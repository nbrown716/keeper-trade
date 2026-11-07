import { liveData } from '../data/live-data.js';
import { SCOREBOARD_SOURCE, normalizeGames, scoreboardDate } from '../data/espn.js';
import { NEWS_SOURCE, normalizeNews, timeAgo } from '../data/news.js';
import { VALUES_SOURCE, normalizePlayers, playerPhoto } from '../data/player-values.js';
import { dealerSource, dealerMovers } from '../data/dynasty-dealer.js';
import { subscribeGameWeather, playerWeatherImpact } from '../data/weather.js';
import { weatherBadge, weatherGlyph } from '../ui/weather-ui.js';
import { getGamificationState } from './gamification.js';
import { levels } from '../data/gamification-data.js';

const LAYOUT_KEY = 'kt-dashboard:v2';
const PREVIOUS_LAYOUT_KEY = 'kt-dashboard:v1';
const WATCHLIST_KEY = 'kt-watchlist:v1';
const definitions = [
  { id: 'scores', name: 'Live scores', size: 'medium' },
  { id: 'weather', name: 'Sunday Weather Board', size: 'large' },
  { id: 'trending', name: 'Trending players', size: 'medium' },
  { id: 'watchlist', name: 'My watchlist', size: 'small' },
  { id: 'movers', name: 'Trade value movers', size: 'small' },
  { id: 'streak', name: 'Streak & XP', size: 'small' },
  { id: 'pickem', name: 'Pick’em countdown', size: 'small' },
  { id: 'countdown', name: 'NFL countdown', size: 'medium' },
  { id: 'news', name: 'News wire', size: 'medium' }
];
const sizes = ['small', 'medium', 'large'];
let layout;
let section;
let grid;
let editing = false;
let scoreSnapshot = {};
let valueSnapshot = {};
let newsSnapshot = {};
let movers;
let countdownTimer;
let drag;
let weatherByGame = {};
let weatherStates = {};
let weatherCleanup = () => {};
let weatherScheduleKey = '';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function sanitizeLayout(saved) {
  if (!Array.isArray(saved)) return null;
  const seen = new Set();
  const clean = [];
  saved.forEach(item => {
    if (!item || typeof item !== 'object' || !definitions.some(definition => definition.id === item.id) || seen.has(item.id)) return;
    seen.add(item.id);
    clean.push({ id: item.id, size: sizes.includes(item.size) ? item.size : 'medium' });
  });
  return clean.length || !saved.length ? clean : null;
}

function loadLayout() {
  const fallback = definitions.map(({ id, size }) => ({ id, size }));
  try {
    const current = sanitizeLayout(JSON.parse(localStorage.getItem(LAYOUT_KEY)));
    if (current) return current;
    const migrated = sanitizeLayout(JSON.parse(localStorage.getItem(PREVIOUS_LAYOUT_KEY)));
    if (!migrated) return fallback;
    if (!migrated.some(item => item.id === 'weather')) migrated.splice(migrated.findIndex(item => item.id === 'scores') + 1, 0, { id: 'weather', size: 'large' });
    return migrated;
  } catch (_) { return fallback; }
}

function saveLayout() {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch (_) {}
}

function watchlist() {
  const fallback = ['Jaxon Smith-Njigba', 'Jahmyr Gibbs', 'Drake London'];
  try {
    const saved = JSON.parse(localStorage.getItem(WATCHLIST_KEY));
    if (!Array.isArray(saved)) return fallback;
    return [...new Set(saved.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean))].slice(0, 50);
  } catch (_) { return fallback; }
}

function saveWatchlist(players) {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(players)); } catch (_) {}
  renderWatchlist();
}

function skeleton() {
  return '<div class="kt-widget-skeleton"><span class="kt-skeleton kt-skeleton-text"></span><span class="kt-skeleton kt-skeleton-text"></span><span class="kt-skeleton kt-skeleton-text"></span><span class="kt-skeleton kt-skeleton-text"></span></div>';
}

