class LiveData {
  constructor() {
    this.sources = new Map();
    this.listeners = new Map();
    this.timers = new Map();
    this.inFlight = new Map();
    this.cachePrefix = 'kt-livedata:v1:';
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.sources.forEach((source, key) => { if (!this.isFresh(source)) this.refresh(key); });
    });
  }

  register(key, { url, fetcher, cadence = 300000, cache = true, maxAge = 0 }) {
    if (this.sources.has(key)) return this.sources.get(key);
    const source = { key, url, fetcher, cadence, cache, maxAge, data: null, updatedAt: 0, status: 'loading', error: null };
    if (cache) {
      try {
        const saved = JSON.parse(localStorage.getItem(this.cachePrefix + key));
        if (saved?.data && saved.updatedAt) {
          source.data = saved.data;
          source.updatedAt = saved.updatedAt;
          source.status = 'stale';
        }
      } catch (_) {}
    }
    this.sources.set(key, source);
    this.listeners.set(key, new Set());
    return source;
  }

  isFresh(source) {
    return Boolean(source.maxAge && source.data && Date.now() - source.updatedAt < source.maxAge);
  }

  subscribe(key, listener) {
    const source = this.sources.get(key);
    if (!source) throw new Error(`LiveData source not registered: ${key}`);
    this.listeners.get(key).add(listener);
    if (source.data) listener(this.snapshot(source));
    else listener({ ...this.snapshot(source), status: 'loading' });
    if (!this.isFresh(source)) this.refresh(key);
    else this.schedule(source);
    return () => {
      this.listeners.get(key)?.delete(listener);
      if (!this.listeners.get(key)?.size) {
        clearTimeout(this.timers.get(key));
        this.timers.delete(key);
      }
    };
  }

  snapshot(source) {
    return { data: source.data, status: source.status, updatedAt: source.updatedAt, error: source.error };
  }

  emit(source) {
    const snapshot = this.snapshot(source);
    this.listeners.get(source.key)?.forEach(listener => {
      try { listener(snapshot); } catch (error) { console.error(`LiveData subscriber failed for ${source.key}`, error); }
    });
  }

  schedule(source) {
    clearTimeout(this.timers.get(source.key));
    if (!this.listeners.get(source.key)?.size) return;
    const delay = typeof source.cadence === 'function' ? source.cadence(source.data) : source.cadence;
    this.timers.set(source.key, window.setTimeout(() => this.refresh(source.key), delay));
  }

  async refresh(key) {
    const source = this.sources.get(key);
    if (!source || this.inFlight.has(key) || !this.listeners.get(key)?.size) return this.inFlight.get(key);
    if (source.data) {
      source.status = 'refreshing';
      this.emit(source);
    }
    const request = (async () => {
      try {
        let data;
        if (source.fetcher) {
          data = await source.fetcher();
        } else {
          const url = typeof source.url === 'function' ? source.url() : source.url;
          const response = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          data = await response.json();
        }
        source.data = data;
        source.updatedAt = Date.now();
        source.status = 'live';
        source.error = null;
        if (source.cache) {
          try { localStorage.setItem(this.cachePrefix + key, JSON.stringify({ data, updatedAt: source.updatedAt })); } catch (_) {}
        }
      } catch (error) {
        source.error = error;
        source.status = source.data ? 'stale' : 'error';
      }
      this.emit(source);
      this.schedule(source);
      this.inFlight.delete(key);
      return source.data;
    })();
    this.inFlight.set(key, request);
    return request;
  }
}

export const liveData = new LiveData();
