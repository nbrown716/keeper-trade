import { liveData } from '../data/live-data.js';
import { friendlyError } from '../ui/friendly-error.js';
import { SCOREBOARD_SOURCE, normalizeGames, summarySource, normalizeSummary } from '../data/espn.js';
import { getSleeperLeagueId, getNflState, getLeagueBundle, leagueUsers, rosterOwner } from '../data/sleeper.js';
import { getPlayerDatabase } from '../data/player-db.js';
import { subscribeGameWeather } from '../data/weather.js';
import { weatherGlyph } from '../ui/weather-ui.js';
import { probabilityBar, probabilityChart } from '../ui/win-probability.js';
import { gameDayUrl } from '../ui/game-link.js';
import { mountNavigation } from '../ui/navigation.js';
import { mascot } from '../ui/mascot.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarsePointer = window.matchMedia('(pointer: coarse)');
const mosaic = document.querySelector('#sunday-mosaic');
const playersRail = document.querySelector('#sunday-players');
const managerSelect = document.querySelector('#sunday-manager');
const directorStatus = document.querySelector('#sunday-director-status');
let games = [];
let summaries = new Map();
let summaryUnsubscribers = new Map();
let knownScoring = new Map();
let weatherByGame = {};
let weatherCleanup = () => {};
let weatherKey = '';
let bundle;
let playerMap = new Map();
let projections = new Map();
let matchup;
let opponent;
let rosterId;
let heroId;
let previousHero;
let pinnedId = '';
let lastDirector = 0;
let renderQueued = false;
let previousScores = new Map();
let previousPlayerPoints = new Map();
let soundEnabled = false;
let audioContext;
let loadingLeague = false;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
}

function gameStatus(game) {
  return game.state === 'post' ? 'Final' : game.detail.replace(' - ', ' · ');
}

function userStarters() {
  return (matchup?.starters || []).filter(id => id !== '0').map(id => playerMap.get(id)).filter(Boolean);
}

function opponentStarters() {
  return (opponent?.starters || []).filter(id => id !== '0').map(id => playerMap.get(id)).filter(Boolean);
}

function weeklyProjection(player) {
  const season = projections.get(`${normalizeName(player.name)}:${player.team}`) || projections.get(normalizeName(player.name));
  const value = Number(season?.proj);
  return Number.isFinite(value) && value > 0 ? value / 17 : null;
}

function fantasyEdge(game) {
  const players = userStarters().filter(player => [game.home.abbreviation, game.away.abbreviation].includes(player.team));
  const points = players.reduce((sum, player) => sum + Number(matchup.players_points?.[player.id] || 0), 0);
  const projection = players.reduce((sum, player) => sum + (weeklyProjection(player) || 0), 0);
  const hasProjection = players.some(player => weeklyProjection(player) !== null);
  const delta = points - projection;
  return `<div class="kt-fantasy-edge${players.length ? '' : ' is-empty'}" title="Weekly baseline: season projection divided by 17"><span>YOUR GUYS</span><strong class="kt-num">${players.length ? points.toFixed(1) : '—'}</strong>${hasProjection ? `<b class="${delta >= 0 ? 'kt-delta-up' : 'kt-delta-down'}">${delta >= 0 ? '+' : ''}${delta.toFixed(1)} vs proj</b>` : '<small>PROJ —</small>'}</div>`;
}

function weatherMarkup(game) {
  const weather = weatherByGame[game.id];
  if (!weather || weather.dome) return '';
  return `<span class="kt-sunday-weather" title="${escapeHtml(weather.venue)}"><span aria-hidden="true">${weatherGlyph(weather)}</span> ${Math.round(weather.temperature)}°</span>`;
}

function teamRow(game, side) {
  const team = game[side];
  return `<div class="kt-sunday-team"><img src="${escapeHtml(team.logo)}" alt="" loading="lazy"><span>${escapeHtml(team.abbreviation)}</span><strong class="kt-num" data-score-id="${escapeHtml(game.id)}:${side}">${team.score}</strong>${team.possession ? '<i aria-label="Possession"></i>' : ''}</div>`;
}

