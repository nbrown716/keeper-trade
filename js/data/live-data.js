// LiveData: the one shared polling/caching engine (register → subscribe/get → refresh).
//
// Storage tiers (rebuilt 2026-11-06):
// - IndexedDB (`kt-livedata` / `cache`) is the durable cache for every payload, any size.
// - localStorage keeps only a small mirror (each entry ≤ 64K chars, all entries ≤ ~1M chars) so
//   small sources can still render synchronously on first paint.
// Previously every response (ESPN game summaries are ~600K chars each) went to localStorage with
// no eviction; it filled the ~5MB quota, after which all later saves failed silently and every
// page synchronously parsed megabytes of JSON on load.
//
// Freshness: cached data younger than the source's cadence (or explicit maxAge) is used without a
// network request. Previously maxAge defaulted to 0, so every page load re-fetched everything.

const LS_PREFIX = 'kt-livedata:v1:';
const LS_ITEM_LIMIT = 64 * 1024;
const LS_TOTAL_LIMIT = 1024 * 1024;
const IDB_NAME = 'kt-livedata';
const IDB_STORE = 'cache';
const IDB_MAX_AGE = 14 * 86400000;
const FETCH_TIMEOUT = 20000;
const STALE_FALLBACK_MS = 6000;

let databasePromise;
function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise(resolve => {
    try {
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE, { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch (_) { resolve(null); }
  });
  return databasePromise;
}

async function idb(mode, action) {
  const db = await openDatabase();
  if (!db) return undefined;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(IDB_STORE, mode);
      const request = action(tx.objectStore(IDB_STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => resolve(undefined);
      tx.onabort = () => resolve(undefined);
    } catch (_) { resolve(undefined); }
  });
}

function idle(callback) {
  if ('requestIdleCallback' in window) window.requestIdleCallback(callback, { timeout: 10000 });
  else window.setTimeout(callback, 3000);
}

