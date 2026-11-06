const CACHE = 'keeper-trade-shell-v53';
const SHELL = [
  './', './index.html', './offline.html', './command.html', './game.html', './drive.html', './sunday.html', './war-room.html', './mock-draft.html', './season-sim.html', './pulse.html', './keeper.html', './redraft.html', './rankings.html', './research.html', './tools.html',
  './css/design-system.css', './css/navigation.css', './css/home.css', './css/score-ticker.css', './css/gamification.css', './css/dashboard.css', './css/league.css', './css/trade-desk.css', './css/game-day.css', './css/roast.css', './css/weather.css', './css/drive.css', './css/sunday.css', './css/mascot.css', './css/war-room.css', './css/mock-draft.css', './css/season-sim.css', './css/pulse.css',
  './manifest.json', './assets/icon.svg', './assets/icon-maskable.svg', './assets/og-image.svg', './assets/mascot-keeper.svg', './data/stadiums.json', './fp-data.json',
  './js/pwa.js', './js/features/home.js', './js/features/command.js', './js/features/game-day.js', './js/features/gamification.js', './js/features/dashboard.js', './js/features/league.js', './js/features/roast-card.js', './js/features/trade-desk.js', './js/features/trade-tracking.js', './js/features/research-tracking.js', './js/features/drive.js', './js/features/drive-data.js', './js/features/drive-field.js', './js/features/drive-map.js', './js/features/drive-cards.js', './js/features/share.js', './js/features/sunday.js', './js/features/war-room.js', './js/features/war-room-data.js', './js/features/mock-draft.js', './js/features/draft-engine.js', './js/features/draft-personalities.js', './js/features/season-sim.js', './js/features/sim.worker.js', './js/features/pulse.js', './js/features/pulse-data.js',
  './js/ui/score-ticker.js', './js/ui/navigation.js', './js/ui/command-palette.js', './js/ui/page-transitions.js', './js/ui/icons.js', './js/ui/game-link.js', './js/ui/red-zone-alert.js', './js/ui/weather-ui.js', './js/ui/win-probability.js', './js/ui/mascot.js', './js/ui/mascot-art.js', './js/ui/mascot-config.js',
  './js/data/live-data.js', './js/data/espn.js', './js/data/news.js', './js/data/player-values.js', './js/data/dynasty-dealer.js', './js/data/gamification-data.js', './js/data/sleeper.js', './js/data/player-db.js', './js/data/league-state.js', './js/data/ai.js', './js/data/weather.js'
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

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
      return response;
    }).catch(async () => (await caches.match(request, { ignoreSearch: true })) || (await caches.match('./index.html', { ignoreSearch: true })) || caches.match('./offline.html', { ignoreSearch: true })));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
