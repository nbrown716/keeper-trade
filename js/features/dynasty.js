// Dynasty Trade Calculator. Live blended values (Dynasty Dealer + FantasyCalc) in the active scoring format,
// rookie picks by year / round / slot, values in points or 1sts, package adjustment, what evens the deal,
// league rosters, shareable link. Math: js/data/dynasty-engine.js. Values: js/data/trade-market.js.
// Not the Keeper calculator: no keeper cost and no 1,000-point house rule here.
import { mountNavigation } from '../ui/navigation.js';
import { mountPageTransitions } from '../ui/page-transitions.js';
import { mountFormatBar } from '../ui/format-bar.js';
import { getActiveFormat, formatLabel, needsProjection } from '../data/scoring-format.js';
import { getMarket, dynastyPick, dynastyPickYears, playerValue } from '../data/trade-market.js';
import { sideTotal, verdict, evenUp, weightAt } from '../data/dynasty-engine.js';
import { getSleeperLeagueId, getLeagueBundle, getNflState, leagueUsers, rosterOwner } from '../data/sleeper.js';
import { getActiveLeagueConnection } from '../data/league-connections.js';
import { liveData } from '../data/live-data.js';

const SLOTS = ['early', 'mid', 'late'];
const ORDINAL = ['1st', '2nd', '3rd', '4th'];
const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'];
const STORE = 'kt-dynasty-trade:v1';
const REFRESH_MS = 15 * 60 * 1000;
const PAGE = 40;
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = text => text[0].toUpperCase() + text.slice(1);

const state = {
  market: null, format: null, unit: 'points', pkg: true, seq: 0, lastLoaded: 0, uid: 1,
  sides: { A: [], B: [] }, pos: { A: 'ALL', B: 'ALL' }, q: { A: '', B: '' }, limit: { A: PAGE, B: PAGE },
  team: { A: '', B: '' }, pickYear: { A: 0, B: 0 }, league: null, tradedPicks: [], suggestions: [], pendingIds: null
};

// ------------------------------------------------------------------ values
function unitValue() {
  if (!state.market) return 0;
  const years = dynastyPickYears(state.market);
  return years.length ? dynastyPick(state.market, { season: years[0], round: 1, slot: 'mid' })?.value || 0 : 0;
}
function resolve(asset) {
  if (!state.market) return { value: 0, low: 0, high: 0 };
  if (asset.kind === 'pick') return dynastyPick(state.market, asset) || { value: 0, low: 0, high: 0, unpriced: true };
  const player = playerValue(state.market, asset.id, asset.name);
  if (!player) return { value: 0, low: 0, high: 0, unpriced: true };
  const dealer = player.dd != null ? player.dd : player.fcNorm;
  return { value: player.value, low: Math.round(Math.min(dealer, player.fcNorm) * 100), high: Math.round(Math.max(dealer, player.fcNorm) * 100), player };
}
function fmt(value) {
  if (state.unit === 'firsts') { const unit = unitValue(); return unit ? (value / unit).toFixed(2) : '—'; }
  return Math.round(value).toLocaleString();
}
const pickLabel = asset => `${asset.season} ${ORDINAL[asset.round - 1]} (${cap(asset.slot)})`;
const assetName = asset => (asset.kind === 'pick' ? pickLabel(asset) : asset.name);
const sideName = side => (state.team[side] && state.league ? teamName(Number(state.team[side])) : `Team ${side}`);
const inTrade = id => ['A', 'B'].some(side => state.sides[side].some(asset => asset.kind === 'player' && asset.id === id));

