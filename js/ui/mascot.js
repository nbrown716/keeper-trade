import { MASCOT_CONFIG } from './mascot-config.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const mounted = new Set();
const instances = new Map();
const SPEECH_KEY = 'kt-mascot-speech:v1';
let currentState = 'idle';
let dwellTimer;
let observer;
let runtimePromise;
let eventsBound = false;

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function speak(state, explicit) {
  let saved = { date: dayKey(), count: 0 };
  try {
    const stored = JSON.parse(localStorage.getItem(SPEECH_KEY));
    if (stored?.date === dayKey()) saved = stored;
  } catch (_) {}
  if (saved.count >= 2) return;
  const lines = MASCOT_CONFIG.copy[state] || MASCOT_CONFIG.copy.idle;
  const message = explicit || lines[saved.count % lines.length];
  saved.count += 1;
  try { localStorage.setItem(SPEECH_KEY, JSON.stringify(saved)); } catch (_) {}
  mounted.forEach(element => {
    const bubble = element.querySelector('.kt-mascot-bubble');
    bubble.textContent = message;
    bubble.hidden = false;
    window.setTimeout(() => { bubble.hidden = true; }, 3600);
  });
}

function applyInput(instance, name, fire = false) {
  if (!instance || !window.rive) return;
  const definition = MASCOT_CONFIG.states[name];
  if (!definition) return;
  try {
    const inputs = instance.stateMachineInputs(MASCOT_CONFIG.stateMachine);
    if (definition.type === 'trigger' || fire) {
      const input = inputs.find(item => item.name === definition.input);
      if (input?.fire) input.fire();
      return;
    }
    Object.entries(MASCOT_CONFIG.states).forEach(([state, config]) => {
      if (config.type !== 'boolean') return;
      const input = inputs.find(item => item.name === config.input);
      if (input) input.value = state === name;
    });
  } catch (_) {}
}

function loadRuntime() {
  if (runtimePromise) return runtimePromise;
  runtimePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = MASCOT_CONFIG.runtime;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  return runtimePromise;
}

async function mountRive(element) {
  if (instances.has(element) || reducedMotion.matches) return;
  try {
    const response = await fetch(MASCOT_CONFIG.asset, { method: 'HEAD' });
    if (!response.ok || response.headers.get('Content-Type')?.includes('text/html')) return;
    await loadRuntime();
    if (!window.rive || instances.has(element) || reducedMotion.matches) return;
    const canvas = element.querySelector('canvas');
    const instance = new window.rive.Rive({
      src: MASCOT_CONFIG.asset,
      canvas,
      stateMachines: MASCOT_CONFIG.stateMachine,
      fit: window.rive.Fit.Contain,
      onLoad: () => {
        instance.resizeDrawingSurfaceToCanvas();
        element.querySelector('img').hidden = true;
        canvas.hidden = false;
        element.dataset.rive = 'ready';
        applyInput(instance, currentState);
      },
      onLoadError: () => { element.dataset.rive = 'fallback'; }
    });
    instances.set(element, instance);
    element.dataset.rive = 'loading';
  } catch (_) {
    element.dataset.rive = 'fallback';
  }
}

function observe(element) {
  if (!observer) {
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) mountRive(entry.target);
      });
    }, { rootMargin: '200px' });
  }
  observer.observe(element);
}

export const mascot = {
  mount(element) {
    if (!element || element.dataset.mascotMounted) return element;
    element.dataset.mascotMounted = 'true';
    element.classList.add('kt-mascot');
    element.dataset.state = currentState;
    element.innerHTML = `<button class="kt-mascot-button" type="button" aria-label="Talk to The Keeper"><img src="assets/mascot-keeper.svg" alt="The Keeper, your fantasy league character" width="180" height="180"><canvas width="320" height="320" hidden aria-label="The Keeper animated mascot"></canvas><span class="kt-mascot-zz" aria-hidden="true">Zzz</span><span class="kt-mascot-think" aria-hidden="true">•••</span></button><div class="kt-mascot-bubble" role="status" hidden></div>`;
    element.querySelector('.kt-mascot-button').addEventListener('click', () => {
      this.setState('celebrating', { dwell: 2800, silent: true });
      speak('easter');
    });
    mounted.add(element);
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
    if (!MASCOT_CONFIG.states[name]) name = 'idle';
    currentState = name;
    clearTimeout(dwellTimer);
    mounted.forEach(element => { element.dataset.state = name; });
    instances.forEach(instance => applyInput(instance, name));
    if (!silent && name !== 'idle') speak(name, message);
    if (dwell > 0 && name !== 'idle') {
      dwellTimer = window.setTimeout(() => this.setState('idle', { dwell: 0, silent: true }), dwell);
    }
  },

  trigger(name) {
    if (!MASCOT_CONFIG.states[name]) return;
    instances.forEach(instance => applyInput(instance, name, true));
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

const resizeObserver = new ResizeObserver(entries => {
  entries.forEach(entry => instances.get(entry.target)?.resizeDrawingSurfaceToCanvas());
});
mounted.forEach(element => resizeObserver.observe(element));
const originalMount = mascot.mount;
mascot.mount = function (element) {
  const mountedElement = originalMount.call(this, element);
  if (mountedElement) resizeObserver.observe(mountedElement);
  return mountedElement;
};

reducedMotion.addEventListener('change', () => {
  mounted.forEach(element => {
    const ready = !reducedMotion.matches && instances.has(element);
    element.dataset.rive = reducedMotion.matches ? 'fallback' : ready ? 'ready' : '';
    element.querySelector('img').hidden = ready;
    element.querySelector('canvas').hidden = !ready;
    if (ready) applyInput(instances.get(element), currentState);
    else if (!reducedMotion.matches) mountRive(element);
  });
});
