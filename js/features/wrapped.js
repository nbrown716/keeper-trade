// Season Wrapped 2.0: story player (tap / hold / swipe / keyboard), poster preview, league table and exports.
import { mountNavigation } from '../ui/navigation.js';
import { mountPageTransitions } from '../ui/page-transitions.js';
import { getSleeperLeagueId } from '../data/sleeper.js';
import { getActiveLeagueConnection } from '../data/league-connections.js';
import { loadSeason } from '../data/season-stats.js';
import { buildSlides } from './wrapped-slides.js';
import { negotiateVideoCodec, shareOrDownload } from './share.js';
import { friendlyError } from '../ui/friendly-error.js';

const MANAGER_KEY = 'kt-drive-manager:v1';
const SEEN_KEY = 'kt-wrapped:v1';
const VIDEO_SLIDE = 2.6; // seconds per slide in the exported video
const VIDEO_SPEED = 1.7; // animations play this much faster in the video
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const $ = selector => document.querySelector(selector);
const els = {
  manager: $('#wr-manager'), play: $('#wr-play'), status: $('#wr-status'), facts: $('#wr-facts'), eyebrow: $('#wr-eyebrow'),
  preview: $('#wr-preview'), previewFrame: $('#wr-preview-frame'), league: $('#wr-league'), table: $('#wr-table'),
  story: $('#wr-story'), stage: $('#wr-stage'), canvas: $('#wr-canvas'), progress: $('#wr-progress'), live: $('#wr-live'),
  prev: $('#wr-prev'), next: $('#wr-next'), close: $('#wr-close'), pause: $('#wr-pause'), count: $('#wr-count'),
  shareSlide: $('#wr-share-slide'), more: $('#wr-more'), menu: $('#wr-menu'), saveAll: $('#wr-save-all'), video: $('#wr-video'), exportStatus: $('#wr-export')
};
const state = { season: null, rosterId: 0, slides: [], index: 0, elapsed: 0, paused: false, held: false, frame: 0, last: 0, opener: null, exporting: false };

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const fmt = (value, digits = 1) => Number(value || 0).toFixed(digits);
const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th'}`;
const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch (_) { return {}; } };
const writeSeen = value => { try { localStorage.setItem(SEEN_KEY, JSON.stringify({ ...readSeen(), ...value })); } catch (_) {} };

async function fontsReady() {
  try { await Promise.all([document.fonts.load('800 40px "Barlow Condensed"'), document.fonts.load('700 14px Inter'), document.fonts.load('500 14px Inter')]); } catch (_) {}
}

// ---------------------------------------------------------------- landing
function renderFacts() {
  const me = state.season.teams.get(state.rosterId);
  const teams = state.season.teams.size;
  els.facts.innerHTML = [
    ['Record', `${me.wins}–${me.losses}${me.ties ? `–${me.ties}` : ''}`],
    ['Points', `${fmt(me.pf)} · ${ordinal(me.ranks.pf)}/${teams}`],
    ['Lineup IQ', `${(me.lineupIQ * 100).toFixed(1)}% · ${ordinal(me.ranks.iq)}`],
    ['Luck', `${me.luck >= 0 ? '+' : '−'}${fmt(Math.abs(me.luck), 1)} wins`]
  ].map(([label, value]) => `<li><span>${label}</span><strong>${escapeHtml(value)}</strong></li>`).join('');
}

function renderPreview() {
  const poster = state.slides.find(slide => slide.id === 'poster');
  if (!poster) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  els.preview.width = 360 * dpr;
  els.preview.height = 640 * dpr;
  const context = els.preview.getContext('2d');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  poster.draw(context, 360, 640, 99, true);
  els.preview.setAttribute('aria-label', poster.alt);
  els.previewFrame.classList.remove('kt-skeleton');
}