// ------------------------------------------------------------------ league
function teamName(rosterId) {
  const roster = state.league?.rosters.find(item => item.roster_id === rosterId);
  return roster ? String(rosterOwner(roster, leagueUsers(state.league.users))).trim() : `Team ${rosterId}`;
}
function ownedPicks(rosterId) {
  if (!state.market) return [];
  const years = dynastyPickYears(state.market);
  const rounds = Math.min(4, Number(state.league?.league?.settings?.draft_rounds) || 4);
  const picks = [];
  years.forEach(season => {
    for (let round = 1; round <= rounds; round += 1) {
      const trades = state.tradedPicks.filter(pick => Number(pick.season) === season && Number(pick.round) === round);
      if (!trades.some(pick => pick.roster_id === rosterId && pick.owner_id !== rosterId)) picks.push({ season, round, from: '' });
      trades.filter(pick => pick.owner_id === rosterId && pick.roster_id !== rosterId).forEach(pick => picks.push({ season, round, from: teamName(pick.roster_id) }));
    }
  });
  return picks;
}
async function loadLeague() {
  const leagueId = getSleeperLeagueId();
  if (!leagueId || getActiveLeagueConnection()?.provider === 'yahoo') return;
  try {
    const nfl = await getNflState();
    const bundle = await getLeagueBundle(leagueId, Math.max(1, Number(nfl.display_week || nfl.week) || 1));
    const key = `sleeper-traded-picks:${leagueId}`;
    liveData.register(key, { url: `https://api.sleeper.app/v1/league/${leagueId}/traded_picks`, cadence: 1800000 });
    const traded = await liveData.get(key).catch(() => []);
    state.league = bundle;
    state.tradedPicks = Array.isArray(traded) ? traded : [];
    const users = leagueUsers(bundle.users);
    const options = bundle.rosters.map(roster => ({ id: roster.roster_id, name: String(rosterOwner(roster, users)).trim() })).sort((a, b) => a.name.localeCompare(b.name));
    ['A', 'B'].forEach(side => {
      const select = $(`#dy-team-${side}`);
      select.innerHTML = `<option value="">Any player</option>${options.map(option => `<option value="${option.id}">${escapeHtml(option.name)}</option>`).join('')}`;
      select.value = state.team[side];
      $(`#dy-team-wrap-${side}`).hidden = false;
    });
    renderAll();
  } catch (_) { /* calculator works without a league */ }
}

// ------------------------------------------------------------------ rendering
function setStatus(kind) {
  const el = $('#dy-status');
  el.className = `dy-status${kind === 'loading' ? ' is-loading' : kind === 'offline' ? ' is-offline' : ''}`;
  if (kind === 'loading') { el.innerHTML = '<span class="dy-dot"></span>Loading live values…'; return; }
  if (kind === 'offline') {
    el.innerHTML = '<span class="dy-dot"></span>Values are reconnecting. <button type="button" class="dy-retry">Retry</button>';
    el.querySelector('.dy-retry').addEventListener('click', () => load(true));
    return;
  }
  const sources = state.market.sources.dealer ? 'Dynasty Dealer + FantasyCalc' : 'FantasyCalc (Dynasty Dealer reconnecting)';
  const rules = needsProjection(state.format) ? (state.market.projected ? ' · scoring rules from Sleeper projections' : ' · scoring adjustment reconnecting') : '';
  el.innerHTML = `<span class="dy-dot"></span>Live · ${sources} · ${escapeHtml(formatLabel(state.format))}${rules}`;
}

function pieceTotals(side) {
  const pieces = state.sides[side].map(asset => ({ asset, ...resolve(asset) }));
  const order = [...pieces].sort((a, b) => b.value - a.value);
  pieces.forEach(piece => { piece.weight = state.pkg ? weightAt(order.indexOf(piece)) : 1; });
  return { pieces, total: sideTotal(pieces, state.pkg) };
}

