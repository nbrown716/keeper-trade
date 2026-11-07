// Fantasy win probability (spec §6 #2): a Monte Carlo of every starter's REMAINING points.
// - Points already scored are locked in (Sleeper's live players_points).
// - Remaining share of each player's game comes from ESPN game state: not started = 1, final/bye = 0,
//   in progress = quarters and clock left.
// - Each player's per-game expectation and spread come from his own season in THIS league's scoring
//   (player-baselines.js), shrunk toward his position's average when he has few games.
// Deterministic for the same inputs (seeded RNG), so the number doesn't jitter between renders.

const SIMS = 4000;

export function remainingShare(game) {
  if (!game) return 0; // bye / no game this week
  const state = game.state || game.status?.type?.state;
  if (state === 'post') return 0;
  if (state !== 'in') return 1;
  const period = Number(game.period || game.status?.period || 1);
  const clock = String(game.clock || game.status?.displayClock || '15:00');
  const [m, s] = clock.split(':').map(Number);
  const secondsLeftInQuarter = Number.isFinite(m) ? m * 60 + (Number.isFinite(s) ? s : 0) : 900;
  if (period > 4) return 0.04; // overtime: a sliver left
  return Math.max(0.02, Math.min(1, ((4 - period) * 900 + secondsLeftInQuarter) / 3600));
}

// Per-game expectation for one player: his mean shrunk toward the position prior (k = 3 pseudo-games).
export function playerExpectation(id, position, baselines) {
  const prior = baselines?.priors?.get(position) || { mean: 8, sd: 6 };
  const own = baselines?.players?.get(String(id));
  const games = own?.games || 0;
  const weight = games / (games + 3);
  const mean = weight * (own?.mean ?? prior.mean) + (1 - weight) * prior.mean;
  const sdRaw = weight * (own?.sd || prior.sd) + (1 - weight) * prior.sd;
  return { mean, sd: Math.max(sdRaw, mean * 0.35, 1.5), games };
}

function rng(seed) {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return ((state >>> 0) % 1e9) / 1e9; };
}
function hash(text) { let h = 2166136261; for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// side = [{ id, position, team, points }]; gameFor(team) -> ESPN game or null.
export function winProbability(sideA, sideB, { gameFor = () => null, baselines = null, sims = SIMS } = {}) {
  const prep = side => side.map(player => {
    const share = remainingShare(gameFor(player.team));
    const expected = playerExpectation(player.id, player.position, baselines);
    return { ...player, share, mu: expected.mean * share, sigma: expected.sd * Math.sqrt(share), floor: -2 * share };
  });
  const a = prep(sideA);
  const b = prep(sideB);
  const lockedA = a.reduce((sum, player) => sum + Number(player.points || 0), 0);
  const lockedB = b.reduce((sum, player) => sum + Number(player.points || 0), 0);
  const random = rng(hash(JSON.stringify([a.map(p => [p.id, p.points, p.share]), b.map(p => [p.id, p.points, p.share])])));
  const normal = () => { let u = 0; let v = 0; while (u === 0) u = random(); while (v === 0) v = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const live = [...a, ...b].filter(player => player.share > 0);
  let wins = 0;
  for (let i = 0; i < sims; i += 1) {
    let ta = lockedA;
    let tb = lockedB;
    for (const player of a) if (player.share > 0) ta += Math.max(player.floor, player.mu + player.sigma * normal());
    for (const player of b) if (player.share > 0) tb += Math.max(player.floor, player.mu + player.sigma * normal());
    wins += ta > tb ? 1 : ta === tb ? 0.5 : 0;
  }
  const projA = lockedA + a.reduce((sum, player) => sum + player.mu, 0);
  const projB = lockedB + b.reduce((sum, player) => sum + player.mu, 0);
  const final = live.length === 0;
  return {
    pA: final ? (lockedA > lockedB ? 1 : lockedA < lockedB ? 0 : 0.5) : wins / sims,
    projA, projB, lockedA, lockedB, final,
    leftA: a.filter(player => player.share > 0).length,
    leftB: b.filter(player => player.share > 0).length,
    playing: [...a, ...b].filter(player => player.share > 0 && player.share < 1).length
  };
}
