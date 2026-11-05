import { mountNavigation } from '../ui/navigation.js?v=2';
import { mountPageTransitions } from '../ui/page-transitions.js';
import { mountScoreTicker } from '../ui/score-ticker.js';
import { mountRedZoneAlert } from '../ui/red-zone-alert.js';
import { mountGamification } from './gamification.js';
import { mountRoastCard } from './roast-card.js?v=2';
import { mascot } from '../ui/mascot.js';
import { liveData } from '../data/live-data.js';
import { SCOREBOARD_SOURCE, normalizeGames } from '../data/espn.js';
import { dealerSource, dealerMovers } from '../data/dynasty-dealer.js';
import { getSleeperLeagueId } from '../data/sleeper.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

function waitForSource(key) {
  return new Promise(resolve => {
    let settled = false;
    let unsubscribe;
    unsubscribe = liveData.subscribe(key, snapshot => {
      if (!snapshot.data && snapshot.status !== 'error') return;
      settled = true;
      resolve(snapshot.data || null);
      if (typeof unsubscribe === 'function') unsubscribe();
    });
    if (settled && typeof unsubscribe === 'function') unsubscribe();
  });
}

export async function getNowSnapshot() {
  const dealerData = await waitForSource(dealerSource());
  const scoreboard = liveData.sources.get(SCOREBOARD_SOURCE);
  const games = normalizeGames(scoreboard?.data);
  return {
    week: games[0]?.week || 0,
    gamesInProgress: games.filter(game => game.state === 'in').length,
    status: scoreboard?.status || 'loading',
    trending: dealerMovers(dealerData, 3).map(player => ({ name: player.name, delta: player.change }))
  };
}

export async function getForYouItems() {
  if (getSleeperLeagueId()) return [
    { type: 'League Pulse', title: 'Your league has lore.', text: 'This week’s headlines, awards, Commissioner newsletter, trophies, and all-time records are ready.', badge: 'Weekly', href: 'pulse.html' },
    { type: 'Season Sim', title: 'Run the remaining season.', text: 'Ten thousand futures, live playoff odds, magic numbers, and a what-if machine built from your real schedule.', badge: '10,000×', href: 'season-sim.html' },
    { type: 'The Drive', title: 'Watch your week become a film.', text: 'Your real starters, scoring plays, stadiums, weather, and a shareable cinematic recap.', badge: 'Replay', href: 'drive.html' }
  ];
  return [
    { type: 'League', title: 'Bring your league into focus.', text: 'Connect Sleeper for standings, live matchups, storylines, playoff odds, and weekly films.', badge: 'Connect', href: 'index.html#league' },
    { type: 'Draft', title: 'The draft room has personalities.', text: 'Run a snake draft against 11 distinct AI GMs, then share every pick and grade.', badge: 'Mock draft', href: 'mock-draft.html' },
    { type: 'Market', title: 'Build a smarter watchlist.', text: 'Search any player, follow real market movement, and keep your research close to the trade desk.', badge: 'Research', href: 'research.html' }
  ];
}

