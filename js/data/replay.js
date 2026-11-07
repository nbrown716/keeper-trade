// Replay engine: rebuilds WHEN every fantasy point happened, for both sides of a matchup.
//
// Sleeper only publishes final player points. ESPN play-by-play carries a real `wallclock` timestamp,
// play type, yardage and abbreviated names ("Mar.Harrison", "J.Smith-Njigba") on every play. We score
// each play with the league's own Sleeper scoring settings, then ANCHOR each player to Sleeper's
// official total, so a replay always finishes on the true score to the hundredth while the timing of
// every surge comes from the real game. See docs/next-features-spec.md §2.1.
//
// Pure functions here (no DOM); `loadReplay` in drive-data.js does the fetching.

const DEFAULT_SCORING = { pass_yd: 0.04, pass_td: 4, pass_int: -1, pass_2pt: 2, rush_yd: 0.1, rush_td: 6, rush_2pt: 2, rec: 1, rec_yd: 0.1, rec_td: 6, rec_2pt: 2, fum_lost: -2, xpm: 1, xpmiss: -1, fgm_yds: 0, fgm: 3, fgmiss: -1 };
const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\.?$/i;
// A name token as ESPN prints it: "J.Chase", "Mar.Harrison", "A.St. Brown", "J.Smith-Njigba".
const NAME = String.raw`([A-Z][A-Za-z]{0,3}\.(?:St\.\s?)?[A-Z][A-Za-z'\-]+)`;
// Sleeper and ESPN disagree on a few team codes.
const ESPN_TEAM = { WAS: 'WSH', JAC: 'JAX', LA: 'LAR' };
export const espnTeam = team => ESPN_TEAM[team] || team;

const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hour12: false });

function clean(value) {
  return String(value || '').toLowerCase().replace(SUFFIX, '').replace(/[^a-z]/g, '');
}

// Split a full name into { first, last } the way ESPN abbreviates it (suffixes dropped).
function nameParts(full) {
  const parts = String(full || '').replace(SUFFIX, '').trim().split(/\s+/);
  if (parts.length < 2) return { first: clean(parts[0]), last: clean(parts[0]) };
  const stIndex = parts.findIndex(part => /^st\.?$/i.test(part));
  const lastStart = stIndex > 0 ? stIndex : parts.length - 1;
  return { first: clean(parts[0]), last: clean(parts.slice(lastStart).join('')) };
}

// Does an ESPN token like "Mar.Harrison" refer to this player?
function tokenMatches(token, player) {
  const [prefix, ...rest] = token.split('.');
  const last = clean(rest.join(''));
  const parts = nameParts(player.name);
  return Boolean(last) && last === parts.last && parts.first.startsWith(clean(prefix));
}

export function windowFor(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return { id: 'game', label: 'Game time', order: 9 };
  const parts = Object.fromEntries(ET.formatToParts(date).map(part => [part.type, part.value]));
  const hour = Number(parts.hour) % 24;
  const day = parts.weekday;
  if (day === 'Thu') return { id: 'tnf', label: 'TNF', order: 0 };
  if (day === 'Fri') return { id: 'fri', label: 'FRI', order: 1 };
  if (day === 'Sat') return { id: 'sat', label: 'SAT', order: 2 };
  if (day === 'Sun' && hour < 12) return { id: 'intl', label: 'SUN INTL', order: 3 };
  if (day === 'Sun' && hour < 16) return { id: 'early', label: 'SUN 1PM', order: 4 };
  if (day === 'Sun' && hour < 19) return { id: 'late', label: 'SUN 4PM', order: 5 };
  if (day === 'Sun') return { id: 'snf', label: 'SNF', order: 6 };
  if (day === 'Mon') return { id: 'mnf', label: 'MNF', order: 7 };
  return { id: 'game', label: day.toUpperCase(), order: 8 };
}

