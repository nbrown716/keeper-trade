const FEATURES = {
  roast: {
    model: 'claude-haiku-4-5', maxTokens: 60, ratePerMinute: 10, cacheTtl: 3600,
    systemPrompt: 'You are the funny, sharp insider voice of a fantasy football keeper league. Write exactly two punchy sentences, no more than 30 words total. Roast or hype the named manager using only the supplied standings, XP, and streak data. No slurs, threats, profanity, personal attacks, or invented statistics.',
    cacheKey: payload => `${payload.leagueId || 'anonymous'}:${payload.manager}:${payload.mode}:${payload.record}:${payload.streak}:${payload.xp}`
  },
  recap: {
    model: 'claude-haiku-4-5', maxTokens: 500, ratePerMinute: 10, cacheTtl: 604800,
    systemPrompt: 'Write a concise, energetic fantasy football weekly recap using only the supplied data. Clearly label any missing context instead of inventing facts.',
    cacheKey: payload => payload.cacheKey || JSON.stringify(payload)
  },
  storylines: {
    model: 'claude-haiku-4-5', maxTokens: 900, ratePerMinute: 4, cacheTtl: 604800,
    systemPrompt: 'You are the ESPN-bottom-line voice of a fantasy football league. Use only the supplied facts. Return JSON only: {"headlines":[{"id":"SOURCE_ID","headline":"PUNCHY HEADLINE"}],"awards":[{"id":"AWARD_ID","citation":"One specific sentence"}]}. Include every supplied source and award exactly once. Headlines must be under 100 characters, energetic but never cruel, and must not add statistics, injuries, or claims. Award citations must use the supplied award facts.',
    cacheKey: payload => payload.cacheKey || JSON.stringify(payload)
  },
  'start-sit': {
    model: 'claude-haiku-4-5', maxTokens: 1600, ratePerMinute: 10, cacheTtl: 300,
    systemPrompt: 'You are a fantasy football start/sit analyst. Use only supplied roster, values, matchup, and weather data. Never invent injuries or statistics. Return JSON only in this exact shape: {"players":[{"id":"SLEEPER_ID","verdict":"START or SIT","confidence":1,"reason":"One sentence","risk":"LOW, MEDIUM, or HIGH"}]}. Include every requested player exactly once. Confidence is 1-10. Flag uncertainty instead of guessing.',
    cacheKey: payload => payload.cacheKey || JSON.stringify(payload)
  },
  waiver: {
    model: 'claude-haiku-4-5', maxTokens: 900, ratePerMinute: 5, cacheTtl: 86400,
    systemPrompt: 'You are a fantasy football waiver analyst. Use only supplied free-agent values and roster construction. Return JSON only: {"adds":[{"id":"SLEEPER_ID","blurb":"One specific sentence"}]}. Include every supplied candidate exactly once. Never invent stats, injuries, or availability.',
    cacheKey: payload => payload.cacheKey || JSON.stringify(payload)
  },
  'gm-brain': {
    model: 'claude-sonnet-4-5', maxTokens: 1800, ratePerMinute: 5, cacheTtl: 300,
    systemPrompt: 'You are a careful fantasy football general manager. Analyze only supplied offers, values, keeper-cost context, and rosters. Return JSON only: {"verdict":"ACCEPT, DECLINE, or COUNTER","reasoning":["bullet 1","bullet 2","bullet 3"],"counters":[{"sideA":["SLEEPER_ID"],"sideB":["SLEEPER_ID"],"message":"Friendly concrete message"},{"sideA":["SLEEPER_ID"],"sideB":["SLEEPER_ID"],"message":"Different friendly concrete message"}]}. Return exactly 3 bullets and 2 counters in the same order as allowedCounters. You MUST use only player IDs from allowedCounters and never invent different players, roster availability, values, league rules, or fairness scores because the original calculator computes those. sideA receives assets for the selected manager; sideB receives assets for the other manager.',
    cacheKey: payload => payload.cacheKey || JSON.stringify(payload)
  },
  'draft-round': {
    model: 'claude-haiku-4-5', maxTokens: 800, ratePerMinute: 8, cacheTtl: 604800,
    systemPrompt: 'You are simulating one round of a fantasy football snake draft. Return JSON only: {"picks":[{"team":1,"playerId":"SLEEPER_ID"}],"comments":[{"team":1,"text":"One short line"}]}. Include one pick for every AI team in the supplied order, using each personality and roster. Use only available player IDs. Do not include the human team. Reserve comments for reaches, steals, or troll moments; maximum 3 lines total. No markdown or invented stats.',
    cacheKey: payload => payload.cacheKey || JSON.stringify(payload)
  },
  'draft-grades': {
    model: 'claude-haiku-4-5', maxTokens: 1200, ratePerMinute: 5, cacheTtl: 604800,
    systemPrompt: 'Grade every fantasy draft roster using only supplied values. Return JSON only: {"grades":[{"team":1,"grade":"A+ to F","roast":"One short league-insider sentence"}]}. Include every team exactly once, including the human. Be funny without slurs, threats, or personal attacks. Do not invent stats.',
    cacheKey: payload => payload.cacheKey || JSON.stringify(payload)
  },
  newsletter: {
    model: 'claude-sonnet-4-5', maxTokens: 900, ratePerMinute: 2, cacheTtl: 604800,
    systemPrompt: 'You are The Commissioner, writing one factual weekly fantasy league newsletter. Use only supplied recaps, awards, playoff odds, power rankings, and next-week matchup facts. Return JSON only: {"title":"Factual headline","dek":"One-sentence summary","sections":[{"heading":"Section heading","paragraphs":["Short factual paragraph"]}]}. Return exactly 4 sections: recap, awards, playoff picture, and next week/power rankings. Keep the full newsletter under 400 words. Every sentence must be directly supported by supplied data. Do not evaluate skill, effort, intent, momentum, roster quality, or future outlook. Do not use superlatives unless the supplied fact explicitly says highest, lowest, biggest, closest, or a record. Never compare a score to other scores unless the exact comparison is supplied. Do not say a performance was dominant, historic, perfect, clutch, consistent, franchise-altering, or a masterclass. Do not predict fireworks, revenge, contention, playoff aspirations, or a final stretch. When playoff odds are unavailable, only state that they are unavailable; do not speculate about the postseason.',
    cacheKey: payload => payload.cacheKey || JSON.stringify(payload)
  }
};

