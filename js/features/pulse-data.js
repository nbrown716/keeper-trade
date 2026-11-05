import { getLeagueBundle, leagueUsers, rosterOwner } from '../data/sleeper.js';
import { getPlayerDatabase } from '../data/player-db.js';
import { askAI } from '../data/ai.js';

const DB_NAME = 'kt-league-pulse';
const DB_VERSION = 1;
const STORE = 'weeks';
let database;

export const AWARD_LABELS = {
  highest: 'Highest Scorer',
  heartbreak: 'Heartbreak Award',
  bench: 'Bench Blunder',
  lucky: 'Lucky Duck',
  bust: 'Bust of the Week'
};

function points(value) {
  return Number(value || 0);
}

function score(value) {
  return points(value).toFixed(2);
}

function pairs(bundle) {
  const groups = new Map();
  bundle.matchups.forEach(matchup => {
    if (matchup.matchup_id === null || matchup.matchup_id === undefined) return;
    if (!groups.has(matchup.matchup_id)) groups.set(matchup.matchup_id, []);
    groups.get(matchup.matchup_id).push(matchup);
  });
  return [...groups.entries()].map(([id, entries]) => ({ id, entries })).filter(pair => pair.entries.length === 2);
}

function story(id, headline, fact, evidence, teamId) {
  return { id, headline, fact, evidence, teamId };
}

