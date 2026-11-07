import { loadDriveRecap, defaultDriveWeek, DRIVE_DURATION } from './drive-data.js';
import { friendlyError } from '../ui/friendly-error.js';
import { createFieldRenderer } from './drive-field.js';
import { createFlyoverRenderer } from './drive-flyover.js';
import { createRaceRenderer } from './drive-race.js';
import { renderSummary } from './drive-summary.js';

const rendererFor = name => name === 'race' ? createRaceRenderer() : name === 'map' ? createFlyoverRenderer() : createFieldRenderer();
import { askAI } from '../data/ai.js';
import { getSleeperLeagueId } from '../data/sleeper.js';
import { renderDriveVideo, renderStoryPack, renderScoreCard, shareOrDownload, shareStoryPack, copyRecapLink, ShareError } from './share.js';
import { mascot } from '../ui/mascot.js';

const canvas = document.querySelector('#drive-canvas');
const context = canvas.getContext('2d');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const playButton = document.querySelector('#drive-play');
const progress = document.querySelector('#drive-progress');
const status = document.querySelector('#drive-status');
const loading = document.querySelector('#drive-loading');
const modeButtons = [...document.querySelectorAll('[data-drive-mode]')];
let recap;
let mode = ['race', 'field', 'map'].includes(new URLSearchParams(window.location.search).get('mode')) ? new URLSearchParams(window.location.search).get('mode') : 'race';
let renderer = rendererFor(mode);
let timeline;
let playhead = { time: 0 };
let canvasWidth = 0;
let canvasHeight = 0;
let pixelRatio = 1;
let currentBeat = -1;
let soundEnabled = false;
let audioContext;
let loadSequence = 0;
let summary = null;

function setStatus(message) {
  status.textContent = message;
}

function renderFrame() {
  if (!recap || !canvasWidth || !canvasHeight) return;
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  renderer(context, recap, canvasWidth, canvasHeight, playhead.time, reducedMotion.matches);
  progress.value = String(playhead.time);
  summary?.update(playhead.time);
  progress.setAttribute('aria-valuetext', `${playhead.time.toFixed(0)} seconds of ${DRIVE_DURATION}`);
  if (mode === 'race' && recap.race) { raceStatus(); return; }
  const beat = playhead.time < 3 ? -1 : playhead.time >= 43 ? recap.starters.length : Math.floor((playhead.time - 3) / recap.beatDuration);
  if (beat !== currentBeat) {
    currentBeat = beat;
    const label = beat === -1 ? `${recap.manager}, week ${recap.week}` : beat === recap.starters.length ? `Final: ${recap.total.toFixed(2)} points, ${recap.result}` : `${recap.starters[beat].name}, ${recap.starters[beat].points.toFixed(1)} points`;
    canvas.setAttribute('aria-label', `The Drive recap. ${label}`);
    setStatus(beat === recap.starters.length ? 'End zone. Your week is complete.' : beat === -1 ? 'The opening kickoff…' : `Play ${beat + 1} of ${recap.starters.length} · ${recap.starters[beat].name}`);
    if (beat === recap.starters.length) window.dispatchEvent(new CustomEvent('kt:drive-finale', { detail: { result: recap.result, rank: recap.rank, manager: recap.manager } }));
    if (soundEnabled && !reducedMotion.matches) playSting(beat === recap.starters.length);
  }
}

