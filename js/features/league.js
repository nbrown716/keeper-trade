import { getSleeperLeagueId, getNflState, getLeagueBundle, leagueUsers, rosterOwner, rosterPoints } from '../data/sleeper.js';
import { getLeagueConnections, getActiveLeagueConnection, addLeagueConnection, setActiveLeagueConnection, removeLeagueConnection, renameLeagueConnection } from '../data/league-connections.js';
import { getPlayerDatabase } from '../data/player-db.js';
import { liveData } from '../data/live-data.js';
import { dealerSource, normalizeDealerPlayers } from '../data/dynasty-dealer.js';
import { SCOREBOARD_SOURCE, normalizeGames } from '../data/espn.js';
import { subscribeGameWeather, playerWeatherImpact } from '../data/weather.js';
import { weatherBadge } from '../ui/weather-ui.js';
import { setLeagueSnapshot } from '../data/league-state.js';

let section;
let bundle;
let playerMap = new Map();
let powerHistory = {};
let games = [];
let weatherByGame = {};
let weatherCleanup = () => {};
let weatherScheduleKey = '';
let selectedProvider = 'sleeper';
let loadGeneration = 0;
const yahooClient = () => import('../data/yahoo.js');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function yahooAttribution() {
  return '<a class="kt-yahoo-attribution" href="https://sports.yahoo.com/fantasy/" target="_blank" rel="noopener"><img src="https://s.yimg.com/rz/p/yahoo_frontpage_en-US_s_f_p_205x58_frontpage.png" alt="Yahoo" width="86" height="24" loading="lazy"><span>Fantasy data provided by Yahoo Fantasy</span></a>';
}

function savedLeaguesMarkup() {
  const connections = getLeagueConnections();
  if (!connections.length) return '';
  return `<div class="kt-saved-leagues"><span class="kt-widget-label">Your leagues</span>${connections.map(connection => `<button class="kt-saved-league" type="button" data-load-provider="${connection.provider}" data-load-id="${connection.id}"><span>${connection.provider === 'sleeper' ? 'S' : 'Y'}</span><div><strong>${escapeHtml(connection.name)}</strong><small>${connection.provider === 'sleeper' ? 'Sleeper' : 'Yahoo'} · ${escapeHtml(connection.id)}</small></div><b>Open</b></button>`).join('')}</div>`;
}

function connectMarkup() {
  return `<div class="kt-league-connect"><span class="kt-league-ball" aria-hidden="true">KT</span><div><span class="kt-eyebrow">Multi-league mode</span><h3>Every league. One command center.</h3><p>Switch between Sleeper and Yahoo leagues without losing your place.</p></div>${savedLeaguesMarkup()}<div class="kt-provider-tabs" role="group" aria-label="League provider"><button class="kt-chip" type="button" data-provider="sleeper" aria-pressed="${selectedProvider === 'sleeper'}">Sleeper</button><button class="kt-chip" type="button" data-provider="yahoo" aria-pressed="${selectedProvider === 'yahoo'}">Yahoo</button></div><form id="sleeper-connect" ${selectedProvider === 'sleeper' ? '' : 'hidden'}><label for="sleeper-id">Paste your Sleeper league link or ID</label><div><input class="kt-control" id="sleeper-id" type="text" autocomplete="off" spellcheck="false" required placeholder="sleeper.com/leagues/… or league ID"><button class="kt-btn kt-btn-primary" type="submit">Connect Sleeper</button></div><small>In Sleeper: League → Settings → copy the league link or League ID. Public, read-only data; stored only on this device.</small></form><div id="yahoo-connect-panel" ${selectedProvider === 'yahoo' ? '' : 'hidden'}><h4>Connect with Yahoo</h4><p>Authorize Yahoo once. OAuth tokens stay encrypted in the Cloudflare Worker; only a random session ID stays on this device.</p><button class="kt-btn kt-btn-primary" type="button" id="yahoo-connect">Sign in with Yahoo</button><p class="kt-muted" id="yahoo-status" role="status"></p><div class="kt-yahoo-league-list" id="yahoo-league-list"></div>${yahooAttribution()}</div></div>`;
}

