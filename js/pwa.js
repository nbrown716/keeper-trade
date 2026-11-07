const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let originalTitle = document.title;
let commissionerClicks = 0;
let sequence = [];
const konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

function toast(message) {
  const region = document.createElement('div');
  region.className = 'kt-toast-region';
  region.setAttribute('aria-live', 'polite');
  region.innerHTML = `<div class="kt-toast kt-toast-success" role="status">${message}</div>`;
  document.body.appendChild(region);
  window.setTimeout(() => region.remove(), 5000);
}

function commissionerMode() {
  document.body.classList.add('kt-commissioner-mode');
  toast('Commissioner mode unlocked. Vetoes are not a strategy.');
  if (!reducedMotion.matches && window.matchMedia('(pointer: coarse)').matches && 'vibrate' in navigator && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate([20, 30, 40]);
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {}));
}

window.addEventListener('kt:scores-update', event => {
  const live = event.detail.games.filter(game => game.state === 'in');
  if (!live.length) { document.title = originalTitle; return; }
  const game = live.sort((a, b) => Math.abs(a.away.score - a.home.score) - Math.abs(b.away.score - b.home.score))[0];
  document.title = `${game.away.abbreviation} ${game.away.score}–${game.home.score} ${game.home.abbreviation} · Keeper Trade`;
});

window.addEventListener('kt:command', () => { originalTitle = document.title; });
document.addEventListener('keydown', event => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  sequence = [...sequence, key].slice(-konami.length);
  if (sequence.every((value, index) => value === konami[index])) commissionerMode();
});
document.querySelector('.kt-site-brand')?.addEventListener('click', event => {
  if (!event.altKey) { commissionerClicks = 0; return; }
  commissionerClicks += 1;
  if (commissionerClicks === 3) commissionerMode();
});