function renderTable() {
  const rows = [...state.season.teams.values()].sort((a, b) => b.wins - a.wins || b.pf - a.pf);
  els.table.innerHTML = `<caption class="kt-sr-only">Season KPIs for every manager through Week ${state.season.throughWeek}</caption><thead><tr><th scope="col">Manager</th><th scope="col">Record</th><th scope="col">All-play</th><th scope="col">Luck</th><th scope="col">Points</th><th scope="col">Lineup IQ</th><th scope="col">Moves</th><th scope="col">Archetype</th></tr></thead><tbody>${rows.map(team => `<tr${team.rosterId === state.rosterId ? ' class="is-me"' : ''}><th scope="row">${escapeHtml(team.name)}</th><td>${team.wins}–${team.losses}${team.ties ? `–${team.ties}` : ''}</td><td>${team.allPlay.wins}–${team.allPlay.losses}</td><td class="${team.luck >= 0.75 ? 'is-up' : team.luck <= -0.75 ? 'is-down' : ''}">${team.luck >= 0 ? '+' : '−'}${fmt(Math.abs(team.luck), 1)}</td><td>${fmt(team.pf)}</td><td>${(team.lineupIQ * 100).toFixed(1)}%</td><td>${team.moves.total}</td><td>${escapeHtml(team.archetype.title)}</td></tr>`).join('')}</tbody>`;
  els.league.hidden = false;
}

function selectManager(rosterId) {
  state.rosterId = rosterId;
  try { localStorage.setItem(MANAGER_KEY, String(rosterId)); } catch (_) {}
  state.slides = buildSlides(state.season, rosterId);
  renderFacts();
  renderPreview();
  renderTable();
}

async function load() {
  mountNavigation({ active: 'wrapped' });
  mountPageTransitions();
  const leagueId = getSleeperLeagueId();
  if (!leagueId) {
    els.status.innerHTML = 'Connect your league on the <a href="index.html#league">Home page</a> to unlock Wrapped.';
    els.manager.innerHTML = '<option>No league connected</option>';
    return;
  }
  if (getActiveLeagueConnection()?.provider === 'yahoo') {
    els.status.textContent = 'Wrapped needs per-player weekly points, which Yahoo leagues don’t share with us yet. Sleeper leagues are fully supported.';
    els.manager.innerHTML = '<option>Yahoo league</option>';
    return;
  }
  try {
    const [season] = await Promise.all([loadSeason(leagueId), fontsReady()]);
    state.season = season;
    if (!season.weeks.length) {
      els.status.textContent = 'Wrapped unlocks once Week 1 is final. Check back Tuesday.';
      els.manager.innerHTML = '<option>Season not started</option>';
      return;
    }
    const saved = Number(localStorage.getItem(MANAGER_KEY));
    const managers = season.managers.slice().sort((a, b) => a.name.localeCompare(b.name));
    const initial = season.teams.has(saved) ? saved : managers[0].id;
    els.manager.innerHTML = managers.map(manager => `<option value="${manager.id}"${manager.id === initial ? ' selected' : ''}>${escapeHtml(manager.name)}</option>`).join('');
    els.manager.disabled = false;
    els.play.disabled = false;
    els.eyebrow.textContent = `${season.league.name} · ${season.league.season} · ${season.complete ? 'final' : `weeks 1–${season.throughWeek}`}`;
    els.status.textContent = season.complete ? `The final cut: all ${season.weeks.length} regular-season weeks.` : `Season so far: weeks 1–${season.throughWeek}. The final cut unlocks after Week ${season.league.playoffStart - 1}.`;
    selectManager(initial);
    els.manager.addEventListener('change', () => selectManager(Number(els.manager.value)));
    const params = new URLSearchParams(window.location.search);
    if (params.get('play') === '1') openStory();
  } catch (error) {
    els.status.textContent = friendlyError(error, 'Your league is reconnecting. Try again in a moment.');
  }
}

// ---------------------------------------------------------------- story player
function sizeCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  els.canvas.width = Math.round(rect.width * dpr);
  els.canvas.height = Math.round(rect.height * dpr);
}

function drawCurrent() {
  const slide = state.slides[state.index];
  if (!slide) return;
  const context = els.canvas.getContext('2d');
  context.setTransform(1, 0, 0, 1, 0, 0);
  slide.draw(context, els.canvas.width, els.canvas.height, reducedMotion.matches ? 99 : state.elapsed, reducedMotion.matches);
  [...els.progress.children].forEach((bar, index) => {
    const fill = index < state.index ? 1 : index > state.index ? 0 : Math.min(1, state.elapsed / slide.duration);
    bar.firstElementChild.style.transform = `scaleX(${fill})`;
  });
}