function renderPieces(side) {
  const { pieces, total } = pieceTotals(side);
  $(`#dy-name-${side}`).textContent = sideName(side);
  $(`#dy-total-${side}`).textContent = fmt(total.total);
  const list = $(`#dy-pieces-${side}`);
  list.setAttribute('aria-label', `${sideName(side)} gives`);
  if (!pieces.length) { list.innerHTML = '<li class="dy-empty">Nothing yet. Add a player from the list below, or a pick with + Pick.</li>'; return; }
  list.innerHTML = pieces.map(({ asset, value, unpriced, player, weight }) => {
    const isPick = asset.kind === 'pick';
    const meta = isPick ? (asset.from ? `via ${escapeHtml(asset.from)}` : 'Rookie pick')
      : player ? `${escapeHtml(player.team)}${player.age != null ? ` · ${Math.round(player.age)}` : ''}` : 'Not in the live market';
    const counted = weight < 1 ? ` · counts ${Math.round(weight * 100)}%` : '';
    return `<li class="dy-piece" data-uid="${asset.uid}">
      <span class="dy-pill dy-pos-${isPick ? 'PICK' : escapeHtml(player?.pos || 'NA')}">${isPick ? 'PICK' : escapeHtml(player?.pos || '?')}</span>
      <span class="dy-piece-main">${isPick ? `<span class="dy-name-text">${escapeHtml(pickLabel(asset))}</span>` : `<button type="button" class="dy-name" data-card="${asset.uid}" aria-haspopup="dialog">${escapeHtml(asset.name)}</button>`}<small>${meta}${counted}</small></span>
      <strong class="dy-val">${unpriced ? '—' : fmt(value)}</strong>
      <button type="button" class="dy-x" data-remove="${asset.uid}" aria-label="Remove ${escapeHtml(assetName(asset))}">×</button>
    </li>`;
  }).join('');
}

// filtered=false: the whole pool for that side (even-up suggestions must not depend on what is typed in search).
function browsePool(side, filtered = true) {
  if (!state.market) return [];
  let pool = state.market.players;
  if (state.team[side] && state.league) {
    const roster = state.league.rosters.find(item => String(item.roster_id) === String(state.team[side]));
    const ids = new Set((roster?.players || []).map(String));
    pool = pool.filter(player => ids.has(player.sleeperId));
  }
  const query = filtered ? state.q[side].trim().toLowerCase() : '';
  return pool.filter(player => player.sleeperId && !inTrade(player.sleeperId)
    && (!filtered || state.pos[side] === 'ALL' || player.pos === state.pos[side])
    && (!query || player.name.toLowerCase().includes(query) || player.team.toLowerCase() === query));
}

function renderBrowse(side) {
  const list = $(`#dy-browse-${side}`);
  if (!state.market) return;
  list.setAttribute('aria-busy', 'false');
  const pool = browsePool(side);
  if (!pool.length) {
    list.innerHTML = `<li class="dy-empty">${state.team[side] ? 'No players on this roster match.' : 'No players match. Try a name or a team.'}</li>`;
    return;
  }
  const rows = pool.slice(0, state.limit[side]).map(player => `<li><button type="button" class="dy-row" data-add="${escapeHtml(player.sleeperId)}" aria-label="Add ${escapeHtml(player.name)} to ${escapeHtml(sideName(side))}">
      <span class="dy-pill dy-pos-${player.pos}">${player.pos}</span>
      <span class="dy-row-main"><b>${escapeHtml(player.name)}</b><small>${escapeHtml(player.team)}${player.age != null ? ` · ${Math.round(player.age)}` : ''}</small></span>
      <strong class="dy-val">${fmt(player.value)}</strong><span class="dy-plus" aria-hidden="true">+</span>
    </button></li>`).join('');
  const more = pool.length > state.limit[side] ? `<li><button type="button" class="dy-more" data-more="${side}">Show ${Math.min(PAGE, pool.length - state.limit[side])} more</button></li>` : '';
  list.innerHTML = rows + more;
}

