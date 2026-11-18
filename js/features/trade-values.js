// Trade Value Chart: this week's trade values by position, live, in the active scoring format.
// Values are the calculators' own (js/data/trade-market.js): "This season" = FantasyCalc redraft;
// "Keeper & Dynasty" = the Dynasty Dealer + FantasyCalc blend the Keeper and Dynasty calculators use.
// Matchups: next three opponents from Sleeper's weekly projections (a team with no game that week is on bye).
import { mountNavigation } from '../ui/navigation.js';
import { mountPageTransitions } from '../ui/page-transitions.js';
import { mountFormatBar } from '../ui/format-bar.js';
import { getActiveFormat, formatLabel, needsProjection, connectedLeague } from '../data/scoring-format.js';
import { getMarket } from '../data/trade-market.js';
import { getSleeperLeagueId, getLeagueBundle, getNflState } from '../data/sleeper.js';
import { getActiveLeagueConnection } from '../data/league-connections.js';
import { liveData } from '../data/live-data.js';

const SECTIONS = [['QB', 'Quarterbacks', 24], ['RB', 'Running backs', 40], ['WR', 'Wide receivers', 48], ['TE', 'Tight ends', 18]];
const MANAGER_KEY = 'kt-drive-manager:v1';
const REFRESH_MS = 15 * 60 * 1000;
const MIN_VALUE = 150; // below this a player is a throw-in: left off the chart
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const state = { mode: 'redraft', modeChosen: false, market: null, format: null, week: 0, season: '', weeks: [], schedule: new Map(), roster: new Set(), open: new Set(), seq: 0, lastLoaded: 0 };

// The number shown. Keeper & Dynasty: the calculators' blended value. This season: FantasyCalc's own redraft value
// (in the active scoring), the same number Rankings (Redraft) and the Redraft calculator show.
const shownValue = player => (state.mode === 'redraft' ? Math.round(player.fc) : player.value);

// Sleeper team codes differ from FantasyCalc's for one club.
const teamKey = team => ({ JAC: 'JAX', WSH: 'WAS', LA: 'LAR' })[team] || team;

// team -> opponent for one week, from the QB projection rows (every team with a game has one).
export function weekMatchups(rows) {
  const map = new Map();
  (rows || []).forEach(row => { if (row?.team && row?.opponent) map.set(teamKey(row.team), teamKey(row.opponent)); });
  return map;
}
async function loadSchedule() {
  const nfl = await getNflState();
  state.season = String(nfl.season || new Date().getFullYear());
  const regular = nfl.season_type === 'regular';
  state.week = regular ? Math.min(18, Math.max(1, Number(nfl.display_week || nfl.week) || 1)) : 0;
  state.weeks = state.week ? [0, 1, 2].map(offset => state.week + offset).filter(week => week <= 18) : [];
  const maps = await Promise.all(state.weeks.map(async week => {
    const key = `sleeper-proj-week:${state.season}:${week}:QB`;
    liveData.register(key, { url: `https://api.sleeper.app/projections/nfl/${state.season}/${week}?season_type=regular&position[]=QB&order_by=pts_ppr`, cadence: 6 * 3600000 });
    try { return weekMatchups(await liveData.get(key)); } catch (_) { return new Map(); }
  }));
  state.schedule = new Map(state.weeks.map((week, index) => [week, maps[index]]));
}
async function loadRoster() {
  const leagueId = getSleeperLeagueId();
  if (!leagueId || getActiveLeagueConnection()?.provider === 'yahoo') return;
  try {
    const nfl = await getNflState();
    const bundle = await getLeagueBundle(leagueId, Math.max(1, Number(nfl.display_week || nfl.week) || 1));
    const roster = bundle.rosters.find(item => item.roster_id === Number(localStorage.getItem(MANAGER_KEY)));
    (roster?.players || []).forEach(id => state.roster.add(String(id)));
  } catch (_) { /* highlight is optional */ }
}

