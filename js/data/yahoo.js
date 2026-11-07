import { liveData } from './live-data.js';
import { getPlayerDatabase } from './player-db.js';

const DEFAULT_WORKER = 'https://keeper-trade-ai.nicholas-brown00.workers.dev';
const SESSION_KEY = 'kt-yahoo-session:v1';
const AI_ENDPOINT_KEY = 'kt-ai-endpoint:v1';

function workerBase() {
  try { return (localStorage.getItem(AI_ENDPOINT_KEY) || DEFAULT_WORKER).replace(/\/+$/, ''); } catch (_) { return DEFAULT_WORKER; }
}

function sessionId() {
  let id = '';
  try { id = localStorage.getItem(SESSION_KEY) || ''; } catch (_) {}
  if (/^[A-Za-z0-9_-]{22,80}$/.test(id)) return id;
  id = `${crypto.randomUUID()}-${crypto.randomUUID()}`.replace(/-/g, '_');
  try { localStorage.setItem(SESSION_KEY, id); } catch (_) {}
  return id;
}

async function request(path, { method = 'GET', allowStatuses = [] } = {}) {
  let response;
  try {
    response = await fetch(`${workerBase()}${path}`, {
      method,
      headers: { Accept: 'application/json', 'X-Keeper-Session': sessionId() }
    });
  } catch (_) {
    throw new Error('The Yahoo connector is unreachable. Your other leagues and tools are unaffected.');
  }
  if (allowStatuses.includes(response.status)) return null;
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    if (response.status === 503 || detail.reason === 'yahoo-config') throw new Error('Yahoo OAuth needs the Worker’s Yahoo app credentials and approved API access.');
    if (response.status === 401) throw new Error('Yahoo authorization expired. Reconnect Yahoo to renew it.');
    throw new Error('Yahoo data is unavailable right now. Try again shortly.');
  }
  return response.json();
}

export async function getYahooConnectUrl() {
  const result = await request('/yahoo/connect');
  if (!result?.url) throw new Error('Yahoo sign-in could not start. Try again.');
  return result.url;
}

export async function disconnectYahoo() {
  await request('/yahoo/disconnect', { method: 'POST', allowStatuses: [401] });
}

function values(value, key, output = []) {
  if (Array.isArray(value)) value.forEach(item => values(item, key, output));
  else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([childKey, child]) => {
      if (childKey === key) output.push(child);
      values(child, key, output);
    });
  }
  return output;
}

