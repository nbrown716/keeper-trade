import { liveData } from '../data/live-data.js';
import { getLeagueBundle, leagueUsers, rosterOwner } from '../data/sleeper.js';
import { getPlayerDatabase } from '../data/player-db.js';
import { dealerSource, normalizeDealerPlayers } from '../data/dynasty-dealer.js';
import { VALUES_SOURCE, normalizePlayers } from '../data/player-values.js';
import { SCOREBOARD_SOURCE, normalizeGames } from '../data/espn.js';
import { playerWeatherImpact } from '../data/weather.js';
import { getWeekSlate, getWeekWeather } from '../data/weather-week.js';

// One-shot read: fresh cache or a fresh network result (stale cache only as a fallback).
function waitForSource(key) {
  return liveData.get(key);
}

async function weatherForPlayers(games, players) {
  if (!games.length) return new Map();
  try {
    const conditions = Object.fromEntries(await getWeekWeather(games));
    return new Map(players.map(player => [player.id, playerWeatherImpact(player, games, conditions)]));
  } catch (_) { return new Map(); }
}

export async function loadWarRoomData(leagueId, week, rosterId) {
  const [bundle, playerMap, dealerData, fantasyCalcData] = await Promise.all([
    getLeagueBundle(leagueId, week),
    getPlayerDatabase(),
    waitForSource(dealerSource()),
    waitForSource(VALUES_SOURCE)
  ]);
  const dealer = new Map(normalizeDealerPlayers(dealerData).map(player => [String(player.id), player]));
  const fantasyCalc = new Map(normalizePlayers(fantasyCalcData).map(player => [String(player.sleeperId || player.id), player]));
  const users = leagueUsers(bundle.users);
  const managers = bundle.rosters.map(roster => ({ id: roster.roster_id, name: rosterOwner(roster, users) })).sort((a, b) => a.name.localeCompare(b.name));
  const selected = Number(rosterId) || managers[0]?.id;
  const roster = bundle.rosters.find(item => item.roster_id === selected);
  const userMatchup = bundle.matchups.find(item => item.roster_id === selected);
  const opponentMatchup = bundle.matchups.find(item => item.matchup_id === userMatchup?.matchup_id && item.roster_id !== selected);
  const opponentRoster = bundle.rosters.find(item => item.roster_id === opponentMatchup?.roster_id);
  const games = await getWeekSlate(String(bundle.league?.season || new Date().getFullYear()), week).catch(() => normalizeGames(liveData.sources.get(SCOREBOARD_SOURCE)?.data));
  const allPlayers = [...playerMap.values()];
  const weather = await weatherForPlayers(games, allPlayers.filter(player => (roster?.players || []).includes(player.id) || (opponentRoster?.players || []).includes(player.id)));
  const enrich = id => {
    const player = playerMap.get(String(id));
    if (!player) return null;
    return {
      ...player,
      dealerValue: dealer.get(String(id))?.value || 0,
      baseValue: dealer.get(String(id))?.baseValue || 0,
      fantasyCalcValue: fantasyCalc.get(String(id))?.value || 0,
      trend: fantasyCalc.get(String(id))?.trend || 0,
      weather: weather.get(String(id)) || null
    };
  };
  const userPlayers = (roster?.players || []).map(enrich).filter(Boolean);
  const opponentPlayers = (opponentRoster?.players || []).map(enrich).filter(Boolean);
  const required = Object.fromEntries((bundle.league.roster_positions || []).map(position => [position, (bundle.league.roster_positions || []).filter(item => item === position).length]));
  const holes = Object.entries(required).map(([position, count]) => {
    const owned = userPlayers.filter(player => player.position === position).length;
    return { position, count, owned, need: Math.max(0, count + 1 - owned) };
  }).filter(item => item.need > 0).sort((a, b) => b.need - a.need);
  const rostered = new Set(bundle.rosters.flatMap(item => item.players || []));
  const freeAgentPool = allPlayers.filter(player => player.active && ['QB', 'RB', 'WR', 'TE'].includes(player.position) && !rostered.has(player.id));
  const enrichedFreeAgents = freeAgentPool.map(player => enrich(player.id));
  const freeAgents = enrichedFreeAgents.filter(player => player && (player.dealerValue > 0 || player.fantasyCalcValue > 0)).sort((a, b) => {
    const aChange = a.baseValue ? (a.dealerValue - a.baseValue) / a.baseValue : 0;
    const bChange = b.baseValue ? (b.dealerValue - b.baseValue) / b.baseValue : 0;
    return bChange - aChange || b.dealerValue - a.dealerValue;
  });
  return {
    leagueId,
    week,
    league: bundle.league,
    managers,
    rosterId: selected,
    manager: managers.find(manager => manager.id === selected)?.name || `Team ${selected}`,
    opponent: managers.find(manager => manager.id === opponentRoster?.roster_id)?.name || 'Opponent',
    opponentRosterId: opponentRoster?.roster_id,
    roster,
    opponentRoster,
    userPlayers,
    opponentPlayers,
    matchup: userMatchup,
    opponentMatchup,
    holes,
    freeAgents,
    transactions: bundle.transactions.filter(transaction => transaction.type === 'trade'),
    playerMap
  };
}

