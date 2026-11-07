const CACHE = 'keeper-trade-shell-v61';
const SHELL = [
  './', './index.html', './offline.html', './command.html', './game.html', './drive.html', './sunday.html', './war-room.html', './mock-draft.html', './season-sim.html', './pulse.html', './keeper.html', './redraft.html', './rankings.html', './research.html', './tools.html',
  './css/design-system.css', './css/navigation.css', './css/home.css', './css/score-ticker.css', './css/gamification.css', './css/dashboard.css', './css/league.css', './css/trade-desk.css', './css/game-day.css', './css/roast.css', './css/weather.css', './css/drive.css', './css/sunday.css', './css/mascot.css', './css/war-room.css', './css/mock-draft.css', './css/season-sim.css', './css/pulse.css',
  './manifest.json', './assets/icon.svg', './assets/icon-maskable.svg', './assets/og-image.svg', './assets/mascot-keeper.svg', './assets/apple-touch-icon.png', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png', './assets/favicon-32.png', './data/stadiums.json', './fp-data.json',
  './js/pwa.js', './js/features/home.js', './js/features/command.js', './js/features/game-day.js', './js/features/gamification.js', './js/features/dashboard.js', './js/features/league.js', './js/features/roast-card.js', './js/features/trade-desk.js', './js/features/trade-tracking.js', './js/features/research-tracking.js', './js/features/drive.js', './js/features/drive-data.js', './js/features/drive-field.js', './js/features/drive-map.js', './js/features/drive-flyover.js', './wrapped.html', './css/wrapped.css', './js/features/wrapped.js', './js/features/wrapped-slides.js', './js/data/season-stats.js', './js/data/us-map.js', './data/us-states-albers.json', './js/features/drive-cards.js', './js/features/share.js', './js/features/sunday.js', './js/features/war-room.js', './js/features/war-room-data.js', './js/features/mock-draft.js', './js/features/draft-engine.js', './js/features/draft-personalities.js', './js/features/season-sim.js', './js/features/sim.worker.js', './js/features/pulse.js', './js/features/pulse-data.js',
  './js/ui/score-ticker.js', './js/ui/navigation.js', './js/ui/command-palette.js', './js/ui/page-transitions.js', './js/ui/icons.js', './js/ui/game-link.js', './js/ui/red-zone-alert.js', './js/ui/weather-ui.js', './js/ui/win-probability.js', './js/ui/mascot.js', './js/ui/mascot-art.js', './js/ui/mascot-config.js',
  './js/data/live-data.js', './js/data/espn.js', './js/data/news.js', './js/data/player-values.js', './js/data/dynasty-dealer.js', './js/data/gamification-data.js', './js/data/sleeper.js', './js/data/player-db.js', './js/data/league-state.js', './js/data/ai.js', './js/data/weather.js', './js/data/league-connections.js', './js/data/yahoo.js', './js/ui/friendly-error.js', './js/data/replay.js', './js/features/drive-race.js', './js/features/drive-summary.js', './weather.html', './css/weather-center.css', './js/data/weather-week.js', './js/features/weather-center.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(SHELL.map(asset => cache.add(new Request(`${asset}?shell=${CACHE}`, { cache: 'reload' }))))));
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    clients.claim(),
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  ]));
});

// Same-origin static assets: stale-while-revalidate. The cached copy answers instantly (and offline),
// while a background fetch refreshes it so a deploy reaches users on their next load even if the
// CACHE version is not bumped. (Previously assets were cache-first forever, which pinned old code.)
// One cache entry per path: the same key the install step uses, so a refresh replaces the shell copy.
const assetKey = url => `${url.origin}${url.pathname}?shell=${CACHE}`;

function refreshAsset(request, url) {
  return fetch(request).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(assetKey(url), copy)).catch(() => {});
    }
    return response;
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
      }
      return response;
    }).catch(async () => {
      if (url.pathname.endsWith('/index.html')) {
        const canonicalHome = await caches.match('./', { ignoreSearch: true });
        if (canonicalHome) return canonicalHome;
      }
      return (await caches.match(request, { ignoreSearch: true })) || (await caches.match('./index.html', { ignoreSearch: true })) || caches.match('./offline.html', { ignoreSearch: true });
    }));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then(cached => {
    const network = refreshAsset(request, url);
    if (cached) {
      event.waitUntil(network.catch(() => {}));
      return cached;
    }
    return network;
  }));
});
