import { getSleeperLeagueId, getNflState, getLeagueBundle, leagueUsers, rosterOwner } from '../data/sleeper.js';
import { getPlayerDatabase } from '../data/player-db.js';
import { dealerSource, normalizeDealerPlayers } from '../data/dynasty-dealer.js';
import { liveData } from '../data/live-data.js';
import { askAI } from '../data/ai.js';
import { PERSONALITIES } from './draft-personalities.js';
import { createDraft, currentTeam, availablePlayers, makePick, recommendations, fallbackPick, gradeRoster, rosterScore } from './draft-engine.js';
import { mountNavigation } from '../ui/navigation.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let pool = [];
let draft;
let leagueId = '';
let timer;
let countdown = 20;
let paused = false;
let speed = 1;
let aiBusy = false;
let comments = [];
let grades = [];
let draftNumber = 0;
let generation = 0;
const HUMAN_ID = 1;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

// One-shot read: fresh cache or a fresh network result (stale cache only as a fallback).
function waitForSource(key) {
  return liveData.get(key);
}

function parseAI(result) {
  if (result.status !== 'ready' || !result.text) throw new Error('AI is resting.');
  const text = result.text.replace(/^```(?:json)?\s*/i, '').replace(/```$/g, '').trim();
  try { return JSON.parse(text); }
  catch (_) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('AI returned an unexpected format.');
  }
}

function teamAt(index) {
  return draft.teams.find(team => team.id === draft.order[index]?.id);
}

function renderBoard() {
  const board = document.querySelector('#draft-board');
  board.style.setProperty('--kt-rounds', draft.rounds);
  board.innerHTML = `<div class="kt-draft-board-head"><span>Team</span>${Array.from({ length: draft.rounds }, (_, index) => `<strong>R${index + 1}</strong>`).join('')}</div>${draft.teams.map(team => `<div class="kt-draft-team-row${team.id === currentTeam(draft)?.id ? ' is-on-clock' : ''}"><header><span class="kt-draft-avatar" style="--kt-team-color:${team.personality?.color || '#c6ff4a'}">${team.personality?.avatar || 'KT'}</span><strong>${escapeHtml(team.name)}</strong></header>${Array.from({ length: draft.rounds }, (_, round) => {
    const pick = draft.history.find(item => item.team.id === team.id && item.round === round + 1);
    return `<div class="kt-draft-cell${pick ? ' has-pick' : ''}" data-overall="${pick?.overall || ''}">${pick ? `<span>${escapeHtml(pick.player.name)}</span><small>${pick.player.dealerValue.toLocaleString()}</small>` : '<span>—</span>'}</div>`;
  }).join('')}</div>`).join('')}`;
}

function renderStage() {
  const team = currentTeam(draft);
  const stage = document.querySelector('#draft-stage');
  if (!team) return;
  const human = team.id === HUMAN_ID;
  const recs = human ? recommendations(draft, pool, 3) : [];
  stage.innerHTML = `<div class="kt-clock-top"><div><span class="kt-eyebrow">On the clock · Pick ${draft.index + 1}</span><h2><span class="kt-draft-avatar" style="--kt-team-color:${team.personality?.color || '#c6ff4a'}">${team.personality?.avatar || 'KT'}</span>${escapeHtml(team.name)}</h2><p>${human ? 'Your call. Take the value, trust the board, or make it weird.' : `${escapeHtml(team.personality?.bio || 'Reading the board…')}`}</p></div><div class="kt-clock-number"><strong class="kt-num" id="draft-countdown">${countdown}</strong><span>seconds</span></div></div>${human ? `<div class="kt-draft-recommendations">${recs.map((player, index) => `<button class="kt-draft-pick-card" type="button" data-draft-player="${escapeHtml(player.id)}"><span>RECOMMENDED ${index + 1}</span><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.position)} · ${escapeHtml(player.team)} · ${player.dealerValue.toLocaleString()}</small></button>`).join('')}</div>` : `<div class="kt-draft-ai-thinking"><span class="kt-skeleton kt-skeleton-text"></span><p>${aiBusy ? 'The room is on the clock…' : 'Reading the next card…'}</p></div>`}`;
  document.querySelector('#draft-available-count').textContent = `${pool.length - draft.history.length} available · ${pool.sourceLabel || 'Dynasty Dealer · market board'}`;
}

