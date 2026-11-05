import { liveData } from './live-data.js';

const BASE = 'https://api.sleeper.app/v1';
const STORAGE_KEY = 'kt-sleeper-league:v1';

export function getSleeperLeagueId() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY))?.id || ''; } catch (_) { return ''; }
}

export function setSleeperLeagueId(id) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, savedAt: Date.now() })); } catch (_) {}
}

function subscribeSource(key, path, cadence) {
  liveData.register(key, { url: `${BASE}/${path}`, cadence });
  return new Promise(resolve => {
    let unsubscribe;
    unsubscribe = liveData.subscribe(key, snapshot => {
      if (snapshot.data || snapshot.status === 'error') {
        if (typeof unsubscribe === 'function') unsubscribe();
        resolve(snapshot.data);
      }
    });
  });
}

export async function getNflState() {
  return subscribeSource('sleeper-nfl-state', 'state/nfl', 3600000);
}

export async function getLeagueBundle(id, week) {
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

export function leagueUsers(users) {
  return new Map(users.map(user => [user.user_id, user]));
}

export function rosterOwner(roster, users) {
  const user = users.get(roster.owner_id);
  return user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
}