function setStatus(kind) {
  const el = $('#tv-status');
  el.className = `tv-status${kind === 'loading' ? ' is-loading' : kind === 'offline' ? ' is-offline' : ''}`;
  if (kind === 'loading') { el.innerHTML = '<span class="tv-dot"></span>Loading live values…'; return; }
  if (kind === 'offline') {
    el.innerHTML = '<span class="tv-dot"></span>Values are reconnecting. <button type="button" class="tv-retry">Retry</button>';
    el.querySelector('.tv-retry').addEventListener('click', () => load(true));
    return;
  }
  const sources = state.mode === 'redraft' ? 'FantasyCalc' : state.market.sources.dealer ? 'Dynasty Dealer + FantasyCalc' : 'FantasyCalc (Dynasty Dealer reconnecting)';
  const rules = needsProjection(state.format) ? (state.market.projected ? ' · scoring rules from Sleeper projections' : ' · scoring adjustment reconnecting') : '';
  const time = new Date(state.lastLoaded).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  el.innerHTML = `<span class="tv-dot"></span>Live · ${sources} · ${escapeHtml(formatLabel(state.format))}${rules} · updated ${time}`;
}

function opponent(team, week) {
  const map = state.schedule.get(week);
  if (!map || !map.size) return '—';
  if (team === 'FA' || !team) return '—';
  return map.get(teamKey(team)) || 'BYE';
}

function render() {
  const host = $('#tv-sections');
  host.setAttribute('aria-busy', 'false');
  $('#tv-eyebrow').textContent = `${state.week ? `Week ${state.week}` : 'Offseason'} · ${state.season} · live`;
  document.title = `${state.week ? `Week ${state.week} ` : ''}Trade Value Chart — Keeper Trade`;
  const market = state.market;
  host.innerHTML = SECTIONS.map(([pos, title, shown]) => {
    const all = market.players.filter(player => player.pos === pos && shownValue(player) >= MIN_VALUE).sort((a, b) => shownValue(b) - shownValue(a));
    const open = state.open.has(pos);
    const list = open ? all : all.slice(0, shown);
    const rows = list.map((player, index) => {
      const move = state.mode === 'redraft' ? Math.round(player.trend) : market.fcMax ? Math.round(player.trend / market.fcMax * 10000) : 0;
      const trend = move ? `<span class="tv-trend ${move > 0 ? 'is-up' : 'is-down'}"><span aria-hidden="true">${move > 0 ? '▲' : '▼'}</span><span class="kt-sr-only">${move > 0 ? 'up' : 'down'} </span>${Math.abs(move).toLocaleString()}</span>` : '<span class="tv-trend">—</span>';
      const mine = state.roster.has(player.sleeperId);
      const adj = Math.abs((player.adj || 1) - 1) >= 0.005 ? `<span class="tv-adj ${player.adj > 1 ? 'is-up' : 'is-down'}" title="Change from the scoring rules">${player.adj > 1 ? '+' : '−'}${Math.abs(Math.round((player.adj - 1) * 100))}%</span>` : '';
      return `<tr${mine ? ' class="is-mine"' : ''} data-id="${escapeHtml(player.sleeperId)}">
        <td class="tv-rank">${pos}${index + 1}</td>
        <th scope="row"><span class="tv-player">${player.sleeperId ? `<img alt="" src="https://sleepercdn.com/content/nfl/players/thumb/${escapeHtml(player.sleeperId)}.jpg" loading="lazy" decoding="async" width="32" height="32" onerror="this.style.visibility='hidden'">` : '<span class="tv-photo"></span>'}<span class="tv-name">${escapeHtml(player.name)}${mine ? '<span class="tv-mine-tag">Yours</span>' : ''}</span></span></th>
        <td>${escapeHtml(player.team)}</td>
        <td class="tv-value"><strong>${shownValue(player).toLocaleString()}</strong>${adj}</td>
        <td>${trend}</td>
        ${state.weeks.map(week => { const opp = opponent(player.team, week); return `<td class="tv-opp${opp === 'BYE' ? ' is-bye' : ''}">${escapeHtml(opp)}</td>`; }).join('')}
      </tr>`;
    }).join('');
    return `<section class="tv-section" id="tv-${pos}" aria-labelledby="tv-h-${pos}">
      <h2 id="tv-h-${pos}">${title}</h2>
      <div class="tv-card"><div class="tv-scroll" role="region" aria-label="${title} trade values. Scroll sideways for every column" tabindex="0">
        <table class="tv-table"><caption class="kt-sr-only">${title} trade values${state.week ? `, week ${state.week}` : ''}</caption>
          <thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Team</th><th scope="col">Value</th><th scope="col">30-day</th>${state.weeks.map(week => `<th scope="col">Wk ${week}</th>`).join('')}</tr></thead>
          <tbody>${rows || `<tr><td colspan="${5 + state.weeks.length}" class="tv-empty">No values yet.</td></tr>`}</tbody>
        </table></div></div>
      ${all.length > shown ? `<button class="kt-btn kt-btn-secondary tv-more" type="button" data-pos="${pos}" aria-expanded="${open}">${open ? `Show top ${shown}` : `Show all ${all.length}`}</button>` : ''}
    </section>`;
  }).join('');
}

