import { liveData } from '../data/live-data.js';
import { summarySource, normalizeSummary } from '../data/espn.js';
import { subscribeGameWeather } from '../data/weather.js';
import { weatherStrip } from '../ui/weather-ui.js';
import { mountRedZoneAlert } from '../ui/red-zone-alert.js';

const app = document.querySelector('#game-app');
const gameId = new URLSearchParams(window.location.search).get('id');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let sourceKey;
let currentTab = 'plays';
let currentSummary;
let scrubIndex;
let lastData;
let previousScores;
let knownScoringIds = new Set();
let currentWeather;
let weatherState = 'loading';
let weatherGameKey = '';
let weatherCleanup = () => {};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function rgb(hex) {
  const value = String(hex || '5f6b7a').replace('#', '');
  return value.length === 6 ? `${parseInt(value.slice(0, 2), 16)} ${parseInt(value.slice(2, 4), 16)} ${parseInt(value.slice(4, 6), 16)}` : '95 107 122';
}

function backUrl() {
  const debug = new URLSearchParams(window.location.search).get('debugdate');
  return debug ? `index.html?debugdate=${debug}` : 'index.html';
}

function teamHeader(team, side, probability) {
  return `<div class="kt-match-team"><img src="${escapeHtml(team.logo)}" alt="${escapeHtml(team.name)} logo"><span class="kt-match-team-name">${escapeHtml(team.name)}</span><strong class="kt-match-team-score" data-team-score="${side}">${team.score}</strong><span class="kt-match-team-wp">${Math.round(probability * 100)}% win probability</span></div>`;
}

function chartMarkup(summary) {
  const points = summary.probability;
  if (!points.length) return '<div class="kt-score-empty">Win probability will appear after the game begins.</div>';
  const coordinates = points.map((point, index) => ({ ...point, x: points.length === 1 ? 500 : index / (points.length - 1) * 1000, y: 230 - point.home * 190 }));
  const line = coordinates.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const area = `${line} L1000 240 L0 240 Z`;
  const dots = summary.scoringPlays.map(play => {
    const index = points.findIndex(point => point.id === play.id);
    if (index < 0) return '';
    const point = coordinates[index];
    const color = play.team?.id === summary.game.home.id ? summary.game.home.color : summary.game.away.color;
    return `<circle class="kt-chart-dot" cx="${point.x}" cy="${point.y}" r="6" fill="#${escapeHtml(color || 'c6ff4a')}" data-play-id="${escapeHtml(play.id)}" tabindex="0" role="button" aria-label="${escapeHtml(play.text)}"></circle>`;
  }).join('');
  return `<div class="kt-chart-wrap"><svg class="kt-chart" viewBox="0 0 1000 280" preserveAspectRatio="none" role="img" aria-label="Home team win probability from 0 to 100 percent"><defs><linearGradient id="kt-area-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c6ff4a" stop-opacity=".32"/><stop offset="1" stop-color="#c6ff4a" stop-opacity="0"/></linearGradient></defs><path class="kt-chart-grid" d="M0 40H1000M0 135H1000M0 230H1000"/><path class="kt-chart-grid kt-chart-mid" d="M0 135H1000"/><path class="kt-chart-area" d="${area}"/><path class="kt-chart-line is-drawing" d="${line}"/><line class="kt-chart-scrubber" id="kt-chart-scrubber-line" x1="1000" y1="25" x2="1000" y2="240"/>${dots}<text class="kt-chart-label" x="8" y="28">100%</text><text class="kt-chart-label" x="8" y="124">50%</text><text class="kt-chart-label" x="8" y="220">0%</text></svg></div><label class="kt-scrubber-control"><span>Kickoff</span><input id="kt-momentum-scrubber" type="range" min="0" max="${points.length - 1}" value="${points.length - 1}" aria-label="Rewind win probability"><span>Now</span></label>`;
}

