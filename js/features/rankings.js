// Rankings: live FantasyCalc consensus boards (Redraft / Keeper / Dynasty) in the Keeper Trade design system.
// Data logic is unchanged from the original page (same endpoints, same Keeper blend); the shell is rebuilt.
// When a Sleeper league is connected, the board starts on that league's scoring (PPR / Half / Non, 1QB / SF)
// and can highlight or filter to your roster.
import { mountNavigation } from '../ui/navigation.js';
import { mountPageTransitions } from '../ui/page-transitions.js';
import { getSleeperLeagueId, getLeagueBundle, getNflState } from '../data/sleeper.js';
import { getActiveLeagueConnection } from '../data/league-connections.js';
import { getActiveFormat, formatSources, formatLabel, needsProjection } from '../data/scoring-format.js';
import { mountFormatBar } from '../ui/format-bar.js';

const MANAGER_KEY = 'kt-drive-manager:v1';
const PAGE = 150;
const REFRESH_MS = 15 * 60 * 1000; // values are live: refetch every 15 minutes while the page is open
const $ = selector => document.querySelector(selector);
const els = {
  mode: $('#rk-mode'), format: $('#rk-format'), pos: $('#rk-pos'), team: $('#rk-team'), search: $('#rk-search'),
  mine: $('#rk-mine'), mineWrap: $('#rk-mine-wrap'), status: $('#rk-status'), rows: $('#rk-rows'),
  more: $('#rk-more'), count: $('#rk-count'), table: $('#rk-table'), modeLabel: $('#rk-mode-label')
};
const state = { mode: 'redraft', format: null, projected: true, pos: 'ALL', team: 'ALL', q: '', mine: false, limit: PAGE, rows: [], roster: new Set(), seq: 0 };
let lastLoaded = 0;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const norm = value => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// One board = FantasyCalc in the active format (league scoring unless the user picked one), re-priced for the
// rules no source models (js/data/scoring-format.js). force: a timed refresh on an open page.
async function board(dynasty, force) {
  const src = await formatSources(state.format, { dynasty, dealer: false, force });
  if (!src.fc.length) throw new Error('Values unavailable');
  state.projected = src.projected;
  return mapRows(src.fc);
}
function rank(list) {
  list.sort((a, b) => b.val - a.val);
  const counts = {};
  list.forEach(player => { counts[player.pos] = (counts[player.pos] || 0) + 1; player.posRank = counts[player.pos]; });
  return list;
}
function mapRows(data) {
  return (data || []).map(row => {
    const player = row.player || {};
    return { name: player.name, pos: String(player.position || '').toUpperCase(), team: player.maybeTeam || 'FA', val: Math.round(Number(row.value || 0)), adj: row.formatM || 1, espnId: player.espnId, sleeperId: player.sleeperId ? String(player.sleeperId) : '', age: player.maybeAge, tier: row.maybeTier, trend: row.trend30Day, posRank: row.positionRank };
  }).filter(player => ['QB', 'RB', 'WR', 'TE'].includes(player.pos) && player.name);
}

function setStatus(kind) {
  els.status.className = `rk-status${kind === 'loading' ? ' is-loading' : kind === 'offline' ? ' is-offline' : ''}`;
  els.status.innerHTML = kind === 'loading' ? '<span class="rk-dot"></span>Loading values…'
    : kind === 'offline' ? '<span class="rk-dot"></span>Values are reconnecting. <button type="button" class="rk-retry">Retry</button>'
    : `<span class="rk-dot"></span>Live · FantasyCalc · ${escapeHtml(state.format ? formatLabel(state.format) : '')}${state.format && needsProjection(state.format) ? (state.projected ? ' · scoring rules from Sleeper projections' : ' · scoring adjustment reconnecting') : ''}`;
  els.status.querySelector('.rk-retry')?.addEventListener('click', () => load(true));
}

