"""Worker /votes routes, run in a browser against an in-memory KV (no deploy needed): origin check, input
validation, counting, re-vote replaces (no double counting), per-device dedupe, rate limit."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio
from playwright.async_api import async_playwright
import matrix as M
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)

JS = r"""(async () => {
  const mod = await import('./worker/worker.js');
  const store = new Map();
  const kv = { async get(k, t) { const v = store.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, async put(k, v) { store.set(k, v); }, async delete(k) { store.delete(k); } };
  const env = { ALLOWED_ORIGIN: 'https://keeper-trade.pages.dev', AI_CACHE: kv, AI_USAGE: kv };
  const call = async (method, path, body, origin = env.ALLOWED_ORIGIN) => {
    const headers = new Headers({ 'Content-Type': 'application/json' }); if (origin) headers.set('Origin', origin);
    const req = { method, url: 'https://w.example' + path, headers, text: async () => body ? JSON.stringify(body) : '' };
    const res = await mod.default.fetch(req, env);
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const out = {};
  out.badOrigin = (await call('GET', '/votes?league=1370223929452433408&trades=123456789', null, 'https://evil.example')).status;
  const v1 = 'a'.repeat(20), v2 = 'b'.repeat(20);
  out.first = (await call('POST', '/votes', { league: '1370223929452433408', trade: '1234567890', pick: 'A', voter: v1 })).json;
  out.second = (await call('POST', '/votes', { league: '1370223929452433408', trade: '1234567890', pick: 'B', voter: v2 })).json;
  out.revote = (await call('POST', '/votes', { league: '1370223929452433408', trade: '1234567890', pick: 'E', voter: v1 })).json;
  out.same = (await call('POST', '/votes', { league: '1370223929452433408', trade: '1234567890', pick: 'E', voter: v1 })).json;
  out.get = (await call('GET', '/votes?league=1370223929452433408&trades=1234567890,9999999999')).json;
  out.badPick = (await call('POST', '/votes', { league: '1370223929452433408', trade: '1234567890', pick: 'Z', voter: v1 })).json;
  out.badLeague = (await call('POST', '/votes', { league: 'drop table', trade: '1234567890', pick: 'A', voter: v1 })).json;
  let last = null; for (let i = 0; i < 32; i++) last = await call('POST', '/votes', { league: '1370223929452433408', trade: '1234567891', pick: 'A', voter: 'c'.repeat(20) });
  out.rate = last.status;
  out.rawVoterStored = [...store.keys()].some(k => k.includes(v1));
  return out;
})()"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context()).new_page()
        await pg.goto(M.BASE + 'offline.html'); r = await pg.evaluate(JS); await b.close()
    check(r['badOrigin'] == 403, f'other origins are refused ({r["badOrigin"]})')
    check(r['first']['counts'] == {'A': 1, 'E': 0, 'B': 0} and r['second']['counts'] == {'A': 1, 'E': 0, 'B': 1}, f'votes count ({r["second"]["counts"]})')
    check(r['revote']['counts'] == {'A': 0, 'E': 1, 'B': 1} and r['same']['counts'] == {'A': 0, 'E': 1, 'B': 1}, f're-voting replaces; repeating the same vote never double counts ({r["same"]["counts"]})')
    check(r['get']['status'] == 'ok' and r['get']['counts']['1234567890'] == {'A': 0, 'E': 1, 'B': 1} and r['get']['counts']['9999999999'] == {'A': 0, 'E': 0, 'B': 0}, 'GET returns counts for many trades at once')
    check(r['badPick']['status'] == 'resting' and r['badLeague']['status'] == 'resting', 'invalid input is rejected')
    check(r['rate'] == 429, f'more than 30 votes a minute from one device is rate-limited ({r["rate"]})')
    check(not r['rawVoterStored'], 'device IDs are stored hashed, never raw')
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