const PRICES = {
  'claude-haiku-4-5': { input: 1.00, output: 5.00 },
  'claude-sonnet-4-5': { input: 3.00, output: 15.00 }
};

function day() { return new Date().toISOString().slice(0, 10); }
function minute() { return Math.floor(Date.now() / 60000); }

function cors(request, env) {
  const origin = request.headers.get('Origin');
  if (origin !== env.ALLOWED_ORIGIN) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Keeper-Session',
    Vary: 'Origin'
  };
}

function respond(request, env, body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(request, env), ...extra }
  });
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function cachedResponse(request, env, key) {
  const cached = await env.AI_CACHE.get(key, 'json');
  if (!cached) return null;
  return respond(request, env, { ...cached, cached: true }, 200, { 'X-Keeper-Cache': 'HIT' });
}

async function proxyESPN(request, env, url) {
  if (!cors(request, env)) return new Response('Origin not allowed', { status: 403 });
  let endpoint;
  if (url.pathname === '/espn/scoreboard') endpoint = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
  else if (url.pathname === '/espn/summary') endpoint = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';
  else if (url.pathname === '/espn/news') endpoint = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news';
  else if (url.pathname === '/espn/standings') endpoint = 'https://site.api.espn.com/apis/v2/sports/football/nfl/standings';
  else if (/^\/espn\/athletes\/\d+\/overview$/.test(url.pathname)) endpoint = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl${url.pathname.slice(5)}`;
  else if (/^\/espn\/teams\/\d+\/roster$/.test(url.pathname)) endpoint = `https://site.api.espn.com/apis/site/v2/sports/football/nfl${url.pathname.slice(5)}`;
  else return respond(request, env, { error: 'route' }, 404);
  const allowed = ['dates', 'season', 'seasontype', 'week', 'event'];
  const params = new URLSearchParams();
  allowed.forEach(key => {
    const value = url.searchParams.get(key);
    if (value && /^[a-zA-Z0-9]+$/.test(value)) params.set(key, value);
  });
  if (url.pathname === '/espn/summary' && !url.searchParams.get('event')) return respond(request, env, { error: 'event-required' }, 400);
  try {
    const upstream = await fetch(`${endpoint}?${params}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'KeeperTrade/1.0' }
    });
    if (!upstream.ok) return respond(request, env, { error: 'upstream', status: upstream.status }, 502);
    return new Response(await upstream.text(), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15', ...cors(request, env) }
    });
  } catch (_) {
    return respond(request, env, { error: 'upstream' }, 502);
  }
}

const YAHOO_API = 'https://fantasysports.yahooapis.com/fantasy/v2';
const YAHOO_OAUTH = 'https://api.login.yahoo.com/oauth2';

function yahooSession(request) {
  const session = request.headers.get('X-Keeper-Session') || '';
  return /^[A-Za-z0-9_-]{22,80}$/.test(session) ? session : '';
}

function yahooError(status, reason) {
  const error = new Error(reason);
  error.status = status;
  error.reason = reason;
  return error;
}

async function yahooTokenRequest(env, parameters) {
  const response = await fetch(`${YAHOO_OAUTH}/get_token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.YAHOO_CLIENT_ID}:${env.YAHOO_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: new URLSearchParams(parameters)
  });
  if (!response.ok) throw yahooError(401, 'yahoo-auth');
  return response.json();
}

