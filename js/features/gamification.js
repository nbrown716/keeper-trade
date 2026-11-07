import { levels, badgeDefinitions, triviaBank } from '../data/gamification-data.js';
import { liveData } from '../data/live-data.js';
import { SCOREBOARD_SOURCE, normalizeGames, scoreboardDate } from '../data/espn.js';
import { getSleeperLeagueId, getNflState, getLeagueBundle, leagueUsers, rosterOwner, rosterPoints } from '../data/sleeper.js';

const STORAGE_KEY = 'kt-gamification:v1';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let state;
let games = [];
let lastScoreData;
let clubhouse;
let celebration;
let celebrationQueue = [];
let celebrationOpen = false;
let wrappedCanvas;
let countdownTimer;
let leagueRecords;

function defaults() {
  return {
    version: 1,
    xp: 0,
    manager: '',
    createdAt: Date.now(),
    streak: { count: 0, lastClaim: '', freezeWeek: '' },
    actions: { trade: 0, compare: 0, pickemCorrect: 0, trivia: 0, scores: 0, research: 0, upset: 0, nightOwl: 0, earlyBird: 0 },
    trivia: { date: '', correct: null, streak: 0 },
    picks: {},
    badges: [],
    stats: { pages: {}, boldestCall: 'Still waiting for your signature move' },
    preferences: { sound: false }
  };
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function cleanText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function cleanPicks(saved) {
  const picks = {};
  Object.entries(record(saved)).slice(0, 60).forEach(([week, entry]) => {
    const source = record(entry);
    const games = {};
    Object.entries(record(source.games)).slice(0, 20).forEach(([id, selection]) => {
      const pick = record(selection);
      if (!['string', 'number'].includes(typeof pick.teamId)) return;
      games[id] = { teamId: String(pick.teamId), confidence: Math.max(1, Math.min(16, Math.floor(cleanNumber(pick.confidence, 1)))) };
    });
    picks[week] = { games, locked: source.locked === true, graded: source.graded === true, points: cleanNumber(source.points), correct: Math.floor(cleanNumber(source.correct)) };
  });
  return picks;
}

function migrate(saved) {
  const base = defaults();
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return base;
  const streak = record(saved.streak);
  const actions = record(saved.actions);
  const trivia = record(saved.trivia);
  const stats = record(saved.stats);
  const preferences = record(saved.preferences);
  return {
    version: 1,
    xp: cleanNumber(saved.xp),
    manager: cleanText(saved.manager).slice(0, 24),
    createdAt: cleanNumber(saved.createdAt, base.createdAt),
    streak: { count: Math.floor(cleanNumber(streak.count)), lastClaim: cleanText(streak.lastClaim), freezeWeek: cleanText(streak.freezeWeek) },
    actions: Object.fromEntries(Object.keys(base.actions).map(key => [key, Math.floor(cleanNumber(actions[key]))])),
    trivia: { date: cleanText(trivia.date), correct: typeof trivia.correct === 'boolean' ? trivia.correct : null, streak: Math.floor(cleanNumber(trivia.streak)) },
    picks: cleanPicks(saved.picks),
    badges: Array.isArray(saved.badges) ? [...new Set(saved.badges.filter(id => badgeDefinitions.some(badge => badge.id === id)))] : [],
    stats: { pages: Object.fromEntries(Object.entries(record(stats.pages)).slice(0, 100).map(([page, count]) => [page, Math.floor(cleanNumber(count))])), boldestCall: cleanText(stats.boldestCall, base.stats.boldestCall) },
    preferences: { sound: preferences.sound === true }
  };
}

function load() {
  if (state) return state;
  try { state = migrate(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch (_) { state = defaults(); }
  return state;
}

function save(render = true) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  updateRewardNav();
  evaluateBadges();
  if (render && clubhouse) renderClubhouse();
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayGap(from, to) {
  return Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);
}

function weekKey(date = new Date()) {
  const first = new Date(date.getFullYear(), 0, 1);
  return `${date.getFullYear()}-W${String(Math.ceil(((date - first) / 86400000 + first.getDay() + 1) / 7)).padStart(2, '0')}`;
}

function levelFor(xp) {
  return levels.reduce((current, level) => xp >= level.xp ? level : current, levels[0]);
}

function nextLevel() {
  return levels.find(level => level.xp > state.xp) || levels.at(-1);
}

function claimDay() {
  const today = dateKey();
  if (state.streak.lastClaim === today) return false;
  const previous = state.streak.lastClaim;
  const gap = previous ? dayGap(previous, today) : 0;
  if (!previous || gap > 2) state.streak.count = 1;
  else if (gap === 2) {
    if (state.streak.freezeWeek !== weekKey()) {
      state.streak.freezeWeek = weekKey();
      state.streak.count += 1;
      celebrate('Streak saved', 'Your weekly Streak Freeze covered the missed day. Keep the run alive.', '❄');
    } else state.streak.count = 1;
  } else state.streak.count += 1;
  state.streak.lastClaim = today;
  if ([7, 30, 100].includes(state.streak.count)) celebrate(`${state.streak.count}-day streak`, 'You made Keeper Trade part of the daily game plan. That is franchise behavior.', '🔥', true);
  return true;
}

function flyingXp(amount) {
  const nav = document.querySelector('.kt-reward-nav');
  if (!nav || reducedMotion.matches) return;
  const particle = document.createElement('span');
  particle.className = 'kt-xp-particle';
  particle.textContent = `+${amount} XP`;
  nav.appendChild(particle);
  window.setTimeout(() => particle.remove(), 1200);
}

let rewardAudio;
function playRewardSound() {
  if (!state.preferences.sound) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    // One shared context: browsers cap live AudioContexts, and a new one per reward was never closed.
    rewardAudio = rewardAudio || new AudioContext();
    const context = rewardAudio;
    if (context.state === 'suspended') context.resume();
    [440, 660].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      gain.connect(context.destination);
      gain.gain.setValueAtTime(0.04, context.currentTime + index * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + index * 0.09 + 0.16);
      oscillator.start(context.currentTime + index * 0.09);
      oscillator.stop(context.currentTime + index * 0.09 + 0.17);
    });
  } catch (_) {}
}

