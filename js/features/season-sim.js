import { getSleeperLeagueId, getNflState, getLeagueBundle, leagueUsers, rosterOwner, rosterPoints } from '../data/sleeper.js';
import { friendlyError } from '../ui/friendly-error.js';
import { dealerSource, normalizeDealerPlayers } from '../data/dynasty-dealer.js';
import { liveData } from '../data/live-data.js';
import { mountNavigation } from '../ui/navigation.js';

let season;
let worker;
let overrides = {};
let baselineResults = new Map();
let matchupSignature = '';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

// One-shot read: fresh cache or a fresh network result (stale cache only as a fallback).
function waitForSource(key) {
  return liveData.get(key);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values) {
  const mean = average(values);
  return Math.sqrt(average(values.map(value => (value - mean) ** 2)));
}

function signature(matchups) {
  return JSON.stringify(matchups.map(matchup => [matchup.roster_id, matchup.matchup_id, matchup.points]));
}

async function loadSeason() {
  const id = getSleeperLeagueId();
  if (!id) throw new Error('Connect Sleeper to simulate your season.');
  const state = await getNflState();
  const week = state.display_week || state.week || 1;
  const [bundle, dealerData] = await Promise.all([getLeagueBundle(id, week), waitForSource(dealerSource())]);
  const playoffStart = Number(bundle.league.settings?.playoff_start_week || 15);
  const history = await Promise.all(Array.from({ length: Math.max(0, week - 1) }, (_, index) => getLeagueBundle(id, index + 1)));
  const remaining = await Promise.all(Array.from({ length: Math.max(0, playoffStart - week) }, (_, index) => getLeagueBundle(id, week + index)));
  const dealer = new Map(normalizeDealerPlayers(dealerData).map(player => [String(player.id), player.value]));
  const users = leagueUsers(bundle.users);
  const rosterValues = new Map(bundle.rosters.map(roster => [roster.roster_id, (roster.players || []).reduce((sum, id) => sum + (dealer.get(String(id)) || 0), 0)]));
  const averageRosterValue = average([...rosterValues.values()]);
  const averagePPG = average(bundle.rosters.map(roster => rosterPoints(roster.settings) / Math.max(1, (roster.settings?.wins || 0) + (roster.settings?.losses || 0) + (roster.settings?.ties || 0))));
  const teams = bundle.rosters.map(roster => {
    const recent = history.slice(-3).flatMap(weekData => weekData.matchups.filter(matchup => matchup.roster_id === roster.roster_id).map(matchup => Number(matchup.points || 0)));
    const played = (roster.settings?.wins || 0) + (roster.settings?.losses || 0) + (roster.settings?.ties || 0);
    const ppg = rosterPoints(roster.settings) / Math.max(1, played);
    const last3 = recent.length ? average(recent) : ppg;
    const rosterValue = rosterValues.get(roster.roster_id) || 0;
    const rosterPrior = averageRosterValue ? averagePPG * rosterValue / averageRosterValue : averagePPG;
    return {
      id: roster.roster_id,
      name: rosterOwner(roster, users),
      wins: Number(roster.settings?.wins || 0),
      losses: Number(roster.settings?.losses || 0),
      ties: Number(roster.settings?.ties || 0),
      pointsFor: rosterPoints(roster.settings),
      // Strength blends season PPG (50%), last-three PPG (30%), and normalized roster value (20%).
      strength: 0.5 * ppg + 0.3 * last3 + 0.2 * rosterPrior,
      rosterValue
    };
  });
  const schedule = remaining.flatMap((weekData, index) => weekData.matchups.flatMap(matchup => {
    const opponent = weekData.matchups.find(other => other.matchup_id === matchup.matchup_id && other.roster_id !== matchup.roster_id);
    if (!opponent || matchup.roster_id > opponent.roster_id) return [];
    return [{ week: week + index, homeId: matchup.roster_id, awayId: opponent.roster_id }];
  }));
  const pointSamples = history.flatMap(weekData => weekData.matchups.map(matchup => Number(matchup.points || 0)));
  const playoffTeams = Number(bundle.league.settings?.playoff_teams || 6);
  const playoffByes = Number(bundle.league.settings?.playoff_byes ?? Math.max(0, 2 ** Math.ceil(Math.log2(playoffTeams)) - playoffTeams));
  return {
    id,
    week,
    league: bundle.league,
    teams,
    schedule,
    playoffTeams,
    playoffByes,
    // Weekly variance comes from real league scores, constrained to avoid unstable tiny/huge samples.
    variance: Math.max(12, Math.min(35, standardDeviation(pointSamples) || 22)),
    seed: 2026 + week,
    simulations: 10000,
    magicSimulations: 200,
    matchupSignature: signature(bundle.matchups)
  };
}