function announce() {
  const slide = state.slides[state.index];
  els.canvas.setAttribute('aria-label', slide.alt);
  els.live.textContent = `Slide ${state.index + 1} of ${state.slides.length}. ${slide.alt}`;
  els.count.textContent = '';
}

function go(index) {
  state.index = Math.max(0, Math.min(state.slides.length - 1, index));
  state.elapsed = 0;
  announce();
  drawCurrent();
  if (navigator.vibrate && matchMedia('(pointer: coarse)').matches) navigator.vibrate(8);
}

function tick(now) {
  if (els.story.hidden) return;
  const delta = Math.min(0.1, (now - (state.last || now)) / 1000);
  state.last = now;
  if (!state.paused && !state.held && !state.exporting) {
    state.elapsed += delta;
    const slide = state.slides[state.index];
    if (state.elapsed >= slide.duration) {
      if (state.index < state.slides.length - 1) go(state.index + 1);
      else { state.elapsed = slide.duration; setPaused(true); }
    }
  }
  drawCurrent();
  state.frame = requestAnimationFrame(tick);
}

function setPaused(paused) {
  state.paused = paused;
  els.pause.setAttribute('aria-pressed', String(paused));
  els.pause.setAttribute('aria-label', paused ? 'Play' : 'Pause');
  els.pause.textContent = paused ? '▶' : '❚❚';
}

function openStory() {
  if (!state.slides.length) return;
  state.opener = document.activeElement;
  els.progress.innerHTML = state.slides.map(() => '<span><i></i></span>').join('');
  els.story.hidden = false;
  document.body.classList.add('wr-locked');
  sizeCanvas();
  setPaused(false);
  state.last = 0;
  go(0);
  els.close.focus();
  cancelAnimationFrame(state.frame);
  state.frame = requestAnimationFrame(tick);
  writeSeen({ [`${state.season.league.id}:${state.season.throughWeek}`]: true });
}

function closeStory() {
  els.story.hidden = true;
  els.menu.hidden = true;
  els.more.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('wr-locked');
  cancelAnimationFrame(state.frame);
  state.opener?.focus?.();
}

// Tap left/right, hold to pause, swipe down to close.
let pointer = null;
function onPointerDown(event) {
  if (event.button > 0) return;
  pointer = { x: event.clientX, y: event.clientY, at: performance.now(), zone: event.currentTarget === els.prev ? -1 : 1 };
  pointer.timer = setTimeout(() => { state.held = true; }, 220);
}
function onPointerUp(event) {
  if (!pointer) return;
  clearTimeout(pointer.timer);
  const dy = event.clientY - pointer.y;
  const wasHeld = state.held;
  state.held = false;
  const zone = pointer.zone;
  pointer = null;
  if (dy > 90) { closeStory(); return; }
  if (wasHeld) return;
  go(state.index + zone);
}
[els.prev, els.next].forEach(zone => {
  zone.addEventListener('pointerdown', onPointerDown);
  zone.addEventListener('pointerup', onPointerUp);
  zone.addEventListener('pointercancel', () => { if (pointer) clearTimeout(pointer.timer); pointer = null; state.held = false; });
  zone.addEventListener('click', event => { if (event.detail === 0) go(state.index + (zone === els.prev ? -1 : 1)); }); // keyboard activation
  zone.addEventListener('contextmenu', event => event.preventDefault());
});

document.addEventListener('keydown', event => {
  if (els.story.hidden) return;
  if (event.key === 'Escape') { event.preventDefault(); if (!els.menu.hidden) toggleMenu(false); else closeStory(); }
  else if (event.key === 'ArrowRight') { event.preventDefault(); go(state.index + 1); }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); go(state.index - 1); }
  else if (event.key === ' ' && !event.target.closest('button')) { event.preventDefault(); setPaused(!state.paused); }
  else if (event.key === 'Tab') {
    const focusable = [...els.story.querySelectorAll('button')].filter(button => !button.closest('[hidden]'));
    const firstItem = focusable[0];
    const lastItem = focusable.at(-1);
    if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem.focus(); }
    else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem.focus(); }
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && !els.story.hidden) setPaused(true); });
window.addEventListener('resize', () => { if (!els.story.hidden) { sizeCanvas(); drawCurrent(); } });

