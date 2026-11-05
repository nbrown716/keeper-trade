import { getSleeperLeagueId, getNflState } from '../data/sleeper.js';
import { askAI } from '../data/ai.js';
import { timeAgo } from '../data/news.js';
import { liveData } from '../data/live-data.js';
import { SCOREBOARD_SOURCE } from '../data/espn.js';
import { weatherBadge } from '../ui/weather-ui.js';
import { mountNavigation } from '../ui/navigation.js';
import { loadWarRoomData, transactionOffer, createEngineFrame, evaluateCounter } from './war-room-data.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let data;
let engineFrame;
let currentTab = 'start';
let currentStart = [];
let currentWaivers = [];
let currentCounter;
let selectedTransaction;
let currentFullLineup = false;
let loading = false;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function parseAI(result) {
  if (result.status !== 'ready' || !result.text) throw new Error('AI is resting. Your roster is still right here.');
  const text = result.text.replace(/^```(?:json)?\s*/i, '').replace(/```$/g, '').trim();
  try { return JSON.parse(text); }
  catch (_) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('AI returned an unexpected format. Try again.');
  }
}

function freshness(element, result) {
  const date = result.createdAt ? new Date(result.createdAt) : new Date();
  document.querySelector(element).textContent = `Generated ${timeAgo(date)}${result.cached ? ' · cached' : ''}`;
}

function typewriter(element, text) {
  if (reducedMotion.matches) { element.textContent = text; return; }
  let index = 0;
  const timer = window.setInterval(() => {
    index += 1;
    element.textContent = text.slice(0, index);
    if (index >= text.length) window.clearInterval(timer);
  }, 12);
}

function setBusy(button, busy, panel) {
  button.disabled = busy;
  document.querySelector(panel).setAttribute('aria-busy', String(busy));
  if (busy) document.querySelector(panel).innerHTML = '<div class="kt-widget-skeleton"><span class="kt-skeleton kt-skeleton-text"></span><span class="kt-skeleton kt-skeleton-text"></span><span class="kt-skeleton kt-skeleton-text"></span></div>';
}

function playerCard(player, verdict, index) {
  const start = verdict.verdict === 'START';
  return `<article class="kt-verdict-card ${start ? 'is-start' : 'is-sit'}" style="--kt-delay:${index * 45}ms"><div class="kt-verdict-head"><div class="kt-verdict-player"><div><h3>${escapeHtml(player.name)}</h3><p>${escapeHtml(player.position)} · ${escapeHtml(player.team)} · ${player.dealerValue.toLocaleString()} dealer</p></div></div><div class="kt-verdict-score"><strong>${verdict.confidence}/10</strong><span>confidence</span></div></div><div class="kt-verdict-meta"><span class="kt-verdict-badge">${escapeHtml(verdict.verdict)}</span><span class="kt-risk kt-risk-${String(verdict.risk).toLowerCase()}">${escapeHtml(verdict.risk)} RISK</span>${weatherBadge(player.weather)}</div><p class="kt-verdict-reason" data-typewriter>${escapeHtml(verdict.reason)}</p></article>`;
}

function rosterMarkup() {
  const starters = new Set(data.roster?.starters || []);
  const players = data.userPlayers.slice().sort((a, b) => Number(starters.has(b.id)) - Number(starters.has(a.id)) || b.dealerValue - a.dealerValue);
  document.querySelector('#war-roster').innerHTML = players.map(player => `<label class="kt-war-player-option"><input type="checkbox" value="${escapeHtml(player.id)}" data-player-check><span>${escapeHtml(player.name)}<small>${escapeHtml(player.position)} · ${escapeHtml(player.team)} · ${player.dealerValue.toLocaleString()}</small></span>${player.weather ? weatherBadge(player.weather) : ''}</label>`).join('');
}