function emptyState(icon, title, text) {
  return `<div class="kt-widget-empty"><span aria-hidden="true">${icon}</span><strong>${title}</strong><p>${text}</p></div>`;
}

function renderScores() {
  const body = grid?.querySelector('[data-widget-body="scores"]');
  if (!body) return;
  const games = normalizeGames(scoreSnapshot.data);
  if (!games.length) { body.innerHTML = scoreSnapshot.status === 'loading' ? skeleton() : emptyState('☀', 'A rare quiet day', 'No games on this slate. The calculators are still open.'); return; }
  body.innerHTML = games.slice(0, 4).map(game => `<a class="kt-mini-game" href="game.html?id=${game.id}"><span>${escapeHtml(game.detail)}</span><div><strong>${escapeHtml(game.away.abbreviation)}</strong><b class="kt-num">${game.away.score}</b></div><div><strong>${escapeHtml(game.home.abbreviation)}</strong><b class="kt-num">${game.home.score}</b></div></a>`).join('');
}

function renderWeather() {
  const body = grid?.querySelector('[data-widget-body="weather"]');
  if (!body) return;
  const games = normalizeGames(scoreSnapshot.data);
  const outdoor = games.map(game => ({ game, weather: weatherByGame[game.id] })).filter(item => item.weather && !item.weather.dome).sort((a, b) => b.weather.severity - a.weather.severity || b.weather.wind - a.weather.wind);
  if (!outdoor.length) {
    const loading = games.length && Object.values(weatherStates).some(state => state === 'loading' || state === 'refreshing');
    body.innerHTML = loading ? skeleton() : emptyState('☀', 'Clear skies, clear decisions', games.length ? 'No outdoor forecasts or weather impacts on this slate.' : 'Outdoor game forecasts will appear on the next NFL slate.');
    return;
  }
  body.innerHTML = `<div class="kt-weather-board">${outdoor.map(({ game, weather }) => `<a class="kt-weather-game${weather.severity ? ' has-impact' : ''}" href="game.html?id=${escapeHtml(game.id)}"><span class="kt-weather-game-glyph" aria-hidden="true">${weatherGlyph(weather)}</span><div class="kt-weather-game-copy"><div><strong>${escapeHtml(game.away.abbreviation)} at ${escapeHtml(game.home.abbreviation)}</strong>${weather.impacts.map(weatherBadge).join('')}</div><span>${escapeHtml(weather.city)} · Wind ${Math.round(weather.wind)} mph · ${Math.round(weather.precipitation)}% precip</span></div><b class="kt-weather-game-temp">${Math.round(weather.temperature)}°</b></a>`).join('')}</div><p class="kt-weather-attribution"><a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a> · Ranked by impact</p>`;
}

function syncWeather() {
  const games = normalizeGames(scoreSnapshot.data);
  const key = games.map(game => `${game.id}:${game.venue}:${game.date}`).join('|');
  if (key === weatherScheduleKey) return;
  weatherScheduleKey = key;
  weatherCleanup();
  weatherByGame = {};
  weatherStates = {};
  if (!games.length) { renderWeather(); return; }
  weatherCleanup = subscribeGameWeather(games, (conditions, states) => {
    weatherByGame = conditions;
    weatherStates = states;
    renderWeather();
    renderWatchlist();
  });
}