function skeleton() {
  els.rows.innerHTML = Array.from({ length: 8 }, () => '<tr class="rk-skel"><td colspan="8"><span class="kt-skeleton"></span></td></tr>').join('');
  els.table.setAttribute('aria-busy', 'true');
}

async function load(force = false) {
  setStatus('loading');
  if (!state.rows.length) skeleton();
  const seq = ++state.seq;
  try {
    state.format = await getActiveFormat();
    let list;
    if (state.mode === 'keeper') {
      // Keeper = average of redraft and dynasty value (rewards young, cheap-to-hold players without going full dynasty)
      const [rd, dynasty] = await Promise.all([board(false, force), board(true, force)]);
      const byName = new Map(dynasty.map(player => [player.name, player]));
      list = rd.map(player => {
        const d = byName.get(player.name);
        return { ...player, trend: d ? d.trend : player.trend, val: d ? Math.round((player.val + d.val) / 2) : player.val };
      });
    } else {
      list = await board(state.mode === 'dynasty', force);
    }
    rank(list); // values moved with the scoring rules, so order and position ranks are recomputed here
    if (seq !== state.seq) return;
    state.rows = list;
    lastLoaded = Date.now();
    buildTeams();
    render();
    setStatus('live');
  } catch (_) {
    if (seq !== state.seq) return;
    setStatus('offline');
    if (!state.rows.length) els.rows.innerHTML = '<tr><td colspan="8" class="rk-empty">Values are reconnecting. Try again in a moment.</td></tr>';
    els.table.setAttribute('aria-busy', 'false');
  }
}

let teamsBuilt = false;
function buildTeams() {
  if (teamsBuilt) return;
  teamsBuilt = true;
  const teams = [...new Set(state.rows.map(player => player.team).filter(team => team && team !== 'FA'))].sort();
  els.team.insertAdjacentHTML('beforeend', teams.map(team => `<option value="${team}">${team}</option>`).join(''));
}

const photo = player => (player.espnId ? `https://a.espncdn.com/i/headshots/nfl/players/full/${player.espnId}.png` : player.sleeperId ? `https://sleepercdn.com/content/nfl/players/thumb/${player.sleeperId}.jpg` : '');
const isMine = player => state.roster.size && (state.roster.has(player.sleeperId) || state.roster.has(`name:${norm(player.name)}`));

function render() {
  const query = norm(state.q);
  const list = state.rows.filter(player => (state.pos === 'ALL' || player.pos === state.pos)
    && (state.team === 'ALL' || player.team === state.team)
    && (!query || norm(player.name).includes(query))
    && (!state.mine || isMine(player)));
  els.table.setAttribute('aria-busy', 'false');
  els.count.textContent = list.length ? `${Math.min(list.length, state.limit)} of ${list.length} players` : '';
  if (!list.length) {
    els.rows.innerHTML = `<tr><td colspan="8" class="rk-empty">${state.mine ? 'None of your players match these filters.' : 'No players match these filters.'}</td></tr>`;
    els.more.hidden = true;
    return;
  }
  const top = Math.max(...list.map(player => player.val || 0), 1);
  els.rows.innerHTML = list.slice(0, state.limit).map((player, index) => {
    const trend = player.trend ? `<span class="rk-trend ${player.trend > 0 ? 'is-up' : 'is-down'}"><span aria-hidden="true">${player.trend > 0 ? '▲' : '▼'}</span><span class="kt-sr-only">${player.trend > 0 ? 'up' : 'down'} </span>${Math.abs(Math.round(player.trend)).toLocaleString()}</span>` : '<span class="rk-trend">—</span>';
    const src = photo(player);
    return `<tr${isMine(player) ? ' class="is-mine"' : ''}>
      <td class="rk-rank">${index + 1}</td>
      <th scope="row"><span class="rk-player">${src ? `<img alt="" src="${escapeHtml(src)}" loading="lazy" decoding="async" width="36" height="36" onerror="this.style.visibility='hidden'">` : '<span class="rk-photo"></span>'}<span class="rk-name">${escapeHtml(player.name)}${isMine(player) ? '<span class="rk-mine-tag">Yours</span>' : ''}</span></span></th>
      <td><span class="rk-pos rk-pos-${player.pos}">${player.pos}${player.posRank || ''}</span></td>
      <td>${escapeHtml(player.team)}</td>
      <td>${player.age != null ? Math.round(player.age) : '—'}</td>
      <td class="rk-tier">${player.tier != null ? `T${player.tier}` : '—'}</td>
      <td class="rk-value"><span class="rk-bar" style="--rk-w:${Math.max(4, Math.round((player.val || 0) / top * 100))}%"></span><strong>${(player.val || 0).toLocaleString()}</strong>${Math.abs(player.adj - 1) >= 0.005 ? `<span class="rk-adj ${player.adj > 1 ? 'is-up' : 'is-down'}" title="Change from your league's scoring rules">${player.adj > 1 ? '+' : '−'}${Math.abs(Math.round((player.adj - 1) * 100))}%</span>` : ''}</td>
      <td>${trend}</td>
    </tr>`;
  }).join('');
  els.more.hidden = list.length <= state.limit;
  els.more.textContent = `Show ${Math.min(PAGE, list.length - state.limit)} more`;
}