async function runStartSit(full = false, force = false) {
  if (!data || loading) return;
  currentFullLineup = full;
  const checked = full ? [...(data.roster?.starters || [])] : [...document.querySelectorAll('[data-player-check]:checked')].map(input => input.value);
  const ids = checked.length ? checked : full ? [] : (data.roster?.starters || []).slice(0, 2);
  if (!ids.length) { document.querySelector('#war-freshness').textContent = 'Select at least one player for the dilemma.'; return; }
  if (!full && ids.length > 2) { document.querySelector('#war-freshness').textContent = 'Choose up to two players for a dilemma, or use the full lineup report.'; return; }
  const button = document.querySelector(full ? '#war-lineup' : '#war-oracle');
  loading = true;
  setBusy(button, true, '#war-start-results');
  try {
    const players = data.userPlayers.filter(player => ids.includes(player.id));
    const payload = {
      cacheKey: `start-sit:${data.leagueId}:${data.week}:${data.rosterId}:${ids.slice().sort().join(',')}`,
      leagueId: data.leagueId,
      week: data.week,
      manager: data.manager,
      opponent: data.opponent,
      players: players.map(player => ({ id: player.id, name: player.name, position: player.position, team: player.team, dealerValue: player.dealerValue, fantasyCalcValue: player.fantasyCalcValue, trend: player.trend, weather: player.weather?.label || null })),
      opponentStarters: data.opponentPlayers.filter(player => (data.opponentRoster?.starters || []).includes(player.id)).map(player => ({ name: player.name, position: player.position, team: player.team, dealerValue: player.dealerValue })),
      holes: data.holes
    };
    const result = await askAI('start-sit', payload, { force });
    const parsed = parseAI(result);
    const verdictById = new Map(parsed.players.map(verdict => [verdict.id, verdict]));
    currentStart = players.map(player => ({
      verdict: verdictById.get(player.id) || { id: player.id, verdict: 'REVIEW', confidence: 5, reason: 'AI omitted this player. Review the matchup manually rather than guessing.', risk: 'MEDIUM' },
      player
    }));
    const results = document.querySelector('#war-start-results');
    results.innerHTML = currentStart.map((item, index) => playerCard(item.player, item.verdict, index)).join('');
    results.querySelectorAll('[data-typewriter]').forEach((element, index) => typewriter(element, currentStart[index].verdict.reason));
    freshness('#war-start-freshness', result);
  } catch (error) {
    document.querySelector('#war-start-results').innerHTML = `<p class="kt-muted">${escapeHtml(error.message)}</p>`;
  } finally {
    loading = false;
    setBusy(button, false, '#war-start-results');
    document.querySelector('#war-start-results').setAttribute('aria-busy', 'false');
  }
}

async function runWaiver(force = false) {
  if (!data || loading) return;
  const button = document.querySelector('#war-waiver-run');
  loading = true;
  setBusy(button, true, '#war-waiver-results');
  try {
    const needed = new Set(data.holes.map(hole => hole.position));
    const fitting = data.freeAgents.filter(player => needed.has(player.position));
    const others = data.freeAgents.filter(player => !needed.has(player.position));
    const candidates = [...fitting, ...others].slice(0, 3);
    const payload = {
      cacheKey: `waiver:${data.leagueId}:${data.week}:${data.rosterId}:${candidates.map(player => player.id).join(',')}`,
      leagueId: data.leagueId,
      week: data.week,
      manager: data.manager,
      holes: data.holes,
      candidates: candidates.map(player => ({ id: player.id, name: player.name, position: player.position, team: player.team, currentValue: player.dealerValue, baseValue: player.baseValue, fantasyCalcValue: player.fantasyCalcValue, trend: player.trend })),
      recentTransactions: data.transactions.slice(0, 4).map(transaction => ({ type: transaction.type, adds: Object.keys(transaction.adds || {}) }))
    };
    const result = await askAI('waiver', payload, { ttl: 86400000, force });
    const parsed = parseAI(result);
    currentWaivers = candidates.map((player, index) => ({ player, blurb: parsed.adds.find(item => item.id === player.id)?.blurb || parsed.adds[index]?.blurb || 'A data-backed fit for this roster.' }));
    const results = document.querySelector('#war-waiver-results');
    results.innerHTML = currentWaivers.map(({ player, blurb }, index) => {
      const change = player.baseValue ? (player.dealerValue - player.baseValue) / player.baseValue * 100 : 0;
      const fit = data.holes.find(hole => hole.position === player.position);
      return `<article class="kt-verdict-card is-start" style="--kt-delay:${index * 55}ms"><div class="kt-verdict-head"><div class="kt-verdict-player"><div><h3>#${index + 1} ${escapeHtml(player.name)}</h3><p>${escapeHtml(player.position)} · ${escapeHtml(player.team)} · ${fit ? `fills ${fit.need} ${fit.position} depth need` : 'best available value'}</p></div></div><div class="kt-verdict-score"><strong>${change >= 0 ? '+' : ''}${change.toFixed(1)}%</strong><span>value move</span></div></div><div class="kt-verdict-meta"><span>${player.dealerValue.toLocaleString()} dealer</span><span>${player.fantasyCalcValue.toLocaleString()} FantasyCalc</span>${player.weather ? weatherBadge(player.weather) : ''}</div><p class="kt-verdict-reason" data-typewriter>${escapeHtml(blurb)}</p></article>`;
    }).join('');
    results.querySelectorAll('[data-typewriter]').forEach((element, index) => typewriter(element, currentWaivers[index].blurb));
    freshness('#war-waiver-freshness', result);
  } catch (error) {
    document.querySelector('#war-waiver-results').innerHTML = `<p class="kt-muted">${escapeHtml(error.message)}</p>`;
  } finally {
    loading = false;
    setBusy(button, false, '#war-waiver-results');
    document.querySelector('#war-waiver-results').setAttribute('aria-busy', 'false');
  }
}