function renderPicker(side) {
  const host = $(`#dy-picker-${side}`);
  if (host.hidden || !state.market) return;
  const years = dynastyPickYears(state.market);
  if (!years.length) { host.innerHTML = '<p class="dy-empty">Pick values are reconnecting.</p>'; return; }
  if (!years.includes(state.pickYear[side])) state.pickYear[side] = years[0];
  const year = state.pickYear[side];
  const own = state.team[side] && state.league ? ownedPicks(Number(state.team[side])) : [];
  host.innerHTML = `
    <div class="dy-picker-years" role="group" aria-label="Draft year">${years.map(y => `<button type="button" data-year="${y}" aria-pressed="${y === year}">${y}</button>`).join('')}</div>
    <div class="dy-picker-grid">${[1, 2, 3, 4].map(round => `<div class="dy-picker-round"><span>${ORDINAL[round - 1]}</span>${SLOTS.map(slot => {
      const pick = dynastyPick(state.market, { season: year, round, slot });
      return `<button type="button" data-pick="${year}.${round}.${slot}" aria-label="Add ${year} ${ORDINAL[round - 1]}, ${slot}">${cap(slot)}<small>${pick ? fmt(pick.value) : '—'}</small></button>`;
    }).join('')}</div>`).join('')}</div>
    ${own.length ? `<div class="dy-picker-own"><span>${escapeHtml(sideName(side))}'s picks (slot unknown, priced as mid)</span><div>${own.map(pick => `<button type="button" data-pick="${pick.season}.${pick.round}.mid" data-from="${escapeHtml(pick.from)}">${pick.season} ${ORDINAL[pick.round - 1]}${pick.from ? ` <small>via ${escapeHtml(pick.from)}</small>` : ''}</button>`).join('')}</div></div>` : ''}
    <p class="dy-picker-note">Rounds 5 and later are not priced by either market.</p>`;
}

function renderVerdict() {
  const host = $('#dy-verdict');
  if (!state.market) { host.innerHTML = '<div class="dy-verdict-skel"><span class="kt-skeleton"></span></div>'; return; }
  const A = pieceTotals('A');
  const B = pieceTotals('B');
  const nameA = escapeHtml(sideName('A'));
  const nameB = escapeHtml(sideName('B'));
  state.suggestions = [];
  if (!A.pieces.length && !B.pieces.length) {
    host.innerHTML = '<div class="dy-call"><p class="dy-call-line">Add a piece to each side to see the call.</p><button type="button" class="kt-btn kt-btn-secondary" id="dy-example">Try an example</button></div>';
    return;
  }
  const v = verdict(A.total, B.total);
  const share = A.total.total + B.total.total ? Math.round(A.total.total / (A.total.total + B.total.total) * 100) : 50;
  const unitNote = state.unit === 'firsts' ? ' 1sts' : '';
  const range = total => (total.low === total.high ? '' : `<small>${fmt(total.low)} to ${fmt(total.high)}</small>`);
  const aheadName = v.ahead === 'A' ? nameA : nameB;
  let line = '';
  if (!A.pieces.length || !B.pieces.length) line = `Add a piece to <b>${!A.pieces.length ? nameA : nameB}</b>'s side to compare.`;
  else if (v.state === 'fair') line = `<b>Fair deal.</b> The sides are ${(v.pct * 100).toFixed(1)}% apart.`;
  else if (v.state === 'lean') line = `<b>Leans ${aheadName}.</b> ${aheadName} gives ${fmt(v.gap)}${unitNote} less (${Math.round(v.pct * 100)}%).`;
  else line = `<b>${aheadName} wins this.</b> ${aheadName} gives ${fmt(v.gap)}${unitNote} less (${Math.round(v.pct * 100)}%).`;
  const overlap = v.ahead && v.overlap ? '<p class="dy-note">The two markets overlap on this one, so treat it as closer than the midpoint.</p>' : '';
  let even = '';
  if (v.ahead && A.pieces.length && B.pieces.length) {
    const shortSide = v.ahead; // the team giving less adds to even it
    const short = shortSide === 'A' ? A : B;
    const otherTotal = (shortSide === 'A' ? B : A).total.total;
    const years = dynastyPickYears(state.market);
    const picks = years.flatMap(season => [1, 2, 3, 4].flatMap(round => SLOTS.map(slot => ({ kind: 'pick', season, round, slot })))).map(asset => ({ asset, ...(dynastyPick(state.market, asset) || { value: 0 }) })).filter(item => item.value > 0);
    const players = browsePool(shortSide, false).slice(0, 250).map(player => ({ asset: { kind: 'player', id: player.sleeperId, name: player.name }, value: player.value, low: player.value, high: player.value }));
    const best = [...evenUp(short.pieces, otherTotal, picks, state.pkg, 2), ...evenUp(short.pieces, otherTotal, players, state.pkg, 2)];
    state.suggestions = best.map(item => ({ side: shortSide, asset: item.candidate.asset }));
    even = `<div class="dy-even"><p>To even it, <b>${shortSide === 'A' ? nameA : nameB}</b> adds about <b>${fmt(v.gap)}${unitNote}</b>${state.pkg ? ' (after the package adjustment)' : ''}.</p>${best.length
      ? `<div class="dy-suggest">${best.map((item, index) => `<button type="button" class="kt-chip" data-suggest="${index}">+ ${escapeHtml(assetName(item.candidate.asset))} <small>${fmt(item.candidate.value)}</small></button>`).join('')}</div>`
      : '<p class="dy-note">No single pick or player lands inside 5%. Try two smaller pieces.</p>'}</div>`;
  }
  const top = [...A.pieces, ...B.pieces].filter(piece => piece.asset.kind === 'player').sort((a, b) => b.value - a.value)[0];
  const straight = state.pkg && (A.total.straight !== A.total.total || B.total.straight !== B.total.total)
    ? `<p class="dy-note">Straight sum: ${fmt(A.total.straight)} vs ${fmt(B.total.straight)}. Package adjustment: ${fmt(A.total.straight - A.total.total)} off ${nameA}, ${fmt(B.total.straight - B.total.total)} off ${nameB}.</p>` : '';
  host.innerHTML = `
    <div class="dy-score">
      <div class="dy-score-side"><span>${nameA} gives</span><strong>${fmt(A.total.total)}</strong>${range(A.total)}</div>
      <div class="dy-score-mid" data-state="${v.state}">${v.state === 'fair' ? 'FAIR' : v.state === 'empty' || !A.pieces.length || !B.pieces.length ? 'VS' : `${Math.round(v.pct * 100)}%`}</div>
      <div class="dy-score-side"><span>${nameB} gives</span><strong>${fmt(B.total.total)}</strong>${range(B.total)}</div>
    </div>
    <div class="dy-meter" role="img" aria-label="${nameA} gives ${share}% of the total value, ${nameB} gives ${100 - share}%"><span style="--dy-w:${share}%"></span></div>
    <div class="dy-call"><p class="dy-call-line" data-state="${v.state}">${line}</p>${overlap}${even}${straight}
      ${top ? `<a class="dy-link" href="deals.html?tab=database&q=${encodeURIComponent(top.asset.name)}">Real trades with ${escapeHtml(top.asset.name)} →</a>` : ''}</div>`;
}