function toggleMenu(open = els.menu.hidden) {
  els.menu.hidden = !open;
  els.more.setAttribute('aria-expanded', String(open));
  if (open) { setPaused(true); els.shareSlide.focus(); }
}

// ---------------------------------------------------------------- exports
const fileBase = () => `keeper-trade-wrapped-${state.season.league.season}-${(state.season.teams.get(state.rosterId)?.name || 'manager').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
function slideBlob(slide) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  slide.draw(canvas.getContext('2d'), 1080, 1920, 99, true);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}
function exportStatus(text) {
  els.exportStatus.hidden = !text;
  els.exportStatus.textContent = text || '';
}

els.shareSlide.addEventListener('click', async () => {
  toggleMenu(false);
  setPaused(true);
  const slide = state.slides[state.index];
  const blob = await slideBlob(slide);
  const result = await shareOrDownload(blob, `${fileBase()}-${String(state.index + 1).padStart(2, '0')}-${slide.id}.png`, 'Keeper Trade — Season Wrapped');
  if (!result.cancelled) exportStatus(result.shared ? 'Shared.' : 'Slide saved.');
  setTimeout(() => exportStatus(''), 2500);
});

els.saveAll.addEventListener('click', async () => {
  toggleMenu(false);
  const files = [];
  for (const [index, slide] of state.slides.entries()) {
    exportStatus(`Rendering slide ${index + 1} of ${state.slides.length}…`);
    files.push(new File([await slideBlob(slide)], `${fileBase()}-${String(index + 1).padStart(2, '0')}-${slide.id}.png`, { type: 'image/png' }));
  }
  if (navigator.share && navigator.canShare?.({ files })) {
    try { await navigator.share({ files, title: 'Season Wrapped' }); exportStatus('Shared.'); setTimeout(() => exportStatus(''), 2500); return; } catch (error) { if (error.name === 'AbortError') { exportStatus(''); return; } }
  }
  for (const file of files) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    await new Promise(resolve => setTimeout(resolve, 180));
  }
  exportStatus(`${files.length} slides saved.`);
  setTimeout(() => exportStatus(''), 3000);
});

els.video.addEventListener('click', async () => {
  toggleMenu(false);
  const codec = negotiateVideoCodec();
  if (!codec) { exportStatus('This browser can’t record video. Use “Save all slides” instead.'); return; }
  state.exporting = true;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.append(canvas);
  const context = canvas.getContext('2d');
  const total = state.slides.length * VIDEO_SLIDE;
  const draw = time => {
    const index = Math.max(0, Math.min(state.slides.length - 1, Math.floor(time / VIDEO_SLIDE)));
    const local = Math.min(state.slides[index].duration, (time - index * VIDEO_SLIDE) * VIDEO_SPEED);
    state.slides[index].draw(context, 1080, 1920, local, false);
  };
  draw(0);
  const stream = canvas.captureStream(30);
  const chunks = [];
  try {
    const recorder = new MediaRecorder(stream, { ...codec, videoBitsPerSecond: 1600000 });
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const done = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start(250);
    const start = performance.now();
    await new Promise(resolve => {
      const step = () => {
        // performance.now(), not the rAF timestamp: that can predate `start` and give a negative time
        const time = Math.max(0, (performance.now() - start) / 1000);
        draw(Math.min(total - 0.001, time));
        exportStatus(`Recording your Wrapped… ${Math.min(99, Math.round(time / total * 100))}%`);
        if (time < total) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    recorder.stop();
    await done;
    const blob = new Blob(chunks, { type: codec.mimeType });
    const result = await shareOrDownload(blob, `${fileBase()}.${codec.extension}`, 'Keeper Trade — Season Wrapped');
    exportStatus(result.cancelled ? '' : `Video ready (${(blob.size / 1048576).toFixed(1)} MB).`);
  } catch (_) {
    exportStatus('Video recording failed. “Save all slides” still works.');
  } finally {
    stream.getTracks().forEach(track => track.stop());
    canvas.remove();
    state.exporting = false;
    setTimeout(() => exportStatus(''), 4000);
  }
});

els.play.addEventListener('click', openStory);
els.close.addEventListener('click', closeStory);
els.pause.addEventListener('click', () => setPaused(!state.paused));
els.more.addEventListener('click', () => toggleMenu());

load();
