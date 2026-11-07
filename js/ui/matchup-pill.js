// Matchup Pill (spec §6 #1): a Live Activity-style pill on every page while your matchup is being played.
// Your live score vs your opponent's and your win probability; tap → The Drive, live.
// Shows from the week's first kickoff until the NFL week rolls over. Needs a connected Sleeper league and a
// remembered team (picked once in The Drive, Wrapped, Sunday, Weather Center...). Dismissible per session.
import { liveData } from '../data/live-data.js';
import { getSleeperLeagueId, getLeagueBundle, getNflState } from '../data/sleeper.js';
import { getActiveLeagueConnection } from '../data/league-connections.js';
import { normalizeGames } from '../data/espn.js';
import { getPlayerDatabase } from '../data/player-db.js';
import { getPlayerBaselines } from '../data/player-baselines.js';
import { winProbability } from '../data/win-prob.js';

const MANAGER_KEY = 'kt-drive-manager:v1';
const DISMISS_KEY = 'kt-pill-dismissed';
const WORKER = 'https://keeper-trade-ai.nicholas-brown00.workers.dev';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

// The week's slate refreshes every 30 s while any game is live, every 5 min otherwise.
export function liveWeekSource(season, week) {
  const key = `live-week:${season}:${week}`;
  liveData.register(key, {
    url: `${WORKER}/espn/scoreboard?dates=${season}&seasontype=2&week=${week}`,
    cadence: data => (normalizeGames(data).some(game => game.state === 'in') ? 30000 : 300000)
  });
  return key;
}

export function pillState({ matchups, rosterId, games, players, baselines }) {
  const mine = matchups.find(entry => entry.roster_id === rosterId);
  const opp = mine && matchups.find(entry => entry.matchup_id === mine.matchup_id && entry.roster_id !== rosterId);
  if (!mine || !opp) return null;
  const started = games.some(game => game.state !== 'pre');
  if (!started) return null;
  const byTeam = new Map();
  games.forEach(game => { byTeam.set(game.home.abbreviation, game); byTeam.set(game.away.abbreviation, game); });
  const side = entry => (entry.starters || []).filter(id => id !== '0').map(id => {
    const player = players.get(String(id));
    return { id, position: player?.position || '', team: player?.team || '', points: Number(entry.players_points?.[id] || 0) };
  });
  const result = winProbability(side(mine), side(opp), { gameFor: team => byTeam.get(team) || null, baselines });
  const live = games.some(game => game.state === 'in');
  return { ...result, live, me: Number(mine.points || 0), them: Number(opp.points || 0) };
}

function render(pill, state, week) {
  if (!state) { pill.hidden = true; return; }
  const pct = Math.round(state.pA * 100);
  const label = state.final ? (state.me > state.them ? 'WON' : state.me < state.them ? 'LOST' : 'TIED') : state.live ? 'LIVE' : `WK ${week}`;
  const tone = state.final ? (state.me >= state.them ? 'is-up' : 'is-down') : pct >= 50 ? 'is-up' : 'is-down';
  pill.hidden = false;
  pill.className = `kt-matchup-pill ${tone}${state.live ? ' is-live' : ''}`;
  pill.querySelector('a').href = `drive.html?week=${week}&mode=race`;
  pill.querySelector('a').setAttribute('aria-label', `${state.final ? 'Final' : 'Your matchup'}: you ${state.me.toFixed(1)}, opponent ${state.them.toFixed(1)}${state.final ? '' : `, ${pct}% win probability, ${state.leftA} of your players still to play`}. Open The Drive.`);
  pill.querySelector('.kt-pill-body').innerHTML = `<span class="kt-pill-tag">${state.live ? '<i aria-hidden="true"></i>' : ''}${label}</span><span class="kt-pill-score"><b class="kt-pill-me">${state.me.toFixed(1)}</b><small>–</small><b>${state.them.toFixed(1)}</b></span>${state.final ? '' : `<span class="kt-pill-prob" style="--p:${pct}%"><strong>${pct}%</strong></span>`}`;
}

export async function mountMatchupPill() {
  try { if (sessionStorage.getItem(DISMISS_KEY)) return; } catch (_) {}
  if (/(drive|wrapped|command|offline|404)\.html$/.test(location.pathname)) return;
  const leagueId = getSleeperLeagueId();
  const rosterId = Number(localStorage.getItem(MANAGER_KEY));
  if (!leagueId || !rosterId || getActiveLeagueConnection()?.provider === 'yahoo') return;
  const nfl = await getNflState();
  if (nfl.season_type !== 'regular' && nfl.season_type !== 'post') return;
  const week = Number(nfl.week || nfl.display_week);
  const bundle = await getLeagueBundle(leagueId, week);
  if (!bundle.matchups.some(entry => entry.roster_id === rosterId)) return;
  const [players, baselines] = await Promise.all([getPlayerDatabase(), getPlayerDatabase().then(map => getPlayerBaselines(leagueId, map)).catch(() => null)]);
  document.body.insertAdjacentHTML('beforeend', '<aside class="kt-matchup-pill" hidden aria-label="Live matchup"><a class="kt-pill-link" href="drive.html"><span class="kt-pill-body"></span></a><button type="button" class="kt-pill-close" aria-label="Hide the live matchup pill">×</button></aside>');
  const pill = document.querySelector('.kt-matchup-pill');
  pill.querySelector('.kt-pill-close').addEventListener('click', () => { pill.remove(); try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch (_) {} });
  const slateKey = liveWeekSource(nfl.season, week);
  const matchupKey = `sleeper-matchups:${leagueId}:${week}`;
  let games = [];
  let matchups = bundle.matchups;
  const update = () => render(pill, pillState({ matchups, rosterId, games, players, baselines }), week);
  liveData.subscribe(slateKey, snapshot => { if (snapshot.statusOnly) return; games = normalizeGames(snapshot.data); update(); });
  liveData.subscribe(matchupKey, snapshot => { if (snapshot.statusOnly || !Array.isArray(snapshot.data)) return; matchups = snapshot.data; update(); });
}