function starterWeatherMarkup(matchup) {
  const impacted = (matchup.starters || []).map(id => playerMap.get(String(id))).filter(Boolean).map(player => ({ player, impact: playerWeatherImpact(player, games, weatherByGame) })).filter(item => item.impact);
  if (!impacted.length) return '';
  return `<div class="kt-matchup-starters">${impacted.map(({ player, impact }) => `<div class="kt-starter-weather"><span>${escapeHtml(player.name)}</span>${weatherBadge(impact)}</div>`).join('')}</div>`;
}

function matchupMarkup(rosters) {
  const groups = new Map();
  bundle.matchups.forEach(matchup => {
    if (!groups.has(matchup.matchup_id)) groups.set(matchup.matchup_id, []);
    groups.get(matchup.matchup_id).push(matchup);
  });
  const pairs = [...groups.values()].filter(pair => pair.length === 2).map(pair => {
    const [a, b] = pair;
    return { a, b, difference: Math.abs((a.points || 0) - (b.points || 0)) };
  }).sort((a, b) => a.difference - b.difference);
  return pairs.map((pair, index) => {
    const a = rosters.get(pair.a.roster_id);
    const b = rosters.get(pair.b.roster_id);
    const total = (pair.a.points || 0) + (pair.b.points || 0);
    const odds = total ? pair.a.points / total * 100 : 50;
    return `<article class="kt-matchup-card${index === 0 ? ' is-closest' : ''}"><div class="kt-matchup-label">${index === 0 ? 'Closest matchup' : `Matchup ${index + 1}`}</div><div class="kt-matchup-team"><strong>${escapeHtml(a.name)}</strong><span class="kt-num">${(pair.a.points || 0).toFixed(2)}</span><small>Proj ${(pair.a.projected_points || pair.a.points || 0).toFixed(2)}</small></div>${starterWeatherMarkup(pair.a)}<div class="kt-matchup-team"><strong>${escapeHtml(b.name)}</strong><span class="kt-num">${(pair.b.points || 0).toFixed(2)}</span><small>Proj ${(pair.b.projected_points || pair.b.points || 0).toFixed(2)}</small></div>${starterWeatherMarkup(pair.b)}<div class="kt-odds"><span style="width:${odds}%"></span></div><div class="kt-odds-labels"><span>${odds.toFixed(0)}%</span><span>${(100 - odds).toFixed(0)}%</span></div></article>`;
  }).join('') || '<p class="kt-muted">Matchups appear when the week begins.</p>';
}

function powerMarkup(rosters) {
  const ranked = [...rosters.values()].map(roster => ({ ...roster, power: roster.fp + roster.wins * 10 - roster.losses * 5 })).sort((a, b) => b.power - a.power);
  const leagueKey = String(bundle.league?.league_id || getSleeperLeagueId() || '');
  const rankedPower = Object.fromEntries(ranked.map((roster, index) => [roster.id, index + 1]));
  const sameLeague = powerHistory.league === leagueKey && powerHistory.week && typeof powerHistory.current === 'object';
  const previous = !sameLeague ? {} : powerHistory.week === bundle.week ? (powerHistory.previous || {}) : powerHistory.current;
  powerHistory = { league: leagueKey, week: bundle.week, current: rankedPower, previous };
  try { localStorage.setItem('kt-power-history:v1', JSON.stringify(powerHistory)); } catch (_) {}
  return ranked.map((roster, index) => {
    const movement = (previous[roster.id] || index + 1) - (index + 1);
    return `<div class="kt-power-row"><span class="kt-power-rank">${index + 1}</span><strong>${escapeHtml(roster.name)}</strong><span class="kt-num">${roster.fp.toFixed(1)}</span><b class="${movement >= 0 ? 'kt-delta-up' : 'kt-delta-down'}">${movement > 0 ? '↑' : movement < 0 ? '↓' : '—'}${movement ? Math.abs(movement) : ''}</b></div>`;
  }).join('');
}