function renderAll() {
  ['A', 'B'].forEach(side => { renderPieces(side); renderBrowse(side); renderPicker(side); });
  renderVerdict();
  persist();
}

// ------------------------------------------------------------------ state changes
function addAsset(side, asset) {
  if (asset.kind === 'player' && inTrade(asset.id)) return;
  state.sides[side].push({ ...asset, uid: state.uid++ });
  try { navigator.vibrate?.(8); } catch (_) {}
  closeCard();
  renderAll();
}
function encodeSide(side) {
  return state.sides[side].map(asset => (asset.kind === 'pick' ? `${asset.season}.${asset.round}.${asset.slot}` : asset.id)).join(',');
}
function decodeSide(text) {
  return String(text || '').split(',').filter(Boolean).slice(0, 12).map(token => {
    const pick = token.match(/^(20\d\d)\.([1-4])\.(early|mid|late)$/);
    if (pick) return { kind: 'pick', season: Number(pick[1]), round: Number(pick[2]), slot: pick[3] };
    return /^\d{1,7}$/.test(token) ? { kind: 'player', id: token, name: '' } : null;
  }).filter(Boolean);
}
function persist() {
  if (!state.market) return; // never overwrite a saved trade before values (and names) have loaded
  const a = encodeSide('A');
  const b = encodeSide('B');
  try { localStorage.setItem(STORE, JSON.stringify({ a, b, unit: state.unit, pkg: state.pkg })); } catch (_) {}
  const params = new URLSearchParams();
  if (a) params.set('a', a);
  if (b) params.set('b', b);
  window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
}
function restore() {
  const params = new URLSearchParams(window.location.search);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (_) {}
  if (saved?.unit === 'firsts') state.unit = 'firsts';
  if (saved?.pkg === false) state.pkg = false;
  const fromUrl = params.has('a') || params.has('b');
  state.pendingIds = { A: decodeSide(fromUrl ? params.get('a') : saved?.a), B: decodeSide(fromUrl ? params.get('b') : saved?.b) };
}
function applyPending() {
  if (!state.pendingIds) return;
  ['A', 'B'].forEach(side => state.pendingIds[side].forEach(asset => {
    if (asset.kind === 'player') {
      const player = state.market.byId.get(asset.id);
      if (!player || inTrade(asset.id)) return; // unknown ids from a link are dropped, never shown as a blank row
      state.sides[side].push({ kind: 'player', id: asset.id, name: player.name, uid: state.uid++ });
    } else state.sides[side].push({ ...asset, uid: state.uid++ });
  }));
  state.pendingIds = null;
}