function playMarkup(play, summary, isLatest) {
  const team = play.teamId === summary.game.home.id ? summary.game.home : summary.game.away;
  return `<article class="kt-play${play.scoring ? ' is-scoring' : ''}" id="play-${escapeHtml(play.id)}" style="--kt-play-color:${rgb(team.color)}"><span class="kt-play-bar" aria-hidden="true"></span><div><p class="kt-play-text">${escapeHtml(play.text)}</p><div class="kt-play-meta"><span>Q${play.period} · ${escapeHtml(play.clock)}</span>${play.yardLine ? `<span class="kt-yard-chip">${escapeHtml(play.yardLine)}</span>` : ''}${play.scoring ? '<span class="kt-badge kt-badge-accent">Scoring play</span>' : ''}</div></div><span class="kt-play-score">${escapeHtml(summary.game.away.abbreviation)} ${play.awayScore} · ${escapeHtml(summary.game.home.abbreviation)} ${play.homeScore}</span>${play.scoring && isLatest ? '<span class="kt-confetti" aria-hidden="true"></span>' : ''}</article>`;
}

function boxMarkup(summary) {
  const away = summary.teams.find(entry => entry.homeAway === 'away');
  const home = summary.teams.find(entry => entry.homeAway === 'home');
  const names = ['totalYards', 'netPassingYards', 'rushingYards', 'firstDowns', 'thirdDownEff', 'fourthDownEff', 'totalOffensivePlays', 'yardsPerPlay', 'redZoneAttempts', 'turnovers', 'totalPenaltiesYards', 'possessionTime'];
  const stat = (team, name) => team?.statistics?.find(item => item.name === name) || {};
  const leaders = summary.leaders.flatMap(team => (team.leaders || []).slice(0, 3).map(category => category.leaders?.[0] ? { category: category.displayName, ...category.leaders[0] } : null).filter(Boolean));
  return `<div class="kt-box-leaders">${leaders.map(leader => `<div class="kt-leader-card"><img src="${escapeHtml(leader.athlete?.headshot?.href || '')}" alt="" loading="lazy"><div class="kt-leader-card-copy"><strong>${escapeHtml(leader.athlete?.displayName || '')}</strong><span>${escapeHtml(leader.category)}</span></div><span class="kt-leader-card-value">${escapeHtml(leader.mainStat?.value || leader.displayValue)}</span></div>`).join('')}</div><div class="kt-stat-table-wrap"><table class="kt-stat-table"><thead><tr><th scope="col">Team stat</th><th scope="col">${escapeHtml(summary.game.away.abbreviation)}</th><th scope="col">${escapeHtml(summary.game.home.abbreviation)}</th></tr></thead><tbody>${names.map(name => {
    const awayStat = stat(away, name);
    const homeStat = stat(home, name);
    const numeric = value => Number.isFinite(Number(value)) && value !== '' ? ` data-count="${Number(value)}"` : '';
    return `<tr><td>${escapeHtml(awayStat.label || homeStat.label || name)}</td><td${numeric(awayStat.value)}>${escapeHtml(awayStat.displayValue ?? '—')}</td><td${numeric(homeStat.value)}>${escapeHtml(homeStat.displayValue ?? '—')}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function drivesMarkup(summary) {
  if (!summary.drives.length) return '<div class="kt-score-empty">Drive data will appear after the game begins.</div>';
  return `<div class="kt-drive-list">${summary.drives.map(drive => {
    const team = drive.teamId === summary.game.home.id ? summary.game.home : summary.game.away;
    const start = Math.max(0, Math.min(100, Number(drive.start?.yardLine || 0)));
    const end = Math.max(0, Math.min(100, Number(drive.end?.yardLine || start)));
    const left = Math.min(start, end);
    const width = Math.max(2, Math.abs(end - start));
    return `<article class="kt-drive"><div class="kt-drive-head"><span><strong>${escapeHtml(team.abbreviation)}</strong> · ${escapeHtml(drive.description)}</span><span>${escapeHtml(drive.result || '')}</span></div><div class="kt-drive-field" aria-label="Drive from ${escapeHtml(drive.start?.text || '')} to ${escapeHtml(drive.end?.text || '')}"><span class="kt-drive-progress" style="left:${left}%;width:${width}%;--kt-drive-color:${rgb(team.color)}"></span></div><div class="kt-drive-meta"><span>${escapeHtml(drive.start?.text || '')}</span><span>${escapeHtml(drive.end?.text || '')}</span></div></article>`;
  }).join('')}</div>`;
}

function selectTab(tab) {
  currentTab = tab;
  app.querySelectorAll('.kt-game-tab').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === tab)));
  app.querySelectorAll('.kt-game-panel').forEach(panel => { panel.hidden = panel.dataset.panel !== tab; });
  if (tab === 'box') animateStats();
}

