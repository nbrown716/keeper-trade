// Deals: your league's real trades, called by you, read by the model, judged by what happened since.
// Tabs: Call it (vote, then the reveal) · Database · Market · Teams · Binder · Your record.
// Every value is live (FantasyCalc + Dynasty Dealer, priced exactly like the Keeper calculator; keeper picks use
// the calculator's own pick rule). Votes stay on this device.
import { mountNavigation } from '../ui/navigation.js';
import { mountPageTransitions } from '../ui/page-transitions.js';
import { getSleeperLeagueId, getLeagueBundle, getNflState } from '../data/sleeper.js';
import { getActiveLeagueConnection } from '../data/league-connections.js';
import { getPlayerDatabase } from '../data/player-db.js';
import { liveData } from '../data/live-data.js';
import { getMarket, loadLeagueTrades, modelRead, leagueContext, teamValues, playerValue, pickUnit, assetValue, keyOf } from '../data/trade-market.js';
import { friendlyError } from '../ui/friendly-error.js';
import { completedWeeks } from '../data/season-stats.js';

const VOTES_KEY = 'kt-deal-votes:v1';
const WORKER = 'https://keeper-trade-ai.nicholas-brown00.workers.dev';
// League votes live on the Keeper Trade Worker. Until it answers {status:'ok'}, the crowd split simply isn't shown.
function voterId() {
  try {
    let id = localStorage.getItem('kt-voter:v1');
    if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => (byte % 36).toString(36)).join('') + Date.now().toString(36); localStorage.setItem('kt-voter:v1', id); }
    return id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40).padEnd(16, '0');
  } catch (_) { return ''; }
}
async function loadCrowd() {
  const groups = new Map();
  state.trades.forEach(trade => { if (!groups.has(trade.leagueId)) groups.set(trade.leagueId, []); groups.get(trade.leagueId).push(trade.id); });
  const counts = {};
  try {
    for (const [league, ids] of groups) {
      for (let i = 0; i < ids.length; i += 60) {
        const response = await fetch(`${WORKER}/votes?league=${league}&trades=${ids.slice(i, i + 60).join(',')}`);
        const data = response.ok ? await response.json() : null;
        if (data?.status !== 'ok') return null;
        Object.assign(counts, data.counts);
      }
    }
    return counts;
  } catch (_) { return null; }
}
async function sendCrowdVote(trade, pick) {
  if (!state.crowd) return;
  try {
    const response = await fetch(`${WORKER}/votes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ league: trade.leagueId, trade: trade.id, pick, voter: voterId() }) });
    const data = await response.json();
    if (data?.status === 'ok') { state.crowd[trade.id] = data.counts; if (state.tab === 'call') renderCall(); }
  } catch (_) {}
}
const MANAGER_KEY = 'kt-drive-manager:v1';
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const num = value => Math.round(value || 0).toLocaleString();
const picks = (value, unit) => (unit && value ? `≈${(value / unit).toFixed(value / unit < 1 ? 2 : 1)} 1sts` : '');
const ago = time => { const s = (Date.now() - time) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
const state = { tab: 'call', index: 0, trades: [], market: null, ctx: null, players: new Map(), bundle: null, tradedPicks: [], query: '', season: 'all', manager: 'all', rosterId: 0 };

const votes = () => { try { return JSON.parse(localStorage.getItem(VOTES_KEY) || '{}'); } catch (_) { return {}; } };
const saveVote = (id, pick) => { try { localStorage.setItem(VOTES_KEY, JSON.stringify({ ...votes(), [id]: { pick, at: Date.now() } })); } catch (_) {} };

function assetLine(asset, read) {
  const value = read ? asset.value : null;
  const label = asset.kind === 'pick'
    ? `<span class="dl-pos dl-pos-PICK">PICK</span><span class="dl-name">${escapeHtml(asset.name)}<small>${escapeHtml(`from ${asset.from}`)}</small></span>`
    : `<span class="dl-pos dl-pos-${escapeHtml(asset.pos)}">${escapeHtml(asset.pos || '—')}</span><span class="dl-name">${escapeHtml(asset.name)}<small>${escapeHtml(asset.team || 'FA')}</small></span>`;
  const shown = read ? (value == null ? '<b class="dl-val is-muted" title="Redraft leagues don’t value picks">listed</b>' : `<b class="dl-val">${num(value)}<small>${picks(value, state.read?.unit)}</small></b>`) : '';
  return `<li>${label}${shown}</li>`;
}

// ------------------------------------------------------------------ Call it
function queue() {
  const voted = votes();
  return [...state.trades.filter(trade => !voted[trade.id]), ...state.trades.filter(trade => voted[trade.id])];
}

function renderCall() {
  const list = queue();
  const panel = $('#dl-panel-call');
  if (!list.length) { panel.innerHTML = '<div class="dl-empty"><h2>No trades yet</h2><p>When your league makes a trade, it lands here for you to call.</p></div>'; return; }
  state.index = Math.max(0, Math.min(list.length - 1, state.index));
  const trade = list[state.index];
  const vote = votes()[trade.id];
  const read = modelRead(trade, state.market, state.ctx);
  state.read = read;
  const [a, b] = read.sides;
  const ctx = state.ctx;
  const fmtChips = [ctx.type[0].toUpperCase() + ctx.type.slice(1), `${ctx.teams}-team`, ctx.ppr >= 0.75 ? 'PPR' : ctx.ppr >= 0.25 ? 'Half PPR' : 'Non-PPR', ctx.superflex ? 'Superflex' : '1QB'];
  const sideCol = (side, index) => `<section class="dl-side${vote && read.winner === index ? ' is-winner' : ''}"><h3>${escapeHtml(side.name)} <span>gets</span></h3><ul>${side.assets.map(asset => assetLine(asset, Boolean(vote))).join('')}</ul>${vote ? `<p class="dl-total"><span>Value now</span><b>${num(side.total)}</b>${side.unvalued ? '<small>+ unvalued picks</small>' : ''}</p>` : ''}</section>`;
  let reveal = '';
  if (vote) {
    const total = Math.max(1, a.total + b.total);
    const modelPick = read.winner === -1 ? 'E' : read.winner === 0 ? 'A' : 'B';
    const agree = vote.pick === modelPick;
    const verdict = read.even ? `Even: ${num(Math.abs(read.diff))} apart, inside the ${ctx.type === 'keeper' ? '1,000-point house band' : 'fair band'}` : `${escapeHtml(read.sides[read.winner].name)} won by ${num(Math.abs(read.diff))}${read.diffInPicks ? ` (≈${read.diffInPicks.toFixed(read.diffInPicks < 1 ? 2 : 1)} of a 1st)` : ''}`;
    const sameSeason = trade.season === String(ctx.season);
    const since = sameSeason && state.completed >= trade.week
      ? `<p class="dl-since"><span>Since the trade</span>${escapeHtml(a.name)}’s new players scored <b>${a.production.toFixed(1)}</b> in their lineup · ${escapeHtml(b.name)}’s scored <b>${b.production.toFixed(1)}</b>.</p>`
      : sameSeason ? '<p class="dl-since"><span>Since the trade</span>No completed week since this trade yet.</p>' : '';
    reveal = `<div class="dl-reveal" role="status"><div class="dl-bar" aria-hidden="true"><i style="width:${(a.total / total * 100).toFixed(1)}%"></i></div>
      <p class="dl-verdict"><span>Model read · values today</span>${verdict}.</p>${since}
      <p class="dl-yours ${agree ? 'is-agree' : 'is-differ'}">${agree ? '✓ You and the model agree.' : `✗ Your call: ${vote.pick === 'E' ? 'even' : escapeHtml(read.sides[vote.pick === 'A' ? 0 : 1].name)}. The model disagrees, and you might be right: values aren’t everything.`}</p>
      ${crowdLine(trade, read)}
      <div class="dl-actions"><button class="kt-btn kt-btn-ghost kt-btn-sm" type="button" data-revote>Change my call</button>${ctx.type === 'keeper' ? '<button class="kt-btn kt-btn-secondary kt-btn-sm" type="button" data-open-calc>Open in the Keeper calculator</button>' : ''}</div></div>`;
  }
  panel.innerHTML = `<article class="dl-card" aria-labelledby="dl-card-title">
    <header class="dl-card-head"><div><span class="kt-eyebrow" id="dl-card-title">${escapeHtml(trade.season)} · Week ${trade.week}</span><small>${trade.created ? ago(trade.created) : ''}</small></div><div class="dl-chips">${fmtChips.map(chip => `<span class="kt-badge">${chip}</span>`).join('')}</div></header>
    <div class="dl-sides">${sideCol(a, 0)}${sideCol(b, 1)}</div>
    ${vote ? reveal : `<div class="dl-vote"><p id="dl-vote-q">Who came out ahead?</p><div role="group" aria-labelledby="dl-vote-q"><button class="kt-btn dl-vote-a" type="button" data-vote="A">${escapeHtml(a.name)}</button><button class="kt-btn dl-vote-e" type="button" data-vote="E">Even</button><button class="kt-btn dl-vote-b" type="button" data-vote="B">${escapeHtml(b.name)}</button></div><small>Values stay hidden until you call it.</small></div>`}
    <footer class="dl-nav"><button class="kt-btn kt-btn-ghost kt-btn-sm" type="button" data-step="-1" ${state.index === 0 ? 'disabled' : ''}>← Previous</button><span>${state.index + 1} of ${list.length}${Object.keys(votes()).length ? ` · ${Object.keys(votes()).filter(id => state.trades.some(t => t.id === id)).length} called` : ''}</span><button class="kt-btn kt-btn-ghost kt-btn-sm" type="button" data-step="1" ${state.index >= list.length - 1 ? 'disabled' : ''}>Next →</button></footer>
  </article>`;
  panel.querySelectorAll('[data-vote]').forEach(button => button.addEventListener('click', () => { saveVote(trade.id, button.dataset.vote); sendCrowdVote(trade, button.dataset.vote); state.index = queue().findIndex(item => item.id === trade.id); renderCall(); renderRecord(); panel.querySelector('.dl-reveal')?.focus?.(); }));
  panel.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => { state.index += Number(button.dataset.step); renderCall(); }));
  panel.querySelector('[data-revote]')?.addEventListener('click', () => { const all = votes(); delete all[trade.id]; try { localStorage.setItem(VOTES_KEY, JSON.stringify(all)); } catch (_) {} state.index = queue().findIndex(item => item.id === trade.id); renderCall(); renderRecord(); });
  panel.querySelector('[data-open-calc]')?.addEventListener('click', () => openInCalculator(trade, read));
}

function crowdLine(trade, read) {
  const c = state.crowd?.[trade.id];
  if (!c) return '';
  const total = c.A + c.E + c.B;
  if (!total) return '';
  const pct = value => Math.round(value / total * 100);
  return `<p class="dl-crowd"><span>League calls · ${total} vote${total === 1 ? '' : 's'}</span>${escapeHtml(read.sides[0].name)} ${pct(c.A)}% · Even ${pct(c.E)}% · ${escapeHtml(read.sides[1].name)} ${pct(c.B)}%</p>`;
}

function openInCalculator(trade, read) {
  const sides = { A: [], B: [] };
  read.sides.forEach((side, index) => side.assets.forEach(asset => {
    const key = index === 0 ? 'A' : 'B';
    if (asset.kind === 'pick') {
      sides[key].push({ ref: { name: asset.name, n: asset.name, pos: 'PICK', p: 'PICK', team: 'pick', t: 'pick', pick: true, round: asset.round, yr: Math.max(0, Number(asset.season) - state.ctx.nextDraft) }, mv: (asset.value || 0) / 100 });
    } else {
      sides[key].push({ ref: { name: asset.name, n: asset.name, pos: asset.pos, p: asset.pos, team: asset.team, t: asset.team, pick: false }, mv: (asset.value || 0) / 100 });
    }
  }));
  try { localStorage.setItem('kt-pending-trade:v1', JSON.stringify({ sides, names: read.sides.map(side => side.name), origin: 'Deals', transactionId: trade.id })); } catch (_) {}
  window.location.href = 'keeper.html?fromLeague=1';
}

// ------------------------------------------------------------------ Database
function renderDatabase() {
  const panel = $('#dl-panel-database');
  const seasons = [...new Set(state.trades.map(trade => trade.season))].sort().reverse();
  const managers = [...new Set(state.trades.flatMap(trade => trade.sides.map(side => side.name)))].sort((a, b) => a.localeCompare(b));
  const q = keyOf(state.query);
  const rows = state.trades.filter(trade => (state.season === 'all' || trade.season === state.season)
    && (state.manager === 'all' || trade.sides.some(side => side.name === state.manager))
    && (!q || trade.sides.some(side => keyOf(side.name).includes(q) || side.gets.some(asset => keyOf(asset.name).includes(q)))));
  if (!panel.querySelector('#dl-q')) {
    panel.innerHTML = `<div class="dl-filters"><label>Search<input class="kt-control" id="dl-q" type="search" placeholder="Player or manager…" autocomplete="off"></label><label>Season<select class="kt-control" id="dl-season"><option value="all">All seasons</option>${seasons.map(season => `<option>${season}</option>`).join('')}</select></label><label>Manager<select class="kt-control" id="dl-manager"><option value="all">Everyone</option>${managers.map(name => `<option>${escapeHtml(name)}</option>`).join('')}</select></label></div><p class="dl-count" id="dl-count" aria-live="polite"></p><ol class="dl-list" id="dl-list"></ol>`;
    let timer;
    panel.querySelector('#dl-q').addEventListener('input', event => { clearTimeout(timer); timer = setTimeout(() => { state.query = event.target.value; renderDatabase(); }, 120); });
    panel.querySelector('#dl-season').addEventListener('change', event => { state.season = event.target.value; renderDatabase(); });
    panel.querySelector('#dl-manager').addEventListener('change', event => { state.manager = event.target.value; renderDatabase(); });
  }
  panel.querySelector('#dl-count').textContent = `${rows.length} of ${state.trades.length} trades`;
  panel.querySelector('#dl-list').innerHTML = rows.length ? rows.map(trade => {
    const read = modelRead(trade, state.market, state.ctx);
    const voted = votes()[trade.id];
    const chip = voted ? (read.even ? 'Even' : `${read.sides[read.winner].name} won`) : 'Not called yet';
    return `<li><button type="button" class="dl-row" data-open-trade="${escapeHtml(trade.id)}"><span class="dl-row-when">${escapeHtml(trade.season)} · Wk ${trade.week}</span><span class="dl-row-deal"><b>${escapeHtml(trade.sides[0].name)}</b> gets ${escapeHtml(trade.sides[0].gets.map(asset => asset.name).join(', ') || '—')}<br><b>${escapeHtml(trade.sides[1].name)}</b> gets ${escapeHtml(trade.sides[1].gets.map(asset => asset.name).join(', ') || '—')}</span><span class="dl-row-chip${voted ? '' : ' is-muted'}">${escapeHtml(chip)}</span></button></li>`;
  }).join('') : '<li class="dl-empty-line">No trades match.</li>';
  panel.querySelectorAll('[data-open-trade]').forEach(button => button.addEventListener('click', () => {
    state.index = queue().findIndex(trade => trade.id === button.dataset.openTrade);
    switchTab('call');
  }));
}

// ------------------------------------------------------------------ Market
function renderMarket() {
  const panel = $('#dl-panel-market');
  const unit = pickUnit(state.market, state.ctx);
  // Movers ranked by the size of the move (FantasyCalc 30-day trend, shown on the 0-10,000 scale), among players
  // worth something before the move, so a 50 -> 400 fringe jump can't top the list at +700%.
  const scale = 10000 / Math.max(1, state.market.fcMax);
  const move = player => player.trend * scale;
  const withTrend = state.market.players.filter(player => player.fc && player.trend && (player.fc - player.trend) * scale >= 1500);
  const pct = player => player.trend / Math.max(1, player.fc - player.trend);
  const risers = withTrend.filter(player => player.trend > 0).sort((a, b) => move(b) - move(a)).slice(0, 8);
  const fallers = withTrend.filter(player => player.trend < 0).sort((a, b) => move(a) - move(b)).slice(0, 8);
  const counts = new Map();
  state.trades.forEach(trade => trade.sides.forEach(side => side.gets.filter(asset => asset.kind === 'player').forEach(asset => counts.set(asset.id, { asset, n: (counts.get(asset.id)?.n || 0) + 1 }))));
  const most = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  const row = (player, extra) => `<li><span class="dl-pos dl-pos-${escapeHtml(player.pos)}">${escapeHtml(player.pos)}</span><span class="dl-name">${escapeHtml(player.name)}<small>${escapeHtml(player.team || 'FA')} · ${num(player.value)} ${picks(player.value, unit)}</small></span>${extra}</li>`;
  panel.innerHTML = `<div class="dl-market">
    <section class="dl-box"><h3>Rising <small>30 days</small></h3><ol class="dl-plist">${risers.map(player => row(player, `<b class="dl-up">+${num(move(player))}<small>+${(pct(player) * 100).toFixed(0)}%</small></b>`)).join('')}</ol></section>
    <section class="dl-box"><h3>Falling <small>30 days</small></h3><ol class="dl-plist">${fallers.map(player => row(player, `<b class="dl-down">−${num(-move(player))}<small>${(pct(player) * 100).toFixed(0)}%</small></b>`)).join('')}</ol></section>
    <section class="dl-box"><h3>Most traded <small>your league, all seasons</small></h3><ol class="dl-plist">${most.length ? most.map(({ asset, n }) => { const v = playerValue(state.market, asset.id, asset.name) || { pos: asset.pos, team: asset.team, value: 0, name: asset.name }; return row({ ...v, name: asset.name }, `<b>${n}×</b>`); }).join('') : '<li class="dl-empty-line">No trades yet.</li>'}</ol></section>
  </div><p class="dl-note">30-day moves are FantasyCalc’s value trend on the 0–10,000 scale, among players worth at least 1,500 before the move. “≈1sts” prices everything in mid first-round picks of the next draft, using ${state.ctx.type === 'keeper' ? 'the Keeper calculator’s pick rule' : 'the live rookie-pick market'}.</p>`;
}

// ------------------------------------------------------------------ Teams
function renderTeams() {
  const panel = $('#dl-panel-teams');
  const teams = teamValues(state.bundle, state.market, state.ctx, state.tradedPicks, state.players);
  const top = Math.max(...teams.map(team => team.total), 1);
  const mine = Number(localStorage.getItem(MANAGER_KEY));
  const profile = team => team.age == null ? '' : team.rank <= Math.ceil(teams.length / 3) && team.age >= 26.5 ? 'Win-now' : team.age < 25.6 ? 'Young core' : team.rank > teams.length - Math.ceil(teams.length / 3) ? 'Rebuild' : 'Balanced';
  panel.innerHTML = `<ol class="dl-teams">${teams.map(team => `<li class="${team.rosterId === mine ? 'is-mine' : ''}"><span class="dl-rank">${team.rank}</span><div class="dl-team-main"><div class="dl-team-head"><strong>${escapeHtml(team.name)}</strong><span class="kt-badge">${profile(team)}</span><b class="dl-team-total">${num(team.total)}</b></div><div class="dl-team-bar" aria-hidden="true"><i style="width:${(team.playerTotal / top * 100).toFixed(1)}%"></i><i class="is-picks" style="width:${(team.pickTotal / top * 100).toFixed(1)}%"></i></div><small>${num(team.playerTotal)} players${state.ctx.type !== 'redraft' ? ` + ${num(team.pickTotal)} picks` : ''}${team.age ? ` · age ${team.age.toFixed(1)}` : ''}</small><small>${team.top.map(asset => escapeHtml(asset.name)).join(' · ')}</small></div></li>`).join('')}</ol>
  <p class="dl-note">Team value = every rostered player at today’s value${state.ctx.type !== 'redraft' ? ` plus the ${state.ctx.nextDraft} picks each team owns (traded picks follow their owner)` : ''}. Keeper costs aren’t included.</p>`;
}

// ------------------------------------------------------------------ Binder (your saved calculator trades, re-priced live)
function renderBinder() {
  const panel = $('#dl-panel-binder');
  let saved = [];
  try { saved = (JSON.parse(localStorage.getItem('kt-trade-history:v1:keeper') || '[]') || []).filter(entry => entry?.sides?.A && entry?.sides?.B); } catch (_) {}
  if (!saved.length) { panel.innerHTML = '<div class="dl-empty"><h2>Your binder is empty</h2><p>Trades you grade in the <a href="keeper.html">Keeper calculator</a> are saved here and re-priced with live values, so you can see how they aged.</p></div>'; return; }
  const priceNow = entry => {
    if (entry.ref?.pick) return assetValue(state.market, { kind: 'pick', round: entry.ref.round, season: state.ctx.nextDraft + (entry.ref.yr || 0) }, { ...state.ctx, type: 'keeper' }) ?? 0;
    return playerValue(state.market, entry.ref?.sleeperId, entry.ref?.n || entry.ref?.name)?.value ?? 0;
  };
  panel.innerHTML = `<ol class="dl-binder">${saved.map(entry => {
    const sides = ['A', 'B'].map(key => {
      const then = entry.sides[key].reduce((sum, item) => sum + (Number(item.mv) || 0) * 100, 0);
      const now = entry.sides[key].reduce((sum, item) => sum + priceNow(item), 0);
      return { key, then, now, names: entry.sides[key].map(item => item.ref?.n || item.ref?.name).filter(Boolean) };
    });
    const names = entry.names || ['Team A', 'Team B'];
    const nowGap = sides[0].now - sides[1].now;
    const thenGap = sides[0].then - sides[1].then;
    return `<li><header><span>${new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><b>${escapeHtml(entry.verdict || '')}</b></header>${sides.map((side, index) => `<p><strong>${escapeHtml(names[index] || side.key)}</strong> ${escapeHtml(side.names.join(', '))}<span>${num(side.then)} → <b class="${side.now >= side.then ? 'dl-up' : 'dl-down'}">${num(side.now)}</b></span></p>`).join('')}<footer>Gap then ${thenGap >= 0 ? '+' : '−'}${num(Math.abs(thenGap))} · now ${nowGap >= 0 ? '+' : '−'}${num(Math.abs(nowGap))} (${escapeHtml(names[0] || 'A')} side, market value)</footer></li>`;
  }).join('')}</ol><p class="dl-note">Market value then (when you graded it) vs now. Keeper costs and edits you made in the calculator aren’t re-applied.</p>`;
}

// ------------------------------------------------------------------ Your record
function renderRecord() {
  const panel = $('#dl-panel-record');
  const voted = votes();
  const called = state.trades.filter(trade => voted[trade.id]).map(trade => {
    const read = modelRead(trade, state.market, state.ctx);
    const modelPick = read.winner === -1 ? 'E' : read.winner === 0 ? 'A' : 'B';
    return { trade, read, pick: voted[trade.id].pick, at: voted[trade.id].at, agree: voted[trade.id].pick === modelPick };
  }).sort((a, b) => b.at - a.at);
  if (!called.length) { panel.innerHTML = '<div class="dl-empty"><h2>No calls yet</h2><p>Call a few trades in <b>Call it</b> and your record shows up here: how often you and the model agree, and your streak.</p></div>'; return; }
  const agreed = called.filter(item => item.agree).length;
  let streak = 0;
  for (const item of called) { if (item.agree) streak += 1; else break; }
  panel.innerHTML = `<dl class="dl-kpis"><div><dt>Calls</dt><dd>${called.length}<small>/${state.trades.length}</small></dd></div><div><dt>Agree with model</dt><dd>${Math.round(agreed / called.length * 100)}%</dd></div><div><dt>Current streak</dt><dd>${streak}</dd></div></dl>
  <ol class="dl-list">${called.map(item => `<li><button type="button" class="dl-row" data-open-trade="${escapeHtml(item.trade.id)}"><span class="dl-row-when">${escapeHtml(item.trade.season)} · Wk ${item.trade.week}</span><span class="dl-row-deal">You: <b>${item.pick === 'E' ? 'Even' : escapeHtml(item.read.sides[item.pick === 'A' ? 0 : 1].name)}</b> · Model: <b>${item.read.even ? 'Even' : escapeHtml(item.read.sides[item.read.winner].name)}</b></span><span class="dl-row-chip ${item.agree ? 'is-agree' : 'is-differ'}">${item.agree ? '✓ agree' : '✗ differ'}</span></button></li>`).join('')}</ol>
  <p class="dl-note">The model re-reads every trade with today’s values, so an old call can flip as players rise and fall. Your calls are saved on this device.</p>`;
  panel.querySelectorAll('[data-open-trade]').forEach(button => button.addEventListener('click', () => { state.index = queue().findIndex(trade => trade.id === button.dataset.openTrade); switchTab('call'); }));
}

// ------------------------------------------------------------------ shell
const renderers = { call: renderCall, database: renderDatabase, market: renderMarket, teams: renderTeams, binder: renderBinder, record: renderRecord };
function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('[role="tab"]').forEach(button => { const on = button.dataset.tab === tab; button.setAttribute('aria-selected', String(on)); button.tabIndex = on ? 0 : -1; });
  document.querySelectorAll('[role="tabpanel"]').forEach(panel => { panel.hidden = panel.id !== `dl-panel-${tab}`; });
  renderers[tab]();
  try { history.replaceState(null, '', `deals.html${tab === 'call' ? '' : `?tab=${tab}`}`); } catch (_) {}
}

async function load() {
  mountNavigation({ active: 'deals' });
  mountPageTransitions();
  const status = $('#dl-status');
  const leagueId = getSleeperLeagueId();
  if (!leagueId) { status.innerHTML = 'Connect your league on the <a href="index.html#league">Home page</a> to see its trades.'; return; }
  if (getActiveLeagueConnection()?.provider === 'yahoo') { status.textContent = 'Deals reads trades from Sleeper leagues today. Yahoo leagues are next.'; return; }
  try {
    const nfl = await getNflState();
    const [players, bundle] = await Promise.all([getPlayerDatabase(), getLeagueBundle(leagueId, Math.max(1, Number(nfl.week || nfl.display_week) || 1))]);
    state.players = players;
    state.bundle = bundle;
    state.ctx = leagueContext(bundle.league);
    state.completed = completedWeeks(bundle.league, nfl);
    const tradedKey = `sleeper-traded-picks:${leagueId}`;
    liveData.register(tradedKey, { url: `https://api.sleeper.app/v1/league/${leagueId}/traded_picks`, cadence: 1800000 });
    const [market, trades, traded] = await Promise.all([getMarket(state.ctx.type), loadLeagueTrades(leagueId, players), liveData.get(tradedKey).catch(() => [])]);
    state.market = market;
    state.trades = trades;
    state.tradedPicks = Array.isArray(traded) ? traded : [];
    $('#dl-eyebrow').textContent = `${bundle.league.name} · ${trades.length} real trade${trades.length === 1 ? '' : 's'}`;
    status.textContent = `Values live · ${market.sources.dealer ? 'FantasyCalc + Dynasty Dealer' : 'FantasyCalc'} · priced like your ${state.ctx.type === 'keeper' ? 'Keeper calculator' : 'trade calculator'}`;
    status.classList.add('is-live');
    document.querySelector('.dl-tabs').hidden = false;
    loadCrowd().then(counts => { state.crowd = counts; if (counts && state.tab === 'call') renderCall(); });
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (params.get('q')) state.query = params.get('q');
    switchTab(renderers[tab] ? tab : 'call');
    const q = document.querySelector('#dl-q');
    if (q && state.query) q.value = state.query;
  } catch (error) {
    status.textContent = friendlyError(error, 'Your league’s trades are reconnecting. Try again in a moment.');
  }
}

document.querySelector('.dl-tabs').addEventListener('click', event => { const tab = event.target.closest('[role="tab"]'); if (tab) switchTab(tab.dataset.tab); });
document.querySelector('.dl-tabs').addEventListener('keydown', event => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const index = tabs.findIndex(tab => tab.dataset.tab === state.tab);
  const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
  if (next < 0) return;
  event.preventDefault();
  switchTab(tabs[next].dataset.tab);
  tabs[next].focus();
});
load();
