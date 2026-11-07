// Weather Center: Thursday-to-Monday kickoff outlook for every game of any NFL week.
// Week picker, filters (all / outdoor / weather impact / your players) and a single-game picker.
import { mountNavigation } from '../ui/navigation.js';
import { mountPageTransitions } from '../ui/page-transitions.js';
import { getNflState, getSleeperLeagueId, getLeagueBundle, leagueUsers, rosterOwner } from '../data/sleeper.js';
import { getPlayerDatabase } from '../data/player-db.js';
import { getWeekSlate, getWeekWeather, WEATHER_LABELS } from '../data/weather-week.js';
import { weatherIcon, weatherBadge } from '../ui/weather-ui.js';
import { friendlyError } from '../ui/friendly-error.js';

const MANAGER_KEY = 'kt-drive-manager:v1';
const ET_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long' });
const ET_SHORT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
const ET_TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
const ET_HOUR = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric' });
const DAY_ORDER = ['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday'];

const els = {
  week: document.querySelector('#wx-week'),
  game: document.querySelector('#wx-game'),
  manager: document.querySelector('#wx-manager'),
  managerWrap: document.querySelector('#wx-manager-wrap'),
  filters: [...document.querySelectorAll('[data-wx-filter]')],
  board: document.querySelector('#wx-board'),
  summary: document.querySelector('#wx-summary'),
  status: document.querySelector('#wx-status')
};
const state = { season: '', week: 1, currentWeek: 1, games: [], weather: new Map(), filter: 'all', game: 'all', myTeams: new Map(), load: 0 };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
const round = value => (value === null || value === undefined || Number.isNaN(value) ? '–' : Math.round(value));

function windowLabel(game) {
  const day = ET_DAY.format(new Date(game.date));
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(game.date)));
  if (day === 'Sunday') return hour < 12 ? 'International' : hour < 16 ? 'Early window' : hour < 19 ? 'Late window' : 'Sunday Night';
  if (day === 'Thursday') return 'Thursday Night';
  if (day === 'Monday') return 'Monday Night';
  return day;
}

function arrow(direction) {
  if (direction === null || direction === undefined) return '';
  // Meteorological direction is where wind comes FROM; the arrow points where it blows TO.
  return `<span class="wx-arrow" style="--wx-dir:${(direction + 180) % 360}deg" aria-hidden="true">↑</span>`;
}

function card(game) {
  const wx = state.weather.get(game.id);
  const mine = [...(state.myTeams.get(game.away.abbreviation) || []), ...(state.myTeams.get(game.home.abbreviation) || [])];
  const head = `<header class="wx-card-head"><div class="wx-teams"><strong>${escapeHtml(game.away.abbreviation)}</strong><span>at</span><strong>${escapeHtml(game.home.abbreviation)}</strong></div><span class="wx-kick">${escapeHtml(ET_TIME.format(new Date(game.date)))} ET · ${escapeHtml(windowLabel(game))}</span></header>`;
  const where = `<p class="wx-venue">${escapeHtml(wx?.venue || game.venue || 'Venue TBA')}${wx?.city ? ` · ${escapeHtml(wx.city)}` : ''}</p>`;
  const players = mine.length ? `<p class="wx-mine"><span>Your players</span>${mine.map(name => `<b>${escapeHtml(name)}</b>`).join('')}</p>` : '';
  if (!wx || wx.status === 'unknown') return `<article class="wx-card">${head}${where}<p class="wx-muted">Kickoff conditions unavailable for this venue.</p>${players}</article>`;
  if (wx.status === 'pending') return `<article class="wx-card is-pending">${head}${where}<p class="wx-muted">Forecast opens ${escapeHtml(ET_SHORT.format(wx.opensOn))}, about 15 days before kickoff.</p>${players}</article>`;
  if (wx.dome) return `<article class="wx-card is-dome">${head}${where}<div class="wx-dome"><span class="wx-dome-chip">DOME</span><span>Climate controlled. Weather is not a factor.</span></div>${players}</article>`;
  const impacts = wx.impacts.map(weatherBadge).join('');
  const strip = wx.window.map(slot => `<li><span>${escapeHtml(ET_HOUR.format(new Date(`${slot.hour}:00Z`)))}</span><b>${round(slot.temperature)}°</b><small>${round(slot.wind)} mph</small><small>${round(slot.precipitation)}%</small></li>`).join('');
  return `<article class="wx-card${wx.severity ? ' has-impact' : ''}${wx.status === 'recorded' ? ' is-recorded' : ''}">${head}${where}
    <div class="wx-now">${weatherIcon(wx)}<div class="wx-temp"><strong>${round(wx.temperature)}°</strong><span>${escapeHtml(WEATHER_LABELS[wx.weatherCode] || '')}</span>${wx.feelsLike !== null && Math.abs(wx.feelsLike - wx.temperature) >= 3 ? `<small>Feels ${round(wx.feelsLike)}°</small>` : ''}</div>
    <dl class="wx-stats"><div><dt>Wind</dt><dd>${arrow(wx.direction)}${round(wx.wind)}<small> mph</small></dd></div><div><dt>Gusts</dt><dd>${round(wx.gust)}<small> mph</small></dd></div><div><dt>${wx.status === 'recorded' ? 'Precip' : 'Rain'}</dt><dd>${wx.status === 'recorded' ? `${(wx.precipAmount / 25.4).toFixed(2)}<small> in</small>` : `${round(wx.precipitation)}<small>%</small>`}</dd></div></dl></div>
    ${impacts ? `<div class="wx-impacts">${impacts}</div>` : ''}
    ${strip ? `<ol class="wx-strip" aria-label="Game window, hour by hour">${strip}</ol>` : ''}
    <p class="wx-tag">${wx.status === 'recorded' ? 'Recorded conditions' : 'Forecast'}</p>${players}</article>`;
}