export function computeWeekSnapshot(bundle, playerMap) {
  const users = leagueUsers(bundle.users);
  const names = new Map(bundle.rosters.map(roster => [roster.roster_id, rosterOwner(roster, users)]));
  const name = id => names.get(id) || `Team ${id}`;
  const matchups = pairs(bundle).map(pair => {
    const [a, b] = pair.entries;
    return { id: pair.id, aId: a.roster_id, bId: b.roster_id, aScore: points(a.points), bScore: points(b.points) };
  });
  const highestEntry = bundle.matchups.slice().sort((a, b) => points(b.points) - points(a.points))[0];
  const results = matchups.flatMap(matchup => [
    { ...matchup, selfId: matchup.aId, opponentId: matchup.bId, selfScore: matchup.aScore, opponentScore: matchup.bScore },
    { ...matchup, selfId: matchup.bId, opponentId: matchup.aId, selfScore: matchup.bScore, opponentScore: matchup.aScore }
  ]);
  const losers = results.filter(result => result.selfScore < result.opponentScore).sort((a, b) => b.selfScore - a.selfScore);
  const winners = results.filter(result => result.selfScore > result.opponentScore).sort((a, b) => a.selfScore - b.selfScore);
  const closest = matchups.slice().sort((a, b) => Math.abs(a.aScore - a.bScore) - Math.abs(b.aScore - b.bScore))[0];
  const blowout = matchups.slice().sort((a, b) => Math.abs(b.aScore - b.bScore) - Math.abs(a.aScore - a.bScore))[0];
  const benches = bundle.matchups.map(matchup => {
    const starters = new Set((matchup.starters || []).map(String));
    const bench = Object.entries(matchup.players_points || {}).filter(([id]) => !starters.has(String(id)))
      .map(([id, value]) => ({ id, name: playerMap.get(String(id))?.name || `Player ${id}`, points: points(value) }))
      .sort((a, b) => b.points - a.points);
    return { teamId: matchup.roster_id, points: bench.reduce((sum, player) => sum + player.points, 0), top: bench[0] };
  }).sort((a, b) => b.points - a.points);
  const starters = bundle.matchups.flatMap(matchup => (matchup.starters || []).filter(id => id !== '0').map(id => ({
    id,
    teamId: matchup.roster_id,
    name: playerMap.get(String(id))?.name || `Player ${id}`,
    points: points(matchup.players_points?.[id])
  }))).sort((a, b) => a.points - b.points);
  const awards = [];
  if (highestEntry) awards.push({ id: 'highest', teamId: highestEntry.roster_id, teamName: name(highestEntry.roster_id), value: points(highestEntry.points), displayValue: score(highestEntry.points), detail: `${name(highestEntry.roster_id)} set the Week ${bundle.week} scoring pace with ${score(highestEntry.points)} points.` });
  if (losers[0]) awards.push({ id: 'heartbreak', teamId: losers[0].selfId, teamName: name(losers[0].selfId), value: losers[0].selfScore, displayValue: score(losers[0].selfScore), detail: `${name(losers[0].selfId)} scored ${score(losers[0].selfScore)} and still lost to ${name(losers[0].opponentId)}.` });
  if (benches[0]) awards.push({ id: 'bench', teamId: benches[0].teamId, teamName: name(benches[0].teamId), value: benches[0].points, displayValue: score(benches[0].points), detail: `${name(benches[0].teamId)} left ${score(benches[0].points)} points outside the starting lineup${benches[0].top ? `, led by ${benches[0].top.name} with ${score(benches[0].top.points)}` : ''}.` });
  if (winners[0]) awards.push({ id: 'lucky', teamId: winners[0].selfId, teamName: name(winners[0].selfId), value: winners[0].selfScore, displayValue: score(winners[0].selfScore), detail: `${name(winners[0].selfId)} was the lowest-scoring winner with ${score(winners[0].selfScore)} points.` });
  if (starters[0]) awards.push({ id: 'bust', teamId: starters[0].teamId, teamName: name(starters[0].teamId), playerName: starters[0].name, value: starters[0].points, displayValue: score(starters[0].points), detail: `${starters[0].name} finished with ${score(starters[0].points)} points as a starter for ${name(starters[0].teamId)}.` });

  const trades = bundle.transactions.filter(transaction => transaction.type === 'trade').map(transaction => {
    const rosterIds = transaction.roster_ids || [];
    const sides = rosterIds.map(rosterId => {
      const players = Object.entries(transaction.adds || {}).filter(([, destination]) => destination === rosterId)
        .map(([id]) => playerMap.get(String(id))?.name || `Player ${id}`);
      const picks = (transaction.draft_picks || []).filter(pick => pick.owner_id === rosterId)
        .map(pick => `${pick.season} Round ${pick.round}`);
      return { rosterId, teamName: name(rosterId), assets: [...players, ...picks] };
    });
    return {
      id: String(transaction.transaction_id),
      rosterIds,
      summary: sides.map(side => `${side.teamName} acquired ${side.assets.join(', ') || 'draft considerations'}`).join('; ')
    };
  });
  const waiverCount = bundle.transactions.filter(transaction => ['waiver', 'free_agent'].includes(transaction.type)).length;
  const stories = [];
  if (closest) {
    const winner = closest.aScore >= closest.bScore ? closest.aId : closest.bId;
    const loser = winner === closest.aId ? closest.bId : closest.aId;
    const margin = Math.abs(closest.aScore - closest.bScore);
    const tied = closest.aScore === closest.bScore;
    stories.push(story('closest', tied ? `DEADLOCK: ${name(closest.aId)} and ${name(closest.bId)} finish tied` : `PHOTO FINISH: ${name(winner)} survives by ${score(margin)}`, tied ? `${name(closest.aId)} and ${name(closest.bId)} tied at ${score(closest.aScore)} points.` : `${name(winner)} defeated ${name(loser)} by ${score(margin)} points, ${score(Math.max(closest.aScore, closest.bScore))}–${score(Math.min(closest.aScore, closest.bScore))}.`, tied ? [['Final', score(closest.aScore)], ['Margin', '0.00 pts']] : [['Winner', name(winner)], ['Margin', `${score(margin)} pts`], ['Final', `${score(closest.aScore)}–${score(closest.bScore)}`]], winner));
  }
  if (highestEntry) stories.push(story('highest', `SCORING TITLE: ${name(highestEntry.roster_id)} hangs ${score(highestEntry.points)}`, `${name(highestEntry.roster_id)} led every team with ${score(highestEntry.points)} points in Week ${bundle.week}.`, [['Manager', name(highestEntry.roster_id)], ['Points', score(highestEntry.points)], ['Week', bundle.week]], highestEntry.roster_id));
  if (losers[0]) stories.push(story('heartbreak', `HEARTBREAK: ${name(losers[0].selfId)} falls despite ${score(losers[0].selfScore)}`, `${name(losers[0].selfId)} was the highest-scoring loser with ${score(losers[0].selfScore)} points.`, [['Manager', name(losers[0].selfId)], ['Points', score(losers[0].selfScore)], ['Opponent', name(losers[0].opponentId)]], losers[0].selfId));
  if (benches[0]) stories.push(story('bench', `BENCH BLUNDER: ${score(benches[0].points)} points left on the pine`, `${name(benches[0].teamId)} left ${score(benches[0].points)} points outside the starting lineup.`, [['Manager', name(benches[0].teamId)], ['Bench points', score(benches[0].points)], ['Top bench', benches[0].top ? `${benches[0].top.name} · ${score(benches[0].top.points)}` : '—']], benches[0].teamId));
  if (blowout) {
    const winner = blowout.aScore >= blowout.bScore ? blowout.aId : blowout.bId;
    const loser = winner === blowout.aId ? blowout.bId : blowout.aId;
    const tied = blowout.aScore === blowout.bScore;
    stories.push(story('blowout', tied ? `DEAD EVEN: ${name(blowout.aId)} and ${name(blowout.bId)} tie` : `NO MERCY: ${name(winner)} wins by ${score(Math.abs(blowout.aScore - blowout.bScore))}`, tied ? `${name(blowout.aId)} and ${name(blowout.bId)} finished tied at ${score(blowout.aScore)}.` : `${name(winner)} handed ${name(loser)} the week's largest margin of defeat at ${score(Math.abs(blowout.aScore - blowout.bScore))} points.`, tied ? [['Final', score(blowout.aScore)], ['Margin', '0.00']] : [['Winner', name(winner)], ['Loser', name(loser)], ['Margin', score(Math.abs(blowout.aScore - blowout.bScore))]], winner));
  }
  if (winners[0]) stories.push(story('lucky', `LUCKY DUCK: ${name(winners[0].selfId)} steals a win`, `${name(winners[0].selfId)} was the lowest-scoring winner at ${score(winners[0].selfScore)} points.`, [['Manager', name(winners[0].selfId)], ['Winning score', score(winners[0].selfScore)], ['Opponent', name(winners[0].opponentId)]], winners[0].selfId));

  return {
    key: `${bundle.league.league_id || bundle.league.id}:${bundle.league.season}:${bundle.week}`,
    leagueId: String(bundle.league.league_id || bundle.league.id),
    leagueName: bundle.league.name,
    season: String(bundle.league.season),
    week: bundle.week,
    teams: bundle.rosters.map(roster => ({ id: roster.roster_id, name: name(roster.roster_id), wins: points(roster.settings?.wins), losses: points(roster.settings?.losses), pointsFor: points(roster.settings?.fpts) })),
    matchups,
    awards,
    stories,
    trades,
    waiverCount
  };
}