export function transactionOffer(transaction, data) {
  const otherId = transaction.roster_ids?.find(id => id !== data.rosterId) || data.opponentRosterId;
  const sideA = [];
  const sideB = [];
  Object.entries(transaction.adds || {}).forEach(([id, roster]) => {
    const player = [...data.userPlayers, ...data.opponentPlayers].find(item => item.id === id) || data.playerMap.get(id);
    if (!player) return;
    (roster === data.rosterId ? sideA : sideB).push(player);
  });
  (transaction.draft_picks || []).forEach(pick => {
    const ref = { id: `pick:${pick.season}:${pick.round}`, pick: true, round: Number(pick.round), season: pick.season, yr: 0, name: `${pick.season} Round ${pick.round}`, team: 'pick', position: 'PICK' };
    (pick.owner_id === data.rosterId ? sideA : sideB).push(ref);
  });
  return { sideA, sideB, otherId };
}

export async function createEngineFrame() {
  const response = await fetch('keeper.html');
  if (!response.ok) throw new Error('The calculator engine is unavailable.');
  const source = (await response.text()).replace(/<script type="module"[\s\S]*?<\/script>/g, '');
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.setAttribute('aria-hidden', 'true');
  document.body.append(frame);
  frame.contentWindow.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve([]) });
  frame.contentDocument.open();
  frame.contentDocument.write(source);
  frame.contentDocument.close();
  await new Promise(resolve => window.setTimeout(resolve, 80));
  const engine = frame.contentWindow.TradeEngine;
  if (!engine) throw new Error('The calculator engine could not initialize.');
  return { frame, engine, document: frame.contentDocument };
}

export function evaluateCounter(frameData, sideA, sideB) {
  const { engine, document } = frameData;
  engine.state.sides.A = [];
  engine.state.sides.B = [];
  const add = (side, player) => {
    const ref = { n: player.name, p: player.position || 'PICK', t: player.team || 'pick', base: player.dealerValue / 100, pick: Boolean(player.pick), round: player.round, yr: player.yr || 0 };
    engine.addAsset(side, ref);
    const entry = engine.state.sides[side].at(-1);
    if (!player.pick && player.dealerValue > 0) engine.setMarketValue(entry, player.dealerValue / 100);
  };
  sideA.forEach(player => add('A', player));
  sideB.forEach(player => add('B', player));
  engine.render('A');
  engine.render('B');
  return {
    verdict: document.querySelector('#vStamp')?.textContent || 'No verdict',
    gap: document.querySelector('#vGap')?.textContent || '',
    totalA: engine.state.sides.A.reduce((sum, entry) => sum + engine.adjustedValue(entry), 0),
    totalB: engine.state.sides.B.reduce((sum, entry) => sum + engine.adjustedValue(entry), 0)
  };
}