function tileMarkup(game, hero = false) {
  const summary = summaries.get(game.id);
  const pinned = pinnedId === game.id;
  return `<article class="kt-sunday-tile${hero ? ' is-hero' : ''}${game.redZone && game.state === 'in' ? ' is-red-zone' : ''}" data-game-id="${escapeHtml(game.id)}" style="--kt-delay:${hero ? 0 : 35}ms"><header><div><span class="kt-live-dot${game.state === 'in' ? '' : ' is-idle'}" aria-hidden="true"></span><span>${escapeHtml(gameStatus(game))}</span>${game.redZone && game.state === 'in' ? '<b class="kt-red-zone">RED ZONE</b>' : ''}</div><div>${weatherMarkup(game)}<button class="kt-sunday-pin${pinned ? ' is-pinned' : ''}" type="button" data-pin="${escapeHtml(game.id)}" aria-pressed="${pinned}" aria-label="${pinned ? 'Unpin' : 'Pin'} ${escapeHtml(game.name)}">${pinned ? 'Pinned' : 'Pin'}</button></div></header><div class="kt-sunday-score">${teamRow(game, 'away')}<span>AT</span>${teamRow(game, 'home')}</div>${hero ? probabilityChart(summary) : probabilityBar(summary)}${fantasyEdge(game)}<footer><button type="button" data-hero="${escapeHtml(game.id)}">Focus</button><a href="${gameDayUrl(game.id)}">Game day <span aria-hidden="true">↗</span></a></footer></article>`;
}

function bestHero() {
  const players = [...userStarters(), ...opponentStarters()];
  return games.slice().sort((a, b) => {
    const aPlayers = players.filter(player => [a.home.abbreviation, a.away.abbreviation].includes(player.team)).length;
    const bPlayers = players.filter(player => [b.home.abbreviation, b.away.abbreviation].includes(player.team)).length;
    if (aPlayers !== bPlayers) return bPlayers - aPlayers;
    if (a.state !== b.state) return a.state === 'in' ? -1 : b.state === 'in' ? 1 : 0;
    if (a.period !== b.period) return b.period - a.period;
    return Math.abs(a.home.score - a.away.score) - Math.abs(b.home.score - b.away.score);
  })[0]?.id;
}

function runDirector() {
  const redZone = games.find(game => game.state === 'in' && game.redZone);
  const pinnedGame = games.find(game => game.id === pinnedId);
  if (pinnedGame) { heroId = pinnedGame.id; return; }
  if (redZone && redZone.id !== heroId && Date.now() - lastDirector >= 5000) {
    previousHero = heroId;
    heroId = redZone.id;
    lastDirector = Date.now();
    directorStatus.hidden = false;
    directorStatus.querySelector('span').textContent = `Red zone: ${redZone.away.abbreviation} at ${redZone.home.abbreviation}`;
    announce(`${redZone.name} enters the red zone. Hero game switched.`);
  }
  if (!games.some(game => game.id === heroId)) heroId = bestHero();
}

function animateMosaic(before) {
  if (reducedMotion.matches || !before.size) return;
  mosaic.querySelectorAll('[data-game-id]').forEach(tile => {
    const previous = before.get(tile.dataset.gameId);
    if (!previous) return;
    const current = tile.getBoundingClientRect();
    const dx = previous.left - current.left;
    const dy = previous.top - current.top;
    if (dx || dy) tile.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0,0)' }], { duration: 360, easing: 'cubic-bezier(.16,1,.3,1)' });
  });
}

