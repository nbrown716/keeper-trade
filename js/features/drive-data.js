import { liveData } from '../data/live-data.js';
import { getNflState, getLeagueBundle, leagueUsers, rosterOwner } from '../data/sleeper.js';
import { getPlayerDatabase } from '../data/player-db.js';
import { normalizeGames, summarySource } from '../data/espn.js';
import { resolveStadium, weatherImpacts } from '../data/weather.js';

export const DRIVE_DURATION = 50;
const MANAGER_KEY = 'kt-drive-manager:v1';

export const TEAM_COLORS = {
  ARI: '#97233f', ATL: '#a71930', BAL: '#241773', BUF: '#00338d', CAR: '#0085ca', CHI: '#c83803', CIN: '#fb4f14', CLE: '#ff3c00',
  DAL: '#003594', DEN: '#fb4f14', DET: '#0076b6', GB: '#ffb612', HOU: '#a71930', IND: '#002c5f', JAX: '#d7a22a', KC: '#e31837',
  LAC: '#0080c6', LAR: '#003594', LV: '#a5acaf', MIA: '#008e97', MIN: '#4f2683', NE: '#002244', NO: '#d3bc8d', NYG: '#0b2265',
  NYJ: '#125740', PHI: '#004c54', PIT: '#ffb612', SEA: '#69be28', SF: '#aa0000', TB: '#d50a0a', TEN: '#4b92db', WAS: '#5a1414'
};

function waitForSource(key) {
  return new Promise(resolve => {
    let settled = false;
    let unsubscribe;
    unsubscribe = liveData.subscribe(key, snapshot => {
      if (!snapshot.data && snapshot.status !== 'error') return;
      settled = true;
      resolve(snapshot.data || null);
      if (typeof unsubscribe === 'function') unsubscribe();
    });
    if (settled && typeof unsubscribe === 'function') unsubscribe();
  });
}

function fetchSource(key, url, cadence = 300000) {
  liveData.register(key, { url, cadence });
  return waitForSource(key);
}

export async function defaultDriveWeek() {
  const state = await getNflState();
  return Math.max(1, Number(state?.display_week || state?.week || 2) - 1);
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
}

function athleteStats(summary, player) {
  const rows = [];
  summary?.boxscore?.players?.forEach(team => {
    team.statistics?.forEach(category => {
      category.athletes?.forEach(athlete => {
        if (normalizeName(athlete.athlete?.displayName) !== normalizeName(player.name)) return;
        const values = Object.fromEntries((category.labels || []).map((label, index) => [label, category.stats?.[index] ?? athlete.stats?.[index] ?? '']));
        rows.push({ name: category.name, label: category.displayName, values });
      });
    });
  });
  return rows;
}

function statDetails(player, summary) {
  const rows = athleteStats(summary, player);
  const passing = rows.find(row => row.name === 'passing' || row.values['C/ATT']);
  const rushing = rows.find(row => row.name === 'rushing' || row.values.CAR);
  const receiving = rows.find(row => row.name === 'receiving' || row.values.REC);
  if (player.position === 'QB' && passing) return [`${passing.values['C/ATT']} PASS`, `${passing.values.YDS || 0} YDS`, `${passing.values.TD || 0} PASS TD`];
  if (player.position === 'RB' && rushing) return [`${rushing.values.CAR || 0} CAR`, `${rushing.values.YDS || 0} YDS`, `${rushing.values.TD || 0} RUSH TD`];
  if (receiving) return [`${receiving.values.REC || 0} REC`, `${receiving.values.YDS || 0} YDS`, `${receiving.values.TD || 0} REC TD`];
  if (rushing) return [`${rushing.values.CAR || 0} CAR`, `${rushing.values.YDS || 0} YDS`, `${rushing.values.TD || 0} RUSH TD`];
  return ['NO BOX SCORE', 'BYE / NO GAME', '0 TD'];
}

