import { liveData } from '../data/live-data.js';
import { SCOREBOARD_SOURCE, normalizeGames, isDebugDate } from '../data/espn.js';
import { subscribeGameWeather } from '../data/weather.js';
import { weatherGlyph } from './weather-ui.js';
import { gameDayUrl } from './game-link.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarsePointer = window.matchMedia('(pointer: coarse)');
const loadingQuips = ['Reading the defense…', 'Checking the chain gang…', 'Waiting on the league office…'];
const loadingQuip = loadingQuips[new Date().getDate() % loadingQuips.length];
let dock;
let track;
let games = [];
let previousScores = new Map();
let userPaused = false;
let expanded = false;
let weatherByGame = {};
let weatherCleanup = () => {};
let weatherScheduleKey = '';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function gameById(id) {
  return games.find(game => game.id === id);
}

function statusLabel(game) {
  if (game.state === 'in') return game.detail.replace(' - ', ' · ');
  if (game.state === 'post') return 'Final';
  return game.detail;
}

function teamRow(game, side) {
  const team = game[side];
  return `<span class="kt-game-team" data-team="${side}"><span class="kt-game-identity"><img src="${escapeHtml(team.logo)}" alt="" width="20" height="20" loading="lazy"><span class="kt-game-abbr">${escapeHtml(team.abbreviation)}</span>${team.possession ? '<span class="kt-possession" aria-label="Possession"></span>' : ''}</span><span class="kt-game-score kt-num" data-score="${side}">${team.score}</span></span>`;
}

function chipWeather(game) {
  const weather = weatherByGame[game.id];
  if (!weather || weather.dome) return '';
  return `<span aria-hidden="true">${weatherGlyph(weather)}</span><b class="kt-num">${Math.round(weather.temperature)}°</b>`;
}

function gameChip(game) {
  const scoring = previousScores.has(game.id) && previousScores.get(game.id) !== `${game.away.score}-${game.home.score}`;
  return `<button class="kt-game-chip${game.state === 'in' ? ' is-live' : ''}${game.state === 'post' ? ' is-final' : ''}${scoring ? ' is-scoring' : ''}" type="button" data-game-id="${escapeHtml(game.id)}" aria-label="${escapeHtml(`${game.away.name} ${game.away.score}, ${game.home.name} ${game.home.score}. ${statusLabel(game)}. Open game details.`)}"><span class="kt-game-status"><span>${escapeHtml(statusLabel(game))}</span>${game.redZone && game.state === 'in' ? '<span class="kt-red-zone">Red zone</span>' : ''}<span class="kt-chip-weather" data-chip-weather="${escapeHtml(game.id)}">${chipWeather(game)}</span></span>${teamRow(game, 'away')}${teamRow(game, 'home')}</button>`;
}

function renderChipWeather() {
  games.forEach(game => {
    const element = track.querySelector(`[data-chip-weather="${CSS.escape(game.id)}"]`);
    if (!element) return;
    element.innerHTML = chipWeather(game);
    const weather = weatherByGame[game.id];
    if (weather && !weather.dome) element.title = `${weather.venue}: ${Math.round(weather.temperature)}°F, ${Math.round(weather.wind)} mph wind`;
  });
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
    renderChipWeather();
  });
}

function skeletons() {
  return Array.from({ length: 6 }, () => '<span class="kt-game-skeleton kt-skeleton" aria-hidden="true"></span>').join('');
}

function animateScore(element, from, to) {
  if (reducedMotion.matches || from === to) { element.textContent = to; return; }
  const start = performance.now();
  const frame = now => {
    const progress = Math.min((now - start) / 420, 1);
    element.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - progress, 3)));
    if (progress < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  element.classList.remove('kt-score-good');
  void element.offsetWidth;
  element.classList.add('kt-score-good');
}

function announceScore(game, previous) {
  const [away, home] = previous.split('-').map(Number);
  const scoringTeam = game.away.score !== away ? game.away : game.home;
  const announcement = document.querySelector('#kt-score-announcement');
  announcement.textContent = `${scoringTeam.name} scores. ${game.away.abbreviation} ${game.away.score}, ${game.home.abbreviation} ${game.home.score}.`;
  if (coarsePointer.matches && 'vibrate' in navigator && navigator.userActivation?.hasBeenActive !== false && !reducedMotion.matches) navigator.vibrate([25, 45, 25]);
}