function animateValue(element, from, to, suffix = '', decimals = 1) {
  if (!element || reducedMotion.matches || from === to) return;
  const start = performance.now();
  const frame = now => {
    const progress = Math.min(1, (now - start) / 420);
    element.textContent = `${(from + (to - from) * (1 - Math.pow(1 - progress, 3))).toFixed(decimals)}${suffix}`;
    if (progress < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  element.classList.add('is-ticking');
  window.setTimeout(() => element.classList.remove('is-ticking'), 650);
}

function renderPlayers() {
  const players = userStarters().map(player => ({ player, game: games.find(game => [game.home.abbreviation, game.away.abbreviation].includes(player.team)) })).filter(item => item.game);
  const playing = players.filter(item => item.game.state === 'in');
  const rail = playing.length ? playing : players;
  playersRail.innerHTML = `<div class="kt-sunday-rail-label"><span>MY PLAYERS</span><small>${playing.length ? 'LIVE' : 'UP NEXT'}</small></div>${rail.map(({ player, game }) => {
    const points = Number(matchup.players_points?.[player.id] || 0);
    const previous = previousPlayerPoints.get(player.id);
    const key = `${game.id}:${player.id}`;
    return `<button type="button" data-player-game="${escapeHtml(game.id)}" data-player-point-id="${escapeHtml(key)}" data-points="${points}" data-previous="${previous ?? points}"><span>${escapeHtml(player.name)}<small>${escapeHtml(player.position)} · ${escapeHtml(player.team)}</small></span><strong class="kt-num">${points.toFixed(1)}</strong></button>`;
  }).join('') || '<p class="kt-muted">Your starters appear here on game day.</p>'}`;
  rail.forEach(({ player }) => {
    const points = Number(matchup.players_points?.[player.id] || 0);
    const previous = previousPlayerPoints.get(player.id);
    if (previous !== undefined && previous !== points) {
      const game = games.find(item => [item.home.abbreviation, item.away.abbreviation].includes(player.team));
      animateValue(playersRail.querySelector(`[data-player-point-id="${CSS.escape(`${game.id}:${player.id}`)}"] strong`), previous, points);
    }
  });
  previousPlayerPoints = new Map(userStarters().map(player => [player.id, Number(matchup.players_points?.[player.id] || 0)]));
}

let scoreStatus = 'loading';
function render() {
  renderQueued = false;
  if (!games.length) {
    // Only claim "no games" when ESPN actually answered; a failed or pending feed says so honestly.
    mosaic.innerHTML = scoreStatus === 'error'
      ? '<div class="kt-sunday-empty">Live scores are reconnecting. Your games will appear here the moment ESPN answers.</div>'
      : scoreStatus === 'loading' ? '<div class="kt-sunday-empty"><span class="kt-skeleton kt-skeleton-text"></span><span class="kt-skeleton kt-skeleton-text"></span></div>'
      : '<div class="kt-sunday-empty">No NFL games on this date. Your next Sunday is already queued.</div>';
    playersRail.innerHTML = '';
    return;
  }
  runDirector();
  const hero = games.find(game => game.id === heroId) || games[0];
  heroId = hero.id;
  const before = new Map([...mosaic.querySelectorAll('[data-game-id]')].map(tile => [tile.dataset.gameId, tile.getBoundingClientRect()]));
  const ordered = [hero, ...games.filter(game => game.id !== hero.id).sort((a, b) => (a.state === 'in' ? -1 : 0) - (b.state === 'in' ? -1 : 0) || new Date(a.date) - new Date(b.date))];
  mosaic.innerHTML = ordered.map(game => tileMarkup(game, game.id === hero.id)).join('');
  animateMosaic(before);
  const closeGames = games.filter(game => game.state === 'in' && game.period >= 4 && Math.abs(game.home.score - game.away.score) <= 8);
  const radar = document.querySelector('#sunday-radar');
  radar.hidden = closeGames.length < 2;
  if (closeGames.length >= 2) radar.textContent = `CLOSE-GAME RADAR · ${closeGames.length} games within one score late`;
  directorStatus.hidden = !previousHero || !games.some(game => game.id === previousHero);
  renderPlayers();
  games.forEach(game => {
    ['away', 'home'].forEach(side => {
      const previous = previousScores.get(`${game.id}:${side}`);
      const score = game[side].score;
      if (previous !== undefined && previous !== score) animateValue(mosaic.querySelector(`[data-score-id="${CSS.escape(`${game.id}:${side}`)}"]`), previous, score, '', 0);
    });
  });
  previousScores = new Map(games.flatMap(game => [['away', 'home'].map(side => [`${game.id}:${side}`, game[side].score])]));
  document.querySelector('#sunday-sync').textContent = `${games.length} GAMES · ESPN 30s${pinnedId ? ' · PINNED' : ''}`;
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(render);
}

function announce(message) {
  document.querySelector('#sunday-announcement').textContent = message;
}

function scoringSting() {
  if (!soundEnabled) return;
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.setValueAtTime(340, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(680, audioContext.currentTime + 0.12);
    gain.gain.setValueAtTime(0.025, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.2);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.21);
  } catch (_) {}
}

function syncSummaries() {
  const ids = new Set(games.map(game => game.id));
  summaryUnsubscribers.forEach((unsubscribe, id) => { if (!ids.has(id)) { unsubscribe(); summaryUnsubscribers.delete(id); summaries.delete(id); } });
  games.forEach(game => {
    if (summaryUnsubscribers.has(game.id)) return;
    summaryUnsubscribers.set(game.id, liveData.subscribe(summarySource(game.id), snapshot => {
      if (snapshot.statusOnly) return;
      if (!snapshot.data) { scheduleRender(); return; }
      const summary = normalizeSummary(snapshot.data);
      summaries.set(game.id, summary);
      const currentIds = new Set(summary.scoringPlays.map(play => play.id));
      const known = knownScoring.get(game.id);
      if (known) {
        const fresh = summary.scoringPlays.filter(play => !known.has(play.id));
        if (fresh.length) scoringSting();
        fresh.forEach(play => {
          const scorer = userStarters().find(player => normalizeName(play.text).includes(normalizeName(player.name)));
          if (scorer) window.dispatchEvent(new CustomEvent('kt:player-score', { detail: { player: scorer, game, play } }));
        });
        const userTouchdown = fresh.some(play => userStarters().some(player => normalizeName(play.text).includes(normalizeName(player.name))) && /touchdown|\bTD\b/i.test(play.text));
        if (userTouchdown && coarsePointer.matches && 'vibrate' in navigator && navigator.userActivation?.hasBeenActive !== false && !reducedMotion.matches) navigator.vibrate([35, 45, 35]);
      }
      knownScoring.set(game.id, currentIds);
      scheduleRender();
    }));
  });
}

function syncWeather() {
  const key = games.map(game => `${game.id}:${game.venue}:${game.date}`).join('|');
  if (key === weatherKey) return;
  weatherKey = key;
  weatherCleanup();
  if (!games.length) return;
  weatherCleanup = subscribeGameWeather(games, conditions => {
    weatherByGame = conditions;
    scheduleRender();
  });
}

async function loadLeague() {
  if (loadingLeague) return;
  loadingLeague = true;
  try {
    const id = getSleeperLeagueId();
    if (!id) throw new Error('Connect Sleeper to unlock your Fantasy Edge.');
    const state = await getNflState();
    const week = Number(new URLSearchParams(window.location.search).get('sleeperweek')) || state.display_week || state.week || 1;
    const [leagueBundle, players] = await Promise.all([getLeagueBundle(id, week), getPlayerDatabase()]);
    bundle = leagueBundle;
    playerMap = players;
    const users = leagueUsers(bundle.users);
    const managers = bundle.rosters.map(roster => ({ id: roster.roster_id, name: rosterOwner(roster, users) })).sort((a, b) => a.name.localeCompare(b.name));
    managerSelect.replaceChildren(...managers.map(manager => {
      const option = document.createElement('option');
      option.value = String(manager.id);
      option.textContent = manager.name;
      return option;
    }));
    let saved = Number(new URLSearchParams(window.location.search).get('roster'));
    if (!saved) { try { saved = Number(localStorage.getItem('kt-drive-manager:v1')); } catch (_) {} }
    rosterId = saved || managers[0]?.id;
    managerSelect.value = String(rosterId);
    matchup = bundle.matchups.find(entry => entry.roster_id === rosterId);
    opponent = bundle.matchups.find(entry => entry.matchup_id === matchup?.matchup_id && entry.roster_id !== rosterId);
    previousPlayerPoints = new Map(userStarters().map(player => [player.id, Number(matchup.players_points?.[player.id] || 0)]));
    scheduleRender();
  } catch (error) {
    document.querySelector('#sunday-league-note').textContent = friendlyError(error, 'League overlays are unavailable right now. Live scores still work.');
  } finally {
    loadingLeague = false;
  }
}

mosaic.addEventListener('click', event => {
  const pin = event.target.closest('[data-pin]');
  if (pin) {
    const id = pin.dataset.pin;
    pinnedId = pinnedId === id ? '' : id;
    if (pinnedId) heroId = id;
    scheduleRender();
    return;
  }
  const focus = event.target.closest('[data-hero]');
  if (focus) {
    if (pinnedId) pinnedId = '';
    heroId = focus.dataset.hero;
    scheduleRender();
  }
});
playersRail.addEventListener('click', event => {
  const button = event.target.closest('[data-player-game]');
  if (!button) return;
  heroId = button.dataset.playerGame;
  document.querySelector(`[data-game-id="${CSS.escape(heroId)}"]`)?.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
  scheduleRender();
});
directorStatus.querySelector('button').addEventListener('click', () => {
  heroId = previousHero;
  previousHero = undefined;
  lastDirector = Date.now();
  scheduleRender();
});
managerSelect.addEventListener('change', () => {
  rosterId = Number(managerSelect.value);
  try { localStorage.setItem('kt-drive-manager:v1', String(rosterId)); } catch (_) {}
  matchup = bundle.matchups.find(entry => entry.roster_id === rosterId);
  opponent = bundle.matchups.find(entry => entry.matchup_id === matchup?.matchup_id && entry.roster_id !== rosterId);
  previousPlayerPoints = new Map(userStarters().map(player => [player.id, Number(matchup.players_points?.[player.id] || 0)]));
  scheduleRender();
});
document.querySelector('#sunday-sound').addEventListener('click', async event => {
  soundEnabled = !soundEnabled;
  if (soundEnabled) { try { audioContext ||= new AudioContext(); await audioContext.resume(); } catch (_) { soundEnabled = false; } }
  event.currentTarget.setAttribute('aria-pressed', String(soundEnabled));
  event.currentTarget.textContent = soundEnabled ? 'Sound on' : 'Sound off';
});

mountNavigation({ active: 'scores' });
mascot.mountDock();
liveData.subscribe(SCOREBOARD_SOURCE, snapshot => {
  if (snapshot.statusOnly) return;
  games = normalizeGames(snapshot.data);
  scoreStatus = snapshot.data ? 'live' : snapshot.status;
  syncSummaries();
  syncWeather();
  scheduleRender();
});
liveData.register('sunday-projections', { url: new URL('../../fp-data.json', import.meta.url).href, cadence: 86400000 });
liveData.subscribe('sunday-projections', snapshot => {
  projections = new Map((snapshot.data?.players || []).flatMap(player => [[`${normalizeName(player.n)}:${player.t}`, player], [normalizeName(player.n), player]]));
  scheduleRender();
});
loadLeague();