class LiveData {
  constructor() {
    this.sources = new Map();
    this.listeners = new Map();
    this.timers = new Map();
    this.inFlight = new Map();
    this.cachePrefix = LS_PREFIX;
    this.mirror = new Map();
    this.indexMirror();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.sources.forEach((source, key) => { if (!this.isFresh(source)) this.refresh(key); });
    });
    idle(() => this.prune());
  }

  // One-time scan of the localStorage mirror: drop oversized legacy entries and enforce the total cap.
  indexMirror() {
    try {
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(LS_PREFIX)) keys.push(key);
      }
      keys.forEach(key => {
        const raw = localStorage.getItem(key) || '';
        if (raw.length > LS_ITEM_LIMIT) { localStorage.removeItem(key); return; }
        let updatedAt = 0;
        const match = raw.match(/"updatedAt":(\d+)/);
        if (match) updatedAt = Number(match[1]);
        this.mirror.set(key, { size: raw.length, updatedAt });
      });
      this.enforceMirrorCap();
    } catch (_) {}
  }

  enforceMirrorCap() {
    let total = 0;
    this.mirror.forEach(entry => { total += entry.size; });
    if (total <= LS_TOTAL_LIMIT) return;
    [...this.mirror.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt).some(([key, entry]) => {
      try { localStorage.removeItem(key); } catch (_) {}
      this.mirror.delete(key);
      total -= entry.size;
      return total <= LS_TOTAL_LIMIT;
    });
  }

  persist(source) {
    const record = { key: source.key, data: source.data, updatedAt: source.updatedAt };
    idb('readwrite', store => store.put(record));
    const storageKey = LS_PREFIX + source.key;
    let serialized = '';
    try { serialized = JSON.stringify({ data: source.data, updatedAt: source.updatedAt }); } catch (_) {}
    try {
      if (serialized && serialized.length <= LS_ITEM_LIMIT) {
        localStorage.setItem(storageKey, serialized);
        this.mirror.set(storageKey, { size: serialized.length, updatedAt: source.updatedAt });
        this.enforceMirrorCap();
      } else if (this.mirror.has(storageKey)) {
        localStorage.removeItem(storageKey);
        this.mirror.delete(storageKey);
      }
    } catch (_) {
      // Quota pressure: free the oldest mirror entries; IndexedDB still holds this payload.
      this.mirror.delete(storageKey);
      this.enforceMirrorCap();
    }
  }

  async prune() {
    const cutoff = Date.now() - IDB_MAX_AGE;
    await idb('readwrite', store => {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (!(cursor.value?.updatedAt > cutoff)) cursor.delete();
        cursor.continue();
      };
      return request;
    });
  }

  register(key, { url, fetcher, cadence = 300000, cache = true, maxAge = null }) {
    if (this.sources.has(key)) return this.sources.get(key);
    const source = { key, url, fetcher, cadence, cache, maxAge, data: null, updatedAt: 0, status: 'loading', error: null, hydrating: null };
    if (cache) {
      try {
        const saved = JSON.parse(localStorage.getItem(LS_PREFIX + key));
        if (saved?.data && saved.updatedAt) {
          source.data = saved.data;
          source.updatedAt = saved.updatedAt;
        }
      } catch (_) {}
      if (source.data) source.status = this.isFresh(source) ? 'live' : 'stale';
      else source.hydrating = this.hydrate(source);
    }
    this.sources.set(key, source);
    this.listeners.set(key, new Set());
    return source;
  }

  async hydrate(source) {
    const record = await idb('readonly', store => store.get(source.key));
    if (record?.data && record.updatedAt && !source.data) {
      source.data = record.data;
      source.updatedAt = record.updatedAt;
      source.status = this.isFresh(source) ? 'live' : 'stale';
      this.emit(source);
    }
    source.hydrating = null;
  }

  freshFor(source) {
    if (source.maxAge) return source.maxAge;
    try { return typeof source.cadence === 'function' ? source.cadence(source.data) : source.cadence; } catch (_) { return 0; }
  }

  isFresh(source) {
    return Boolean(source.data && source.updatedAt && Date.now() - source.updatedAt < this.freshFor(source));
  }

  ensure(key) {
    const source = this.sources.get(key);
    if (!source || !this.listeners.get(key)?.size) return;
    if (this.isFresh(source)) this.schedule(source);
    else this.refresh(key);
  }

  subscribe(key, listener) {
    const source = this.sources.get(key);
    if (!source) throw new Error(`LiveData source not registered: ${key}`);
    this.listeners.get(key).add(listener);
    if (source.data) listener(this.snapshot(source));
    else listener({ ...this.snapshot(source), status: 'loading' });
    if (source.hydrating) source.hydrating.then(() => this.ensure(key));
    else this.ensure(key);
    return () => {
      this.listeners.get(key)?.delete(listener);
      if (!this.listeners.get(key)?.size) {
        clearTimeout(this.timers.get(key));
        this.timers.delete(key);
      }
    };
  }

  // One-shot read: fresh cache answers immediately; otherwise wait for the network, falling back to
  // stale cache if the request fails or is still pending after a few seconds. Resolves null when
  // nothing is available. Does not keep a polling subscription alive.
  // Mark a source stale so the next get() fetches fresh data (live loops whose timer can fire a second before
  // the cached copy expires would otherwise re-read it).
  invalidate(key) {
    const source = this.sources.get(key);
    if (source) source.updatedAt = 0;
  }

  async get(key) {
    const source = this.sources.get(key);
    if (!source) throw new Error(`LiveData source not registered: ${key}`);
    if (source.hydrating) await source.hydrating;
    if (this.isFresh(source)) return source.data;
    const request = this.refresh(key, { idle: true });
    if (!source.data) return (await request) ?? null;
    let timer;
    const fallback = new Promise(resolve => { timer = window.setTimeout(() => resolve(source.data), STALE_FALLBACK_MS); });
    const result = await Promise.race([request, fallback]);
    clearTimeout(timer);
    return result ?? source.data ?? null;
  }

  snapshot(source, statusOnly = false) {
    return { data: source.data, status: source.status, updatedAt: source.updatedAt, error: source.error, statusOnly };
  }

  emit(source, statusOnly = false) {
    const snapshot = this.snapshot(source, statusOnly);
    this.listeners.get(source.key)?.forEach(listener => {
      try { listener(snapshot); } catch (error) { console.error(`LiveData subscriber failed for ${source.key}`, error); }
    });
  }

  schedule(source) {
    clearTimeout(this.timers.get(source.key));
    if (!this.listeners.get(source.key)?.size) return;
    const age = source.updatedAt ? Date.now() - source.updatedAt : 0;
    let cadence = 300000;
    try { cadence = typeof source.cadence === 'function' ? source.cadence(source.data) : source.cadence; } catch (_) {}
    const delay = Math.max(1000, cadence - Math.max(0, age));
    this.timers.set(source.key, window.setTimeout(() => this.refresh(source.key), delay));
  }

  async refresh(key, { idle = false } = {}) {
    const source = this.sources.get(key);
    if (!source) return undefined;
    if (this.inFlight.has(key)) return this.inFlight.get(key);
    if (!idle && !this.listeners.get(key)?.size) return undefined;
    if (source.data) {
      source.status = 'refreshing';
      this.emit(source, true);
    }
    const request = (async () => {
      try {
        let data;
        if (source.fetcher) {
          data = await source.fetcher();
        } else {
          const url = typeof source.url === 'function' ? source.url() : source.url;
          const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(FETCH_TIMEOUT) : undefined;
          const response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          data = await response.json();
        }
        source.data = data;
        source.updatedAt = Date.now();
        source.status = 'live';
        source.error = null;
        if (source.cache) this.persist(source);
      } catch (error) {
        source.error = error;
        source.status = source.data ? 'stale' : 'error';
      }
      this.inFlight.delete(key);
      this.emit(source);
      this.schedule(source);
      return source.data;
    })();
    this.inFlight.set(key, request);
    return request;
  }
}

export const liveData = new LiveData();
