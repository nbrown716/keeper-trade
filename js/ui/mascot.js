import { MASCOT_CONFIG } from './mascot-config.js';
import { mascotArt } from './mascot-art.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const mounted = new Set();
const bubbleTimers = new WeakMap();
const SPEECH_KEY = 'kt-mascot-speech:v1';
let currentState = 'idle';
let dwellTimer;
let observer;
let eventsBound = false;
let serial = 0;

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function speak(state, explicit) {
  let saved = { date: dayKey(), count: 0 };
  try {
    const stored = JSON.parse(localStorage.getItem(SPEECH_KEY));
    if (stored?.date === dayKey() && Number.isInteger(stored.count) && stored.count >= 0) saved = stored;
  } catch (_) {}
  if (saved.count >= 2) return;
  const lines = MASCOT_CONFIG.copy[state] || MASCOT_CONFIG.copy.idle;
  const message = explicit || lines[saved.count % lines.length];
  saved.count += 1;
  try { localStorage.setItem(SPEECH_KEY, JSON.stringify(saved)); } catch (_) {}
  mounted.forEach(element => {
    const bubble = element.querySelector('.kt-mascot-bubble');
    clearTimeout(bubbleTimers.get(element));
    bubble.textContent = message;
    bubble.hidden = false;
    bubbleTimers.set(element, window.setTimeout(() => { bubble.hidden = true; }, 3600));
  });
}

function syncMotion(element) {
  const staticMode = reducedMotion.matches;
  element.dataset.motion = staticMode ? 'static' : 'animated';
  element.querySelector('img').hidden = !staticMode;
  element.querySelector('.kt-mascot-art').toggleAttribute('hidden', staticMode);
}

function observe(element) {
  if (!('IntersectionObserver' in window)) {
    element.dataset.visible = 'true';
    return;
  }
  if (!observer) {
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { entry.target.dataset.visible = String(entry.isIntersecting); });
    }, { rootMargin: '100px' });
  }
  observer.observe(element);
}

export const mascot = {
  mount(element) {
    if (!element || element.dataset.mascotMounted) return element;
    element.dataset.mascotMounted = 'true';
    element.classList.add('kt-mascot');
    element.dataset.state = currentState;
    element.innerHTML = `<button class="kt-mascot-button" type="button" aria-label="Talk to The Keeper"><img src="assets/mascot-keeper.svg" alt="The Keeper, your fantasy league character" width="180" height="180">${mascotArt(`kt-mascot-${serial++}`)}<span class="kt-mascot-zz" aria-hidden="true">Zzz</span><span class="kt-mascot-think" aria-hidden="true"><i>•</i><i>•</i><i>•</i></span></button><div class="kt-mascot-bubble" role="status" hidden></div>`;
    const button = element.querySelector('.kt-mascot-button');
    button.addEventListener('click', () => {
      this.setState('celebrating', { dwell: 2800, silent: true });
      speak('easter');
    });
    button.addEventListener('pointermove', event => {
      if (reducedMotion.matches || event.pointerType === 'touch') return;
      const rect = button.getBoundingClientRect();
      button.style.setProperty('--kt-look-x', `${((event.clientX - rect.left) / rect.width - 0.5) * 7}px`);
      button.style.setProperty('--kt-look-y', `${((event.clientY - rect.top) / rect.height - 0.5) * 5}px`);
    }, { passive: true });
    button.addEventListener('pointerleave', () => {
      button.style.setProperty('--kt-look-x', '0px');
      button.style.setProperty('--kt-look-y', '0px');
    }, { passive: true });
    mounted.add(element);
    syncMotion(element);
    observe(element);
    return element;
  },

  mountDock() {
    let dock = document.querySelector('.kt-mascot-dock');
    if (!dock) {
      dock = document.createElement('aside');
      dock.className = 'kt-mascot-dock';
      dock.setAttribute('aria-label', 'The Keeper mascot');
      document.body.append(dock);
    }
    return this.mount(dock);
  },

  setState(name, { dwell = 3200, message = '', silent = false } = {}) {
    if (!MASCOT_CONFIG.states.includes(name)) name = 'idle';
    currentState = name;
    clearTimeout(dwellTimer);
    mounted.forEach(element => { element.dataset.state = name; });
    if (!silent && name !== 'idle') speak(name, message);
    if (dwell > 0 && name !== 'idle') {
      dwellTimer = window.setTimeout(() => this.setState('idle', { dwell: 0, silent: true }), dwell);
    }
  },

  trigger(name) {
    if (!MASCOT_CONFIG.states.includes(name)) return;
    this.setState(name, { dwell: name === 'idle' ? 0 : 2800, silent: true });
  }
};

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;
  window.addEventListener('kt:gamification', () => mascot.setState('celebrating'));
  window.addEventListener('kt:ai-loading', event => mascot.setState(event.detail?.busy ? 'thinking' : 'idle', { silent: true }));
  window.addEventListener('kt:drive-finale', event => mascot.setState(event.detail?.result === 'W' ? 'happy' : 'devastated', { dwell: 4200 }));
  window.addEventListener('kt:player-score', () => mascot.setState('happy', { dwell: 2800 }));
  window.addEventListener('kt:trade-verdict', event => mascot.setState(event.detail?.lopsided ? 'judging' : 'happy', { dwell: 3600 }));
  window.addEventListener('kt:playoff-clinch', () => mascot.setState('hype', { dwell: 4200 }));
  window.addEventListener('kt:scores-update', event => {
    const games = event.detail?.games || [];
    if (games.some(game => game.state === 'in' && game.redZone)) mascot.setState('nervous', { dwell: 3600, silent: true });
    else if (!games.length && [2, 3, 4, 5, 6, 7, 8].includes(new Date().getMonth() + 1)) mascot.setState('sleeping', { dwell: 0, silent: true });
  });
}
bindEvents();

reducedMotion.addEventListener('change', () => mounted.forEach(syncMotion));