function renderComments() {
  document.querySelector('#draft-chat').innerHTML = comments.slice(-8).map(comment => `<article class="kt-draft-comment" style="--kt-team-color:${comment.color}"><span class="kt-draft-avatar" style="--kt-team-color:${comment.color}">${comment.avatar}</span><div><strong>${escapeHtml(comment.team)}</strong><p>${escapeHtml(comment.text)}</p></div></article>`).join('') || '<p class="kt-muted">The draft room is quiet. For now.</p>';
}

function addComment(team, text) {
  if (!text || comments.length >= 15 || comments.some(comment => comment.text === text && comment.team === team.name)) return;
  comments.push({ team: team.name, avatar: team.personality?.avatar || 'KT', color: team.personality?.color || '#c6ff4a', text });
  renderComments();
}

function renderAll() {
  renderBoard();
  renderStage();
  renderComments();
  document.querySelector('#draft-progress-bar').style.transform = `scaleX(${draft.index / draft.order.length})`;
}

async function runAIRound() {
  if (aiBusy || paused || !currentTeam(draft) || currentTeam(draft).id === HUMAN_ID) return;
  const runGeneration = generation;
  aiBusy = true;
  const round = Math.floor(draft.index / draft.teams.length) + 1;
  const order = [];
  let orderIndex = draft.index;
  while (orderIndex < draft.order.length && draft.order[orderIndex].id !== HUMAN_ID && Math.floor(orderIndex / draft.teams.length) + 1 === round) {
    order.push(draft.order[orderIndex]);
    orderIndex += 1;
  }
  const available = availablePlayers(draft, pool).slice().sort((a, b) => b.dealerValue - a.dealerValue).slice(0, 40).map(player => ({ id: player.id, name: player.name, position: player.position, team: player.team, value: player.dealerValue }));
  const payload = {
    cacheKey: `draft:${leagueId || 'default'}:${round}:${draft.index}:${available.map(player => player.id).join(',')}`,
    leagueId: leagueId || 'default',
    round,
    available,
    teams: order.map(team => ({ id: team.id, name: team.name, roster: draft.rosters[team.id].map(player => ({ id: player.id, position: player.position, value: player.dealerValue })), personality: team.personality.rules })),
    humanTarget: recommendations(draft, pool, 1)[0]?.id || null
  };
  let parsed;
  try { parsed = parseAI(await askAI('draft-round', payload, { ttl: 604800000 })); }
  catch (_) { parsed = null; }
  for (const team of order) {
    if (paused || runGeneration !== generation) break;
    const aiPick = parsed?.picks?.find(pick => Number(pick.team) === team.id);
    const player = aiPick ? pool.find(item => item.id === aiPick.playerId) : fallbackPick(draft, pool, team);
    makePick(draft, team, player || fallbackPick(draft, pool, team));
    const comment = parsed?.comments?.find(item => Number(item.team) === team.id);
    if (comment) addComment(team, comment.text);
    else if (team.personality.rules.stealHumanTarget) addComment(team, `You wanted ${player?.name || 'that guy'}? I noticed.`);
    renderAll();
    await new Promise(resolve => window.setTimeout(resolve, reducedMotion.matches ? 0 : 600 / speed));
  }
  if (runGeneration !== generation) return;
  aiBusy = false;
  if (paused) return;
  if (currentTeam(draft)) startClock();
  else finishDraft();
}

function startClock() {
  clearInterval(timer);
  countdown = 20;
  if (!currentTeam(draft) || currentTeam(draft).id !== HUMAN_ID) {
    renderStage();
    runAIRound();
    return;
  }
  renderStage();
  timer = window.setInterval(() => {
    if (paused) return;
    countdown = Math.max(0, countdown - 1);
    const element = document.querySelector('#draft-countdown');
    if (element) element.textContent = countdown;
    if (countdown === 0) {
      clearInterval(timer);
      const player = recommendations(draft, pool, 1)[0];
      if (player) makePick(draft, currentTeam(draft), player);
      renderAll();
      if (currentTeam(draft)) startClock();
      else finishDraft();
    }
  }, 1000);
}