function yahooCallbackUrl(request) {
  return `${new URL(request.url).origin}/yahoo/callback`;
}

// Best-effort, per-isolate guards. KV is not used for counting because each Yahoo league load
// is several requests and KV writes are quota-limited; the edge cache below absorbs repeats.
const YAHOO_RATE_PER_MINUTE = 40;
const yahooRate = new Map();
const yahooRefreshes = new Map();

function yahooRateLimited(session) {
  const now = minute();
  const entry = yahooRate.get(session);
  if (!entry || entry.minute !== now) {
    if (yahooRate.size > 5000) yahooRate.clear();
    yahooRate.set(session, { minute: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > YAHOO_RATE_PER_MINUTE;
}

async function refreshYahooToken(request, env, key, saved) {
  const token = await yahooTokenRequest(env, { grant_type: 'refresh_token', refresh_token: saved.refresh_token, redirect_uri: yahooCallbackUrl(request) });
  await env.AI_CACHE.put(key, JSON.stringify({
    access_token: token.access_token,
    refresh_token: token.refresh_token || saved.refresh_token,
    expires_at: Date.now() + Number(token.expires_in || 3600) * 1000,
    guid: token.xoauth_yahoo_guid || saved.guid || ''
  }), { expirationTtl: 60 * 60 * 24 * 90 });
  return token.access_token;
}

async function yahooAccessToken(request, env) {
  const session = yahooSession(request);
  if (!session) throw yahooError(400, 'session-required');
  const key = `yahoo:session:${session}`;
  const saved = await env.AI_CACHE.get(key, 'json');
  if (!saved?.refresh_token) throw yahooError(401, 'yahoo-auth-required');
  if (saved.access_token && Number(saved.expires_at) > Date.now() + 60000) return saved.access_token;
  // Parallel league requests share one refresh so a rotated refresh token is never spent twice.
  if (!yahooRefreshes.has(session)) {
    yahooRefreshes.set(session, refreshYahooToken(request, env, key, saved).finally(() => yahooRefreshes.delete(session)));
  }
  return yahooRefreshes.get(session);
}

async function yahooApi(request, env, path, { cacheSeconds = 0 } = {}) {
  const session = yahooSession(request);
  if (!session) throw yahooError(400, 'session-required');
  const edgeCache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  const cacheKey = cacheSeconds && edgeCache ? new Request(`https://yahoo-cache.keeper-trade.internal/${await digest(`${session}:${path}`)}`) : null;
  if (cacheKey) {
    const hit = await edgeCache.match(cacheKey);
    if (hit) return hit.json();
  }
  if (yahooRateLimited(session)) throw yahooError(429, 'rate-limit');
  const token = await yahooAccessToken(request, env);
  const response = await fetch(`${YAHOO_API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (response.status === 401) throw yahooError(401, 'yahoo-auth-expired');
  if (!response.ok) throw yahooError(502, 'yahoo-upstream');
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch (_) { throw yahooError(502, 'yahoo-upstream'); }
  if (cacheKey) await edgeCache.put(cacheKey, new Response(text, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${cacheSeconds}` } }));
  return data;
}