function offerDescription(offer) {
  const names = assets => assets.map(player => player.name).join(' + ') || 'picks';
  return `${names(offer.sideA)} for ${names(offer.sideB)}`;
}

function buildCounterCandidates() {
  const mine = data.userPlayers.slice().sort((a, b) => b.dealerValue - a.dealerValue);
  const theirs = data.opponentPlayers.slice().sort((a, b) => b.dealerValue - a.dealerValue);
  const message = (sideA, sideB) => `I'd like to make this work: ${sideA.map(player => player.name).join(' + ')} for ${sideB.map(player => player.name).join(' + ')}. It gives us both a cleaner path to a stronger roster. How about it?`;
  return [
    { sideA: theirs.slice(0, 2), sideB: mine.slice(0, 2), message: message(theirs.slice(0, 2), mine.slice(0, 2)) },
    { sideA: theirs.slice(0, 1), sideB: mine.slice(0, 1), message: message(theirs.slice(0, 1), mine.slice(0, 1)) }
  ].filter(counter => counter.sideA.length && counter.sideB.length);
}

async function runCounter(force = false) {
  if (!data || loading) return;
  const offerText = document.querySelector('#war-offer-text').value.trim();
  if (!offerText && !selectedTransaction) { document.querySelector('#war-freshness').textContent = 'Describe an offer or load one from Sleeper first.'; return; }
  const button = document.querySelector('#war-counter-run');
  loading = true;
  setBusy(button, true, '#war-counter-results');
  try {
    const rosterPayload = players => players.map(player => ({ id: player.id, name: player.name, position: player.position, team: player.team, dealerValue: player.dealerValue, baseValue: player.baseValue, fantasyCalcValue: player.fantasyCalcValue }));
    const structured = selectedTransaction ? transactionOffer(selectedTransaction, data) : null;
    const allowed = buildCounterCandidates();
    const payload = {
      cacheKey: `counter:${data.leagueId}:${data.rosterId}:${selectedTransaction?.transaction_id || offerText}`,
      leagueId: data.leagueId,
      manager: data.manager,
      opponent: data.opponent,
      offer: offerText || offerDescription(structured),
      structuredOffer: structured,
      userRoster: rosterPayload(data.userPlayers),
      opponentRoster: rosterPayload(data.opponentPlayers),
      allowedCounters: allowed.map(counter => ({ sideA: counter.sideA.map(player => player.id), sideB: counter.sideB.map(player => player.id) })),
      holes: data.holes,
      keeperCosts: 'Unknown acquisition rounds are inferred by the existing calculator. Do not invent exact costs.'
    };
    const result = await askAI('gm-brain', payload, { force });
    const parsed = parseAI(result);
    engineFrame ||= await createEngineFrame();
    const byId = new Map([...data.userPlayers, ...data.opponentPlayers].map(player => [player.id, player]));
    let counters = (parsed.counters || []).slice(0, 2).map(counter => {
      const sideA = (counter.sideA || []).map(id => byId.get(id)).filter(Boolean);
      const sideB = (counter.sideB || []).map(id => byId.get(id)).filter(Boolean);
      if (!sideA.length || !sideB.length) return null;
      const fairness = evaluateCounter(engineFrame, sideA, sideB);
      return { ...counter, sideA, sideB, fairness };
    }).filter(Boolean);
    if (counters.length < 2) counters = allowed.map(counter => ({ ...counter, fairness: evaluateCounter(engineFrame, counter.sideA, counter.sideB) }));
    currentCounter = { verdict: parsed.verdict, reasoning: parsed.reasoning || [], counters, createdAt: result.createdAt };
    const results = document.querySelector('#war-counter-results');
    results.innerHTML = `<div class="kt-counter-verdict"><h3>${escapeHtml(parsed.verdict)}</h3><ul>${parsed.reasoning.slice(0, 3).map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}</ul></div><div class="kt-counter-grid">${counters.map((counter, index) => `<article class="kt-verdict-card" style="--kt-delay:${index * 60}ms"><span class="kt-eyebrow">Counter ${index + 1}</span><div class="kt-counter-assets"><div class="kt-counter-side"><small>You receive</small><strong>${escapeHtml(counter.sideA.map(player => player.name).join(' + '))}</strong></div><div class="kt-counter-side"><small>They receive</small><strong>${escapeHtml(counter.sideB.map(player => player.name).join(' + '))}</strong></div></div><div class="kt-fairness"><span>${escapeHtml(counter.fairness.verdict)}</span><span>${escapeHtml(counter.fairness.gap)}</span></div><p class="kt-counter-message">${escapeHtml(counter.message)}</p><button class="kt-btn kt-btn-sm kt-btn-secondary kt-counter-copy" type="button" data-counter-copy="${index}">Copy counter-offer message</button></article>`).join('')}</div>`;
    freshness('#war-counter-freshness', result);
  } catch (error) {
    document.querySelector('#war-counter-results').innerHTML = `<p class="kt-muted">${escapeHtml(error.message)}</p>`;
  } finally {
    loading = false;
    setBusy(button, false, '#war-counter-results');
    document.querySelector('#war-counter-results').setAttribute('aria-busy', 'false');
  }
}