function animateNumber(element, target) {
  if (reducedMotion.matches) { element.textContent = target; return; }
  const start = performance.now();
  const frame = now => {
    const progress = Math.min((now - start) / 500, 1);
    element.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3)));
    if (progress < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

async function renderNow() {
  const strip = document.querySelector('#scores');
  const snapshot = await getNowSnapshot();
  const sourceLabel = !navigator.onLine ? 'ESPN · Offline' : snapshot.status === 'stale' ? 'ESPN · Cached' : snapshot.status === 'live' ? 'ESPN · Live data' : snapshot.status === 'error' ? 'ESPN · Unavailable' : 'ESPN · Connecting';
  strip.innerHTML = `<div><div class="kt-now-label"><span class="kt-live-dot" aria-hidden="true"></span>Now</div><span class="kt-demo-label">${sourceLabel}</span></div><div class="kt-now-week"><strong>${snapshot.week ? `NFL Week ${snapshot.week}` : 'NFL Schedule'}</strong><span><b class="kt-num" id="live-game-count">0</b> games in progress</span></div><div class="kt-now-trending" aria-label="Dynasty Dealer market movers">${snapshot.trending.map(player => `<span class="kt-trend-chip"><b>${player.name}</b><span class="kt-delta${player.delta < 0 ? ' is-down' : ''}">${player.delta >= 0 ? '+' : ''}${player.delta.toFixed(1)}%</span></span>`).join('') || '<span class="kt-trend-chip">Market values updating</span>'}</div>`;
  animateNumber(document.querySelector('#live-game-count'), snapshot.gamesInProgress);
  strip.setAttribute('aria-busy', 'false');
}

async function renderFeed() {
  const feed = document.querySelector('#for-you-feed');
  const items = await getForYouItems();
  feed.innerHTML = items.map((item, index) => `<a class="kt-card kt-feed-card kt-animate-in" style="--kt-delay:${index * 40}ms" href="${item.href}"><div class="kt-feed-card-top"><span class="kt-eyebrow" style="margin:0">${item.type}</span><span class="kt-badge">${item.badge}</span></div><h3>${item.title}</h3><p>${item.text}</p><span class="kt-feed-link">Open ${item.type} <span aria-hidden="true">→</span></span></a>`).join('');
  feed.setAttribute('aria-busy', 'false');
}

function mountCardPhysics() {
  document.querySelectorAll('[data-tilt]').forEach(card => {
    card.addEventListener('pointermove', event => {
      if (!finePointer.matches || reducedMotion.matches) return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.setProperty('--kt-tilt-x', `${y * -2.2}deg`);
      card.style.setProperty('--kt-tilt-y', `${x * 2.2}deg`);
    }, { passive: true });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--kt-tilt-x', '0deg');
      card.style.setProperty('--kt-tilt-y', '0deg');
    }, { passive: true });
  });
  document.querySelectorAll('.kt-feature-card').forEach(card => {
    card.addEventListener('click', () => {
      if (window.matchMedia('(pointer:coarse)').matches && 'vibrate' in navigator) navigator.vibrate(8);
    });
  });
}

function mountLazyFeatures() {
  const slots = ['dashboard-slot', 'league-slot'];
  let loaded = false;
  const load = async () => {
    if (loaded) return;
    loaded = true;
    slots.forEach(slot => document.getElementById(slot)?.remove());
    for (const [path, mount] of [['./dashboard.js', 'mountDashboard'], ['./league.js', 'mountLeague']]) {
      try { (await import(path))[mount](); }
      catch (_) {
        const section = document.createElement('section');
        section.className = 'kt-container kt-section';
        section.innerHTML = '<div class="kt-card kt-feed-empty"><strong>This widget is catching its breath.</strong><p class="kt-muted">The rest of your command center is still ready.</p></div>';
        document.querySelector('.kt-home-footer')?.before(section);
      }
    }
  };
  if (!('IntersectionObserver' in window)) { load(); return; }
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    load();
  }, { rootMargin: '1000px 0px' });
  slots.forEach(slot => {
    const target = document.getElementById(slot);
    if (target) observer.observe(target);
  });
}

mountNavigation({ active: 'home' });
mountPageTransitions();
mountScoreTicker();
mountRedZoneAlert();
mountGamification();
mountRoastCard();
mountCardPhysics();
mascot.mountDock();
mountLazyFeatures();
renderNow().catch(() => {
  document.querySelector('#scores').innerHTML = '<span class="kt-muted">Live context is warming up. Your tools are ready.</span>';
});
window.addEventListener('kt:scores-update', event => {
  const { games, week, status } = event.detail;
  const strip = document.querySelector('#scores');
  const weekLabel = strip.querySelector('.kt-now-week strong');
  if (!weekLabel) return;
  weekLabel.textContent = week ? `NFL Week ${week}` : 'NFL Schedule';
  strip.querySelector('.kt-now-week span').innerHTML = `<b class="kt-num">${games.filter(game => game.state === 'in').length}</b> games in progress`;
  strip.querySelector('.kt-demo-label').textContent = status === 'stale' ? 'ESPN · Cached' : 'ESPN · Live data';
});
renderFeed().catch(() => {
  const feed = document.querySelector('#for-you-feed');
  feed.innerHTML = '<div class="kt-card kt-feed-empty"><span class="kt-feed-empty-icon" aria-hidden="true">KT</span><div><h3>Your feed will be back</h3><p>All calculators and research tools are still available.</p></div></div>';
  feed.setAttribute('aria-busy', 'false');
});