function tradeAssets(transaction, rosterA) {
  const values = normalizeDealerPlayers(liveData.sources.get(dealerSource())?.data);
  const valueMap = new Map(values.map(player => [String(player.id), player.value]));
  const assets = { A: [], B: [] };
  const push = (id, side) => {
    const player = playerMap.get(id) || { id, name: `Player ${id}`, position: '', team: '—' };
    const ref = { name: player.name, n: player.name, pos: player.position, p: player.position, team: player.team, t: player.team, pick: false };
    assets[side].push({ ref, mv: (valueMap.get(String(id)) || 0) / 100 });
  };
  Object.entries(transaction.adds || {}).forEach(([id, roster]) => push(id, roster === rosterA ? 'A' : 'B'));
  (transaction.draft_picks || []).forEach(pick => {
    const name = `${pick.season} Round ${pick.round}`;
    const ref = { name, n: name, pos: 'PICK', p: 'PICK', team: 'pick', t: 'pick', pick: true, round: Number(pick.round), yr: 0 };
    assets[pick.owner_id === rosterA ? 'A' : 'B'].push({ ref, mv: 0 });
  });
  return assets;
}

function wireMarkup(rosters) {
  const trades = bundle.transactions.filter(transaction => transaction.type === 'trade').slice(0, 6);
  if (!trades.length) return '<div class="kt-league-empty-line">No trades this week. The wire is quiet — for now.</div>';
  return trades.map((transaction, index) => {
    const rosterA = rosters.get(bundle.rosters.find(roster => roster.owner_id === transaction.creator)?.roster_id || transaction.roster_ids?.[0])?.id;
    const rosterName = rosters.get(rosterA)?.name || 'League member';
    const names = Object.keys(transaction.adds || {}).map(id => playerMap.get(id)?.name || `Player ${id}`);
    return `<article class="kt-wire-trade"><span class="kt-badge kt-badge-blue">Trade</span><div><strong>${escapeHtml(rosterName)}</strong><p>${escapeHtml(names.join(', ') || 'Draft picks and players moved')}</p></div><button class="kt-btn kt-btn-sm kt-btn-secondary" type="button" data-grade-trade="${index}" data-roster-a="${rosterA}">Grade this trade</button></article>`;
  }).join('');
}

function leagueSwitcherMarkup(active) {
  const connections = getLeagueConnections();
  return `<div class="kt-league-switcher"><label for="league-active">Active league<select id="league-active">${connections.map(connection => `<option value="${connection.provider}:${connection.id}" ${connection.provider === active.provider && connection.id === active.id ? 'selected' : ''}>${connection.provider === 'sleeper' ? 'Sleeper' : 'Yahoo'} · ${escapeHtml(connection.name)}</option>`).join('')}</select></label><button class="kt-btn kt-btn-sm kt-btn-secondary" type="button" id="league-add">Add league</button><button class="kt-btn kt-btn-sm kt-btn-ghost" type="button" id="league-remove">Remove</button></div>`;
}

