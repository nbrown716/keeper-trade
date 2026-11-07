import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
REPO = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, re, sys
from playwright.async_api import async_playwright

BASE = _os.environ.get('KT_BASE', 'http://127.0.0.1:4173/')  # KT_BASE=https://keeper-trade.pages.dev/ audits production
ROUTES = ['deals.html', 'wrapped.html', 'weather.html', 'index.html', 'keeper.html', 'redraft.html', 'rankings.html', 'research.html', 'tools.html', 'game.html',
          'sunday.html', 'war-room.html', 'mock-draft.html', 'season-sim.html', 'pulse.html', 'drive.html', 'command.html']
MODE = sys.argv[1] if len(sys.argv) > 1 else 'mobile'   # mobile | down
AXE = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'
LEAGUE = "try{localStorage.setItem('kt-sleeper-league:v1',JSON.stringify({id:'1370223929452433408',savedAt:1790000000000}))}catch(e){}"
ESPN = {'/espn/scoreboard': 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard', '/espn/summary': 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary',
        '/espn/news': 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news', '/espn/standings': 'https://site.api.espn.com/apis/v2/sports/football/nfl/standings'}

async def worker_relay(route):
    # The Worker only answers the production origin; relay local test calls with it (same answer production gets).
    try:
        resp = await route.fetch(headers={**route.request.headers, 'origin': 'https://keeper-trade.pages.dev'})
        await route.fulfill(status=resp.status, body=await resp.body(), headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'})
    except Exception:
        await route.fulfill(status=200, body='{"status":"resting"}', headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'})

async def espn_proxy(route):
    from urllib.parse import urlparse
    u = urlparse(route.request.url)
    target = ESPN.get(u.path)
    if not target and u.path.startswith('/espn/athletes/'): target = 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl' + u.path[5:]
    if not target and u.path.startswith('/espn/teams/'): target = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl' + u.path[5:]
    if not target: return await route.fulfill(status=404, body='{}')
    try:
        # Same headers the production Worker sends; ESPN 403s a headless-browser User-Agent.
        resp = await route.fetch(url=target + ('?' + u.query if u.query else ''), headers={'user-agent': 'KeeperTrade/1.0', 'accept': 'application/json'})
        await route.fulfill(status=resp.status, body=await resp.body(), headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'})
    except Exception:
        await route.fulfill(status=502, headers={'Access-Control-Allow-Origin': '*'}, body='{}')

STRUCT = """() => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const ids = {}; document.querySelectorAll('[id]').forEach(e => ids[e.id] = (ids[e.id] || 0) + 1);
  const dup = Object.entries(ids).filter(([, n]) => n > 1).map(([k]) => k);
  const small = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, [role=button]')].filter(vis).filter(el => {
    if (el.closest('p, li p, .kt-weather-attribution, footer') && el.tagName === 'A') return false;  // inline text links (WCAG 2.5.8 exemption)
    const target = el.matches('input[type=checkbox], input[type=radio]') && el.closest('label') ? el.closest('label') : el;  // effective hit area
    const r = target.getBoundingClientRect(); return Math.min(r.width, r.height) < 24; }).map(el => (el.id || el.className || el.tagName).toString().slice(0, 40));
  const text = document.body.innerText;
  const raw = (text.match(/TypeError|ReferenceError|\\[object Object\\]|\\bNaN\\b|undefined|HTTP [45]\\d\\d|Failed to fetch/g) || []);
  const busy = [...document.querySelectorAll('[aria-busy=true]')].filter(vis).map(e => e.id || e.className.toString().slice(0, 30));
  const W = visualViewport ? visualViewport.width : innerWidth;
  const wide = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); if (!(r.width > 0) || r.right <= W + 1) return false; const cs = getComputedStyle(e); if (cs.position === 'fixed') return r.left < W && r.width > W + 1; let n = e.parentElement; while (n && n !== document.body) { const o = getComputedStyle(n); if (/(auto|scroll|hidden|clip)/.test(o.overflowX)) { const pr = n.getBoundingClientRect(); if (pr.right <= W + 1) return false; } n = n.parentElement; } return true; }).slice(0, 4).map(e => (e.id || e.className || e.tagName).toString().slice(0, 40));
  return { overflow: Math.max(document.documentElement.scrollWidth - W, innerWidth - W, wide.length ? 1 : 0), wide, dup, small: small.slice(0, 6), smallCount: small.length, raw, busy, theme: document.documentElement.dataset.theme || '', nodes: document.getElementsByTagName('*').length };
}"""

async def audit(browser, route, theme):
    ctx = await browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    await ctx.add_init_script(LEAGUE)
    if theme == 'light': await ctx.add_init_script("try{localStorage.setItem('gi-theme','light')}catch(e){}")
    if MODE == 'down':
        await ctx.route(re.compile(r'^https?://(?!127\.0\.0\.1).*'), lambda r: r.abort())
    else:
        await ctx.route(re.compile(r'https://keeper-trade-ai\.nicholas-brown00\.workers\.dev/espn/.*'), espn_proxy)
        await ctx.route(re.compile(r'https://keeper-trade-ai\.nicholas-brown00\.workers\.dev/votes.*'), worker_relay)
    page = await ctx.new_page()
    errors, local_fail, cons = [], [], []
    page.on('pageerror', lambda e: errors.append(str(e)[:160]))
    page.on('console', lambda m: cons.append(m.text) if m.type == 'error' else None)  # full text: classify first, truncate when printing
    page.on('response', lambda r: local_fail.append(f'{r.status} {r.url[:90]}') if r.url.startswith(BASE) and r.status >= 400 else None)
    page.on('requestfailed', lambda r: local_fail.append(f'FAILED {r.url[:90]}') if r.url.startswith(BASE) else None)
    await page.goto(BASE + route, wait_until='load', timeout=60000)
    await page.wait_for_timeout(12000)
    s = await page.evaluate(STRUCT)
    axe = None
    if MODE != 'down':
        try:
            await page.add_script_tag(url=AXE)
            axe = await page.evaluate("async () => { const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] } }); return r.violations.map(v => v.id + ':' + v.nodes.length + ':' + v.nodes[0].target.join(' ').slice(0,60)); }")
        except Exception as e:
            axe = ['axe-error ' + str(e)[:80]]
    await ctx.close()
    cons = [c for c in cons if 'blocked' not in c and 'ERR_FAILED' not in c and 'net::' not in c and 'Failed to load resource' not in c and 'CORS' not in c]
    cons = [c[:140] for c in cons]
    return s, errors, local_fail, axe, cons

async def main():
    fails = 0
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for theme in (['dark', 'light'] if MODE == 'mobile' else ['dark']):
            print(f'===== {MODE} / {theme} =====')
            for r in ROUTES:
                s, errors, lf, axe, cons = await audit(b, r, theme)
                problems = []
                if errors: problems.append(f'pageerror {errors}')
                if lf: problems.append(f'local-asset {lf[:3]}')
                if s['overflow'] > 1 or s['wide']: problems.append(f"overflow {s['overflow']}px {s['wide']}")
                if s['dup']: problems.append(f"dup-ids {s['dup'][:5]}")
                if s['smallCount']: problems.append(f"small<24px {s['smallCount']} {s['small']}")
                if s['raw']: problems.append(f"raw-text {s['raw'][:4]}")
                if s['busy']: problems.append(f"stuck-busy {s['busy']}")
                # the saved theme must actually apply (drive.html is a deliberately dark cinema page); without this
                # a page that ignores the setting passes the light run trivially
                if theme == 'light' and s['theme'] != 'light' and r != 'drive.html': problems.append(f"theme-not-applied (data-theme={s['theme']!r})")
                if axe: problems.append(f'axe {axe}')
                if cons: problems.append(f'console {cons[:2]}')
                fails += bool(problems)
                print(f"{'OK  ' if not problems else 'FAIL'} {r:16} nodes={s['nodes']}" + ('' if not problems else '\n      ' + '\n      '.join(problems)))
        await b.close()
    print('MATRIX', 'PASS' if not fails else f'{fails} route(s) with issues')
if __name__ == "__main__": asyncio.run(main())