function coldStreakStory(snapshot, history) {
  const streaks = snapshot.teams.map(team => {
    let count = 0;
    for (let week = history.length - 1; week >= 0; week -= 1) {
      const matchup = history[week].matchups.find(pair => pair.aId === team.id || pair.bId === team.id);
      if (!matchup) continue;
      const own = matchup.aId === team.id ? matchup.aScore : matchup.bScore;
      const opponent = matchup.aId === team.id ? matchup.bScore : matchup.aScore;
      if (own < opponent) count += 1;
      else break;
    }
    return { team, count };
  }).sort((a, b) => b.count - a.count);
  if (!streaks[0] || streaks[0].count < 2) return null;
  const { team, count } = streaks[0];
  return story('cold', `COLD STREAK: ${team.name} drops ${count} straight`, `${team.name} has lost ${count} consecutive matchups through Week ${snapshot.week}.`, [['Manager', team.name], ['Losing streak', count], ['Through', `Week ${snapshot.week}`]], team.id);
}

function tradeStory(snapshot) {
  if (snapshot.trades.length) {
    const latest = snapshot.trades[0];
    return story('trade', `BLOCKBUSTER: ${snapshot.trades.length} deal${snapshot.trades.length === 1 ? '' : 's'} hit the wire`, latest.summary, snapshot.trades.slice(0, 3).map(trade => ['Trade', trade.summary]), latest.rosterIds[0]);
  }
  if (snapshot.waiverCount) return story('waivers', `WAIVER WIRE: ${snapshot.waiverCount} roster moves completed`, `${snapshot.waiverCount} waiver or free-agent transactions were recorded in Week ${snapshot.week}.`, [['Roster moves', snapshot.waiverCount], ['Week', snapshot.week]], null);
  return null;
}