let raceBeat = '';
function raceStatus() {
  const race = recap.race;
  const t = playhead.time;
  const segment = race.segments.find(item => t >= item.filmStart && t <= item.filmEnd);
  const key = t >= race.playEnd ? 'final' : t < race.intro ? 'intro' : segment?.id || 'gap';
  if (key === raceBeat) return;
  raceBeat = key;
  const result = race.winner === race.A ? `${race.nameA} wins` : race.winner === race.B ? `${race.nameB} wins` : 'Tie game';
  const label = key === 'final' ? `${result}, ${race.finalA.toFixed(2)} to ${race.finalB.toFixed(2)}. ${race.leadChanges.length} lead changes.` : key === 'intro' ? `${race.nameA} versus ${race.nameB}` : segment ? `${segment.label} window` : 'Between windows';
  canvas.setAttribute('aria-label', `The Drive head-to-head race. ${label}`);
  setStatus(key === 'final' ? `Final · ${result}` : key === 'intro' ? 'Kickoff: both lineups, every play in real order.' : segment ? `${segment.label} · the race is on` : 'Time-lapse to the next window…');
  if (key === 'final') window.dispatchEvent(new CustomEvent('kt:drive-finale', { detail: { result: recap.result, rank: recap.rank, manager: recap.manager } }));
  if (soundEnabled && !reducedMotion.matches) playSting(key === 'final');
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  canvasWidth = Math.max(1, Math.round(rect.width));
  canvasHeight = Math.max(1, Math.round(rect.height));
  canvas.width = Math.round(canvasWidth * pixelRatio);
  canvas.height = Math.round(canvasHeight * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  renderFrame();
}

function updatePlayButton() {
  const paused = !timeline || timeline.paused();
  playButton.textContent = playhead.time >= DRIVE_DURATION ? 'Replay' : paused ? 'Play' : 'Pause';
  playButton.setAttribute('aria-label', playButton.textContent);
}

function makeTimeline(startAt = 0, autoplay = false) {
  timeline?.kill();
  playhead = { time: startAt };
  if (!window.gsap) {
    renderFrame();
    updatePlayButton();
    return;
  }
  timeline = window.gsap.timeline({
    paused: true,
    onUpdate: renderFrame,
    onComplete: () => { playhead.time = DRIVE_DURATION; renderFrame(); updatePlayButton(); }
  });
  timeline.to(playhead, { time: DRIVE_DURATION, duration: DRIVE_DURATION, ease: 'none' }, 0);
  timeline.addLabel('kickoff', 0);
  recap.starters.forEach((player, index) => timeline.addLabel(`play-${index + 1}`, 3 + index * recap.beatDuration));
  timeline.addLabel('end-zone', 43);
  timeline.seek(startAt, false);
  if (autoplay && !reducedMotion.matches) timeline.play();
  renderFrame();
  updatePlayButton();
}

function seek(time, pause = true) {
  const target = Math.max(0, Math.min(DRIVE_DURATION, Number(time)));
  if (timeline) {
    timeline.seek(target, false);
    if (pause) timeline.pause();
  } else {
    playhead.time = target;
    renderFrame();
  }
  updatePlayButton();
}

function togglePlay() {
  if (!recap) return;
  if (reducedMotion.matches || !timeline) {
    seek(playhead.time >= DRIVE_DURATION ? 0 : DRIVE_DURATION);
    return;
  }
  if (playhead.time >= DRIVE_DURATION) timeline.seek(0);
  timeline.paused(!timeline.paused());
  updatePlayButton();
}

function skipBeat() {
  if (!recap) return;
  const labels = [0, ...recap.starters.map((_, index) => 3 + index * recap.beatDuration), 43, DRIVE_DURATION];
  const next = labels.find(time => time > playhead.time + 0.08);
  seek(next ?? DRIVE_DURATION);
}

function playSting(finale) {
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(finale ? 420 : 170, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(finale ? 780 : 350, audioContext.currentTime + 0.16);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.025, audioContext.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.2);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.21);
  } catch (_) {}
}

export async function generatePoster(recapData, posterMode = 'field') {
  const poster = document.createElement('canvas');
  poster.width = 1080;
  poster.height = 1920;
  const posterContext = poster.getContext('2d');
  const draw = rendererFor(posterMode);
  draw(posterContext, recapData, 1080, 1920, DRIVE_DURATION, true);
  return new Promise(resolve => poster.toBlob(resolve, 'image/png'));
}

async function loadVerdict(sequence) {
  const fallback = recap.result === 'W'
    ? `${recap.manager} turned week ${recap.week} into a ${recap.margin.toFixed(2)}-point statement win.`
    : recap.result === 'L' ? `Week ${recap.week} went to ${recap.opponent}; the next drive starts now.` : `Week ${recap.week} ended level. One play made all the difference.`;
  recap.verdict = fallback;
  try {
    const result = await askAI('recap', {
      cacheKey: recap.cacheKey,
      leagueId: recap.leagueId,
      format: 'One sentence only, maximum 24 words.',
      week: recap.week,
      manager: recap.manager,
      opponent: recap.opponent,
      score: recap.total,
      opponentScore: recap.opponentTotal,
      result: recap.result,
      rank: recap.rank,
      teams: recap.teams
    }, { ttl: 604800000 });
    if (sequence === loadSequence && result.status === 'ready' && result.text) recap.verdict = result.text.replace(/\s+/g, ' ').trim();
  } catch (_) {}
  if (sequence === loadSequence) renderFrame();
}