function renderLeague() {
  const active = getActiveLeagueConnection();
  const users = leagueUsers(bundle.users);
  const rosters = new Map(bundle.rosters.map(roster => [roster.roster_id, {
    id: roster.roster_id,
    name: rosterOwner(roster, users),
    avatar: users.get(roster.owner_id)?.avatar,
    wins: roster.settings?.wins || 0,
    losses: roster.settings?.losses || 0,
    fp: rosterPoints(roster.settings)
  }]));
  const standings = [...rosters.values()].sort((a, b) => b.wins - a.wins || b.fp - a.fp);
  setLeagueSnapshot({ league: bundle.league, week: bundle.week, standings, provider: active?.provider || 'sleeper', leagueId: active?.id || '' });
  section.innerHTML = `<div class="kt-section-header"><div><span class="kt-eyebrow">${escapeHtml(bundle.league.name)}</span><h2 class="kt-display">Your league is live.</h2></div><div class="kt-league-week-actions"><a class="kt-btn kt-btn-sm kt-btn-secondary" href="pulse.html">League Pulse</a><a class="kt-btn kt-btn-sm kt-btn-secondary" href="war-room.html">War Room</a></div></div>${leagueSwitcherMarkup(active)}<div class="kt-league-grid"><section class="kt-league-card kt-standings-card"><div class="kt-league-card-head"><h3>Standings</h3><span class="kt-badge">Week ${bundle.week}</span></div>${standings.map((roster, index) => `<div class="kt-standing-row"><span>${index + 1}</span><strong>${escapeHtml(roster.name)}</strong><b>${roster.wins}–${roster.losses}</b><span>${roster.fp.toFixed(1)}</span></div>`).join('')}</section><section class="kt-league-card kt-matchups-card"><div class="kt-league-card-head"><h3>This week</h3><div class="kt-league-week-actions"><span class="kt-badge kt-badge-accent">Live scores</span><a class="kt-btn kt-btn-sm kt-btn-primary kt-watch-week" href="drive.html"><span aria-hidden="true">▶</span> Watch your week</a></div></div><div class="kt-matchup-grid">${matchupMarkup(rosters)}</div></section><section class="kt-league-card"><div class="kt-league-card-head"><h3>Power rankings</h3><span class="kt-badge kt-badge-blue">Score + record</span></div>${powerMarkup(rosters)}</section><section class="kt-league-card kt-wire-card"><div class="kt-league-card-head"><h3>Trade wire</h3><span class="kt-badge kt-badge-accent">One-tap grade</span></div>${wireMarkup(rosters)}</section></div>${active?.provider === 'yahoo' ? yahooAttribution() : ''}`;
  section.querySelector('#league-active').addEventListener('change', event => {
    const [provider, id] = event.target.value.split(/:(.*)/);
    setActiveLeagueConnection(provider, id);
    loadLeague(id);
  });
  section.querySelector('#league-add').addEventListener('click', () => {
    section.innerHTML = connectMarkup();
    mountConnect();
  });
  section.querySelector('#league-remove').addEventListener('click', () => {
    if (!active || !window.confirm(`Remove ${active.name} from this device?`)) return;
    const next = removeLeagueConnection(active.provider, active.id);
    bundle = null;
    if (next) loadLeague(next.id);
    else {
      section.innerHTML = connectMarkup();
      mountConnect();
    }
  });
  section.querySelectorAll('[data-grade-trade]').forEach(button => button.addEventListener('click', () => {
    const trades = bundle.transactions.filter(transaction => transaction.type === 'trade');
    const transaction = trades[Number(button.dataset.gradeTrade)];
    const rosterA = Number(button.dataset.rosterA);
    const pending = {
      sides: tradeAssets(transaction, rosterA),
      names: [rosters.get(rosterA)?.name || 'Team A', 'Other side'],
      origin: bundle.league.name,
      transactionId: transaction.transaction_id
    };
    try { localStorage.setItem('kt-pending-trade:v1', JSON.stringify(pending)); } catch (_) {}
    window.location.href = 'keeper.html?fromLeague=1';
  }));
}

function syncWeather() {
  const key = games.map(game => `${game.id}:${game.venue}:${game.date}`).join('|');
  if (key === weatherScheduleKey) return;
  weatherScheduleKey = key;
  weatherCleanup();
  weatherByGame = {};
  if (!games.length) return;
  weatherCleanup = subscribeGameWeather(games, conditions => {
    weatherByGame = conditions;
    if (bundle) renderLeague();
  });
}

