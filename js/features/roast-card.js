import { askAI, configureAIEndpoint } from '../data/ai.js';
import { getGamificationState } from './gamification.js';
import { getLeagueSnapshot } from '../data/league-state.js';
import { getSleeperLeagueId } from '../data/sleeper.js?v=3';

let section;
let canvas;
let currentManager;
let mode = 'roast';
let leagueSnapshot;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function managerOptions() {
  const names = leagueSnapshot?.standings?.map(roster => roster.name) || [];
  const local = getGamificationState().manager;
  if (local && !names.includes(local)) names.unshift(local);
  if (!names.length) names.push(local || 'Your manager');
  currentManager = names.includes(currentManager) ? currentManager : local || names[0];
  return names.map(name => `<option value="${escapeHtml(name)}" ${name === currentManager ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('');
}

function renderManagers() {
  const select = section?.querySelector('#roast-manager');
  if (select) select.innerHTML = managerOptions();
}

function wrapText(context, text, x, y, maxWidth, lineHeight, maxLines = 5) {
  const words = text.split(/\s+/);
  let line = '';
  let lines = 0;
  words.forEach(word => {
    const test = line ? `${line} ${word}` : word;
    if (context.measureText(test).width > maxWidth && line) {
      context.fillText(line, x, y + lines * lineHeight);
      line = word;
      lines += 1;
    } else line = test;
  });
  if (line && lines < maxLines) context.fillText(line, x, y + lines * lineHeight);
}

function drawCard(text) {
  const state = getGamificationState();
  const roster = leagueSnapshot?.standings?.find(item => item.name === currentManager);
  const record = roster ? `${roster.wins}–${roster.losses}` : 'COMMAND CENTER';
  const hue = [...currentManager].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 675;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 1200, 675);
  gradient.addColorStop(0, `hsl(${hue} 45% 18%)`);
  gradient.addColorStop(1, '#0b0f1a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1200, 675);
  context.fillStyle = '#c6ff4a';
  context.fillRect(0, 0, 1200, 12);
  context.font = '700 25px Arial';
  context.fillText(`KEEPER TRADE · ${mode.toUpperCase()} CARD`, 60, 70);
  context.fillStyle = '#f4f7fb';
  context.font = '800 64px Arial';
  context.fillText(currentManager.toUpperCase(), 60, 170);
  context.fillStyle = '#8190a8';
  context.font = '700 22px Arial';
  context.fillText(record, 60, 220);
  context.fillStyle = '#f4f7fb';
  context.font = '34px Arial';
  wrapText(context, text, 60, 310, 1040, 52);
  context.fillStyle = '#8190a8';
  context.font = '20px Arial';
  context.fillText(`🔥 ${state.streak.count} days · ${state.xp.toLocaleString()} XP`, 60, 620);
  const image = section.querySelector('.kt-roast-preview');
  image.src = canvas.toDataURL('image/png');
  image.hidden = false;
  section.querySelector('.kt-roast-empty').hidden = true;
  section.querySelectorAll('[data-roast-download], [data-roast-copy]').forEach(button => { button.hidden = false; });
}

function status(message) {
  section.querySelector('.kt-roast-status').textContent = message;
}

async function generate(event) {
  event.preventDefault();
  const button = section.querySelector('#roast-generate');
  button.disabled = true;
  status('Calling the league’s insider…');
  section.querySelector('.kt-roast-loading').hidden = false;
  const roster = leagueSnapshot?.standings?.find(item => item.name === currentManager);
  const gamification = getGamificationState();
  try {
    const result = await askAI('roast', {
      leagueId: getSleeperLeagueId(),
      manager: currentManager,
      mode,
      record: roster ? `${roster.wins}-${roster.losses}` : 'not connected',
      rank: roster ? leagueSnapshot.standings.indexOf(roster) + 1 : null,
      points: roster?.fp ?? null,
      streak: gamification.streak.count,
      xp: gamification.xp
    }, { ttl: 3600000 });
    if (result.status === 'resting') status('AI is resting. Your next card will be ready when it is back.');
    else if (result.status === 'ready' && result.text) {
      drawCard(result.text);
      status('Fresh from the league office. Two sentences, maximum damage.');
    } else status('AI is resting. Try again in a moment.');
  } catch (error) {
    status(error.code === 'config' ? 'AI needs its Cloudflare connection. Add the Worker URL below.' : 'AI is resting. Your league is still right here.');
  } finally {
    section.querySelector('.kt-roast-loading').hidden = true;
    button.disabled = false;
  }
}

export function mountRoastCard() {
  if (section) return;
  section = document.createElement('section');
  section.className = 'kt-container kt-section kt-roast-lab';
  section.id = 'roast-lab';
  section.dataset.aiFeature = 'roast';
  section.setAttribute('aria-label', 'League roast and hype cards');
  section.innerHTML = `<div class="kt-section-header"><div><span class="kt-eyebrow">The group-chat department</span><h2 class="kt-display">Say it with a score bug.</h2></div><span class="kt-badge kt-badge-blue">Haiku · 2 sentences</span></div><div class="kt-roast-layout"><form class="kt-roast-form" id="roast-form"><label for="roast-manager">Manager</label><select id="roast-manager">${managerOptions()}</select><div class="kt-roast-modes" role="group" aria-label="Card tone"><button class="kt-chip" type="button" data-mode="roast" aria-pressed="true">Roast them</button><button class="kt-chip" type="button" data-mode="hype" aria-pressed="false">Hype them</button></div><button class="kt-btn kt-btn-primary" id="roast-generate" type="submit">Generate card</button><p class="kt-roast-status" aria-live="polite">Real league data. No cheap jokes about bad Wi‑Fi.</p><details class="kt-ai-setup"><summary>AI setup</summary><div id="ai-endpoint-form"><label for="ai-endpoint">Cloudflare Worker URL</label><input class="kt-control" id="ai-endpoint" type="url" placeholder="https://keeper-trade-ai....workers.dev" required><button class="kt-btn kt-btn-sm" type="button">Save Worker URL</button><small>Only the Worker URL. Never paste an API key.</small></div></details></form><div class="kt-roast-stage"><div class="kt-roast-empty"><span>KT</span><strong>Your next legendary call-out goes here.</strong></div><img class="kt-roast-preview" alt="Generated league roast or hype card" hidden><div class="kt-roast-loading kt-skeleton" hidden></div><div class="kt-roast-actions"><button class="kt-btn kt-btn-sm" type="button" data-roast-download hidden>Download</button><button class="kt-btn kt-btn-sm" type="button" data-roast-copy hidden>Copy image</button></div></div></div>`;
  const forYou = document.querySelector('#for-you-title')?.closest('.kt-section');
  if (forYou) forYou.before(section);
  section.querySelector('#roast-manager').addEventListener('change', event => { currentManager = event.target.value; });
  section.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    section.querySelectorAll('[data-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));
  section.querySelector('#roast-form').addEventListener('submit', event => event.preventDefault());
  section.querySelector('#roast-generate').addEventListener('click', generate);
  const endpointForm = section.querySelector('#ai-endpoint-form');
  const saveEndpoint = () => {
    try {
      configureAIEndpoint(section.querySelector('#ai-endpoint').value);
      status('Worker connected. Generate when ready.');
    } catch (_) { status('Use your full HTTPS Worker URL.'); }
  };
  endpointForm.querySelector('button').addEventListener('click', saveEndpoint);
  endpointForm.querySelector('input').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); saveEndpoint(); }
  });
  section.querySelector('[data-roast-download]').addEventListener('click', () => {
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `keeper-trade-${mode}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
  section.querySelector('[data-roast-copy]').addEventListener('click', async event => {
    if (!canvas) return;
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      event.target.textContent = 'Copied';
    } catch (_) { status('Clipboard is unavailable here. Download works instead.'); }
  });
  window.addEventListener('kt:league-update', event => {
    leagueSnapshot = event.detail;
    renderManagers();
  });
  leagueSnapshot = getLeagueSnapshot();
  renderManagers();
}