function group(element, key, after) {
  element.addEventListener('click', event => {
    const button = event.target.closest('button[data-v]');
    if (!button) return;
    element.querySelectorAll('button[data-v]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    state[key] = button.dataset.v;
    state.limit = PAGE;
    after();
  });
}
function press(element, value) {
  element.querySelectorAll('button[data-v]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.v === value)));
}

// "Your players": the connected league's roster for the saved manager (scoring sync lives in the format bar).
async function loadRoster() {
  const leagueId = getSleeperLeagueId();
  if (!leagueId || getActiveLeagueConnection()?.provider === 'yahoo') return false;
  try {
    const nfl = await getNflState();
    const bundle = await getLeagueBundle(leagueId, Math.max(1, Number(nfl.display_week || nfl.week) || 1));
    const saved = Number(localStorage.getItem(MANAGER_KEY));
    const roster = bundle.rosters.find(item => item.roster_id === saved);
    if (!roster) return false;
    const players = await import('../data/player-db.js').then(module => module.getPlayerDatabase()).catch(() => new Map());
    (roster.players || []).forEach(id => {
      state.roster.add(String(id));
      const name = players.get(String(id))?.name;
      if (name) state.roster.add(`name:${norm(name)}`);
    });
    els.mineWrap.hidden = false;
    return true;
  } catch (_) { return false; }
}

async function start() {
  mountNavigation({ active: 'rankings' });
  mountPageTransitions();
  const params = new URLSearchParams(window.location.search);
  if (['redraft', 'keeper', 'dynasty'].includes(params.get('mode'))) { state.mode = params.get('mode'); press(els.mode, state.mode); }
  els.modeLabel.textContent = state.mode[0].toUpperCase() + state.mode.slice(1);
  group(els.mode, 'mode', () => { els.modeLabel.textContent = state.mode[0].toUpperCase() + state.mode.slice(1); load(); });
  mountFormatBar(els.format, { onChange: () => { state.limit = PAGE; load(); } });
  group(els.pos, 'pos', render);
  els.team.addEventListener('change', () => { state.team = els.team.value; state.limit = PAGE; render(); });
  let timer;
  els.search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.q = els.search.value.trim(); state.limit = PAGE; render(); }, 120); });
  els.mine.addEventListener('click', () => { state.mine = !state.mine; els.mine.setAttribute('aria-pressed', String(state.mine)); state.limit = PAGE; render(); });
  els.more.addEventListener('click', () => { state.limit += PAGE; render(); });
  skeleton();
  setInterval(() => { if (!document.hidden) load(true); }, REFRESH_MS); // force: the cached copy may be seconds short of 15 min
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastLoaded > REFRESH_MS) load(true); });
  load();
  if (await loadRoster()) render();
}

start();