function buildStories(snapshot, history) {
  const extras = [tradeStory(snapshot), coldStreakStory(snapshot, history)].filter(Boolean);
  const base = snapshot.stories;
  const preferred = [base.find(item => item.id === 'closest'), base.find(item => item.id === 'highest'), base.find(item => item.id === 'heartbreak'), extras[0], base.find(item => item.id === 'bench'), base.find(item => item.id === 'blowout'), base.find(item => item.id === 'lucky')];
  return [...new Set([...preferred, ...extras, ...base].filter(Boolean))].slice(0, 7);
}

function openDatabase() {
  if (database) return database;
  database = new Promise(resolve => {
    if (!('indexedDB' in window)) { resolve(null); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return database;
}

async function readSnapshots(leagueId) {
  const db = await openDatabase();
  if (!db) return [];
  return new Promise(resolve => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result || []).filter(snapshot => snapshot.leagueId === String(leagueId)));
    request.onerror = () => resolve([]);
  });
}

async function writeSnapshots(snapshots) {
  const db = await openDatabase();
  if (!db) return;
  return new Promise(resolve => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    snapshots.forEach(snapshot => store.put(snapshot));
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
    transaction.onabort = resolve;
  });
}

function powerTable(snapshots, season, week) {
  const teams = new Map();
  snapshots.filter(snapshot => snapshot.season === String(season) && snapshot.week <= week).forEach(snapshot => {
    snapshot.teams.forEach(team => {
      if (!teams.has(team.id)) teams.set(team.id, { id: team.id, name: team.name, points: 0, wins: 0, losses: 0 });
    });
    snapshot.matchups.forEach(matchup => {
      const a = teams.get(matchup.aId);
      const b = teams.get(matchup.bId);
      if (!a || !b) return;
      a.points += matchup.aScore;
      b.points += matchup.bScore;
      if (matchup.aScore > matchup.bScore) { a.wins += 1; b.losses += 1; }
      else if (matchup.bScore > matchup.aScore) { b.wins += 1; a.losses += 1; }
    });
  });
  return [...teams.values()].map(team => ({ ...team, power: team.points + team.wins * 10 - team.losses * 5 }))
    .sort((a, b) => b.power - a.power).map((team, index) => ({ ...team, rank: index + 1 }));
}

export function computePowerMovement(snapshots, season, week) {
  const current = powerTable(snapshots, season, week);
  const previous = new Map(powerTable(snapshots, season, week - 1).map(team => [team.id, team.rank]));
  return current.map(team => ({ ...team, movement: (previous.get(team.id) || team.rank) - team.rank }));
}