function rewardFeedback(amount) {
  flyingXp(amount);
  if (window.matchMedia('(pointer: coarse)').matches && !reducedMotion.matches && 'vibrate' in navigator && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate([20, 35, 35]);
  playRewardSound();
}

function awardXp(amount) {
  state.xp += amount;
  rewardFeedback(amount);
}

export function trackAction(type, detail = {}) {
  load();
  const claimed = claimDay();
  const xp = type === 'checkin' ? (claimed ? 10 : 0) : ({ trade: 50, compare: 15, pickemCorrect: 25, trivia: 25 }[type] || 0);
  if (type in state.actions) state.actions[type] += 1;
  const hour = new Date().getHours();
  if (hour < 2) state.actions.nightOwl += 1;
  if (hour >= 5 && hour < 7) state.actions.earlyBird += 1;
  if (detail.page) state.stats.pages[detail.page] = (state.stats.pages[detail.page] || 0) + 1;
  if (xp) awardXp(xp);
  save();
}

export function getGamificationState() {
  return structuredClone(load());
}

function evaluateBadges() {
  const unlocked = badgeDefinitions.filter(badge => !state.badges.includes(badge.id) && badge.test(state));
  unlocked.forEach(badge => {
    state.badges.push(badge.id);
    celebrate('Badge unlocked', badge.name, badge.icon, false, badge.description);
  });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}

function updateRewardNav() {
  const nav = document.querySelector('.kt-reward-nav');
  if (!nav) return;
  const level = levelFor(state.xp);
  const next = nextLevel();
  const previous = levels[levels.indexOf(level) - 1]?.xp || 0;
  const progress = level === next ? 100 : (state.xp - previous) / (next.xp - previous) * 100;
  nav.querySelector('.kt-reward-streak').textContent = state.streak.count;
  nav.querySelector('.kt-reward-level').textContent = level.name;
  nav.querySelector('.kt-reward-xp').textContent = `${state.xp} XP`;
  nav.querySelector('.kt-reward-progress').style.width = `${Math.min(100, Math.max(0, progress))}%`;
  nav.setAttribute('aria-label', `${state.streak.count}-day streak, ${state.xp} XP, ${level.name}. Open clubhouse.`);
}

function celebrate(title, subtitle, icon = '★', milestone = false, description = '') {
  window.dispatchEvent(new CustomEvent('kt:gamification', { detail: { title, subtitle, milestone, description } }));
  celebrationQueue.push({ title, subtitle, icon, milestone, description });
  if (!celebrationOpen) showNextCelebration();
}

function showNextCelebration() {
  if (!celebration || !celebrationQueue.length) { celebrationOpen = false; return; }
  const reward = celebrationQueue.shift();
  celebrationOpen = true;
  celebration.querySelector('.kt-celebration-icon').textContent = reward.icon;
  celebration.querySelector('h2').textContent = reward.title;
  celebration.querySelector('.kt-celebration-subtitle').textContent = reward.subtitle;
  celebration.querySelector('.kt-celebration-description').textContent = reward.description;
  celebration.querySelector('.kt-celebration-image').hidden = true;
  celebration.querySelector('.kt-celebration-download').hidden = !reward.milestone;
  celebration.hidden = false;
  document.body.style.overflow = 'hidden';
  celebration.querySelector('.kt-celebration-close').focus();
  if (!reducedMotion.matches) {
    const container = celebration.querySelector('.kt-celebration-confetti');
    container.innerHTML = Array.from({ length: 28 }, (_, index) => `<i style="--i:${index};--x:${(index * 37) % 100}%;--r:${(index * 47) % 360}deg"></i>`).join('');
  }
}

function closeCelebration() {
  if (!celebration) return;
  celebration.hidden = true;
  document.body.style.removeProperty('overflow');
  celebrationOpen = false;
  window.setTimeout(showNextCelebration, reducedMotion.matches ? 0 : 180);
}

function triviaForToday() {
  return triviaBank[Math.floor(Date.now() / 86400000) % triviaBank.length];
}

function triviaMarkup() {
  const trivia = triviaForToday();
  const answered = state.trivia.date === dateKey();
  return `<section class="kt-club-card kt-trivia-card"><div class="kt-club-card-head"><span class="kt-eyebrow">Daily trivia</span><span class="kt-badge kt-badge-blue">${state.trivia.streak} day streak</span></div><h3>${escapeHtml(trivia.question)}</h3><div class="kt-trivia-answers">${trivia.answers.map((answer, index) => `<button class="kt-trivia-answer" type="button" data-trivia="${index}" ${answered ? 'disabled' : ''} ${answered && index === trivia.answer ? 'data-correct="true"' : ''}>${escapeHtml(answer)}</button>`).join('')}</div>${answered ? `<p class="kt-trivia-result">${state.trivia.correct ? 'Correct. Your playbook is looking sharp.' : `Not this time. The answer is ${escapeHtml(trivia.answers[trivia.answer])}.`}</p>` : '<p class="kt-muted">One question. One shot. +25 XP when you nail it.</p>'}</section>`;
}

function currentPickWeek() {
  return `${scoreboardDate()}-${games[0]?.week || 'schedule'}`;
}

function picksForWeek() {
  return state.picks[currentPickWeek()] || { games: {}, locked: false, graded: false, points: 0, correct: 0 };
}

function countdown(game) {
  const difference = new Date(game.date) - Date.now();
  if (difference <= 0) return 'Locked';
  const days = Math.floor(difference / 86400000);
  const hours = Math.floor(difference % 86400000 / 3600000);
  const minutes = Math.floor(difference % 3600000 / 60000);
  return days ? `Locks in ${days}d ${hours}h` : `Locks in ${hours}h ${minutes}m`;
}

function gradePicks() {
  const week = currentPickWeek();
  const picks = picksForWeek();
  if (!picks.locked || picks.graded || !games.length || games.some(game => game.state !== 'post')) return;
  picks.games = picks.games || {};
  picks.correct = 0;
  picks.points = 0;
  games.forEach(game => {
    const pick = picks.games[game.id];
    if (!pick) return;
    const pickedHome = String(pick.teamId) === String(game.home.id);
    const won = pickedHome ? game.home.score > game.away.score : game.away.score > game.home.score;
    if (won) {
      picks.correct += 1;
      picks.points += Number(pick.confidence || 1);
      state.actions.pickemCorrect += 1;
      if (!pickedHome) state.actions.upset += 1;
    }
  });
  picks.graded = true;
  state.picks[week] = picks;
  if (picks.points) awardXp(picks.points);
  state.stats.boldestCall = picks.correct ? `${picks.correct} correct calls with ${picks.points} confidence points` : state.stats.boldestCall;
}

async function loadLeagueRecords() {
  const leagueId = getSleeperLeagueId();
  if (!leagueId) { leagueRecords = null; return; }
  try {
    const nfl = await getNflState();
    const week = Number(nfl?.display_week || nfl?.week || 1);
    const current = await getLeagueBundle(leagueId, week);
    const users = leagueUsers(current.users);
    const selectedId = Number(localStorage.getItem('kt-drive-manager:v1')) || current.rosters[0]?.roster_id;
    const selected = current.rosters.find(roster => roster.roster_id === selectedId) || current.rosters[0];
    const selectedMatchup = current.matchups.find(matchup => matchup.roster_id === selected?.roster_id);
    const opponent = current.matchups.find(matchup => matchup.matchup_id === selectedMatchup?.matchup_id && matchup.roster_id !== selected?.roster_id);
    const history = await Promise.all(Array.from({ length: Math.max(0, week - 1) }, (_, index) => getLeagueBundle(leagueId, index + 1)));
    const result = { wins: 0, losses: 0, ties: 0 };
    history.forEach(bundle => {
      const self = bundle.matchups.find(matchup => matchup.roster_id === selected?.roster_id);
      const other = bundle.matchups.find(matchup => matchup.matchup_id === self?.matchup_id && matchup.roster_id !== selected?.roster_id);
      if (!self || !other) return;
      if (Number(self.points) > Number(other.points)) result.wins += 1;
      else if (Number(self.points) < Number(other.points)) result.losses += 1;
      else result.ties += 1;
    });
    leagueRecords = {
      standings: current.rosters.map(roster => ({ id: roster.roster_id, name: rosterOwner(roster, users), points: rosterPoints(roster.settings), wins: Number(roster.settings?.wins || 0), losses: Number(roster.settings?.losses || 0), ties: Number(roster.settings?.ties || 0) })).sort((a, b) => b.wins - a.wins || b.points - a.points),
      selectedId: selected?.roster_id,
      selectedName: selected ? rosterOwner(selected, users) : 'Your manager',
      opponentName: opponent ? rosterOwner(current.rosters.find(roster => roster.roster_id === opponent.roster_id), users) : 'No opponent yet',
      ...result
    };
    if (clubhouse) renderClubhouse();
  } catch (_) { leagueRecords = null; }
}

function pickemMarkup() {
  const week = currentPickWeek();
  const picks = picksForWeek();
  state.picks[week] = picks;
  picks.games ||= {};
  gradePicks();
  const upcoming = games.filter(game => game.state === 'pre');
  const completed = games.filter(game => game.state === 'post');
  const leaderboard = leagueRecords ? leagueRecords.standings.map(row => ({
    ...row,
    record: `${row.wins}–${row.losses}${row.ties ? `–${row.ties}` : ''}`,
    local: row.id === leagueRecords.selectedId
  })) : [{ name: state.manager || 'You', points: picks.points || 0, record: `${picks.correct || 0}–${Math.max(0, completed.length - (picks.correct || 0))}`, local: true }];
  const sourceLabel = leagueRecords ? 'Sleeper · actual records' : 'Local pick’em';
  const headToHead = leagueRecords
    ? `<p><strong>${escapeHtml(leagueRecords.selectedName)}</strong> vs ${escapeHtml(leagueRecords.opponentName)}</p><span>${leagueRecords.wins}–${leagueRecords.losses}${leagueRecords.ties ? `–${leagueRecords.ties}` : ''} head-to-head · actual Sleeper record</span>`
    : '<p>Connect Sleeper for real head-to-head records.</p><span>Pick’em selections and points stay on this device.</span>';
  return `<section class="kt-club-card kt-pickem-card"><div class="kt-club-card-head"><div><span class="kt-eyebrow">Weekly pick’em</span><h3>Confidence is currency.</h3></div><span class="kt-badge kt-badge-blue">${sourceLabel}</span></div>${upcoming.length ? `<div class="kt-pick-list">${upcoming.map(game => {
    const pick = picks.games[game.id] || {};
    const locked = picks.locked || new Date(game.date) <= new Date();
    return `<article class="kt-pick-game"><div class="kt-pick-kickoff" data-kickoff="${escapeHtml(game.date)}">${locked ? 'Locked' : countdown(game)}</div><div class="kt-pick-teams"><button class="kt-pick-team" type="button" data-pick-game="${game.id}" data-team-id="${game.away.id}" aria-pressed="${String(pick.teamId) === String(game.away.id)}" ${locked ? 'disabled' : ''}>${escapeHtml(game.away.abbreviation)}</button><span>at</span><button class="kt-pick-team" type="button" data-pick-game="${game.id}" data-team-id="${game.home.id}" aria-pressed="${String(pick.teamId) === String(game.home.id)}" ${locked ? 'disabled' : ''}>${escapeHtml(game.home.abbreviation)}</button></div><label>Confidence <select data-confidence-game="${game.id}" ${locked ? 'disabled' : ''}>${Array.from({ length: 16 }, (_, index) => `<option value="${index + 1}" ${Number(pick.confidence) === index + 1 ? 'selected' : ''}>${index + 1}</option>`).join('')}</select></label></article>`;
  }).join('')}</div><button class="kt-btn kt-btn-primary" type="button" id="lock-picks" ${picks.locked ? 'disabled' : ''}>${picks.locked ? 'Picks locked' : 'Lock weekly picks'}</button>` : `<div class="kt-pick-results"><strong>${picks.graded ? `${picks.correct} correct · ${picks.points} points` : 'This week is in the books'}</strong><p class="kt-muted">${picks.graded ? 'Your graded picks and confidence points are locked into the local leaderboard.' : 'Completed games lock automatically. Make your picks before kickoff next week.'}</p></div>`}<div class="kt-pickem-lower"><div><h4>League leaderboard</h4><table><thead><tr><th>Manager</th><th>Points</th><th>H2H</th></tr></thead><tbody>${leaderboard.map(row => `<tr${row.local ? ' class="is-you"' : ''}><td>${escapeHtml(row.name)}</td><td>${Number(row.points).toFixed(1)}</td><td>${escapeHtml(row.record)}</td></tr>`).join('')}</tbody></table></div><div class="kt-manager-record"><h4>Head-to-head</h4>${headToHead}</div></div></section>`;
}

function badgesMarkup() {
  return `<section class="kt-club-card kt-badges-card"><div class="kt-club-card-head"><span class="kt-eyebrow">Trophy case</span><span class="kt-badge">${state.badges.length} / ${badgeDefinitions.length}</span></div><div class="kt-badge-grid">${badgeDefinitions.map(badge => {
    const unlocked = state.badges.includes(badge.id);
    return `<div class="kt-trophy${unlocked ? ' is-unlocked' : ''}" title="${escapeHtml(badge.description)}"><span>${unlocked ? badge.icon : '◆'}</span><strong>${escapeHtml(badge.name)}</strong><small>${unlocked ? escapeHtml(badge.description) : 'Locked'}</small></div>`;
  }).join('')}</div></section>`;
}

function favoritePage() {
  const pages = Object.entries(state.stats.pages).sort((a, b) => b[1] - a[1]);
  return pages[0]?.[0] || 'Home';
}

function buildWrappedCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 1066;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 600, 1066);
  gradient.addColorStop(0, '#111827');
  gradient.addColorStop(1, '#070b12');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 600, 1066);
  context.fillStyle = '#c6ff4a';
  context.beginPath();
  context.arc(520, 100, 180, 0, Math.PI * 2);
  context.globalAlpha = 0.1;
  context.fill();
  context.globalAlpha = 1;
  context.font = '700 28px Arial';
  context.fillText('KEEPER TRADE', 50, 80);
  context.fillStyle = '#f4f7fb';
  context.font = '800 68px Arial';
  context.fillText('YOUR SEASON', 50, 190);
  context.fillText('IN REVIEW', 50, 265);
  context.fillStyle = '#a9b7cc';
  context.font = '24px Arial';
  context.fillText(state.manager || 'The front office', 50, 320);
  const stats = [
    ['LEVEL', levelFor(state.xp).name],
    ['TOTAL XP', state.xp.toLocaleString()],
    ['TRADES GRADED', state.actions.trade],
    ['CORRECT PICKS', state.actions.pickemCorrect],
    ['DAILY STREAK', `${state.streak.count} days`],
    ['FAVORITE PAGE', favoritePage()]
  ];
  stats.forEach(([label, value], index) => {
    const y = 410 + index * 82;
    context.fillStyle = '#8190a8';
    context.font = '700 17px Arial';
    context.fillText(label, 50, y);
    context.fillStyle = index % 2 ? '#f4f7fb' : '#c6ff4a';
    context.font = '700 36px Arial';
    context.fillText(String(value), 50, y + 42);
  });
  context.fillStyle = '#8190a8';
  context.font = '700 17px Arial';
  context.fillText('BOLDEST CALL', 50, 930);
  context.fillStyle = '#f4f7fb';
  context.font = '24px Arial';
  const text = state.stats.boldestCall;
  context.fillText(text.length > 36 ? `${text.slice(0, 36)}…` : text, 50, 970);
  context.fillStyle = '#8190a8';
  context.font = '18px Arial';
  context.fillText('Built for the win.', 50, 1020);
  return canvas;
}