async function load(force = false) {
  const seq = ++state.seq;
  if (!state.market) setStatus('loading');
  try {
    const format = await getActiveFormat();
    const market = await getMarket('dynasty', format, { force });
    if (seq !== state.seq) return;
    state.format = format;
    state.market = market;
    state.lastLoaded = Date.now();
    applyPending();
    setStatus('live');
    renderAll();
  } catch (_) {
    if (seq !== state.seq) return;
    setStatus('offline');
    if (!state.market) ['A', 'B'].forEach(side => { const list = $(`#dy-browse-${side}`); list.setAttribute('aria-busy', 'false'); list.innerHTML = '<li class="dy-empty">Values are reconnecting. Try again in a moment.</li>'; });
  }
}

// ------------------------------------------------------------------ player card (click a name; click away to close)
let card = null;
let cardAnchor = null;
let cardScrollY = 0;
function closeCard() {
  if (!card || card.hidden) return;
  card.hidden = true;
  cardAnchor?.setAttribute('aria-expanded', 'false');
  cardAnchor = null;
}
function openCard(anchor, asset) {
  const player = playerValue(state.market, asset.id, asset.name);
  if (!player) return;
  if (!card) {
    card = document.createElement('div');
    card.className = 'dy-card';
    card.id = 'dy-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Player card');
    document.body.appendChild(card);
    card.addEventListener('click', event => { if (event.target.closest('.dy-card-x')) closeCard(); });
  }
  const rank = state.market.players.filter(item => item.pos === player.pos).indexOf(player) + 1;
  const unit = unitValue();
  const trend = player.trend ? `<b class="${player.trend > 0 ? 'is-up' : 'is-down'}">${player.trend > 0 ? '▲' : '▼'} ${Math.abs(Math.round(player.trend)).toLocaleString()}</b>` : '<b>—</b>';
  const adj = Math.abs((player.adj || 1) - 1) >= 0.005 ? `${player.adj > 1 ? '+' : '−'}${Math.abs(Math.round((player.adj - 1) * 100))}%` : 'None';
  card.innerHTML = `
    <button type="button" class="dy-card-x" aria-label="Close player card">×</button>
    <div class="dy-card-head"><img alt="" width="48" height="48" src="https://sleepercdn.com/content/nfl/players/thumb/${escapeHtml(player.sleeperId)}.jpg" onerror="this.style.visibility='hidden'">
      <div><strong>${escapeHtml(player.name)}</strong><span>${player.pos} · ${escapeHtml(player.team)}${player.age != null ? ` · Age ${Math.round(player.age)}` : ''}</span></div></div>
    <dl class="dy-card-grid">
      <div><dt>Value</dt><dd>${player.value.toLocaleString()}</dd></div>
      <div><dt>In 1sts</dt><dd>${unit ? (player.value / unit).toFixed(2) : '—'}</dd></div>
      <div><dt>Pos rank</dt><dd>${player.pos}${rank}</dd></div>
      <div><dt>Dynasty Dealer</dt><dd>${player.dd != null ? Math.round(player.dd * 100).toLocaleString() : '—'}</dd></div>
      <div><dt>FantasyCalc</dt><dd>${Math.round(player.fcNorm * 100).toLocaleString()}</dd></div>
      <div><dt>30-day</dt><dd>${trend}</dd></div>
      <div class="dy-card-wide"><dt>Scoring adjustment</dt><dd>${adj}</dd></div>
    </dl>
    <a class="dy-link" href="deals.html?tab=database&q=${encodeURIComponent(player.name)}">Real trades with ${escapeHtml(player.name)} →</a>`;
  card.hidden = false;
  cardAnchor = anchor;
  cardScrollY = window.scrollY;
  anchor.setAttribute('aria-expanded', 'true');
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(288, window.innerWidth - 16);
  card.style.width = `${width}px`;
  const height = card.offsetHeight;
  let top = rect.bottom + 8;
  if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8);
  card.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
  card.style.top = `${top}px`;
}