export function computeRecordBook(snapshots) {
  const teams = new Map();
  snapshots.forEach(snapshot => snapshot.teams.forEach(team => teams.set(team.id, team.name)));
  const entries = snapshots.flatMap(snapshot => snapshot.matchups.flatMap(matchup => [
    { snapshot, teamId: matchup.aId, opponentId: matchup.bId, score: matchup.aScore, opponentScore: matchup.bScore },
    { snapshot, teamId: matchup.bId, opponentId: matchup.aId, score: matchup.bScore, opponentScore: matchup.aScore }
  ]));
  const highest = entries.slice().sort((a, b) => b.score - a.score)[0];
  const margins = entries.filter(entry => entry.score > entry.opponentScore).sort((a, b) => (b.score - b.opponentScore) - (a.score - a.opponentScore));
  const tradeCounts = new Map();
  snapshots.forEach(snapshot => snapshot.trades.forEach(trade => trade.rosterIds.forEach(id => {
    const current = tradeCounts.get(id) || { count: 0, season: snapshot.season, week: snapshot.week };
    tradeCounts.set(id, { count: current.count + 1, season: snapshot.season, week: snapshot.week });
  })));
  const mostTrades = [...tradeCounts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  const chronological = snapshots.slice().sort((a, b) => Number(a.season) - Number(b.season) || a.week - b.week);
  const currentStreaks = new Map();
  let longest = null;
  chronological.forEach(snapshot => snapshot.matchups.forEach(matchup => {
    [[matchup.aId, matchup.aScore, matchup.bScore], [matchup.bId, matchup.bScore, matchup.aScore]].forEach(([id, own, opponent]) => {
      const next = own > opponent ? (currentStreaks.get(id) || 0) + 1 : 0;
      currentStreaks.set(id, next);
      if (next > (longest?.count || 0)) longest = { id, count: next, season: snapshot.season, week: snapshot.week };
    });
  }));
  const record = (id, label, entry, value, detail) => entry ? {
    id, label, value, displayValue: id === 'trades' || id === 'streak' ? String(value) : score(value),
    teamId: entry.teamId ?? entry.id ?? entry[0], teamName: teams.get(entry.teamId ?? entry.id ?? entry[0]) || 'League record',
    season: entry.snapshot?.season || entry.season || entry[1]?.season,
    week: entry.snapshot?.week || entry.week || entry[1]?.week,
    detail
  } : null;
  return [
    record('highest', 'Highest weekly score', highest, highest?.score, highest ? `${teams.get(highest.teamId)} scored ${score(highest.score)} in Week ${highest.snapshot.week}, ${highest.snapshot.season}.` : ''),
    record('blowout', 'Biggest blowout', margins[0], margins[0] ? margins[0].score - margins[0].opponentScore : null, margins[0] ? `${teams.get(margins[0].teamId)} beat ${teams.get(margins[0].opponentId)} by ${score(margins[0].score - margins[0].opponentScore)} points.` : ''),
    record('streak', 'Longest win streak', longest ? { ...longest, teamId: longest.id } : null, longest?.count, longest ? `${teams.get(longest.id)} won ${longest.count} straight through Week ${longest.week}, ${longest.season}.` : ''),
    record('trades', 'Most trades', mostTrades, mostTrades?.[1]?.count, mostTrades ? `${teams.get(mostTrades[0])} has made ${mostTrades[1].count} recorded trades.` : '')
  ].filter(Boolean);
}

export function seasonTrophies(snapshots, season, teams) {
  const counts = new Map(teams.map(team => [team.id, { ...team, total: 0, awards: Object.fromEntries(Object.keys(AWARD_LABELS).map(id => [id, 0])) }]));
  snapshots.filter(snapshot => snapshot.season === String(season)).forEach(snapshot => snapshot.awards.forEach(award => {
    const team = counts.get(award.teamId);
    if (!team) return;
    team.awards[award.id] = (team.awards[award.id] || 0) + 1;
    team.total += 1;
  }));
  return [...counts.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function playoffOdds(leagueId, targetWeek) {
  try {
    const saved = JSON.parse(localStorage.getItem(`kt-season-sim:v1:${leagueId}`) || 'null');
    if (!saved?.probabilities) return [];
    const history = Object.entries(saved.history || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
    const probabilities = history.find(([week]) => Number(week) === Number(targetWeek))?.[1]
      || (Number(saved.week) === Number(targetWeek) ? saved.probabilities : null);
    if (!probabilities) return [];
    const previous = history.filter(([week]) => Number(week) < Number(targetWeek)).at(-1)?.[1] || {};
    return Object.entries(probabilities).map(([id, probability]) => ({ id: Number(id), playoff: Number(probability), delta: previous[id] === undefined ? null : Number(probability) - Number(previous[id]) }));
  } catch (_) { return []; }
}

function nextPreview(nextBundle) {
  if (!nextBundle) return null;
  const users = leagueUsers(nextBundle.users);
  const names = new Map(nextBundle.rosters.map(roster => [roster.roster_id, { name: rosterOwner(roster, users), points: points(roster.settings?.fpts) }]));
  const matchups = pairs(nextBundle).map(pair => {
    const [a, b] = pair.entries;
    return { aId: a.roster_id, bId: b.roster_id, aName: names.get(a.roster_id)?.name, bName: names.get(b.roster_id)?.name, combined: (names.get(a.roster_id)?.points || 0) + (names.get(b.roster_id)?.points || 0) };
  }).sort((a, b) => b.combined - a.combined);
  if (!matchups[0]) return null;
  const matchup = matchups[0];
  return { ...matchup, fact: `${matchup.aName} meets ${matchup.bName} in Week ${nextBundle.week}; they have the highest combined season scoring of next week's pairings.` };
}

export async function loadPulseData(leagueId, week) {
  const [playerMap, ...bundles] = await Promise.all([
    getPlayerDatabase(),
    ...Array.from({ length: week }, (_, index) => getLeagueBundle(leagueId, index + 1))
  ]);
  const snapshots = bundles.map((bundle, index) => computeWeekSnapshot({ ...bundle, week: index + 1 }, playerMap));
  const snapshot = snapshots.at(-1);
  if (!snapshot?.matchups.length) throw new Error('This week has no completed matchup data yet.');
  const before = await readSnapshots(leagueId);
  const previousRecords = computeRecordBook(before);
  await writeSnapshots(snapshots);
  const stored = await readSnapshots(leagueId);
  const merged = [...new Map([...stored, ...snapshots].map(item => [item.key, item])).values()];
  const recordBook = computeRecordBook(merged);
  const celebrations = recordBook.filter(record => {
    const previous = previousRecords.find(item => item.id === record.id);
    return record.season === snapshot.season && record.week === snapshot.week && (!previous || record.value > previous.value);
  });
  const nextBundle = week < 18 ? await getLeagueBundle(leagueId, week + 1).then(bundle => ({ ...bundle, week: week + 1 })).catch(() => null) : null;
  return {
    ...snapshot,
    stories: buildStories(snapshot, snapshots),
    recordBook,
    celebrations,
    trophies: seasonTrophies(merged, snapshot.season, snapshot.teams),
    power: computePowerMovement(merged.filter(item => item.season === snapshot.season), snapshot.season, week),
    odds: playoffOdds(leagueId, week + 1),
    preview: nextPreview(nextBundle),
    history: snapshots,
    fingerprint: `${snapshot.key}:${snapshot.matchups.map(matchup => `${matchup.aScore}-${matchup.bScore}`).join('|')}:${snapshot.trades.map(trade => trade.id).join(',')}:${snapshot.waiverCount}`
  };
}

function parseJSON(result) {
  if (result?.status !== 'ready' || !result.text) throw new Error('AI unavailable');
  const text = result.text.replace(/^```(?:json)?\s*/i, '').replace(/```$/g, '').trim();
  try { return JSON.parse(text); }
  catch (_) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('Unexpected AI format');
  }
}

export async function narratePulse(data, { force = false } = {}) {
  const fallback = { stories: data.stories, awards: data.awards.map(award => ({ ...award, citation: award.detail })), source: 'computed', createdAt: null };
  try {
    const result = await askAI('storylines', {
      cacheKey: `pulse-v2:${data.fingerprint}`,
      leagueId: data.leagueId,
      season: data.season,
      week: data.week,
      facts: data.stories.map(item => ({ id: item.id, fact: item.fact })),
      awards: data.awards.map(award => ({ id: award.id, label: AWARD_LABELS[award.id], fact: award.detail }))
    }, { ttl: 604800000, force });
    const parsed = parseJSON(result);
    const stories = data.stories.map(item => {
      const narrative = parsed.headlines?.find(headline => headline.id === item.id);
      return { ...item, headline: typeof narrative?.headline === 'string' && narrative.headline.length <= 140 ? narrative.headline : item.headline };
    });
    const awards = data.awards.map(award => {
      const narrative = parsed.awards?.find(item => item.id === award.id);
      return { ...award, citation: typeof narrative?.citation === 'string' && narrative.citation.length <= 220 ? narrative.citation : award.detail };
    });
    return { stories, awards, source: 'ai', createdAt: result.createdAt, cached: result.cached };
  } catch (_) { return fallback; }
}

function fallbackNewsletter(data, narrative) {
  const odds = data.odds.slice().sort((a, b) => b.playoff - a.playoff);
  const teamNames = new Map(data.teams.map(team => [team.id, team.name]));
  return {
    title: `Week ${data.week}: ${data.awards.find(award => award.id === 'highest')?.teamName || 'The league'} sets the pace`,
    dek: `${data.leagueName} delivered a photo finish, a scoring title, and another week of group-chat evidence.`,
    sections: [
      { heading: 'The week that was', paragraphs: narrative.stories.slice(0, 3).map(item => item.fact) },
      { heading: 'The hardware', paragraphs: narrative.awards.map(award => `${AWARD_LABELS[award.id]}: ${award.citation}`) },
      { heading: 'The playoff picture', paragraphs: [odds.length ? odds.slice(0, 6).map(team => `${teamNames.get(team.id) || `Team ${team.id}`}: ${(team.playoff * 100).toFixed(1)}%${team.delta === null ? '' : ` (${team.delta >= 0 ? '+' : ''}${(team.delta * 100).toFixed(1)} pts)`}`).join('. ') : 'Run Season Sim to add current playoff odds and week-over-week movement to the next Commissioner.'] },
      { heading: 'Next up', paragraphs: [data.preview?.fact || 'Next week’s schedule is not available yet.', ...data.power.slice(0, 3).map(team => `${team.name} holds power rank ${team.rank}${team.movement ? `, moving ${team.movement > 0 ? 'up' : 'down'} ${Math.abs(team.movement)}` : ''}.`)] }
    ]
  };
}

export async function writeNewsletter(data, narrative, { allowAI = true } = {}) {
  const fallback = { article: fallbackNewsletter(data, narrative), source: 'computed', createdAt: null };
  if (!allowAI) return fallback;
  try {
    const result = await askAI('newsletter', {
      cacheKey: `commissioner-v2:${data.fingerprint}:${data.odds.map(team => `${team.id}-${team.playoff}-${team.delta}`).join(',')}`,
      leagueId: data.leagueId,
      leagueName: data.leagueName,
      season: data.season,
      week: data.week,
      recaps: data.stories.map(item => ({ id: item.id, fact: item.fact })),
      awards: narrative.awards.map(award => ({ label: AWARD_LABELS[award.id], citation: award.citation })),
      playoffOdds: data.odds.map(team => ({ team: data.teams.find(item => item.id === team.id)?.name || `Team ${team.id}`, probability: team.playoff, movement: team.delta })),
      nextWeek: data.preview?.fact || 'Schedule unavailable',
      powerRankings: data.power.slice(0, 6).map(team => ({ team: team.name, rank: team.rank, movement: team.movement }))
    }, { ttl: 604800000 });
    const parsed = parseJSON(result);
    if (!parsed.title || !Array.isArray(parsed.sections) || !parsed.sections.length) throw new Error('Unexpected newsletter');
    const sections = parsed.sections.slice(0, 5).filter(section => section.heading && Array.isArray(section.paragraphs)).map(section => ({ heading: String(section.heading), paragraphs: section.paragraphs.filter(paragraph => typeof paragraph === 'string').slice(0, 6) }));
    return { article: { title: String(parsed.title), dek: String(parsed.dek || ''), sections }, source: 'ai', createdAt: result.createdAt, cached: result.cached };
  } catch (_) { return fallback; }
}

export function newsletterText(data, article) {
  return `THE COMMISSIONER · ${data.leagueName}\n${article.title}\n${article.dek}\n\n${article.sections.map(section => `${section.heading.toUpperCase()}\n${section.paragraphs.map(paragraph => `• ${paragraph}`).join('\n')}`).join('\n\n')}\n\nGenerated from real Sleeper data by Keeper Trade.`;
}