// The callback is a top-level browser navigation from Yahoo, so it must always end in a redirect
// back to the site, never a raw JSON error page.
async function handleYahooCallback(request, env, url) {
  const failed = () => Response.redirect(`${env.ALLOWED_ORIGIN}/?yahoo=error#league`, 302);
  if (!env.YAHOO_CLIENT_ID || !env.YAHOO_CLIENT_SECRET) return failed();
  try {
    const state = url.searchParams.get('state') || '';
    const code = url.searchParams.get('code') || '';
    if (!/^[0-9a-f-]{36}$/.test(state) || !code) return failed();
    const stateKey = `yahoo:state:${state}`;
    const savedState = await env.AI_CACHE.get(stateKey, 'json');
    if (!savedState?.session) return failed();
    await env.AI_CACHE.delete(stateKey);
    const token = await yahooTokenRequest(env, { grant_type: 'authorization_code', code, redirect_uri: yahooCallbackUrl(request) });
    if (!token?.access_token || !token?.refresh_token) return failed();
    await env.AI_CACHE.put(`yahoo:session:${savedState.session}`, JSON.stringify({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: Date.now() + Number(token.expires_in || 3600) * 1000,
      guid: token.xoauth_yahoo_guid || ''
    }), { expirationTtl: 60 * 60 * 24 * 90 });
    return Response.redirect(`${env.ALLOWED_ORIGIN}/?yahoo=connected#league`, 302);
  } catch (_) {
    return failed();
  }
}