function storageKey() {
  return `kt-season-sim:v1:${season.id}`;
}

function previousResults() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch (_) { return {}; }
}

function setCount(element, value) {
  const token = Symbol('count');
  element.countToken = token;
  const start = Number(element.dataset.value || 0);
  element.dataset.value = String(value);
  if (reducedMotion.matches) {
    element.textContent = `${(value * 100).toFixed(1)}%`;
    return;
  }
  const started = performance.now();
  function frame(now) {
    if (element.countToken !== token) return;
    const progress = Math.min(1, (now - started) / 400);
    const eased = 1 - (1 - progress) ** 3;
    element.textContent = `${((start + (value - start) * eased) * 100).toFixed(1)}%`;
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function rowMarkup(team, managerId) {
  return `<article class="kt-season-row${team.id === managerId ? ' is-manager' : ''}" data-team-id="${team.id}"><div class="kt-season-team"><span class="kt-season-seed" aria-label="Likely playoff seed range">${escapeHtml(team.seedRange)}</span><div><strong>${escapeHtml(team.name)}</strong><small><span data-record>${team.recordBand}</span> wins projected · <span data-losses>${team.lossBand}</span> losses</small></div></div><div class="kt-season-prob"><div class="kt-season-bar" aria-hidden="true"><span style="transform:scaleX(${team.playoff})"></span></div><strong class="kt-num" data-playoff data-value="${team.playoff}">${(team.playoff * 100).toFixed(1)}%</strong><small>playoffs</small></div><div class="kt-season-champ"><strong class="kt-num" data-championship data-value="${team.championship}">${(team.championship * 100).toFixed(1)}%</strong><small>championship</small></div><div class="kt-season-magic"><strong data-magic>${team.magicNumber === null ? '—' : team.magicNumber}</strong><small>wins to 90%</small></div><div class="kt-season-movement" data-movement></div></article>`;
}

function render(results, meta, isBaseline) {
  const previous = previousResults();
  const managerId = Number(document.querySelector('#season-manager').value) || season.teams[0]?.id;
  const ordered = results.slice().sort((a, b) => (a.id === managerId ? -1 : b.id === managerId ? 1 : b.playoff - a.playoff));
  const board = document.querySelector('#season-board');
  if (board.querySelectorAll('.kt-season-row').length !== ordered.length) board.innerHTML = ordered.map(team => rowMarkup(team, managerId)).join('');
  const positions = new Map([...board.children].map(row => [row.dataset.teamId, row.getBoundingClientRect()]));

  ordered.forEach((team, index) => {
    const row = board.querySelector(`[data-team-id="${team.id}"]`);
    const clinch = team.playoff >= 0.995;
    const eliminated = team.playoff <= 0.005;
    const comparison = isBaseline
      ? (previous.week < season.week ? previous.probabilities?.[team.id] : undefined)
      : baselineResults.get(team.id);
    const delta = comparison === undefined ? null : (team.playoff - comparison) * 100;
    row.classList.toggle('is-manager', team.id === managerId);
    row.classList.toggle('is-clinched', clinch);
    row.classList.toggle('is-eliminated', eliminated);
    row.style.setProperty('--kt-row-index', index);
    row.querySelector('.kt-season-team strong').textContent = team.name;
    row.querySelector('.kt-season-seed').textContent = team.seedRange;
    row.querySelector('[data-record]').textContent = team.recordBand;
    row.querySelector('[data-losses]').textContent = team.lossBand;
    row.querySelector('.kt-season-bar span').style.transform = `scaleX(${team.playoff})`;
    setCount(row.querySelector('[data-playoff]'), team.playoff);
    setCount(row.querySelector('[data-championship]'), team.championship);
    row.querySelector('[data-magic]').textContent = team.magicNumber === null ? '—' : team.magicNumber;
    const movement = row.querySelector('[data-movement]');
    movement.textContent = clinch ? '✓ CLINCHED' : eliminated ? '× ELIMINATED' : delta === null || Math.abs(delta) < 0.05 ? '—' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}%`;
    movement.classList.toggle('is-positive', delta > 0);
    movement.classList.toggle('is-negative', delta < 0);
    board.append(row);
  });

  if (!reducedMotion.matches) ordered.forEach(team => {
    const row = board.querySelector(`[data-team-id="${team.id}"]`);
    const before = positions.get(String(team.id));
    if (!before) return;
    const distance = before.top - row.getBoundingClientRect().top;
    if (distance) row.animate([{ transform: `translateY(${distance}px)` }, { transform: 'translateY(0)' }], { duration: 400, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });

  document.querySelector('#season-meta').textContent = `${meta.simulations.toLocaleString()} simulations · ${meta.elapsed}ms worker time · seed ${meta.seed}${isBaseline ? '' : ' · what-if'}`;
  if (isBaseline) {
    baselineResults = new Map(results.map(team => [team.id, team.playoff]));
    try {
      const history = { ...(previous.history || {}), [season.week]: Object.fromEntries(baselineResults) };
      localStorage.setItem(storageKey(), JSON.stringify({ week: season.week, probabilities: Object.fromEntries(baselineResults), history }));
    } catch (_) {}
  }
}

function runSimulation(nextOverrides = {}) {
  if (!season) return;
  overrides = nextOverrides;
  const isBaseline = Object.keys(overrides).length === 0;
  worker?.terminate();
  const board = document.querySelector('#season-board');
  board.setAttribute('aria-busy', 'true');
  document.querySelector('#season-meta').textContent = `Running ${season.simulations.toLocaleString()} futures…`;
  worker = new Worker('js/features/sim.worker.js', { type: 'module' });
  worker.onmessage = event => {
    render(event.data.results, event.data, isBaseline);
    board.setAttribute('aria-busy', 'false');
  };
  worker.onerror = () => {
    document.querySelector('#season-meta').textContent = 'Simulation could not finish. Try again.';
    board.setAttribute('aria-busy', 'false');
  };
  worker.postMessage({
    teams: season.teams,
    schedule: season.schedule,
    playoffTeams: season.playoffTeams,
    playoffByes: season.playoffByes,
    variance: season.variance,
    seed: season.seed,
    simulations: season.simulations,
    magicSimulations: season.magicSimulations,
    ...overrides
  });
}

function scenario(type) {
  const managerId = Number(document.querySelector('#season-manager').value) || season.teams[0]?.id;
  const rivalId = Number(document.querySelector('#season-rival').value) || season.teams.find(team => team.id !== managerId)?.id;
  const week = season.week;
  if (type === 'winOut') return { winOutId: managerId };
  if (type === 'loseWeek') return { lossId: managerId, lossWeek: week };
  if (type === 'rivalTwice') return { rivalLossesId: rivalId, rivalLossesThroughWeek: week + 1 };
  return {};
}

function selectScenario(type) {
  document.querySelectorAll('[data-scenario]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scenario === type)));
  runSimulation(scenario(type));
}

async function init() {
  try {
    season = await loadSeason();
    matchupSignature = season.matchupSignature;
    const managerId = Number(localStorage.getItem('kt-drive-manager:v1')) || season.teams[0]?.id;
    document.querySelector('#season-manager').innerHTML = season.teams.map(team => `<option value="${team.id}" ${team.id === managerId ? 'selected' : ''}>${escapeHtml(team.name)}</option>`).join('');
    document.querySelector('#season-rival').innerHTML = season.teams.filter(team => team.id !== managerId).map(team => `<option value="${team.id}">${escapeHtml(team.name)}</option>`).join('');
    document.querySelector('#season-league').textContent = `${season.league.name} · Week ${season.week} · ${season.playoffTeams} playoff teams · ${season.playoffByes} byes`;
    runSimulation();
    liveData.subscribe(`sleeper-matchups:${season.id}:${season.week}`, snapshot => {
      if (!snapshot.data || signature(snapshot.data) === matchupSignature) return;
      matchupSignature = signature(snapshot.data);
      loadSeason().then(nextSeason => {
        season = nextSeason;
        matchupSignature = season.matchupSignature;
        runSimulation(overrides);
      }).catch(() => {});
    });
  } catch (error) {
    document.querySelector('#season-meta').textContent = 'Season Sim is waiting for a league.';
    document.querySelector('#season-board').setAttribute('aria-busy', 'false');
    document.querySelector('#season-board').innerHTML = `<div class="kt-season-error"><h2>${escapeHtml(friendlyError(error, 'Season Sim could not reach your league right now.'))}</h2><a class="kt-btn kt-btn-primary" href="index.html#league">Connect league</a></div>`;
  }
}

document.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => selectScenario(button.dataset.scenario)));
document.querySelector('#season-rival').addEventListener('change', () => selectScenario('rivalTwice'));
document.querySelector('#season-manager').addEventListener('change', event => {
  try { localStorage.setItem('kt-drive-manager:v1', event.target.value); } catch (_) {}
  const managerId = Number(event.target.value);
  const rival = document.querySelector('#season-rival');
  const previousRival = Number(rival.value);
  rival.innerHTML = season.teams.filter(team => team.id !== managerId).map(team => `<option value="${team.id}">${escapeHtml(team.name)}</option>`).join('');
  if (previousRival !== managerId) rival.value = String(previousRival);
  selectScenario('reset');
});
mountNavigation({ active: 'sim' });
init();