// ------------------------------------------------------------------ events
function segment(element, apply) {
  element.addEventListener('click', event => {
    const button = event.target.closest('button[data-v]');
    if (!button) return;
    element.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    apply(button.dataset.v);
    renderAll();
  });
}
function press(element, value) { element.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.v === value))); }

function bind() {
  segment($('#dy-unit'), value => { state.unit = value; });
  segment($('#dy-pkg'), value => { state.pkg = value === '1'; });
  $('#dy-clear').addEventListener('click', () => { state.sides.A = []; state.sides.B = []; closeCard(); renderAll(); });
  $('#dy-share').addEventListener('click', async event => {
    const button = event.currentTarget;
    const url = window.location.href;
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (_) {}
    button.textContent = ok ? 'Link copied' : 'Copy the address bar';
    window.setTimeout(() => { button.textContent = 'Copy link'; }, 2200);
  });
  ['A', 'B'].forEach(side => {
    const posHost = document.querySelector(`[data-dy-pos="${side}"]`);
    posHost.innerHTML = POSITIONS.map(pos => `<button type="button" class="kt-chip" data-v="${pos}" aria-pressed="${pos === 'ALL'}">${pos === 'ALL' ? 'All' : pos}</button>`).join('');
    posHost.addEventListener('click', event => {
      const button = event.target.closest('button[data-v]');
      if (!button) return;
      posHost.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      state.pos[side] = button.dataset.v; state.limit[side] = PAGE; renderBrowse(side);
    });
    let timer;
    $(`#dy-search-${side}`).addEventListener('input', event => { clearTimeout(timer); timer = setTimeout(() => { state.q[side] = event.target.value; state.limit[side] = PAGE; renderBrowse(side); }, 100); });
    $(`#dy-team-${side}`).addEventListener('change', event => { state.team[side] = event.target.value; state.limit[side] = PAGE; closeCard(); renderAll(); });
    document.querySelector(`[data-dy-pick="${side}"]`).addEventListener('click', event => {
      const host = $(`#dy-picker-${side}`);
      host.hidden = !host.hidden;
      event.currentTarget.setAttribute('aria-expanded', String(!host.hidden));
      renderPicker(side);
    });
    $(`#dy-picker-${side}`).addEventListener('click', event => {
      const year = event.target.closest('button[data-year]');
      if (year) { state.pickYear[side] = Number(year.dataset.year); renderPicker(side); return; }
      const pick = event.target.closest('button[data-pick]');
      if (!pick) return;
      const [season, round, slot] = pick.dataset.pick.split('.');
      addAsset(side, { kind: 'pick', season: Number(season), round: Number(round), slot, from: pick.dataset.from || '' });
    });
    $(`#dy-browse-${side}`).addEventListener('click', event => {
      const more = event.target.closest('button[data-more]');
      if (more) { state.limit[side] += PAGE; renderBrowse(side); return; }
      const row = event.target.closest('button[data-add]');
      if (!row) return;
      const player = state.market.byId.get(row.dataset.add);
      if (player) addAsset(side, { kind: 'player', id: player.sleeperId, name: player.name });
    });
    $(`#dy-pieces-${side}`).addEventListener('click', event => {
      const remove = event.target.closest('button[data-remove]');
      if (remove) { state.sides[side] = state.sides[side].filter(asset => asset.uid !== Number(remove.dataset.remove)); closeCard(); renderAll(); return; }
      const name = event.target.closest('button[data-card]');
      if (!name) return;
      if (cardAnchor === name) { closeCard(); return; }
      closeCard();
      const asset = state.sides[side].find(item => item.uid === Number(name.dataset.card));
      if (asset) openCard(name, asset);
    });
  });
  $('#dy-verdict').addEventListener('click', event => {
    const suggest = event.target.closest('button[data-suggest]');
    if (suggest) { const item = state.suggestions[Number(suggest.dataset.suggest)]; if (item) addAsset(item.side, item.asset); return; }
    if (event.target.closest('#dy-example') && state.market) {
      const [, second, , , , , , eighth] = state.market.players;
      const years = dynastyPickYears(state.market);
      if (second) addAsset('A', { kind: 'player', id: second.sleeperId, name: second.name });
      if (eighth) addAsset('B', { kind: 'player', id: eighth.sleeperId, name: eighth.name });
      if (years.length) addAsset('B', { kind: 'pick', season: years[0], round: 1, slot: 'mid', from: '' });
    }
  });
  // the card never outlives what opened it
  document.addEventListener('pointerdown', event => {
    if (!card || card.hidden) return;
    if (card.contains(event.target) || cardAnchor?.contains(event.target)) return;
    closeCard();
  }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && card && !card.hidden) { const anchor = cardAnchor; closeCard(); anchor?.focus(); } });
  // Scrolling the page away closes the card. A few pixels of settle (a tap that nudges the page, a list scrolling
  // inside the page) must not: the first build closed the card the instant it opened whenever the tap scrolled.
  window.addEventListener('scroll', () => { if (Math.abs(window.scrollY - cardScrollY) > 24) closeCard(); }, { passive: true, capture: true });
  window.addEventListener('resize', closeCard, { passive: true });
}

function start() {
  mountNavigation({ active: 'dynasty' });
  mountPageTransitions();
  restore();
  press($('#dy-unit'), state.unit);
  press($('#dy-pkg'), state.pkg ? '1' : '0');
  ['A', 'B'].forEach(side => { $(`#dy-browse-${side}`).innerHTML = Array.from({ length: 6 }, () => '<li class="dy-skel"><span class="kt-skeleton"></span></li>').join(''); renderPieces(side); });
  renderVerdict();
  bind();
  mountFormatBar($('#dy-format'), { onChange: () => load() });
  load();
  loadLeague();
  setInterval(() => { if (!document.hidden) load(true); }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - state.lastLoaded > REFRESH_MS) load(true); });
}

start();