async function load() {
  const sequence = ++loadSequence;
  timeline?.kill();
  timeline = null;
  recap = null;
  summary = null;
  document.querySelector('#drive-summary').hidden = true;
  loading.hidden = false;
  loading.setAttribute('aria-busy', 'true');
  document.querySelector('#drive-error').hidden = true;
  try {
    const leagueId = getSleeperLeagueId();
    if (!leagueId) throw new Error('Connect your Sleeper league before watching your week.');
    const params = new URLSearchParams(window.location.search);
    const requestedWeek = Number(params.get('week'));
    const week = requestedWeek >= 1 && requestedWeek <= 18 ? requestedWeek : await defaultDriveWeek();
    const rosterId = Number(params.get('roster')) || undefined;
    const data = await loadDriveRecap(leagueId, week, rosterId);
    if (sequence !== loadSequence) return;
    recap = data;
    mascot.mount(document.querySelector('#drive-mascot'));
    recap.verdict = 'The league office is writing this week’s verdict…';
    const managerSelect = document.querySelector('#drive-manager');
    managerSelect.replaceChildren(...recap.managers.map(manager => {
      const option = document.createElement('option');
      option.value = String(manager.id);
      option.textContent = manager.name;
      option.selected = manager.id === recap.rosterId;
      return option;
    }));
    managerSelect.value = String(recap.rosterId);
    document.querySelector('#drive-week').value = String(recap.week);
    document.querySelector('#drive-title-week').textContent = `Week ${recap.week}`;
    document.title = `${recap.manager} · Week ${recap.week} — The Drive`;
    const nextParams = new URLSearchParams({ week: String(recap.week), roster: String(recap.rosterId) });
    history.replaceState(null, '', `drive.html?${nextParams}`);
    loading.hidden = true;
    loading.setAttribute('aria-busy', 'false');
    currentBeat = -2;
    raceBeat = '';
    resizeCanvas();
    makeTimeline(0, true);
    summary = renderSummary(document.querySelector('#drive-summary'), recap, { onSeek: time => seek(time) }) || null;
    if (reducedMotion.matches) setStatus('Reduced motion is on. Scrub or skip through the static recap.');
    loadVerdict(sequence);
  } catch (error) {
    loading.hidden = true;
    const panel = document.querySelector('#drive-error');
    panel.hidden = false;
    panel.querySelector('p').textContent = friendlyError(error, 'Your recap could not load. Your league and other tools are still available.');
    setStatus('The Drive is waiting for a connected league.');
  }
}