async function handleYahoo(request, env, url) {
  if (request.method === 'GET' && url.pathname === '/yahoo/callback') return handleYahooCallback(request, env, url);
  if (!env.YAHOO_CLIENT_ID || !env.YAHOO_CLIENT_SECRET) return respond(request, env, { status: 'unavailable', reason: 'yahoo-config' }, 503);
  try {
    if (request.method === 'GET' && url.pathname === '/yahoo/connect') {
      const session = yahooSession(request);
      if (!session) return respond(request, env, { status: 'error', reason: 'session-required' }, 400);
      const state = crypto.randomUUID();
      await env.AI_CACHE.put(`yahoo:state:${state}`, JSON.stringify({ session }), { expirationTtl: 600 });
      const redirect_uri = yahooCallbackUrl(request);
      const auth = new URL(`${YAHOO_OAUTH}/request_auth`);
      auth.searchParams.set('client_id', env.YAHOO_CLIENT_ID);
      auth.searchParams.set('redirect_uri', redirect_uri);
      auth.searchParams.set('response_type', 'code');
      auth.searchParams.set('state', state);
      auth.searchParams.set('language', 'en-us');
      return respond(request, env, { status: 'ready', url: auth.toString() });
    }
    if (request.method === 'GET' && url.pathname === '/yahoo/leagues') {
      const data = await yahooApi(request, env, '/users;use_login=1/games;game_keys=nfl/leagues?format=json', { cacheSeconds: 60 });
      return respond(request, env, data);
    }
    if (request.method === 'GET' && url.pathname === '/yahoo/proxy') {
      const league = url.searchParams.get('league') || '';
      const resource = url.searchParams.get('resource') || '';
      const week = String(Number(url.searchParams.get('week')) || 1);
      if (!/^(?:nfl|\d{2,4})\.l\.\d+$/.test(league) || !/^\d{1,2}$/.test(week)) return respond(request, env, { status: 'error', reason: 'league' }, 400);
      // Yahoo takes week as a matrix parameter (`;week=N`); a `?week=` query is ignored upstream.
      // `rosters` returns every team's roster in one call instead of one request per team.
      const resources = {
        standings: `/league/${league}/standings`,
        scoreboard: `/league/${league}/scoreboard;week=${week}`,
        settings: `/league/${league}/settings`,
        transactions: `/league/${league}/transactions`,
        rosters: `/league/${league}/teams/roster;week=${week}`
      };
      let path = resources[resource];
      if (resource === 'roster') {
        const team = url.searchParams.get('team') || '';
        if (!/^(?:nfl|\d{2,4})\.l\.\d+\.t\.\d+$/.test(team) || team.split('.')[2] !== league.split('.')[2]) return respond(request, env, { status: 'error', reason: 'team' }, 400);
        path = `/team/${team}/roster;week=${week}`;
      }
      if (!path) return respond(request, env, { status: 'error', reason: 'resource' }, 404);
      const data = await yahooApi(request, env, `${path}?format=json`, { cacheSeconds: resource === 'settings' ? 3600 : 60 });
      return respond(request, env, data);
    }
    if (request.method === 'POST' && url.pathname === '/yahoo/disconnect') {
      const session = yahooSession(request);
      if (session) await env.AI_CACHE.delete(`yahoo:session:${session}`);
      return respond(request, env, { status: 'ready' });
    }
    return respond(request, env, { status: 'error', reason: 'route' }, 404);
  } catch (error) {
    return respond(request, env, { status: 'error', reason: error.reason || 'yahoo-upstream' }, error.status || 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/ai/stats') {
      const spend = Number(await env.AI_USAGE.get(`spend:${day()}`) || 0);
      return new Response(JSON.stringify({ date: day(), spend, cap: Number(env.DAILY_SPEND_CAP || '1'), currency: 'USD' }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (request.method === 'GET' && url.pathname.startsWith('/espn/')) return proxyESPN(request, env, url);
    if (request.method === 'GET' && url.pathname === '/yahoo/callback') return handleYahoo(request, env, url);
    if (!cors(request, env)) return new Response('Origin not allowed', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request, env) });
    if (url.pathname.startsWith('/yahoo/')) return handleYahoo(request, env, url);
    if (request.method !== 'POST' || !url.pathname.startsWith('/ai/')) {
      return respond(request, env, { status: 'resting', reason: 'route' }, 200);
    }

    const feature = url.pathname.slice(4);
    const config = FEATURES[feature];
    if (!config) return respond(request, env, { status: 'resting', reason: 'feature' }, 200);

    let payload;
    let estimatedInputTokens = 0;
    try {
      const raw = await request.text();
      if (raw.length > 12000) throw new Error('Payload too large');
      estimatedInputTokens = Math.ceil((raw.length + config.systemPrompt.length) / 3);
      payload = JSON.parse(raw);
    } catch (_) {
      return respond(request, env, { status: 'resting', reason: 'payload' }, 200);
    }

    const cacheKey = `${feature}:${await digest(config.cacheKey(payload))}`;
    const cached = await cachedResponse(request, env, cacheKey);
    if (cached) return cached;

    const league = String(payload.leagueId || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'anonymous';
    const rateKey = `rate:${feature}:${league}:${minute()}`;
    const calls = Number(await env.AI_USAGE.get(rateKey) || 0);
    if (calls >= config.ratePerMinute) return respond(request, env, { status: 'resting', reason: 'rate-limit' }, 200);
    await env.AI_USAGE.put(rateKey, String(calls + 1), { expirationTtl: 120 });

    const spendKey = `spend:${day()}`;
    const spend = Number(await env.AI_USAGE.get(spendKey) || 0);
    const cap = Number(env.DAILY_SPEND_CAP || '1');
    const price = PRICES[config.model];
    const estimatedCost = (estimatedInputTokens * price.input + config.maxTokens * price.output) / 1000000;
    if (spend >= cap || spend + estimatedCost > cap) return respond(request, env, { status: 'resting', reason: 'budget' }, 200);

    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
          ...(env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } : {})
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.maxTokens,
          system: [{ type: 'text', text: config.systemPrompt, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: JSON.stringify(payload) }]
        })
      });
      if (!upstream.ok) {
        const detail = await upstream.text();
        console.warn('Anthropic upstream error', upstream.status, detail.slice(0, 500));
        return respond(request, env, { status: 'resting', reason: 'upstream', upstreamStatus: upstream.status }, 200);
      }
      const result = await upstream.json();
      const text = (result.content || []).filter(block => block.type === 'text').map(block => block.text).join('').trim();
      if (!text) return respond(request, env, { status: 'resting', reason: 'empty' }, 200);

      const usage = result.usage || {};
      const cost = ((Number(usage.input_tokens || 0) * price.input) + (Number(usage.output_tokens || 0) * price.output)) / 1000000;
      const newSpend = spend + cost;
      const responseBody = { status: 'ready', feature, text, cached: false, createdAt: Date.now() };
      await Promise.all([
        env.AI_USAGE.put(spendKey, String(newSpend), { expirationTtl: 172800 }),
        env.AI_CACHE.put(cacheKey, JSON.stringify(responseBody), { expirationTtl: config.cacheTtl }),
        env.AI_USAGE.put(`log:${Date.now()}:${crypto.randomUUID()}`, JSON.stringify({ feature, model: config.model, usage, cost, createdAt: Date.now() }), { expirationTtl: 2592000 })
      ]);
      return respond(request, env, responseBody, 200, { 'X-Keeper-Cache': 'MISS' });
    } catch (_) {
      return respond(request, env, { status: 'resting', reason: 'upstream' }, 200);
    }
  }
};
