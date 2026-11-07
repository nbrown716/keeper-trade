// Live player baselines from your own league: each player's points per game this season, in YOUR scoring,
// built from Sleeper matchups for every completed week (approved, keyless, updates every week).
// Replaces the frozen FantasyPros season-projection export. Shared by Sunday ("vs avg") and win probability.
import { getLeagueBundle, getNflState } from './sleeper.js';
import { completedWeeks } from './season-stats.js';

const memo = new Map();
const mean = list => (list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0);
const sd = list => { if (list.length < 2) return 0; const m = mean(list); return Math.sqrt(list.reduce((sum, value) => sum + (value - m) ** 2, 0) / (list.length - 1)); };

// Pure: weeks = [{ week, matchups }]. A "game" = a week the player was rostered and scored non-zero points
// (0.0 almost always means bye, injury or inactive, which would drag a per-game average down unfairly).
export function computeBaselines(weeks, positionOf = () => '') {
  const byPlayer = new Map();
  weeks.forEach(({ week, matchups }) => (matchups || []).forEach(entry => {
    Object.entries(entry.players_points || {}).forEach(([id, value]) => {
      const points = Number(value || 0);
      if (!points) return;
      if (!byPlayer.has(id)) byPlayer.set(id, []);
      byPlayer.get(id).push({ week, points });
    });
  }));
  const players = new Map();
  byPlayer.forEach((games, id) => {
    const points = games.map(game => game.points);
    players.set(id, { id, games: points.length, mean: mean(points), sd: sd(points), position: positionOf(id) });
  });
  // Positional priors for players with too few games: mean/SD of every rostered player-game at that position.
  const positions = new Map();
  players.forEach(player => {
    if (!player.position) return;
    if (!positions.has(player.position)) positions.set(player.position, []);
    byPlayer.get(player.id).forEach(game => positions.get(player.position).push(game.points));
  });
  const priors = new Map([...positions.entries()].map(([position, points]) => [position, { mean: mean(points), sd: sd(points) }]));
  return { players, priors, weeks: weeks.map(item => item.week) };
}

export async function getPlayerBaselines(leagueId, players = new Map()) {
  const nfl = await getNflState();
  const first = await getLeagueBundle(leagueId, 1);
  const through = completedWeeks(first.league, nfl);
  const key = `${leagueId}:${through}`;
  if (memo.has(key)) return memo.get(key);
  const promise = Promise.all(Array.from({ length: through }, (_, index) => (index === 0 ? Promise.resolve(first) : getLeagueBundle(leagueId, index + 1))))
    .then(bundles => computeBaselines(bundles.map((bundle, index) => ({ week: index + 1, matchups: bundle.matchups })), id => players.get(String(id))?.position || ''));
  memo.set(key, promise);
  promise.catch(() => memo.delete(key));
  return promise;
}