function animateStats() {
  app.querySelectorAll('[data-count]').forEach(element => {
    const target = Number(element.dataset.count);
    if (reducedMotion.matches || element.dataset.counted) { element.textContent = target; element.dataset.counted = 'true'; return; }
    element.dataset.counted = 'true';
    const start = performance.now();
    const frame = now => {
      const progress = Math.min((now - start) / 500, 1);
      element.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

function jumpToPlay(playId) {
  selectTab('plays');
  const play = document.querySelector(`#play-${CSS.escape(playId)}`);
  if (!play) return;
  play.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
  play.classList.remove('kt-score-good');
  void play.offsetWidth;
  play.classList.add('kt-score-good');
}

function updateScrubber(value, jump = false) {
  if (!currentSummary?.probability.length) return;
  scrubIndex = Math.max(0, Math.min(currentSummary.probability.length - 1, Number(value)));
  const point = currentSummary.probability[scrubIndex];
  const x = currentSummary.probability.length === 1 ? 500 : scrubIndex / (currentSummary.probability.length - 1) * 1000;
  const line = document.querySelector('#kt-chart-scrubber-line');
  line?.setAttribute('x1', x);
  line?.setAttribute('x2', x);
  const readout = document.querySelector('.kt-momentum-readout strong');
  if (readout) readout.textContent = `${Math.round(point.home * 100)}%`;
  if (jump) jumpToPlay(point.id);
}

function syncGameWeather(game) {
  const key = `${game.id}:${game.venue}:${game.date}`;
  if (key === weatherGameKey) return;
  weatherGameKey = key;
  weatherCleanup();
  currentWeather = undefined;
  weatherState = 'loading';
  weatherCleanup = subscribeGameWeather([game], (conditions, states) => {
    currentWeather = conditions[game.id];
    weatherState = states[game.id] || 'error';
    const target = app.querySelector('.kt-game-weather');
    if (target) target.innerHTML = weatherStrip(currentWeather, weatherState);
  });
}

function render(summary) {
  currentSummary = summary;
  const { game, probability } = summary;
  syncGameWeather(game);
  const latestHome = probability.at(-1)?.home ?? 0.5;
  app.style.setProperty('--kt-away-color', rgb(game.away.color));
  app.style.setProperty('--kt-home-color', rgb(game.home.color));
  app.style.setProperty('--kt-away-glow', (0.08 + (1 - latestHome) * 0.2).toFixed(2));
  app.style.setProperty('--kt-home-glow', (0.08 + latestHome * 0.2).toFixed(2));
  app.innerHTML = `<div class="kt-game-topbar"><a class="kt-game-back" href="${backUrl()}">← All games</a><span class="kt-game-state${game.state === 'post' ? ' is-final' : ''}">${game.state === 'in' ? '<span class="kt-live-dot" aria-hidden="true"></span>' : ''}${escapeHtml(game.state === 'post' ? 'Final' : game.state === 'in' ? 'Live' : 'Upcoming')}</span></div><section class="kt-matchup" aria-label="${escapeHtml(game.away.name)} at ${escapeHtml(game.home.name)}">${teamHeader(game.away, 'away', 1 - latestHome)}<div class="kt-match-center"><span class="kt-match-vs">AT</span><span class="kt-match-status">${escapeHtml(game.detail)}</span>${game.redZone ? '<span class="kt-red-zone">Red zone</span>' : ''}</div>${teamHeader(game.home, 'home', latestHome)}</section><div class="kt-game-weather">${weatherStrip(currentWeather, weatherState)}</div><section class="kt-momentum-card" aria-labelledby="momentum-title"><div class="kt-momentum-header"><div><span class="kt-eyebrow">Momentum</span><h1 id="momentum-title">Win probability</h1></div><div class="kt-momentum-readout"><strong>${Math.round(latestHome * 100)}%</strong><span>${escapeHtml(game.home.abbreviation)} · Live model</span></div></div>${chartMarkup(summary)}</section><div class="kt-game-tabs" role="tablist" aria-label="Game details"><button class="kt-game-tab" type="button" role="tab" data-tab="plays" aria-selected="${currentTab === 'plays'}">Play by play</button><button class="kt-game-tab" type="button" role="tab" data-tab="box" aria-selected="${currentTab === 'box'}">Box score</button><button class="kt-game-tab" type="button" role="tab" data-tab="drives" aria-selected="${currentTab === 'drives'}">Drives</button></div><section class="kt-game-panel" data-panel="plays"><div class="kt-play-feed">${summary.plays.length ? summary.plays.slice().reverse().map((play, index) => playMarkup(play, summary, index === 0)).join('') : '<div class="kt-score-empty">Play-by-play will appear after kickoff.</div>'}</div></section><section class="kt-game-panel" data-panel="box" hidden>${boxMarkup(summary)}</section><section class="kt-game-panel" data-panel="drives" hidden>${drivesMarkup(summary)}</section>`;
  app.setAttribute('aria-busy', 'false');
  document.title = `${game.away.abbreviation} ${game.away.score} at ${game.home.abbreviation} ${game.home.score} — Game Day`;
  app.querySelectorAll('.kt-game-tab').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.tab)));
  app.querySelectorAll('.kt-chart-dot').forEach(dot => {
    dot.addEventListener('click', () => jumpToPlay(dot.dataset.playId));
    dot.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); jumpToPlay(dot.dataset.playId); } });
  });
  const scrubber = document.querySelector('#kt-momentum-scrubber');
  scrubber?.addEventListener('input', event => updateScrubber(event.target.value));
  scrubber?.addEventListener('change', event => updateScrubber(event.target.value, true));
  selectTab(currentTab);
  if (scrubIndex !== undefined) {
    scrubber.value = scrubIndex;
    updateScrubber(scrubIndex);
  }

  const scoreKey = `${game.away.score}-${game.home.score}`;
  if (previousScores && previousScores !== scoreKey && coarseHaptics()) navigator.vibrate([25, 45, 25]);
  previousScores = scoreKey;
  const newScoring = summary.scoringPlays.filter(play => !knownScoringIds.has(play.id));
  if (newScoring.length && knownScoringIds.size && coarseHaptics()) navigator.vibrate([25, 45, 25]);
  knownScoringIds = new Set(summary.scoringPlays.map(play => play.id));
}

function coarseHaptics() {
  return !reducedMotion.matches && window.matchMedia('(pointer: coarse)').matches && 'vibrate' in navigator;
}

function renderError() {
  app.innerHTML = `<div class="kt-game-loading"><span class="kt-eyebrow">Game Day</span><h1 class="kt-display">The stadium is reconnecting</h1><p class="kt-muted">Your last-good scores are safe. Try the summary again.</p><div><a class="kt-btn" href="${backUrl()}">All games</a> <button class="kt-btn kt-btn-primary" type="button" id="game-retry">Retry</button></div></div>`;
  document.querySelector('#game-retry').addEventListener('click', () => liveData.refresh(sourceKey));
}

if (!gameId) {
  app.innerHTML = '<div class="kt-game-loading"><h1 class="kt-display">No game selected</h1><a class="kt-btn kt-btn-primary" href="index.html">Back to scores</a></div>';
} else {
  sourceKey = summarySource(gameId);
  mountRedZoneAlert(gameId);
  liveData.subscribe(sourceKey, ({ data, status }) => {
    if (data && data !== lastData) {
      lastData = data;
      const summary = normalizeSummary(data);
      if (summary) render(summary);
      else renderError();
    } else if (!data && status === 'error') renderError();
  });
}