// Score one ESPN play into fantasy deltas for any rostered players it mentions.
// The play TYPE is the official ruling (an overturned "TOUCHDOWN" in the text is typed "Pass Incompletion").
export function scorePlay(play, playersOnTeams, scoring) {
  const s = { ...DEFAULT_SCORING, ...scoring };
  const type = String(play.type?.text || '');
  const raw = String(play.text || '');
  if (/No Play|NULLIFIED/i.test(raw)) return [];
  if (/Timeout|End Period|End of|Two-minute|Kickoff|Punt|Official|Coin Toss/i.test(type)) return [];
  // Drop tacklers/formations in () and [], and "X reported in as eligible." preambles.
  const text = raw.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(new RegExp(`${NAME} reported in as eligible\.\s*`, 'g'), '').replace(/\s+/g, ' ').trim();
  const deltas = [];
  const find = token => token && playersOnTeams.find(player => tokenMatches(token, player));
  const add = (token, points, kind, label) => {
    const player = find(token);
    if (player && points) deltas.push({ playerId: player.id, delta: points, kind, label });
  };
  // After a replay reversal ESPN appends the corrected play: score only what follows the last "REVERSED.".
  const ruled = /REVERSED\./.test(text) ? text.slice(text.lastIndexOf('REVERSED.') + 9) : text;
  // The scrimmage play is everything before a two-point try; the try is scored separately below.
  const main = ruled.split(/TWO-POINT CONVERSION ATTEMPT/i)[0];
  // Fantasy credits the yards the play itself gained; statYardage nets out post-play penalties.
  const action = main.split(/PENALTY/)[0];
  const stated = action.match(/for (-?\d+) yards?|for no gain/);
  const yards = stated ? Number(stated[1] || 0) : Number(play.statYardage || 0);
  // After a replay reversal the text keeps the old "TOUCHDOWN"; the play type holds the final ruling.
  const isTD = /Touchdown/i.test(type) || (/TOUCHDOWN/.test(main) && !/Incompletion|Interception/i.test(type));

  const passer = main.match(new RegExp(`${NAME} pass`));
  const sack = /Sack/i.test(type) || new RegExp(`${NAME} sacked`).test(main);
  if (passer && !sack && !/Penalty/i.test(type)) {
    const target = main.match(new RegExp(`pass (?:[a-z]+ )*?(?:to|intended for) ${NAME}`));
    if (/Interception/i.test(type) || /INTERCEPTED/.test(main)) add(passer[1], s.pass_int, 'turnover', 'Interception');
    else if (!/Incompletion/i.test(type) && !/ incomplete/.test(main) && target) {
      add(passer[1], yards * s.pass_yd + (isTD ? s.pass_td : 0), isTD ? 'td' : 'yards', isTD ? `${yards}-yd TD pass` : `${yards}-yd pass`);
      add(target[1], s.rec + yards * s.rec_yd + (isTD ? s.rec_td : 0), isTD ? 'td' : 'yards', isTD ? `${yards}-yd TD catch` : yards ? `${yards}-yd catch` : 'Catch, no gain');
    }
  } else if (!sack && (/Rush/i.test(type) || /Fumble/i.test(type))) {
    const rusher = main.match(new RegExp(`${NAME} (?:scrambles|up the middle|left|right|kneels|rushes|to |for )`));
    if (rusher) add(rusher[1], yards * s.rush_yd + (isTD ? s.rush_td : 0), isTD ? 'td' : 'yards', isTD ? `${yards}-yd TD run` : yards ? `${yards}-yd run` : 'Run, no gain');
  }
  if (!deltas.length && /Touchdown/i.test(type)) {
    const full = ruled.match(/^([A-Z][A-Za-z.'\- ]+?) (\d+) Yd (pass from|Run|Rush|Pass)\s*([A-Z][A-Za-z.'\- ]+?)?(?: \(|$)/);
    const byName = name => name && playersOnTeams.find(player => clean(player.name) === clean(name));
    if (full) {
      const gained = Number(full[2]);
      const scorer = byName(full[1]);
      if (/pass from/i.test(full[3])) {
        if (scorer) deltas.push({ playerId: scorer.id, delta: s.rec + gained * s.rec_yd + s.rec_td, kind: 'td', label: `${gained}-yd TD catch` });
        const qb = byName(full[4]);
        if (qb) deltas.push({ playerId: qb.id, delta: gained * s.pass_yd + s.pass_td, kind: 'td', label: `${gained}-yd TD pass` });
      } else if (scorer) deltas.push({ playerId: scorer.id, delta: gained * s.rush_yd + s.rush_td, kind: 'td', label: `${gained}-yd TD run` });
    }
  }
  for (const match of text.matchAll(new RegExp(`${NAME} FUMBLES`, 'g'))) {
    const lost = /RECOVERED by/i.test(text) && !/and recovers/i.test(text) && !/Fumble Recovery \(Own\)/i.test(type);
    add(match[1], (s.fum || 0) + (lost ? s.fum_lost : 0), 'turnover', lost ? 'Fumble lost' : 'Fumble');
  }
  const twoPoint = text.match(new RegExp(`TWO-POINT CONVERSION ATTEMPT\. ${NAME} (pass to ${NAME}|rushes|up the middle|left|right)[\s\S]*?ATTEMPT SUCCEEDS`, 'i'));
  if (twoPoint) {
    if (twoPoint[3]) { add(twoPoint[1], s.pass_2pt, 'td', '2-pt pass'); add(twoPoint[3], s.rec_2pt, 'td', '2-pt catch'); }
    else add(twoPoint[1], s.rush_2pt, 'td', '2-pt run');
  }
  const fg = text.match(new RegExp(`${NAME} (\d+) yard field goal is (GOOD|No Good|BLOCKED)`, 'i'));
  if (fg) add(fg[1], /^GOOD/i.test(fg[3]) ? (s.fgm || 0) + Number(fg[2]) * (s.fgm_yds || 0) : s.fgmiss || 0, 'kick', `${fg[2]}-yd FG`);
  const xp = text.match(new RegExp(`${NAME} extra point is (GOOD|No Good|BLOCKED)`, 'i'));
  if (xp) add(xp[1], /^GOOD/i.test(xp[2]) ? s.xpm : s.xpmiss, 'kick', 'Extra point');
  return deltas;
}

// Build the replay for two rosters. `starters` = [{ id, name, team, position, rosterId, official }].
// `games` = Map(teamAbbr -> { id, date }), `summaries` = Map(gameId -> ESPN summary JSON or null).
export function buildReplay({ starters, games, summaries, scoring = {} }) {
  const byGame = new Map();
  starters.forEach(player => {
    const game = games.get(player.team) || games.get(espnTeam(player.team));
    if (!game) return;
    if (!byGame.has(game.id)) byGame.set(game.id, { game, players: [] });
    byGame.get(game.id).players.push(player);
  });

  const provisional = new Map(starters.map(player => [player.id, []]));
  const gameSpan = new Map();
  byGame.forEach(({ game, players }, gameId) => {
    const summary = summaries.get(gameId);
    const plays = (summary?.drives?.previous || []).flatMap(drive => drive.plays || []).filter(play => play.wallclock);
    plays.sort((a, b) => Date.parse(a.wallclock) - Date.parse(b.wallclock) || Number(a.sequenceNumber || 0) - Number(b.sequenceNumber || 0));
    const start = plays.length ? Date.parse(plays[0].wallclock) : Date.parse(game.date) || 0;
    const end = plays.length ? Date.parse(plays.at(-1).wallclock) : start + 3.25 * 3600000;
    gameSpan.set(gameId, { start, end, window: windowFor(game.date), source: plays.length ? 'plays' : 'schedule' });
    plays.forEach(play => {
      scorePlay(play, players, scoring).forEach(delta => provisional.get(delta.playerId)?.push({ ...delta, t: Date.parse(play.wallclock), text: play.text }));
    });
  });

  // Anchor every player to the official Sleeper total.
  const events = [];
  const accuracy = [];
  starters.forEach(player => {
    const list = provisional.get(player.id) || [];
    const official = Math.round(Number(player.official || 0) * 100) / 100;
    const parsed = list.reduce((sum, item) => sum + item.delta, 0);
    const game = games.get(player.team) || games.get(espnTeam(player.team));
    const span = game ? gameSpan.get(game.id) : null;
    accuracy.push({ playerId: player.id, name: player.name, parsed: Math.round(parsed * 100) / 100, official });
    let anchored = list;
    if (list.length && Math.abs(parsed) > 0.01 && Math.sign(parsed) === Math.sign(official || parsed)) {
      const factor = official / parsed;
      anchored = list.map(item => ({ ...item, delta: item.delta * factor }));
    } else if (Math.abs(official - parsed) > 0.005) {
      // Nothing usable parsed: spread the official points across the player's real game window.
      const steps = 6;
      const startAt = span?.start || 0;
      const length = span ? Math.max(1, span.end - span.start) : 3 * 3600000;
      anchored = [...list, ...Array.from({ length: steps }, (_, index) => ({ playerId: player.id, delta: (official - parsed) / steps, kind: 'approx', label: 'Approximate timing', t: startAt + length * (index + 1) / (steps + 1), text: '' }))];
    }
    const drift = official - anchored.reduce((sum, item) => sum + item.delta, 0);
    if (anchored.length && Math.abs(drift) > 1e-9) anchored[anchored.length - 1] = { ...anchored.at(-1), delta: anchored.at(-1).delta + drift };
    anchored.forEach(item => events.push({ ...item, rosterId: player.rosterId, name: player.name, position: player.position, team: player.team }));
  });
  events.sort((a, b) => a.t - b.t);

  // Film windows: only windows where a starter played, in chronological order.
  const windows = [];
  gameSpan.forEach(span => {
    let win = windows.find(item => item.id === span.window.id);
    if (!win) windows.push(win = { ...span.window, start: span.start, end: span.end, points: 0 });
    win.start = Math.min(win.start, span.start);
    win.end = Math.max(win.end, span.end);
  });
  windows.sort((a, b) => a.start - b.start);
  events.forEach(event => {
    const win = windows.find(item => event.t >= item.start - 60000 && event.t <= item.end + 60000) || windows.at(-1);
    if (win) { win.points += Math.abs(event.delta); event.window = win.id; }
  });
  return { events, windows, accuracy, sources: [...gameSpan.values()].map(span => span.source) };
}

// Map real time onto film time: each window gets time proportional to its points (min share), and the
// dead hours between windows collapse into short wipes. Returns helpers used by every renderer.
export function filmTimeline(replay, { duration = 45, intro = 2.5, outro = 4, wipe = 0.6, minShare = 3 } = {}) {
  const windows = replay.windows.length ? replay.windows : [{ id: 'game', label: 'Game', start: 0, end: 1, points: 1 }];
  const play = Math.max(5, duration - intro - outro - wipe * Math.max(0, windows.length - 1));
  const totalPoints = windows.reduce((sum, win) => sum + win.points, 0) || 1;
  const raw = windows.map(win => Math.max(minShare, play * win.points / totalPoints));
  const scale = play / raw.reduce((sum, value) => sum + value, 0);
  let cursor = intro;
  const segments = windows.map((win, index) => {
    const length = raw[index] * scale;
    const segment = { ...win, filmStart: cursor, filmEnd: cursor + length };
    cursor += length + (index < windows.length - 1 ? wipe : 0);
    return segment;
  });
  const realToFilm = t => {
    const segment = segments.find(item => t <= item.end) || segments.at(-1);
    if (t < segment.start) return segment.filmStart;
    const progress = Math.min(1, (t - segment.start) / Math.max(1, segment.end - segment.start));
    return segment.filmStart + progress * (segment.filmEnd - segment.filmStart);
  };
  const timed = replay.events.map(event => ({ ...event, ft: realToFilm(event.t) }));
  const filmToReal = ft => {
    const segment = segments.find(item => ft <= item.filmEnd) || segments.at(-1);
    if (ft < segment.filmStart) return segment.start;
    const progress = (ft - segment.filmStart) / Math.max(1e-6, segment.filmEnd - segment.filmStart);
    return segment.start + progress * (segment.end - segment.start);
  };
  return { duration, intro, outro, playEnd: duration - outro, segments, events: timed, filmToReal };
}

// Cumulative points for a roster at film time `ft` (events must carry `ft`). Allocation-free hot path.
export function totalAt(events, rosterId, ft) {
  let total = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.ft > ft) break;
    if (event.rosterId === rosterId) total += event.delta;
  }
  return total;
}