async function load(force = false) {
  const seq = ++state.seq;
  if (!state.market) setStatus('loading');
  try {
    const format = await getActiveFormat();
    const market = await getMarket(state.mode === 'redraft' ? 'redraft' : 'dynasty', format, { force });
    if (seq !== state.seq) return;
    state.format = format;
    state.market = market;
    state.lastLoaded = Date.now();
    render();
    setStatus('live');
  } catch (_) {
    if (seq !== state.seq) return;
    setStatus('offline');
    if (!state.market) { const host = $('#tv-sections'); host.setAttribute('aria-busy', 'false'); host.innerHTML = '<p class="tv-empty">Values are reconnecting. Try again in a moment.</p>'; }
  }
}

function press(value) { $('#tv-mode').querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.v === value))); }

async function start() {
  mountNavigation({ active: 'values' });
  mountPageTransitions();
  const param = new URLSearchParams(window.location.search).get('mode');
  if (param === 'redraft' || param === 'longterm') { state.mode = param; state.modeChosen = true; press(param); }
  $('#tv-sections').innerHTML = SECTIONS.map(([, title]) => `<section class="tv-section"><h2>${title}</h2><div class="tv-card tv-skel">${'<span class="kt-skeleton"></span>'.repeat(5)}</div></section>`).join('');
  $('#tv-mode').addEventListener('click', event => {
    const button = event.target.closest('button[data-v]');
    if (!button || button.dataset.v === state.mode) return;
    state.mode = button.dataset.v; state.modeChosen = true; state.market = null; press(state.mode);
    window.history.replaceState(null, '', `${window.location.pathname}?mode=${state.mode}`);
    load();
  });
  $('#tv-sections').addEventListener('click', event => {
    const more = event.target.closest('button.tv-more');
    if (!more) return;
    if (state.open.has(more.dataset.pos)) state.open.delete(more.dataset.pos); else state.open.add(more.dataset.pos);
    render();
    if (!state.open.has(more.dataset.pos)) document.getElementById(`tv-${more.dataset.pos}`)?.scrollIntoView({ block: 'start' });
  });
  mountFormatBar($('#tv-format'), { onChange: () => load() });
  // A keeper or dynasty league opens on long-term values; a redraft league (or none) on this season's.
  if (!state.modeChosen) {
    const league = await connectedLeague();
    if (league && Number(league.settings?.type) > 0) { state.mode = 'longterm'; press('longterm'); }
  }
  await Promise.all([loadSchedule().catch(() => {}), loadRoster()]);
  await load();
  setInterval(() => { if (!document.hidden) load(true); }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - state.lastLoaded > REFRESH_MS) load(true); });
}

start();