function scrollToPriority() {
  if (userPaused || !track) return;
  const priority = games.find(game => game.state === 'in') || games.find(game => game.state === 'pre') || games[0];
  const chip = track.querySelector(`[data-game-id="${CSS.escape(priority?.id || '')}"]`);
  if (chip) {
    const left = chip.offsetLeft - (track.clientWidth - chip.offsetWidth) / 2;
    track.scrollTo({ left, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  }
}

function updateMarquee() {
  const marquee = dock.querySelector('.kt-score-marquee');
  const game = games.find(item => item.state === 'in') || games.find(item => item.state === 'pre') || games[0];
  marquee.hidden = expanded;
  marquee.querySelector('span').textContent = game
    ? `${game.away.abbreviation} ${game.away.score} — ${game.home.abbreviation} ${game.home.score} · ${statusLabel(game)}`
    : 'NFL scores · Schedule loading';
}

function render(snapshot) {
  const { data, status, error } = snapshot;
  dock.dataset.status = status;
  dock.querySelector('.kt-score-sync').textContent = isDebugDate()
    ? 'Debug date'
    : status === 'refreshing' || (status === 'stale' && error) ? 'Updating…'
      : status === 'stale' ? 'Cached' : status === 'error' ? 'Reconnecting' : 'ESPN';
  const announce = () => window.dispatchEvent(new CustomEvent('kt:scores-update', { detail: { games, status, week: games[0]?.week || data?.week?.number || 0 } }));
  if (!data) { if (status === 'error') announce(); return; }

  games = normalizeGames(data);
  syncWeather();
  if (!games.length) {
    track.innerHTML = '<div class="kt-score-empty">No NFL games on this date.</div>';
    updateMarquee();
    announce();
    return;
  }

  const scrollLeft = track.scrollLeft;
  const focusedGame = document.activeElement?.dataset?.gameId;
  track.innerHTML = games.map(gameChip).join('');
  track.scrollLeft = scrollLeft;
  track.querySelectorAll('img').forEach(image => image.addEventListener('error', () => { image.style.visibility = 'hidden'; }, { once: true }));

  games.forEach(game => {
    const previous = previousScores.get(game.id);
    if (!previous) return;
    const [away, home] = previous.split('-').map(Number);
    if (away !== game.away.score) animateScore(track.querySelector(`[data-game-id="${CSS.escape(game.id)}"] [data-score="away"]`), away, game.away.score);
    if (home !== game.home.score) animateScore(track.querySelector(`[data-game-id="${CSS.escape(game.id)}"] [data-score="home"]`), home, game.home.score);
    if (previous !== `${game.away.score}-${game.home.score}`) announceScore(game, previous);
  });
  previousScores = new Map(games.map(game => [game.id, `${game.away.score}-${game.home.score}`]));
  updateMarquee();
  scrollToPriority();
  if (focusedGame) track.querySelector(`[data-game-id="${CSS.escape(focusedGame)}"]`)?.focus({ preventScroll: true });
  announce();
}

function openGameDay(game) {
  if (game) window.location.href = gameDayUrl(game.id);
}

export function mountScoreTicker() {
  if (dock) return;
  const header = document.querySelector('[data-site-header]');
  if (!header) return;
  header.insertAdjacentHTML('afterend', `<section class="kt-score-dock" data-status="loading" aria-label="Live NFL scores"><button class="kt-score-marquee" type="button" aria-expanded="false"><span>NFL scores · Loading</span><b>Expand</b></button><div class="kt-score-bar"><div class="kt-score-label"><span class="kt-live-dot" aria-hidden="true"></span><strong>NFL</strong><span class="kt-score-sync">${loadingQuip}</span></div><div class="kt-score-track" tabindex="0" role="region" aria-label="Games">${skeletons()}</div><button class="kt-score-refresh" type="button" aria-label="Refresh scores" title="Refresh scores">↻</button><button class="kt-score-collapse" type="button" aria-label="Collapse scores">×</button></div><span class="kt-sr-only" id="kt-score-announcement" aria-live="polite"></span></section>`);
  dock = document.querySelector('.kt-score-dock');
  track = dock.querySelector('.kt-score-track');

  dock.querySelector('.kt-score-marquee').addEventListener('click', event => {
    expanded = !expanded;
    dock.classList.toggle('is-expanded', expanded);
    event.currentTarget.setAttribute('aria-expanded', String(expanded));
    track.querySelector('.kt-game-chip')?.focus();
  });
  dock.querySelector('.kt-score-collapse').addEventListener('click', () => {
    expanded = false;
    dock.classList.remove('is-expanded');
    dock.querySelector('.kt-score-marquee').setAttribute('aria-expanded', 'false');
    dock.querySelector('.kt-score-marquee').focus();
  });
  dock.querySelector('.kt-score-refresh').addEventListener('click', () => liveData.refresh(SCOREBOARD_SOURCE));
  track.addEventListener('click', event => {
    const chip = event.target.closest('[data-game-id]');
    if (chip) openGameDay(gameById(chip.dataset.gameId));
  });
  ['pointerdown', 'wheel', 'touchstart'].forEach(type => track.addEventListener(type, () => { userPaused = true; }, { passive: true }));
  liveData.subscribe(SCOREBOARD_SOURCE, render);
}