function showWrapped() {
  wrappedCanvas = buildWrappedCanvas();
  const image = celebration.querySelector('.kt-celebration-image');
  image.src = wrappedCanvas.toDataURL('image/png');
  image.hidden = false;
  celebration.querySelector('.kt-celebration-icon').textContent = '★';
  celebration.querySelector('h2').textContent = 'Your Season in Review';
  celebration.querySelector('.kt-celebration-subtitle').textContent = 'A front-office year worth framing.';
  celebration.querySelector('.kt-celebration-description').textContent = 'Download your story card and share it with the league.';
  celebration.querySelector('.kt-celebration-download').hidden = false;
  celebration.hidden = false;
  celebrationOpen = true;
  document.body.style.overflow = 'hidden';
  celebration.querySelector('.kt-celebration-close').focus();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function renderClubhouse() {
  const level = levelFor(state.xp);
  const next = nextLevel();
  const start = levels[levels.indexOf(level) - 1]?.xp || 0;
  const progress = level === next ? 100 : (state.xp - start) / (next.xp - start) * 100;
  clubhouse.innerHTML = `<div class="kt-section-header"><div><span class="kt-eyebrow">The clubhouse</span><h2 class="kt-display">Show up. Level up.</h2></div><span class="kt-badge kt-badge-accent">${state.streak.count} day streak</span></div><section class="kt-club-card kt-level-card"><div class="kt-level-summary"><div><span class="kt-eyebrow">${escapeHtml(state.manager || 'Your front office')}</span><h3>${escapeHtml(level.name)}</h3><p>${state.xp.toLocaleString()} XP · ${level === next ? 'Top of the mountain' : `${next.xp - state.xp} XP to ${escapeHtml(next.name)}`}</p></div><div class="kt-level-flame" aria-hidden="true">🔥<strong>${state.streak.count}</strong></div></div><div class="kt-level-track"><span style="width:${Math.min(100, Math.max(0, progress))}%"></span></div>${!state.manager ? '<form class="kt-manager-form" id="manager-form"><label for="manager-name">Claim your manager name</label><div><input class="kt-control" id="manager-name" maxlength="24" required placeholder="e.g. Nick"><button class="kt-btn kt-btn-primary" type="submit">Claim</button></div></form>' : ''}<div class="kt-freeze-status">❄ ${state.streak.freezeWeek === weekKey() ? 'Streak Freeze used this week' : '1 Streak Freeze available this week'}</div></section><div class="kt-club-grid">${triviaMarkup()}<section class="kt-club-card kt-wrapped-card"><span class="kt-eyebrow">Season Wrapped</span><h3>Your story, in story form.</h3><p class="kt-muted">Turn your trades, picks, streaks, and favorite destinations into a shareable season card.</p><button class="kt-btn kt-btn-primary" type="button" id="generate-wrapped">Generate my Wrapped</button><label class="kt-sound-toggle"><input type="checkbox" id="reward-sound" ${state.preferences.sound ? 'checked' : ''}> Reward sounds <span>Off by default</span></label></section>${pickemMarkup()}${badgesMarkup()}</div>`;
  clubhouse.querySelector('#manager-form')?.addEventListener('submit', event => {
    event.preventDefault();
    state.manager = clubhouse.querySelector('#manager-name').value.trim();
    if (state.manager) save();
  });
  clubhouse.querySelectorAll('[data-trivia]').forEach(button => button.addEventListener('click', () => {
    const trivia = triviaForToday();
    const correct = Number(button.dataset.trivia) === trivia.answer;
    state.trivia.date = dateKey();
    state.trivia.correct = correct;
    state.trivia.streak = correct ? state.trivia.streak + 1 : 0;
    if (correct) trackAction('trivia');
    else { claimDay(); save(); }
  }));
  clubhouse.querySelectorAll('[data-pick-game]').forEach(button => button.addEventListener('click', () => {
    const picks = picksForWeek();
    picks.games[button.dataset.pickGame] = { teamId: button.dataset.teamId, confidence: Number(clubhouse.querySelector(`[data-confidence-game="${button.dataset.pickGame}"]`)?.value || 1) };
    state.picks[currentPickWeek()] = picks;
    claimDay();
    save();
  }));
  clubhouse.querySelectorAll('[data-confidence-game]').forEach(select => select.addEventListener('change', () => {
    const picks = picksForWeek();
    picks.games[select.dataset.confidenceGame] = { ...picks.games[select.dataset.confidenceGame], confidence: Number(select.value) };
    state.picks[currentPickWeek()] = picks;
    save(false);
  }));
  clubhouse.querySelector('#lock-picks')?.addEventListener('click', () => {
    const picks = picksForWeek();
    if (!Object.keys(picks.games).length) return;
    picks.locked = true;
    state.picks[currentPickWeek()] = picks;
    claimDay();
    save();
  });
  clubhouse.querySelector('#generate-wrapped').addEventListener('click', showWrapped);
  clubhouse.querySelector('#reward-sound').addEventListener('change', event => {
    state.preferences.sound = event.target.checked;
    save(false);
  });
  clearInterval(countdownTimer);
  countdownTimer = window.setInterval(() => {
    clubhouse.querySelectorAll('[data-kickoff]').forEach(element => {
      const game = games.find(item => item.date === element.dataset.kickoff);
      if (game) element.textContent = countdown(game);
    });
  }, 60000);
}

function mountCelebration() {
  document.body.insertAdjacentHTML('beforeend', '<div class="kt-celebration" hidden role="dialog" aria-modal="true" aria-labelledby="kt-celebration-title"><div class="kt-celebration-confetti" aria-hidden="true"></div><section class="kt-celebration-card"><button class="kt-btn kt-btn-ghost kt-icon-btn kt-celebration-close" type="button" aria-label="Close celebration">×</button><div class="kt-celebration-icon" aria-hidden="true">★</div><h2 id="kt-celebration-title">Reward unlocked</h2><p class="kt-celebration-subtitle"></p><p class="kt-celebration-description"></p><img class="kt-celebration-image" alt="Your downloadable Keeper Trade season summary" hidden><div class="kt-celebration-actions"><button class="kt-btn kt-btn-primary kt-celebration-share" type="button">Share</button><button class="kt-btn kt-celebration-download" type="button" hidden>Download image</button><button class="kt-btn kt-btn-ghost kt-celebration-skip" type="button">Skip</button></div></section></div>');
  celebration = document.querySelector('.kt-celebration');
  celebration.querySelector('.kt-celebration-close').addEventListener('click', closeCelebration);
  celebration.querySelector('.kt-celebration-skip').addEventListener('click', () => { celebrationQueue = []; closeCelebration(); });
  celebration.querySelector('.kt-celebration-share').addEventListener('click', async () => {
    const shareData = { title: 'Keeper Trade', text: `${state.manager || 'I'} reached ${levelFor(state.xp).name} with ${state.xp} XP and a ${state.streak.count}-day streak on Keeper Trade.`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
    } catch (_) {}
  });
  celebration.querySelector('.kt-celebration-download').addEventListener('click', () => {
    const canvas = wrappedCanvas || buildWrappedCanvas();
    const link = document.createElement('a');
    link.download = `keeper-trade-wrapped-${dateKey()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !celebration.hidden) closeCelebration();
    if (event.key === 'Tab' && !celebration.hidden) {
      const buttons = [...celebration.querySelectorAll('button:not([hidden])')];
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
}

export function mountGamification() {
  load();
  const actions = document.querySelector('.kt-header-actions');
  if (actions && !document.querySelector('.kt-reward-nav')) {
    actions.insertAdjacentHTML('afterbegin', '<a class="kt-reward-nav" href="index.html#clubhouse"><span class="kt-reward-fire">🔥<b class="kt-reward-streak">0</b></span><span class="kt-reward-copy"><strong class="kt-reward-level">Water Boy</strong><span class="kt-reward-xp">0 XP</span><i><em class="kt-reward-progress"></em></i></span></a>');
  }
  if (!clubhouse) {
    clubhouse = document.createElement('section');
    clubhouse.className = 'kt-container kt-section kt-clubhouse';
    clubhouse.id = 'clubhouse';
    clubhouse.setAttribute('aria-label', 'Keeper Trade clubhouse');
    const footer = document.querySelector('.kt-home-footer');
    if (footer) footer.before(clubhouse);
  }
  mountCelebration();
  updateRewardNav();
  trackAction('checkin', { page: document.body.classList.contains('kt-home') ? 'Home' : document.title });
  liveData.subscribe(SCOREBOARD_SOURCE, ({ data }) => {
    if (!data || data === lastScoreData) return;
    lastScoreData = data;
    games = normalizeGames(data);
    if (games.length && state.actions.scores === 0) trackAction('scores');
    if (clubhouse) renderClubhouse();
  });
  loadLeagueRecords();
  window.addEventListener('kt:action', event => trackAction(event.detail.type, event.detail));
}
