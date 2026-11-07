import { liveData } from './live-data.js';
import { addLeagueConnection, getActiveLeagueConnection } from './league-connections.js';

const BASE = 'https://api.sleeper.app/v1';

function isYahooLeague(id) {
  const active = getActiveLeagueConnection();
  return (active?.id === String(id) && active.provider === 'yahoo') || /^(?:nfl|\d{2,4})\.l\.\d+$/.test(String(id));
}

async function yahooBundle(id, week) {
  const { getYahooLeagueBundle } = await import('./yahoo.js');
  return getYahooLeagueBundle(id, week);
}

export function getSleeperLeagueId() {
  return getActiveLeagueConnection()?.id || '';
}

export function setSleeperLeagueId(id) {
  addLeagueConnection('sleeper', String(id || '').trim());
}

export function rosterPoints(settings = {}) {
  return Number(settings.fpts || 0) + Number(settings.fpts_decimal || 0) / 100;
}

function subscribeSource(key, path, cadence) {
  liveData.register(key, { url: `${BASE}/${path}`, cadence });
  return liveData.get(key).then(data => data ?? undefined);
}

// Calendar estimate used only when Sleeper's NFL state is unreachable and nothing is cached:
// Week 1 kicks off the Thursday after Labor Day (first Monday of September).
function estimatedNflState(now = new Date()) {
  const season = now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
  const laborDay = new Date(season, 8, 1);
  laborDay.setDate(1 + ((8 - laborDay.getDay()) % 7));
  const kickoff = new Date(season, 8, laborDay.getDate() + 3);
  const week = Math.min(18, Math.max(1, Math.floor((now - kickoff) / 604800000) + 1));
  return { season: String(season), week, display_week: week, season_type: 'regular', estimated: true };
}

export async function getNflState() {
  const state = await subscribeSource('sleeper-nfl-state', 'state/nfl', 3600000);
  return state && typeof state === 'object' ? state : estimatedNflState();
}

export async function getLeagueBundle(id, week) {
  if (isYahooLeague(id)) return yahooBundle(id, week);
  const [league, rosters, users, matchups, transactions] = await Promise.all([
    subscribeSource(`sleeper-league:${id}`, `league/${id}`, 300000),
    subscribeSource(`sleeper-rosters:${id}`, `league/${id}/rosters`, 300000),
    subscribeSource(`sleeper-users:${id}`, `league/${id}/users`, 300000),
    subscribeSource(`sleeper-matchups:${id}:${week}`, `league/${id}/matchups/${week}`, 60000),
    subscribeSource(`sleeper-transactions:${id}:${week}`, `league/${id}/transactions/${week}`, 300000)
  ]);
  if (!league || !rosters || !users) throw new Error('League unavailable');
  return { league, rosters, users, matchups: matchups || [], transactions: transactions || [] };
}

export async function getLeagueLineage(id) {
  if (isYahooLeague(id)) {
    const bundle = await yahooBundle(id, 1);
    return [bundle.league];
  }
  const lineage = [];
  const seen = new Set();
  let current = String(id);
  while (current && !seen.has(current) && lineage.length < 10) {
    seen.add(current);
    try {
      const league = await subscribeSource(`sleeper-league:${current}`, `league/${current}`, 86400000);
      if (!league) break;
      lineage.push(league);
      current = String(league.previous_league_id || '');
    } catch (_) { break; }
  }
  return lineage;
}

export function leagueUsers(users) {
  return new Map(users.map(user => [user.user_id, user]));
}

export function rosterOwner(roster, users) {
  const user = users.get(roster.owner_id);
  return user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
}