function visibleGames() {
  return state.games.filter(game => {
    if (state.game !== 'all' && game.id !== state.game) return false;
    const wx = state.weather.get(game.id);
    if (state.filter === 'outdoor') return wx && !wx.dome && wx.status !== 'dome';
    if (state.filter === 'impact') return wx?.severity > 0;
    if (state.filter === 'mine') return state.myTeams.has(game.away.abbreviation) || state.myTeams.has(game.home.abbreviation);
    return true;
  });
}

function render() {
  const games = visibleGames();
  const byDay = new Map();
  games.forEach(game => {
    const day = ET_DAY.format(new Date(game.date));
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(game);
  });
  const days = [...byDay.entries()].sort((a, b) => DAY_ORDER.indexOf(a[0]) - DAY_ORDER.indexOf(b[0]));
  els.board.setAttribute('aria-busy', 'false');
  els.board.innerHTML = days.length
    ? days.map(([day, list]) => `<section class="wx-day" aria-label="${escapeHtml(day)}"><h2><span>${escapeHtml(day)}</span><small>${escapeHtml(ET_SHORT.format(new Date(list[0].date)))} · ${list.length} game${list.length === 1 ? '' : 's'}</small></h2><div class="wx-grid">${list.map(card).join('')}</div></section>`).join('')
    : `<div class="wx-empty"><strong>${state.filter === 'impact' ? 'No weather games this week.' : state.filter === 'mine' ? 'None of your players are in these games.' : 'No games match.'}</strong><p>${state.filter === 'impact' ? 'Every kickoff looks playable: no wind advisories, rain games, snow, or deep freezes.' : 'Try another filter or week.'}</p></div>`;
  const all = state.games.map(game => state.weather.get(game.id)).filter(Boolean);
  const impact = state.games.filter(game => state.weather.get(game.id)?.severity > 0);
  const domes = all.filter(item => item.dome).length;
  const pending = all.filter(item => item.status === 'pending').length;
  els.summary.innerHTML = `<div><strong>${impact.length}</strong><span>weather game${impact.length === 1 ? '' : 's'}</span></div><div><strong>${state.games.length - domes - pending}</strong><span>outdoor</span></div><div><strong>${domes}</strong><span>dome</span></div>${impact.length ? `<p>${impact.map(game => `<a href="#wx-${escapeHtml(game.id)}" data-focus-game="${escapeHtml(game.id)}">${escapeHtml(game.away.abbreviation)} at ${escapeHtml(game.home.abbreviation)}: ${escapeHtml(state.weather.get(game.id).impacts.map(item => item.label.toLowerCase()).join(', '))}</a>`).join('')}</p>` : '<p>No wind, rain, snow, or freeze flags at any kickoff this week.</p>'}`;
  els.summary.querySelectorAll('[data-focus-game]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    state.game = link.dataset.focusGame;
    els.game.value = state.game;
    render();
  }));
}

function fillGameSelect() {
  els.game.innerHTML = `<option value="all">All games (${state.games.length})</option>${state.games.map(game => `<option value="${escapeHtml(game.id)}">${escapeHtml(game.away.abbreviation)} at ${escapeHtml(game.home.abbreviation)} · ${escapeHtml(ET_DAY.format(new Date(game.date)).slice(0, 3))}</option>`).join('')}`;
  els.game.value = state.games.some(game => game.id === state.game) ? state.game : 'all';
  state.game = els.game.value;
}