async function loadLeague(id) {
  const generation = ++loadGeneration;
  section.innerHTML = '<div class="kt-league-loading"><span class="kt-skeleton kt-skeleton-card"></span><span class="kt-skeleton kt-skeleton-card"></span><span class="kt-skeleton kt-skeleton-card"></span><span class="kt-sr-only">Loading your league</span></div>';
  try {
    const state = await getNflState();
    const week = Number(new URLSearchParams(window.location.search).get('sleeperweek')) || state.display_week || state.week || 1;
    const [leagueBundle, players] = await Promise.all([getLeagueBundle(id, week), getPlayerDatabase()]);
    if (generation !== loadGeneration) return;
    bundle = { ...leagueBundle, week };
    playerMap = players;
    const active = getActiveLeagueConnection();
    if (active) renameLeagueConnection(active.provider, active.id, bundle.league.name);
    try {
      const saved = JSON.parse(localStorage.getItem('kt-power-history:v1'));
      powerHistory = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch (_) { powerHistory = {}; }
    renderLeague();
  } catch (_) {
    if (generation !== loadGeneration) return;
    section.innerHTML = `<div class="kt-league-connect"><div><span class="kt-eyebrow">League reconnecting</span><h3>That league is out of reach right now.</h3><p>Check the connection and try again. Your other leagues and tools are unaffected.</p></div><button class="kt-btn" type="button" id="league-retry">Try again</button><button class="kt-btn kt-btn-ghost" type="button" id="league-edit">Choose another league</button></div>`;
    section.querySelector('#league-retry').addEventListener('click', () => loadLeague(id));
    section.querySelector('#league-edit').addEventListener('click', () => { section.innerHTML = connectMarkup(); mountConnect(); });
  }
}

async function showYahooLeagues() {
  const status = section.querySelector('#yahoo-status');
  const list = section.querySelector('#yahoo-league-list');
  if (!status || !list) return;
  status.textContent = 'Loading your Yahoo leagues…';
  try {
    const leagues = await (await yahooClient()).listYahooLeagues();
    status.textContent = leagues.length ? 'Choose a league to add it to Keeper Trade.' : 'No Yahoo fantasy football leagues were found for this account.';
    list.innerHTML = leagues.map(league => `<button class="kt-saved-league" type="button" data-yahoo-id="${escapeHtml(league.id)}" data-yahoo-name="${escapeHtml(league.name)}"><span>Y</span><div><strong>${escapeHtml(league.name)}</strong><small>${escapeHtml(league.season)} · Week ${league.week}</small></div><b>Add</b></button>`).join('');
    list.querySelectorAll('[data-yahoo-id]').forEach(button => button.addEventListener('click', () => {
      const connection = addLeagueConnection('yahoo', button.dataset.yahooId, button.dataset.yahooName);
      loadLeague(connection.id);
    }));
  } catch (error) {
    status.textContent = error.message;
  }
}

function mountConnect() {
  section.querySelectorAll('[data-provider]').forEach(button => button.addEventListener('click', () => {
    selectedProvider = button.dataset.provider;
    section.querySelectorAll('[data-provider]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    section.querySelector('#sleeper-connect').hidden = selectedProvider !== 'sleeper';
    section.querySelector('#yahoo-connect-panel').hidden = selectedProvider !== 'yahoo';
    if (selectedProvider === 'yahoo' && new URLSearchParams(window.location.search).get('yahoo') === 'connected') showYahooLeagues();
  }));
  section.querySelectorAll('[data-load-provider]').forEach(button => button.addEventListener('click', () => {
    setActiveLeagueConnection(button.dataset.loadProvider, button.dataset.loadId);
    loadLeague(button.dataset.loadId);
  }));
  const form = section.querySelector('#sleeper-connect');
  const input = section.querySelector('#sleeper-id');
  input.value = getActiveLeagueConnection()?.provider === 'sleeper' ? getSleeperLeagueId() : '';
  input.addEventListener('input', () => input.setCustomValidity(''));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const id = input.value.trim().match(/(\d{15,20})/)?.[1];
    if (!id) {
      input.setCustomValidity('Paste a full Sleeper league link or numeric league ID.');
      input.reportValidity();
      return;
    }
    addLeagueConnection('sleeper', id);
    loadLeague(id);
  });
  section.querySelector('#yahoo-connect')?.addEventListener('click', async () => {
    const status = section.querySelector('#yahoo-status');
    try {
      status.textContent = 'Opening secure Yahoo sign-in…';
      const url = await (await yahooClient()).getYahooConnectUrl();
      window.location.assign(url);
    } catch (error) {
      status.textContent = error.message;
    }
  });
  const oauthResult = new URLSearchParams(window.location.search).get('yahoo');
  if (oauthResult) {
    selectedProvider = 'yahoo';
    section.querySelectorAll('[data-provider]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.provider === 'yahoo')));
    section.querySelector('#sleeper-connect').hidden = true;
    section.querySelector('#yahoo-connect-panel').hidden = false;
    if (oauthResult === 'connected') showYahooLeagues();
    else section.querySelector('#yahoo-status').textContent = 'Yahoo authorization could not complete. Try again when you are ready.';
    history.replaceState(null, '', `${window.location.pathname}#league`);
  }
}

export function mountLeague() {
  if (section) return;
  section = document.createElement('section');
  section.className = 'kt-container kt-section kt-league-section';
  section.id = 'league';
  section.setAttribute('aria-label', 'Multi-league mode');
  const forYou = document.querySelector('#for-you-title')?.closest('.kt-section');
  if (forYou) forYou.before(section);
  liveData.subscribe(SCOREBOARD_SOURCE, snapshot => {
    if (snapshot.statusOnly) return;
    games = normalizeGames(snapshot.data);
    syncWeather();
  });
  const id = getSleeperLeagueId();
  if (id) loadLeague(id);
  else {
    section.innerHTML = connectMarkup();
    mountConnect();
  }
  if (window.location.hash === '#league') {
    section.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
}