async function finishDraft() {
  const finishGeneration = generation;
  clearInterval(timer);
  document.querySelector('#draft-stage').innerHTML = '<div class="kt-draft-complete"><span class="kt-eyebrow">Draft complete</span><h2>The league has opinions.</h2><p>Every roster graded. Every decision judged.</p></div>';
  const payload = {
    cacheKey: `draft-grades:${leagueId || 'default'}:${draftNumber}:${draft.history.map(pick => pick.player.id).join(',')}`,
    leagueId: leagueId || 'default',
    teams: draft.teams.map(team => ({ id: team.id, name: team.name, roster: draft.rosters[team.id].map(player => ({ name: player.name, value: player.dealerValue })) }))
  };
  let parsed;
  try { parsed = parseAI(await askAI('draft-grades', payload, { ttl: 604800000 })); }
  catch (_) { parsed = null; }
  if (finishGeneration !== generation) return;
  grades = draft.teams.map(team => {
    const ai = parsed?.grades?.find(item => Number(item.team) === team.id);
    return { team, grade: ai?.grade || gradeRoster(draft.rosters[team.id]), roast: ai?.roast || `${team.name} leaves with ${rosterScore(draft.rosters[team.id]).toLocaleString()} in value and several questions to answer.` };
  });
  document.querySelector('#draft-grades').innerHTML = `<div class="kt-grade-grid">${grades.map(({ team, grade, roast }) => `<article class="kt-grade-card" style="--kt-team-color:${team.personality?.color || '#c6ff4a'}"><div><span class="kt-draft-avatar" style="--kt-team-color:${team.personality?.color || '#c6ff4a'}">${team.personality?.avatar || 'KT'}</span><h3>${escapeHtml(team.name)}</h3><strong>${escapeHtml(grade)}</strong></div><p>${escapeHtml(roast)}</p><small>${rosterScore(draft.rosters[team.id]).toLocaleString()} total value</small></article>`).join('')}</div><button class="kt-btn kt-btn-primary" id="draft-share" type="button">Share draft grades</button>`;
  document.querySelector('#draft-share').addEventListener('click', shareGrades);
}