async function loadMyPlayers() {
  state.myTeams = new Map();
  const leagueId = getSleeperLeagueId();
  if (!leagueId) { els.managerWrap.hidden = true; els.filters.find(button => button.dataset.wxFilter === 'mine').hidden = true; return; }
  try {
    const [bundle, players] = await Promise.all([getLeagueBundle(leagueId, state.week), getPlayerDatabase()]);
    const users = leagueUsers(bundle.users);
    const managers = bundle.rosters.map(roster => ({ id: roster.roster_id, name: rosterOwner(roster, users), roster })).sort((a, b) => a.name.localeCompare(b.name));
    let selected = Number(els.manager.value) || Number(localStorage.getItem(MANAGER_KEY)) || managers[0]?.id;
    if (!managers.some(manager => manager.id === selected)) selected = managers[0]?.id;
    els.manager.innerHTML = managers.map(manager => `<option value="${manager.id}"${manager.id === selected ? ' selected' : ''}>${escapeHtml(manager.name)}</option>`).join('');
    els.managerWrap.hidden = false;
    const roster = managers.find(manager => manager.id === selected)?.roster;
    const matchup = bundle.matchups.find(item => item.roster_id === selected);
    const ids = (matchup?.starters?.length ? matchup.starters : roster?.players || []).filter(id => id && id !== '0');
    ids.forEach(id => {
      const player = players.get(id);
      if (!player?.team) return;
      if (!state.myTeams.has(player.team)) state.myTeams.set(player.team, []);
      state.myTeams.get(player.team).push(player.name);
    });
  } catch (_) { els.managerWrap.hidden = true; }
}

async function loadWeek(week) {
  const sequence = ++state.load;
  state.week = week;
  els.board.setAttribute('aria-busy', 'true');
  els.board.innerHTML = Array.from({ length: 4 }, () => '<div class="wx-card wx-skeleton"><span class="kt-skeleton kt-skeleton-text"></span><span class="kt-skeleton kt-skeleton-text"></span><span class="kt-skeleton kt-skeleton-card"></span></div>').join('');
  els.status.textContent = `Loading Week ${week}…`;
  try {
    const games = await getWeekSlate(state.season, week);
    if (sequence !== state.load) return;
    if (!games.length) throw new Error(`Week ${week} has no scheduled games yet.`);
    state.games = games;
    fillGameSelect();
    const [weather] = await Promise.all([getWeekWeather(games), loadMyPlayers()]);
    if (sequence !== state.load) return;
    state.weather = weather;
    const first = new Date(games[0].date);
    const last = new Date(games.at(-1).date);
    els.status.textContent = `Week ${week} · ${ET_SHORT.format(first)} to ${ET_SHORT.format(last)} · ${week < state.currentWeek ? 'recorded conditions' : 'kickoff forecasts, refreshed every 30 minutes'}`;
    render();
    const url = new URL(window.location.href);
    url.searchParams.set('week', String(week));
    history.replaceState(null, '', url);
  } catch (error) {
    if (sequence !== state.load) return;
    els.board.setAttribute('aria-busy', 'false');
    els.board.innerHTML = `<div class="wx-empty"><strong>${escapeHtml(friendlyError(error, 'Weather is reconnecting.'))}</strong><p>Try again in a moment, or pick another week.</p><button class="kt-btn kt-btn-primary" type="button" id="wx-retry">Try again</button></div>`;
    els.board.querySelector('#wx-retry').addEventListener('click', () => loadWeek(week));
    els.status.textContent = '';
  }
}

async function init() {
  mountNavigation({ active: 'weather' });
  mountPageTransitions();
  const nfl = await getNflState();
  state.season = String(nfl.season || new Date().getFullYear());
  // Sleeper rolls the week on Tuesday, which matches a Thursday-to-Monday outlook.
  state.currentWeek = Math.min(18, Math.max(1, Number(nfl.display_week || nfl.week) || 1));
  els.week.innerHTML = Array.from({ length: 18 }, (_, index) => `<option value="${index + 1}">Week ${index + 1}${index + 1 === state.currentWeek ? ' · this week' : ''}</option>`).join('');
  const requested = Number(new URLSearchParams(window.location.search).get('week'));
  const week = requested >= 1 && requested <= 18 ? requested : state.currentWeek;
  els.week.value = String(week);
  els.week.addEventListener('change', () => { state.game = 'all'; loadWeek(Number(els.week.value)); });
  els.game.addEventListener('change', () => { state.game = els.game.value; render(); });
  els.manager.addEventListener('change', async () => { try { localStorage.setItem(MANAGER_KEY, els.manager.value); } catch (_) {} await loadMyPlayers(); render(); });
  els.filters.forEach(button => button.addEventListener('click', () => {
    state.filter = button.dataset.wxFilter;
    els.filters.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    render();
  }));
  loadWeek(week);
}

init();