function historicalWeather(summary, stadium) {
  const conditions = summary?.gameInfo?.weather;
  if (!conditions || stadium?.roof === 'dome') return null;
  const temperature = Number(conditions.temperature ?? conditions.highTemperature);
  const precipitation = Number(conditions.precipitation || 0);
  const wind = Number(conditions.windSpeed || conditions.wind_speed || conditions.wind || 0);
  if (!Number.isFinite(temperature)) return null;
  return { temperature, precipitation, wind, impacts: weatherImpacts(wind, precipitation, temperature) };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export async function loadDriveRecap(leagueId, week, rosterId) {
  const [bundle, playerMap] = await Promise.all([getLeagueBundle(leagueId, week), getPlayerDatabase()]);
  if (!bundle.matchups.length) throw new Error('This week has no matchup data yet.');
  const users = leagueUsers(bundle.users);
  const managers = bundle.rosters.map(roster => ({ id: roster.roster_id, name: rosterOwner(roster, users) })).sort((a, b) => a.name.localeCompare(b.name));
  let selected = Number(rosterId);
  if (!selected) {
    try { selected = Number(localStorage.getItem(MANAGER_KEY)); } catch (_) {}
  }
  if (!selected) {
    let localName = '';
    try { localName = JSON.parse(localStorage.getItem('kt-gamification:v1'))?.manager || ''; } catch (_) {}
    selected = managers.find(manager => normalizeName(manager.name) === normalizeName(localName))?.id || managers[0]?.id;
  }
  const matchup = bundle.matchups.find(item => item.roster_id === selected);
  if (!matchup) throw new Error('Choose a manager with a matchup this week.');
  const opponent = bundle.matchups.find(item => item.matchup_id === matchup.matchup_id && item.roster_id !== selected);
  try { localStorage.setItem(MANAGER_KEY, String(selected)); } catch (_) {}

  const season = bundle.league.season || (await getNflState())?.season || new Date().getFullYear();
  const scoreboard = await fetchSource(`drive-scoreboard:${season}:${week}`, `https://keeper-trade-ai.nicholas-brown00.workers.dev/espn/scoreboard?dates=${season}&seasontype=2&week=${week}`, 86400000);
  const games = normalizeGames(scoreboard);
  const teamGames = new Map();
  games.forEach(game => {
    teamGames.set(game.home.abbreviation, game);
    teamGames.set(game.away.abbreviation, game);
  });
  const starterIds = (matchup.starters || []).filter(id => id !== '0');
  const gameIds = [...new Set(starterIds.map(id => teamGames.get(playerMap.get(id)?.team)?.id).filter(Boolean))];
  const summaries = new Map(await Promise.all(gameIds.map(async id => [id, await waitForSource(summarySource(id))])));

  const positionPoints = {};
  bundle.matchups.forEach(entry => (entry.starters || []).forEach(id => {
    const player = playerMap.get(id);
    const points = Number(entry.players_points?.[id] || 0);
    if (!player || id === '0') return;
    (positionPoints[player.position] ||= []).push(points);
  }));
  const averages = Object.fromEntries(Object.entries(positionPoints).map(([position, points]) => [position, points.reduce((sum, value) => sum + value, 0) / Math.max(1, points.length)]));

  const starters = await Promise.all(starterIds.map(async (id, index) => {
    const player = playerMap.get(id) || { id, name: `Player ${id}`, team: 'FA', position: 'NFL' };
    const game = teamGames.get(player.team) || null;
    const summary = game ? summaries.get(game.id) : null;
    const stadium = game ? await resolveStadium(game) : null;
    const points = Number(matchup.players_points?.[id] || 0);
    const average = averages[player.position] || 10;
    return {
      ...player,
      points,
      average,
      stats: statDetails(player, summary),
      game,
      stadium,
      weather: historicalWeather(summary, stadium),
      yards: Math.round(clamp((points / Math.max(1, average) - 1) * 20 + 10, -10, 35)),
      explosive: points >= Math.max(20, average * 1.5),
      bust: points < 5,
      color: TEAM_COLORS[player.team] || '#59a8ff',
      order: game ? new Date(game.date).getTime() : Number.MAX_SAFE_INTEGER,
      index
    };
  }));
  starters.sort((a, b) => a.order - b.order || a.index - b.index);

  const total = Number(matchup.points || 0);
  const opponentTotal = Number(opponent?.points || 0);
  const rank = bundle.matchups.slice().sort((a, b) => Number(b.points || 0) - Number(a.points || 0)).findIndex(item => item.roster_id === selected) + 1;
  return {
    leagueId,
    leagueName: bundle.league.name,
    week,
    rosterId: selected,
    manager: managers.find(manager => manager.id === selected)?.name || `Team ${selected}`,
    opponent: managers.find(manager => manager.id === opponent?.roster_id)?.name || 'Opponent',
    opponentRosterId: opponent?.roster_id,
    managers,
    starters,
    total,
    opponentTotal,
    result: total > opponentTotal ? 'W' : total < opponentTotal ? 'L' : 'T',
    margin: Math.abs(total - opponentTotal),
    rank,
    teams: bundle.matchups.length,
    duration: DRIVE_DURATION,
    beatDuration: 40 / Math.max(1, starters.length),
    cacheKey: `drive:${leagueId}:${week}:${selected}:${total}:${opponentTotal}`
  };
}