function first(value, key, fallback) {
  const found = values(value, key)[0];
  return found === undefined ? fallback : found;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function playerPoints(settings = {}) {
  return Number(settings.fpts || 0) + Number(settings.fpts_decimal || 0) / 100;
}

function pointsObject(points) {
  const integer = Math.floor(points);
  return { fpts: integer, fpts_decimal: Math.round((points - integer) * 100) };
}

function teamPoints(raw, standings = false) {
  const direct = first(raw, 'team_points', null);
  if (typeof direct === 'object' && direct !== null && direct.total !== undefined) return number(direct.total);
  if (direct !== null && direct !== undefined) return number(direct);
  if (standings) {
    const pointsFor = first(raw, 'points_for', null);
    if (pointsFor !== null) return number(pointsFor);
  }
  const stats = values(raw, 'stat').map(item => item?.stat || item).filter(item => item && typeof item === 'object');
  const total = stats.find(item => String(item.stat_id) === '0') || stats.find(item => String(item.stat_id) === '1');
  return number(total?.value);
}

function teamInfo(raw, index = 0) {
  const key = String(first(raw, 'team_key', ''));
  if (!key) return null;
  const id = number(first(raw, 'team_id', key.split('.').at(-1)), index + 1);
  const name = String(first(raw, 'name', `Team ${id}`));
  const manager = String(first(raw, 'nickname', first(raw, 'manager_name', 'Yahoo manager')));
  const outcomes = first(raw, 'outcome_totals', {});
  return {
    key,
    id,
    name,
    manager,
    wins: number(first(raw, 'wins', first(outcomes, 'wins', 0))),
    losses: number(first(raw, 'losses', first(outcomes, 'losses', 0))),
    ties: number(first(raw, 'ties', first(outcomes, 'ties', 0))),
    points: teamPoints(raw, true)
  };
}

function teamsFrom(raw) {
  return values(raw, 'team').map((team, index) => teamInfo(team, index)).filter(Boolean).filter((team, index, teams) => teams.findIndex(item => item.key === team.key) === index);
}

function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function playerInfo(raw, playerMap) {
  const yahooId = String(first(raw, 'player_id', first(raw, 'player_key', '').split('.').at(-1) || ''));
  const nameField = first(raw, 'name', null);
  const name = String((nameField && typeof nameField === 'object' ? nameField.full || [nameField.first, nameField.last].filter(Boolean).join(' ') : nameField) || first(raw, 'full_name', 'Player'));
  const position = String(first(raw, 'display_position', first(raw, 'position', '')));
  const team = String(first(raw, 'editorial_team_abbr', first(raw, 'team_abbr', 'FA'))).toUpperCase();
  const selected = first(raw, 'selected_position', {});
  const slot = String(first(selected, 'position', 'BN'));
  const directPoints = first(raw, 'player_points', null);
  const points = typeof directPoints === 'object' && directPoints !== null ? number(directPoints.total) : number(directPoints);
  const canonical = playerMap.get(normalizeName(name));
  return { id: canonical?.id || `yahoo:${yahooId}`, yahooId, name, position: canonical?.position || position, team: canonical?.team || team, slot, points };
}

function playersFrom(raw, playerMap) {
  return values(raw, 'player').map(player => playerInfo(player, playerMap)).filter(player => player.yahooId);
}

function rosterPlayers(raw, playerMap) {
  const players = playersFrom(raw, playerMap);
  const reserve = players.filter(player => ['IR', 'DL', 'OUT', 'NA'].includes(player.slot.toUpperCase())).map(player => player.id);
  const taxi = players.filter(player => player.slot.toUpperCase() === 'TAXI').map(player => player.id);
  const unavailable = new Set([...reserve, ...taxi]);
  const starters = players.filter(player => !['BN', 'TAXI', 'IR', 'DL', 'OUT', 'NA'].includes(player.slot.toUpperCase()) && !unavailable.has(player.id)).map(player => player.id);
  return { players, starters, reserve, taxi };
}

function yahooTransactionType(type, waiver) {
  const value = String(type || '').toLowerCase();
  if (value === 'trade' || value === 'pending_trade') return 'trade';
  if (value === 'commish') return 'commissioner';
  return waiver ? 'waiver' : 'free_agent';
}

function normalizeTransactions(raw, teams, playerMap) {
  const rosterByKey = new Map(teams.map(team => [team.key, team.id]));
  return values(raw, 'transaction').filter(item => first(item, 'transaction_key', '')).map((transaction, index) => {
    const key = String(first(transaction, 'transaction_key', index));
    const creatorKey = String(first(transaction, 'source_team_key', first(transaction, 'team_key', '')));
    const adds = {};
    const drops = {};
    values(transaction, 'player').forEach(rawPlayer => {
      const player = playerInfo(rawPlayer, playerMap);
      const destination = String(first(rawPlayer, 'destination_team_key', ''));
      const source = String(first(rawPlayer, 'source_team_key', ''));
      if (destination && rosterByKey.has(destination)) adds[player.id] = rosterByKey.get(destination);
      if (source && rosterByKey.has(source)) drops[player.id] = rosterByKey.get(source);
    });
    return {
      transaction_id: key,
      type: yahooTransactionType(first(transaction, 'type', ''), first(transaction, 'faab_bid', null) !== null || String(first(transaction, 'source_type', '')) === 'waivers'),
      creator: creatorKey,
      roster_ids: [...new Set([...Object.values(adds), ...Object.values(drops)])],
      adds,
      drops,
      draft_picks: [],
      status: String(first(transaction, 'status', 'successful')),
      created: number(first(transaction, 'timestamp', 0)) * 1000
    };
  });
}

export function normalizeYahooLeagues(data) {
  return values(data, 'league').map(league => ({
    id: String(first(league, 'league_key', '')),
    name: String(first(league, 'name', 'Yahoo league')),
    season: String(first(league, 'season', new Date().getFullYear())),
    week: number(first(league, 'current_week', 1), 1)
  })).filter(league => /^(?:nfl|\d{2,4})\.l\.\d+$/.test(league.id)).filter((league, index, leagues) => leagues.findIndex(item => item.id === league.id) === index);
}

export async function listYahooLeagues() {
  const data = await request('/yahoo/leagues');
  return normalizeYahooLeagues(data);
}

const WEEKLY_RESOURCES = new Set(['scoreboard', 'rosters']);

function subscribeResource(leagueId, resource, week, cadence = 300000) {
  const key = WEEKLY_RESOURCES.has(resource) ? `yahoo:${leagueId}:${resource}:${week}` : `yahoo:${leagueId}:${resource}`;
  liveData.register(key, {
    fetcher: () => request(`/yahoo/proxy?league=${encodeURIComponent(leagueId)}&resource=${resource}&week=${Number(week) || 1}`),
    cadence
  });
  return liveData.get(key).then(data => data ?? undefined);
}

function normalizeBundle({ leagueId, week, standings, scoreboard, settings, transactions, rosters, playerMap }) {
  const teams = teamsFrom(standings).length ? teamsFrom(standings) : teamsFrom(scoreboard);
  if (!teams.length) throw new Error('Yahoo returned no league teams.');
  const rosterResources = new Map(rosters.map(entry => [entry.teamKey, entry.data]));
  const normalizedRosters = teams.map(team => {
    const resource = rosterResources.get(team.key);
    const roster = rosterPlayers(resource, playerMap);
    return {
      roster_id: team.id,
      owner_id: team.key,
      players: roster.players.map(player => player.id),
      starters: roster.starters,
      reserve: roster.reserve,
      taxi: roster.taxi,
      settings: { wins: team.wins, losses: team.losses, ties: team.ties, ...pointsObject(team.points) }
    };
  });
  const users = teams.map(team => ({ user_id: team.key, display_name: team.manager, metadata: { team_name: team.name } }));
  const matchupTeams = teamsFrom(scoreboard);
  const matchups = matchupTeams.length ? matchupTeams.map((team, index) => {
    const roster = normalizedRosters.find(item => item.roster_id === team.id);
    const resource = rosterResources.get(team.key);
    const players = rosterPlayers(resource, playerMap).players;
    return {
      matchup_id: Math.floor(index / 2) + 1,
      roster_id: team.id,
      points: team.points,
      starters: roster?.starters || [],
      players_points: Object.fromEntries(players.map(player => [player.id, player.points]))
    };
  }) : [];
  const leagueName = String(first(settings, 'name', first(standings, 'name', 'Yahoo league')));
  const season = String(first(settings, 'season', first(standings, 'season', new Date().getFullYear())));
  const league = {
    league_id: leagueId,
    name: leagueName,
    season,
    provider: 'yahoo',
    total_rosters: teams.length,
    settings: {
      playoff_start_week: number(first(settings, 'playoff_start_week', 15), 15),
      playoff_teams: number(first(settings, 'num_playoff_teams', first(settings, 'playoff_teams', 6)), 6),
      draft_rounds: number(first(settings, 'draft_rounds', 8), 8)
    }
  };
  return {
    league,
    rosters: normalizedRosters,
    users,
    matchups,
    transactions: normalizeTransactions(transactions, teams, playerMap),
    provider: 'yahoo',
    week
  };
}

export async function getYahooLeagueBundle(leagueId, week) {
  const [standings, scoreboard, settings, transactions, rosterData, playerMap] = await Promise.all([
    subscribeResource(leagueId, 'standings', week),
    subscribeResource(leagueId, 'scoreboard', week, 60000),
    subscribeResource(leagueId, 'settings', week, 86400000),
    subscribeResource(leagueId, 'transactions', week),
    subscribeResource(leagueId, 'rosters', week),
    getPlayerDatabase().catch(() => new Map())
  ]);
  if (!standings || !scoreboard || !settings) throw new Error('Yahoo league data is unavailable.');
  const nameMap = new Map([...playerMap.values()].map(player => [normalizeName(player.name), player]));
  const rosters = rosterData ? values(rosterData, 'team').map(team => ({ teamKey: String(first(team, 'team_key', '')), data: team })).filter(entry => entry.teamKey) : [];
  return normalizeBundle({ leagueId, week, standings, scoreboard, settings, transactions, rosters, playerMap: nameMap });
}