async function copyText(text) {
  let timer;
  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error('Clipboard timeout')), 800); })
    ]);
    window.clearTimeout(timer);
    return true;
  } catch (_) {
    window.clearTimeout(timer);
    const input = document.createElement('textarea');
    input.value = text;
    input.style.cssText = 'position:fixed;opacity:0';
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    return copied;
  }
}

function downloadCurrentCards() {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 675;
  const context = canvas.getContext('2d');
  context.fillStyle = '#0b0f1a';
  context.fillRect(0, 0, 1200, 675);
  context.fillStyle = '#c6ff4a';
  context.fillRect(0, 0, 1200, 12);
  context.font = '700 28px Arial';
  context.fillText('KEEPER TRADE · THE WAR ROOM', 55, 65);
  context.fillStyle = '#f4f7fb';
  context.font = '800 54px Arial';
  const title = currentTab === 'start' ? 'START / SIT ORACLE' : currentTab === 'waiver' ? 'WAIVER WIRE WEDNESDAY' : 'TRADE COUNTER-BUILDER';
  context.fillText(title, 55, 135);
  context.font = '700 25px Arial';
  context.fillStyle = '#8190a8';
  context.fillText(`${data.manager} · Week ${data.week}`, 55, 175);
  const rows = currentTab === 'start' ? currentStart.map(item => `${item.verdict.verdict} ${item.verdict.confidence}/10 · ${item.player.name}`) : currentTab === 'waiver' ? currentWaivers.map((item, index) => `#${index + 1} ${item.player.name} · ${item.player.position}`) : (currentCounter?.counters || []).map((counter, index) => `C${index + 1}: ${counter.fairness.verdict} ${counter.fairness.gap}`);
  context.font = '700 31px Arial';
  rows.slice(0, 6).forEach((row, index) => {
    context.fillStyle = index % 2 ? '#f4f7fb' : '#c6ff4a';
    context.fillText(row, 55, 245 + index * 58);
  });
  context.fillStyle = '#8190a8';
  context.font = '20px Arial';
  context.fillText('Real roster data · AI reasoning · Original calculator verdicts', 55, 630);
  const link = document.createElement('a');
  link.download = `keeper-trade-war-room-${currentTab}-week-${data.week}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

async function load() {
  const id = getSleeperLeagueId();
  if (!id) { document.querySelector('#war-error').hidden = false; return; }
  document.querySelector('#war-loading').hidden = false;
  try {
    const state = await getNflState();
    const week = state.display_week || state.week || 1;
    let rosterId = Number(new URLSearchParams(window.location.search).get('roster'));
    if (!rosterId) { try { rosterId = Number(localStorage.getItem('kt-drive-manager:v1')); } catch (_) {} }
    data = await loadWarRoomData(id, week, rosterId);
    const manager = document.querySelector('#war-manager');
    manager.replaceChildren(...data.managers.map(item => {
      const option = document.createElement('option');
      option.value = String(item.id);
      option.textContent = item.name;
      option.selected = item.id === data.rosterId;
      return option;
    }));
    manager.value = String(data.rosterId);
    rosterMarkup();
    const select = document.querySelector('#war-offer-select');
    data.transactions.forEach((transaction, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = offerDescription(transactionOffer(transaction, data));
      select.append(option);
    });
    document.querySelector('#war-error').hidden = true;
    const now = new Date();
    if (now.getDay() === 2 && now.getHours() >= 18) runWaiver();
    else document.querySelector('#war-waiver-note').textContent = 'Auto-generates Tuesday at 6pm. Build a board anytime with your current data.';
  } catch (error) {
    document.querySelector('#war-freshness').textContent = error.message || 'The War Room could not load your league.';
  } finally {
    document.querySelector('#war-loading').hidden = true;
  }
}

document.querySelectorAll('[data-war-tab]').forEach(button => button.addEventListener('click', () => {
  currentTab = button.dataset.warTab;
  document.querySelectorAll('[data-war-tab]').forEach(item => item.setAttribute('aria-selected', String(item === button)));
  document.querySelectorAll('[data-war-panel]').forEach(panel => { panel.hidden = panel.dataset.warPanel !== currentTab; });
}));
document.querySelector('#war-oracle').addEventListener('click', () => runStartSit(false));
document.querySelector('#war-lineup').addEventListener('click', () => runStartSit(true));
document.querySelector('#war-start-regenerate').addEventListener('click', () => runStartSit(currentFullLineup, true));
document.querySelector('#war-waiver-run').addEventListener('click', () => runWaiver(false));
document.querySelector('#war-waiver-regenerate').addEventListener('click', () => runWaiver(true));
document.querySelector('#war-counter-run').addEventListener('click', () => runCounter(false));
document.querySelector('#war-counter-regenerate').addEventListener('click', () => runCounter(true));
document.querySelector('#war-offer-select').addEventListener('change', event => {
  selectedTransaction = event.target.value === '' ? undefined : data.transactions[Number(event.target.value)];
  document.querySelector('#war-offer-text').value = selectedTransaction ? offerDescription(transactionOffer(selectedTransaction, data)) : '';
});
document.querySelector('#war-counter-results').addEventListener('click', async event => {
  const button = event.target.closest('[data-counter-copy]');
  if (!button || !currentCounter) return;
  const counter = currentCounter.counters[Number(button.dataset.counterCopy)];
  const copied = await copyText(counter.message);
  button.textContent = copied ? 'Copied' : 'Copy unavailable';
});
document.querySelector('#war-share').addEventListener('click', downloadCurrentCards);
document.querySelector('#war-manager').addEventListener('change', event => {
  try { localStorage.setItem('kt-drive-manager:v1', event.target.value); } catch (_) {}
  history.replaceState(null, '', `war-room.html?roster=${event.target.value}`);
  load();
});
liveData.register(SCOREBOARD_SOURCE, { url: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard', cadence: 300000 });
mountNavigation({ active: 'more' });
load();