modeButtons.forEach(item => item.setAttribute('aria-pressed', String(item.dataset.driveMode === mode)));
playButton.addEventListener('click', togglePlay);
document.querySelector('#drive-skip').addEventListener('click', skipBeat);
canvas.addEventListener('click', skipBeat);
document.querySelector('#drive-replay').addEventListener('click', () => { seek(0); if (timeline && !reducedMotion.matches) timeline.play(); updatePlayButton(); });
progress.addEventListener('input', () => seek(progress.value));
modeButtons.forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.driveMode;
  renderer = rendererFor(mode);
  modeButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  raceBeat = '';
  currentBeat = -2;
  renderFrame();
}));
document.querySelector('#drive-sound').addEventListener('click', async event => {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    try { audioContext ||= new AudioContext(); await audioContext.resume(); } catch (_) { soundEnabled = false; }
  }
  event.currentTarget.setAttribute('aria-pressed', String(soundEnabled));
  event.currentTarget.textContent = soundEnabled ? 'Sound on' : 'Sound off';
});
document.querySelector('#drive-download').addEventListener('click', async () => {
  if (!recap) return;
  const blob = await generatePoster(recap, mode);
  if (!blob) { setStatus('Poster export is unavailable in this browser.'); return; }
  const link = document.createElement('a');
  link.download = `keeper-trade-drive-week-${recap.week}-${mode}.png`;
  link.href = URL.createObjectURL(blob);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  setStatus('Poster downloaded. Your week is ready for the group chat.');
});
document.querySelector('#drive-manager').addEventListener('change', event => {
  const week = document.querySelector('#drive-week').value;
  history.replaceState(null, '', `drive.html?week=${week}&roster=${event.target.value}`);
  load();
});
document.querySelector('#drive-week').addEventListener('change', event => {
  const roster = document.querySelector('#drive-manager').value;
  history.replaceState(null, '', `drive.html?week=${event.target.value}&roster=${roster}`);
  load();
});
function exportProgress(message, percent = 0) {
  const panel = document.querySelector('#drive-export-progress');
  panel.hidden = false;
  panel.querySelector('span').textContent = `${message} ${percent}%`;
  panel.querySelector('.kt-drive-export-fill').style.transform = `scaleX(${percent / 100})`;
}

async function storyPackExport() {
  const frames = await renderStoryPack(recap, { mode, onProgress: percent => exportProgress('Building your Story Pack…', percent) });
  const outcome = await shareStoryPack(frames, recap);
  setStatus(outcome.shared ? 'Story Pack shared. Six real frames from your week.' : outcome.cancelled ? 'Story Pack is ready whenever you are.' : 'Story Pack downloaded: intro, three leaders, and finale.');
}

async function runExport(task) {
  if (!recap) return;
  const buttons = [...document.querySelectorAll('[data-share-action]')];
  buttons.forEach(button => { button.disabled = true; });
  if (timeline) timeline.pause();
  updatePlayButton();
  try {
    await task();
  } catch (error) {
    setStatus(error.name === 'AbortError' ? 'Export cancelled. Your film is still here.' : 'Export is unavailable right now. Try the Story Pack instead.');
  } finally {
    buttons.forEach(button => { button.disabled = false; });
    document.querySelector('#drive-export-progress').hidden = true;
  }
}

document.querySelector('[data-share-action="video"]').addEventListener('click', () => runExport(async () => {
  const orientation = document.querySelector('#drive-orientation').value;
  try {
    const result = await renderDriveVideo(recap, { mode, orientation, onProgress: percent => exportProgress('Rendering your week…', percent) });
    if (result.blob.size > 15 * 1024 * 1024) throw new ShareError('story-pack', 'Video exceeded the share-size budget.');
    const name = `keeper-trade-week-${recap.week}-${mode}-${orientation}.${result.extension}`;
    const outcome = await shareOrDownload(result.blob, name);
    setStatus(outcome.shared ? `Video shared · ${(result.blob.size / 1048576).toFixed(1)} MB` : outcome.cancelled ? 'Your rendered video is ready to export again.' : `Video downloaded · ${(result.blob.size / 1048576).toFixed(1)} MB · ${result.width}×${result.height}`);
  } catch (error) {
    if (error instanceof ShareError && error.code === 'story-pack') await storyPackExport();
    else throw error;
  }
}));
document.querySelector('[data-share-action="story"]').addEventListener('click', () => runExport(storyPackExport));
document.querySelector('[data-share-action="score"]').addEventListener('click', () => runExport(async () => {
  exportProgress('Drawing your score card…', 35);
  const blob = await renderScoreCard(recap);
  if (!blob) throw new ShareError('export', 'Score card unavailable.');
  exportProgress('Drawing your score card…', 100);
  const outcome = await shareOrDownload(blob, `keeper-trade-week-${recap.week}-score-card.png`);
  setStatus(outcome.shared ? 'Score card shared.' : outcome.cancelled ? 'Score card ready when you are.' : 'Score card downloaded. Top three and route included.');
}));
document.querySelector('[data-share-action="copy"]').addEventListener('click', () => runExport(async () => {
  await copyRecapLink(recap);
  setStatus('Recap link copied. It opens this exact manager and week.');
}));

new ResizeObserver(resizeCanvas).observe(canvas);
load();