function shareGrades() {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 675;
  const context = canvas.getContext('2d');
  context.fillStyle = '#0b0f1a';
  context.fillRect(0, 0, 1200, 675);
  context.fillStyle = '#c6ff4a';
  context.fillRect(0, 0, 1200, 12);
  context.font = '800 60px Arial';
  context.fillText('MOCK DRAFT ARENA', 55, 80);
  context.font = '700 25px Arial';
  context.fillStyle = '#8190a8';
  context.fillText(`${draft.teams.length} teams · ${draft.rounds} rounds · ${draft.history.length} picks`, 55, 125);
  grades.slice(0, 10).forEach(({ team, grade }, index) => {
    const column = index < 5 ? 0 : 1;
    const row = index % 5;
    context.font = '800 44px Arial';
    context.fillStyle = team.personality?.color || '#c6ff4a';
    context.fillText(grade, 55 + column * 590, 205 + row * 82);
    context.font = '700 23px Arial';
    context.fillStyle = '#f4f7fb';
    context.fillText(team.name, 145 + column * 590, 202 + row * 82);
  });
  const link = document.createElement('a');
  link.download = `keeper-trade-mock-draft-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

async function localDraftPool() {
  const response = await fetch('fp-data.json');
  if (!response.ok) throw new Error('Local draft board unavailable');
  const data = await response.json();
  return (data.players || []).filter(player => ['QB', 'RB', 'WR', 'TE'].includes(player.pos) && player.n && Number(player.ecr) > 0).map(player => ({
    id: String(player.id),
    name: player.n,
    position: player.pos,
    team: player.t || 'FA',
    injury: '',
    dealerValue: Math.max(100, Math.round(10000 * (1 - Math.log10(Number(player.ecr)) / 3)))
  }));
}

async function init() {
  const initGeneration = ++generation;
  clearInterval(timer);
  aiBusy = false;
  paused = false;
  document.querySelector('#draft-pause').textContent = 'Pause draft';
  document.querySelector('#draft-pause').setAttribute('aria-pressed', 'false');
  document.querySelector('#draft-stage').innerHTML = '<div class="kt-draft-complete"><span class="kt-eyebrow">Draft room warming up</span><h2>Building your board.</h2><div class="kt-widget-skeleton"><span class="kt-skeleton kt-skeleton-text"></span><span class="kt-skeleton kt-skeleton-text"></span></div></div>';
  try {
    const [playerResult, dealerResult, stateResult] = await Promise.allSettled([getPlayerDatabase(), waitForSource(dealerSource()), getNflState()]);
    if (initGeneration !== generation) return;
    const playerMap = playerResult.status === 'fulfilled' ? playerResult.value : new Map();
    const dealerData = dealerResult.status === 'fulfilled' ? dealerResult.value : null;
    const state = stateResult.status === 'fulfilled' && stateResult.value ? stateResult.value : { display_week: 1, week: 1 };
    let players = normalizeDealerPlayers(dealerData).map(player => ({
      ...player,
      dealerValue: player.value,
      position: playerMap.get(String(player.id))?.position || player.position,
      team: playerMap.get(String(player.id))?.team || player.team,
      injury: playerMap.get(String(player.id))?.injury || ''
    })).filter(player => player.name && player.position && player.team && player.dealerValue > 0).sort((a, b) => b.dealerValue - a.dealerValue);
    let sourceLabel = 'Dynasty Dealer · market board';
    if (!players.length) {
      players = await localDraftPool();
      sourceLabel = 'Local ECR board · live market offline';
    }
    if (initGeneration !== generation) return;
    pool = players;
    pool.sourceLabel = sourceLabel;
    leagueId = getSleeperLeagueId();
    let manager = 'You';
    let rounds = 8;
    if (leagueId) {
      try {
        const bundle = await getLeagueBundle(leagueId, state.display_week || state.week || 1);
        const users = leagueUsers(bundle.users);
        const rosterId = Number(localStorage.getItem('kt-drive-manager:v1')) || bundle.rosters[0]?.roster_id;
        const roster = bundle.rosters.find(item => item.roster_id === rosterId) || bundle.rosters[0];
        manager = rosterOwner(roster, users);
        rounds = Math.max(4, Math.min(12, Number(bundle.league.settings?.draft_rounds) || 8));
      } catch (_) {}
    }
    if (initGeneration !== generation) return;
    draftNumber += 1;
    const teams = [{ id: HUMAN_ID, name: manager, personality: { avatar: 'KT', color: '#c6ff4a', bio: 'Your board. Your convictions.', rules: {} } }, ...PERSONALITIES.map((personality, index) => ({ id: index + 2, name: personality.name, personality }))];
    draft = createDraft(teams, rounds);
    comments = [];
    grades = [];
    document.querySelector('#draft-grades').innerHTML = '';
    renderAll();
    startClock();
  } catch (_) {
    if (initGeneration !== generation) return;
    document.querySelector('#draft-stage').innerHTML = '<div class="kt-draft-complete"><h2>Draft room reconnecting</h2><p>The live player feeds and bundled draft board are unavailable. Check your connection and retry; your other tools are still ready.</p><button class="kt-btn kt-btn-primary" type="button" id="draft-retry">Retry draft</button></div>';
    document.querySelector('#draft-retry').addEventListener('click', init, { once: true });
  }
}

document.querySelector('#draft-board').addEventListener('click', event => {
  const button = event.target.closest('[data-draft-player]');
  if (!button || !currentTeam(draft) || currentTeam(draft).id !== HUMAN_ID) return;
  const player = pool.find(item => item.id === button.dataset.draftPlayer);
  if (!player) return;
  clearInterval(timer);
  makePick(draft, currentTeam(draft), player);
  renderAll();
  if (currentTeam(draft)) startClock();
  else finishDraft();
});
document.querySelector('#draft-stage').addEventListener('click', event => {
  const button = event.target.closest('[data-draft-player]');
  if (!button || !currentTeam(draft) || currentTeam(draft).id !== HUMAN_ID) return;
  const player = pool.find(item => item.id === button.dataset.draftPlayer);
  if (!player) return;
  clearInterval(timer);
  makePick(draft, currentTeam(draft), player);
  renderAll();
  if (currentTeam(draft)) startClock();
  else finishDraft();
});
document.querySelector('#draft-pause').addEventListener('click', event => {
  paused = !paused;
  event.currentTarget.textContent = paused ? 'Resume draft' : 'Pause draft';
  event.currentTarget.setAttribute('aria-pressed', String(paused));
  if (!paused && currentTeam(draft)?.id !== HUMAN_ID) runAIRound();
});
document.querySelector('#draft-speed').addEventListener('change', event => { speed = Number(event.target.value) || 1; });
document.querySelector('#draft-reset').addEventListener('click', init);
mountNavigation({ active: 'more' });
init();