function sparkline(player) {
  const points = Array.from({ length: 8 }, (_, index) => {
    const progress = index / 7 - 1;
    const value = 20 - progress * player.trend / Math.max(1, player.value) * 80 + Math.sin(index * 1.7) * 2;
    return `${index * 10},${Math.max(2, Math.min(22, value))}`;
  }).join(' ');
  return `<svg class="kt-spark" viewBox="0 0 70 24" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function playerRow(player, showRank = false) {
  return `<div class="kt-player-row"><img src="${escapeHtml(playerPhoto(player))}" alt="" loading="lazy"><div><strong>${escapeHtml(player.name)}</strong><span>${escapeHtml(player.position)} · ${escapeHtml(player.team)}${showRank && player.rank ? ` · ${player.rank}` : ''}</span></div>${sparkline(player)}<b class="kt-delta ${player.trend >= 0 ? 'kt-delta-up' : 'kt-delta-down'}">${player.trend >= 0 ? '+' : ''}${Math.round(player.trend).toLocaleString()}</b></div>`;
}

function renderTrending() {
  const body = grid?.querySelector('[data-widget-body="trending"]');
  if (!body) return;
  const players = normalizePlayers(valueSnapshot.data).filter(player => player.trend);
  if (!players.length) { body.innerHTML = valueSnapshot.status === 'loading' ? skeleton() : emptyState('↗', 'The market is catching its breath', 'Trend data will be back after the next refresh.'); return; }
  const risers = players.slice().sort((a, b) => b.trend - a.trend).slice(0, 3);
  const fallers = players.slice().sort((a, b) => a.trend - b.trend).slice(0, 3);
  body.innerHTML = `<div class="kt-trend-columns"><div><span class="kt-widget-label kt-delta-up">Risers · 30d</span>${risers.map(playerRow).join('')}</div><div><span class="kt-widget-label kt-delta-down">Fallers · 30d</span>${fallers.map(playerRow).join('')}</div></div>`;
}

function renderWatchlist() {
  const body = grid?.querySelector('[data-widget-body="watchlist"]');
  if (!body) return;
  const watched = watchlist();
  const players = normalizePlayers(valueSnapshot.data);
  const available = players.length ? players : watched.map(name => ({ name, position: 'NFL', team: '—', value: 0, trend: 0 }));
  const rows = watched.map(name => available.find(player => player.name === name) || { name, position: 'NFL', team: '—', value: 0, trend: 0 });
  const suggestions = players.filter(player => !watched.includes(player.name)).slice(0, 30);
  body.innerHTML = `${rows.length ? rows.map(player => `<div class="kt-watch-row"><div><strong>${escapeHtml(player.name)}${playerWeatherImpact(player, normalizeGames(scoreSnapshot.data), weatherByGame) ? `<span class="kt-watch-weather">${weatherBadge(playerWeatherImpact(player, normalizeGames(scoreSnapshot.data), weatherByGame))}</span>` : ''}</strong><span>${escapeHtml(player.position)} · ${escapeHtml(player.team)} · <b class="kt-num">${player.value.toLocaleString()}</b></span></div><button type="button" data-watch-remove="${escapeHtml(player.name)}" aria-label="Remove ${escapeHtml(player.name)} from watchlist">×</button></div>`).join('') : emptyState('☆', 'Your board is wide open', 'Add a player below and start tracking his value.')}${suggestions.length ? `<div class="kt-watch-add"><select aria-label="Player to add">${suggestions.map(player => `<option value="${escapeHtml(player.name)}">${escapeHtml(player.name)} · ${escapeHtml(player.position)}</option>`).join('')}</select><button class="kt-btn kt-btn-sm" type="button" data-watch-add>Add</button></div>` : ''}`;
  body.querySelectorAll('[data-watch-remove]').forEach(button => button.addEventListener('click', () => saveWatchlist(watched.filter(name => name !== button.dataset.watchRemove))));
  body.querySelector('[data-watch-add]')?.addEventListener('click', () => {
    const select = body.querySelector('select');
    if (select.value) saveWatchlist([...watched, select.value]);
  });
}

function renderMovers(snapshot = {}) {
  const body = grid?.querySelector('[data-widget-body="movers"]');
  if (!body) return;
  const players = dealerMovers(snapshot.data, 4);
  if (!players.length) {
    body.innerHTML = ['loading', 'refreshing'].includes(snapshot.status) ? skeleton() : emptyState('↗', 'Market feed reconnecting', 'Trade values will refresh automatically. Your calculators and saved research remain ready.');
    return;
  }
  body.innerHTML = `<span class="kt-widget-label">Dynasty Dealer · Current vs base</span>${players.map(player => `<div class="kt-mover-row"><div><strong>${escapeHtml(player.name)}</strong><span>${escapeHtml(player.position)} · ${escapeHtml(player.team)}</span></div><span class="kt-num">${player.value.toLocaleString()}</span><b class="kt-delta ${player.change >= 0 ? 'kt-delta-up' : 'kt-delta-down'}">${player.change >= 0 ? '+' : ''}${player.change.toFixed(1)}%</b></div>`).join('')}`;
}

let streakSignature = '';
function renderStreak(force = true) {
  const body = grid?.querySelector('[data-widget-body="streak"]');
  if (!body) return;
  const state = getGamificationState();
  const level = levels.reduce((current, item) => state.xp >= item.xp ? item : current, levels[0]);
  // The periodic check only touches the DOM when something changed (re-rendering knocked keyboard focus off the link).
  const signature = `${state.streak.count}|${state.xp}|${state.streak.freezeWeek}|${state.badges.length}|${level.name}`;
  if (!force && signature === streakSignature && body.firstElementChild) return;
  streakSignature = signature;
  body.innerHTML = `<div class="kt-streak-widget"><div><span>🔥</span><strong class="kt-num">${state.streak.count}</strong><small>day streak</small></div><div><span class="kt-widget-label">${escapeHtml(level.name)}</span><strong class="kt-num">${state.xp.toLocaleString()}</strong><small>total XP</small></div></div><div class="kt-freeze-status">❄ ${state.streak.freezeWeek ? 'Freeze used this week' : 'Freeze ready'} · ${state.badges.length} badges earned</div><a class="kt-btn kt-btn-sm kt-btn-secondary" href="#clubhouse">Open clubhouse</a>`;
}

function renderPickem() {
  const body = grid?.querySelector('[data-widget-body="pickem"]');
  if (!body) return;
  const games = normalizeGames(scoreSnapshot.data);
  const upcoming = games.filter(game => game.state === 'pre').sort((a, b) => new Date(a.date) - new Date(b.date));
  const state = getGamificationState();
  const picks = state.picks[`${scoreboardDate()}-${games[0]?.week || 'schedule'}`] || { games: {}, locked: false };
  const remaining = Math.max(0, upcoming.length - Object.keys(picks.games || {}).length);
  body.innerHTML = upcoming.length ? `<span class="kt-widget-label">${picks.locked ? 'Picks locked' : `${remaining} picks remaining`}</span><strong class="kt-widget-big">${picks.locked ? '✓' : remaining}</strong><p>${picks.locked ? 'Your card is in. Good luck.' : 'Make every point count before kickoff.'}</p><span class="kt-chip" data-next-kickoff>${upcoming[0] ? formatDuration(new Date(upcoming[0].date) - Date.now()) : ''}</span>` : emptyState('✓', 'Card complete', 'This week is in the books. Your next card opens soon.');
}

let kickoffCache = { data: undefined, next: null };
function nextKickoff() {
  if (kickoffCache.data === scoreSnapshot.data && kickoffCache.next) return kickoffCache.next;
  const upcoming = normalizeGames(scoreSnapshot.data).filter(game => game.state === 'pre').sort((a, b) => new Date(a.date) - new Date(b.date));
  kickoffCache = { data: scoreSnapshot.data, next: null };
  kickoffCache.next = upcoming[0] ? { date: new Date(upcoming[0].date), label: `${upcoming[0].away.abbreviation} at ${upcoming[0].home.abbreviation}` } : { date: new Date('2027-04-22T00:00:00Z'), label: 'NFL Draft · estimated' };
  return kickoffCache.next;
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const secs = seconds % 60;
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

function renderCountdown() {
  const body = grid?.querySelector('[data-widget-body="countdown"]');
  if (!body) return;
  const next = nextKickoff();
  body.innerHTML = `<span class="kt-widget-label">Next up · ${escapeHtml(next.label)}</span><div class="kt-countdown-value" data-countdown-value>${formatDuration(next.date - Date.now())}</div><div class="kt-countdown-track"><span></span></div><p>Time to make the next winning move.</p>`;
}

function renderNews() {
  const body = grid?.querySelector('[data-widget-body="news"]');
  if (!body) return;
  const articles = normalizeNews(newsSnapshot.data).slice(0, 5);
  if (!articles.length) { body.innerHTML = newsSnapshot.status === 'loading' ? skeleton() : emptyState('⌁', 'The wire is quiet', 'Fresh NFL headlines will land here automatically.'); return; }
  body.innerHTML = articles.map(article => `<a class="kt-news-row" href="${escapeHtml(article.url)}" target="_blank" rel="noopener"><div><strong>${escapeHtml(article.headline)}</strong><span>${escapeHtml(article.source)} · ${timeAgo(article.published)}</span></div><span aria-hidden="true">↗</span></a>`).join('');
}

function renderAll() {
  renderScores();
  renderWeather();
  renderTrending();
  renderWatchlist();
  renderMovers();
  renderStreak();
  renderPickem();
  renderCountdown();
  renderNews();
}

function renderGrid() {
  if (!grid) return;
  grid.innerHTML = layout.map(item => {
    const definition = definitions.find(entry => entry.id === item.id);
    return `<article class="kt-widget size-${item.size}" data-widget="${item.id}"><header class="kt-widget-head"><button class="kt-widget-handle" type="button" data-drag-handle="${item.id}" aria-label="Move ${definition.name} widget. Use arrow keys to reorder" tabindex="${editing ? '0' : '-1'}">⠿</button><h3>${definition.name}</h3><div class="kt-widget-controls"><button type="button" data-resize="${item.id}" aria-label="Resize ${definition.name}">↔</button><button type="button" data-remove="${item.id}" aria-label="Remove ${definition.name}">×</button></div></header><div class="kt-widget-body" data-widget-body="${item.id}">${skeleton()}</div></article>`;
  }).join('') || emptyState('▦', 'A blank playbook', 'Use Add widget to build your ideal Sunday dashboard.');
  grid.classList.toggle('is-editing', editing);
  renderAll();
  const addSelect = section.querySelector('#widget-add-select');
  const removed = definitions.filter(definition => !layout.some(item => item.id === definition.id));
  addSelect.innerHTML = removed.map(definition => `<option value="${definition.id}">${definition.name}</option>`).join('');
  section.querySelector('#widget-add').disabled = !removed.length;
}

function setEditing(value) {
  editing = value;
  grid.classList.toggle('is-editing', editing);
  grid.querySelectorAll('.kt-widget-handle').forEach(handle => { handle.tabIndex = editing ? 0 : -1; });
  section.querySelector('#widget-edit').textContent = editing ? 'Done' : 'Customize';
  section.querySelector('#widget-edit').setAttribute('aria-pressed', String(editing));
}

function widgetPositions() {
  return new Map([...grid.querySelectorAll('.kt-widget:not(.kt-widget-placeholder)')].map(card => [card.dataset.widget, card.getBoundingClientRect()]));
}

function animateReordered(before) {
  const after = widgetPositions();
  after.forEach((rect, id) => {
    const previous = before.get(id);
    if (!previous) return;
    const card = grid.querySelector(`[data-widget="${id}"]`);
    const dx = previous.left - rect.left;
    const dy = previous.top - rect.top;
    if (!dx && !dy) return;
    card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
  });
}

function updateDropTarget(x = drag?.clientX, y = drag?.clientY) {
  if (!drag) return;
  let target = document.elementFromPoint(x, y)?.closest('.kt-widget');
  if (target?.classList.contains('kt-widget-placeholder')) target = null;
  if (drag.target === target) return;
  drag.target?.classList.remove('is-drop-target');
  drag.target = target || null;
  drag.targetId = target?.dataset.widget || '';
  drag.target?.classList.add('is-drop-target');
}

function updateDragScroll() {
  if (!drag) return;
  drag.frame = 0;
  const edge = 72;
  const distance = drag.clientY < edge ? drag.clientY - edge : drag.clientY > window.innerHeight - edge ? drag.clientY - window.innerHeight + edge : 0;
  if (!distance) return;
  window.scrollBy(0, Math.max(-14, Math.min(14, distance / 4)));
  updateDropTarget();
  drag.frame = requestAnimationFrame(updateDragScroll);
}

function finishDrag(event) {
  if (!drag) return;
  const current = drag;
  const { card, id, before, placeholder } = current;
  cancelAnimationFrame(current.frame);
  if (event.type !== 'pointercancel') updateDropTarget(event.clientX, event.clientY);
  const targetId = event.type === 'pointercancel' ? '' : current.targetId;
  current.target?.classList.remove('is-drop-target');
  placeholder.remove();
  if (card.hasPointerCapture?.(event.pointerId)) card.releasePointerCapture(event.pointerId);
  drag = null;
  if (targetId && targetId !== id) {
    const from = layout.findIndex(item => item.id === id);
    const to = layout.findIndex(item => item.id === targetId);
    const [moved] = layout.splice(from, 1);
    layout.splice(to, 0, moved);
    saveLayout();
  }
  renderGrid();
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) animateReordered(before);
}

function mountDragAndLongPress() {
  grid.addEventListener('pointerdown', event => {
    const card = event.target.closest('.kt-widget');
    const handle = event.target.closest('.kt-widget-handle');
    if (!card || event.target.closest('a, input, select') || (event.target.closest('button') && !handle)) return;
    const id = card.dataset.widget;
    if (editing && handle) {
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      const before = widgetPositions();
      const placeholder = document.createElement('div');
      placeholder.className = `kt-widget kt-widget-placeholder ${[...card.classList].find(name => name.startsWith('size-')) || ''}`;
      placeholder.style.height = `${rect.height}px`;
      placeholder.setAttribute('aria-hidden', 'true');
      card.before(placeholder);
      drag = { card, id, before, placeholder, startX: event.clientX, startY: event.clientY, clientX: event.clientX, clientY: event.clientY, target: null, targetId: '', frame: 0 };
      card.setPointerCapture(event.pointerId);
      card.classList.add('is-dragging');
      Object.assign(card.style, { width: `${rect.width}px`, left: `${rect.left}px`, top: `${rect.top}px`, transform: 'translate3d(0, 0, 0)' });
      return;
    }
    if (!editing) {
      const startX = event.clientX;
      const startY = event.clientY;
      const cancel = () => {
        clearTimeout(timer);
        window.removeEventListener('pointerup', cancel);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('pointermove', onMove);
      };
      const onMove = move => { if (Math.hypot(move.clientX - startX, move.clientY - startY) > 10) cancel(); };
      const timer = window.setTimeout(() => { cancel(); setEditing(true); }, 550);
      window.addEventListener('pointerup', cancel, { once: true });
      window.addEventListener('pointercancel', cancel, { once: true });
      window.addEventListener('pointermove', onMove, { passive: true });
    }
  });
  grid.addEventListener('pointermove', event => {
    if (!drag) return;
    event.preventDefault();
    drag.clientX = event.clientX;
    drag.clientY = event.clientY;
    drag.card.style.transform = `translate3d(${event.clientX - drag.startX}px, ${event.clientY - drag.startY}px, 0)`;
    updateDropTarget();
    if (!drag.frame) updateDragScroll();
  });
  grid.addEventListener('pointerup', finishDrag);
  grid.addEventListener('pointercancel', finishDrag);
  grid.addEventListener('keydown', event => {
    const handle = event.target.closest('[data-drag-handle]');
    if (!editing || !handle) return;
    const id = handle.dataset.dragHandle;
    const from = layout.findIndex(item => item.id === id);
    let to = from;
    if (['ArrowLeft', 'ArrowUp'].includes(event.key)) to = from - 1;
    else if (['ArrowRight', 'ArrowDown'].includes(event.key)) to = from + 1;
    else if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = layout.length - 1;
    else return;
    if (to < 0 || to >= layout.length || to === from) return;
    event.preventDefault();
    const before = widgetPositions();
    const [moved] = layout.splice(from, 1);
    layout.splice(to, 0, moved);
    saveLayout();
    renderGrid();
    grid.querySelector(`[data-drag-handle="${id}"]`)?.focus();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) animateReordered(before);
  });
  grid.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove]');
    const resize = event.target.closest('[data-resize]');
    if (remove) {
      const before = widgetPositions();
      layout = layout.filter(item => item.id !== remove.dataset.remove);
      saveLayout();
      renderGrid();
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) animateReordered(before);
    }
    if (resize) {
      const item = layout.find(entry => entry.id === resize.dataset.resize);
      item.size = sizes[(sizes.indexOf(item.size) + 1) % sizes.length];
      saveLayout();
      renderGrid();
      grid.querySelector(`[data-resize="${item.id}"]`)?.focus();
    }
  });
}

export function mountDashboard() {
  if (section) return;
  layout = loadLayout();
  section = document.createElement('section');
  section.className = 'kt-container kt-section kt-dashboard';
  section.innerHTML = '<div class="kt-section-header"><div><span class="kt-eyebrow">Your Sunday dashboard</span><h2 class="kt-display">Your field. Your formation.</h2></div><div class="kt-dashboard-actions"><button class="kt-btn kt-btn-sm" type="button" id="widget-edit" aria-pressed="false">Customize</button><select id="widget-add-select" aria-label="Widget to add"></select><button class="kt-btn kt-btn-sm kt-btn-primary" type="button" id="widget-add">Add widget</button></div></div><div class="kt-widget-grid" aria-live="polite"></div><p class="kt-dashboard-hint">Customize to drag, resize, or remove. Long-press any card on touch.</p>';
  grid = section.querySelector('.kt-widget-grid');
  const forYou = document.querySelector('#for-you-title')?.closest('.kt-section');
  if (forYou) forYou.before(section);
  section.querySelector('#widget-edit').addEventListener('click', () => setEditing(!editing));
  section.querySelector('#widget-add').addEventListener('click', () => {
    const id = section.querySelector('#widget-add-select').value;
    if (!id) return;
    layout.push({ id, size: definitions.find(definition => definition.id === id).size });
    saveLayout();
    renderGrid();
  });
  mountDragAndLongPress();
  renderGrid();
  // statusOnly snapshots ("refreshing…" with unchanged data) skip the full widget re-render.
  liveData.subscribe(SCOREBOARD_SOURCE, snapshot => { if (snapshot.statusOnly) return; scoreSnapshot = snapshot; renderScores(); syncWeather(); renderPickem(); renderCountdown(); });
  liveData.subscribe(VALUES_SOURCE, snapshot => { if (snapshot.statusOnly) return; valueSnapshot = snapshot; renderTrending(); renderWatchlist(); });
  liveData.subscribe(NEWS_SOURCE, snapshot => { if (snapshot.statusOnly) return; newsSnapshot = snapshot; renderNews(); });
  liveData.subscribe(dealerSource(), snapshot => { if (!snapshot.statusOnly) renderMovers(snapshot); });
  window.addEventListener('kt:gamification', () => renderStreak(false));
  window.setInterval(() => renderStreak(false), 10000);
  countdownTimer = window.setInterval(() => {
    if (document.hidden) return;
    const next = nextKickoff();
    const value = section.querySelector('[data-countdown-value]');
    if (value) value.textContent = formatDuration(next.date - Date.now());
    const kickoff = section.querySelector('[data-next-kickoff]');
    if (kickoff && !next.label.startsWith('NFL Draft')) kickoff.textContent = formatDuration(next.date - Date.now());
  }, 1000);
}
