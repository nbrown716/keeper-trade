import { liveData } from './live-data.js';

const memory = new Map();
const CACHE_PREFIX = 'kt-ai-cache:v1:';
const ENDPOINT_KEY = 'kt-ai-endpoint:v1';
const DEFAULT_TTL = 604800000;

export class AIError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AIError';
    this.code = code;
  }
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

// The production Worker URL is public configuration (no secret). Without this default, AI only worked
// in browsers where someone had manually saved an endpoint, so real visitors never got AI features.
const DEFAULT_ENDPOINT = 'https://keeper-trade-ai.nicholas-brown00.workers.dev';

function endpoint() {
  try { return localStorage.getItem(ENDPOINT_KEY) || DEFAULT_ENDPOINT; } catch (_) { return DEFAULT_ENDPOINT; }
}

export function configureAIEndpoint(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) throw new AIError('config', 'Use your HTTPS Cloudflare Worker URL.');
  const normalized = url.replace(/\/+$/, '');
  try { localStorage.setItem(ENDPOINT_KEY, normalized); } catch (_) {}
  return normalized;
}

function cached(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_PREFIX + key));
    if (saved?.expiresAt > Date.now()) {
      memory.set(key, saved.value);
      return saved.value;
    }
  } catch (_) {}
  return null;
}

function saveCache(key, value, ttl) {
  memory.set(key, value);
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ value, expiresAt: Date.now() + ttl })); } catch (_) {}
}

function loading(feature, busy) {
  document.querySelectorAll(`[data-ai-feature="${feature}"]`).forEach(element => element.setAttribute('aria-busy', String(busy)));
  window.dispatchEvent(new CustomEvent('kt:ai-loading', { detail: { feature, busy } }));
}

async function post(feature, payload) {
  const base = endpoint();
  if (!base) throw new AIError('config', 'The AI Worker is not connected yet.');
  let response;
  try {
    response = await fetch(`${base}/ai/${feature}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (_) {
    throw new AIError('offline', 'AI is unreachable right now.');
  }
  if (!response.ok) throw new AIError('http', `AI returned HTTP ${response.status}.`);
  const data = await response.json();
  if (!data || !['ready', 'resting'].includes(data.status)) throw new AIError('response', 'AI returned an unexpected response.');
  return data;
}

export async function askAI(feature, payload, { ttl = DEFAULT_TTL, force = false } = {}) {
  const cacheKey = `${feature}:${hash(stable(payload))}`;
  const existing = force ? null : cached(cacheKey);
  if (existing) return existing;

  const sourceKey = `ai:${cacheKey}`;
  liveData.register(sourceKey, { fetcher: () => post(feature, payload), cache: false, cadence: 86400000 });
  const source = liveData.sources.get(sourceKey);
  if (force) source.data = null;
  if (source.data) return source.data;

  loading(feature, true);
  let unsubscribe;
  unsubscribe = liveData.subscribe(sourceKey, snapshot => {
    loading(feature, snapshot.status === 'loading' || snapshot.status === 'refreshing');
    if (snapshot.status === 'live' || snapshot.status === 'error') {
      if (typeof unsubscribe === 'function') unsubscribe();
    }
  });
  try {
    const result = await liveData.refresh(sourceKey);
    if (!result && source.error) throw new AIError('offline', source.error.message);
    if (result?.status === 'ready') saveCache(cacheKey, result, ttl);
    return result || { status: 'resting' };
  } finally {
    loading(feature, false);
  }
}
