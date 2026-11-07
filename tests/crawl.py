"""Click-everything audit: every visible control on every route, mobile + desktop."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
REPO = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, re, sys
from urllib.parse import urlparse
from playwright.async_api import async_playwright
import matrix as M

BASE = M.BASE
WORKER = 'https://keeper-trade-ai.nicholas-brown00.workers.dev'
ROUTES = ['index.html', 'keeper.html', 'redraft.html', 'rankings.html', 'research.html', 'tools.html', 'game.html',
          'sunday.html', 'war-room.html', 'mock-draft.html', 'season-sim.html', 'pulse.html', 'drive.html', 'command.html']
only = [a for a in sys.argv[1:] if a.endswith('.html')]
if only: ROUTES = only
VIEWS = [('mobile', {'width': 390, 'height': 844}, True), ('desktop', {'width': 1440, 'height': 900}, False)]
if '--mobile' in sys.argv: VIEWS = VIEWS[:1]
if '--desktop' in sys.argv: VIEWS = VIEWS[1:]

async def ai_proxy(route):
    """Forward /ai/* and /yahoo/* to the real Worker as the production origin (browser-forbidden header set by Playwright's network stack)."""
    req = route.request
    if req.method == 'OPTIONS':
        return await route.fulfill(status=204, headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Keeper-Session', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'})
    try:
        resp = await route.fetch(headers={**req.headers, 'origin': 'https://keeper-trade.pages.dev'})
        body = await resp.body()
        await route.fulfill(status=resp.status, body=body, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': resp.headers.get('content-type', 'application/json')})
    except Exception:
        await route.fulfill(status=502, headers={'Access-Control-Allow-Origin': '*'}, body='{}')

async def make_context(browser, viewport, mobile):
    c = await browser.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile, service_workers='block', accept_downloads=True)
    await c.add_init_script(M.LEAGUE)
    await c.route(re.compile(r'https://keeper-trade-ai\.nicholas-brown00\.workers\.dev/espn/.*'), M.espn_proxy)
    await c.route(re.compile(r'https://keeper-trade-ai\.nicholas-brown00\.workers\.dev/(ai|yahoo)/.*'), ai_proxy)
    return c

ENUM = r"""() => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden],[inert],[aria-hidden=true]'); };
  const sel = 'button, a[href], select, input[type=checkbox], input[type=radio], [role=button], [role=tab], summary, [data-tilt]';
  let i = 0; const out = [];
  document.querySelectorAll(sel).forEach(el => {
    if (!vis(el) || el.disabled) return;
    el.dataset.auditId = String(i);
    const label = (el.getAttribute('aria-label') || el.textContent || el.value || el.id || el.className || el.tagName).toString().replace(/\s+/g, ' ').trim().slice(0, 50);
    out.push({ id: i++, tag: el.tagName.toLowerCase(), type: el.type || '', href: el.getAttribute('href') || '', target: el.target || '', label, inNav: !!el.closest('header, nav, .kt-bottom-nav, footer'), options: el.tagName === 'SELECT' ? [...el.options].map(o => o.value).slice(0, 6) : [] });
  });
  return out;
}"""
SNAP = r"""() => ({ html: (() => { const t = document.body.innerHTML + [...document.querySelectorAll('[hidden],[aria-selected=true],[aria-pressed=true],[aria-expanded=true]')].map(e => e.id || e.className).join('|'); let h = 0; for (let i = 0; i < t.length; i += 7) h = (h * 31 + t.charCodeAt(i)) | 0; const cv = [...document.querySelectorAll('canvas')].map(c => { try { const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data; let k = 0; if (d) for (let i = 0; i < d.length; i += 8191) k = (k * 31 + d[i]) | 0; return k; } catch (_) { return 0; } }).join(','); return h + ':' + cv; })(), text: document.body.innerText.slice(0, 20000), url: location.href, scroll: scrollY, open: document.querySelectorAll('[aria-expanded=true], [open], dialog[open], .is-open, .is-expanded, [aria-pressed=true]').length, hidden: document.querySelectorAll('[hidden]').length })"""
RAW = re.compile(r'TypeError|ReferenceError|\[object Object\]|\bNaN\b|\bundefined\b|HTTP [45]\d\d|Failed to fetch|Infinity')
DANGER = re.compile(r'remove|delete|reset|clear|disconnect|sign in with yahoo', re.I)

async def audit_route(browser, route, vname, viewport, mobile, report):
    ctx = await make_context(browser, viewport, mobile)
    page = await ctx.new_page()
    errors, cons = [], []
    page.on('pageerror', lambda e: errors.append(str(e)[:180]))
    page.on('console', lambda m: cons.append(m.text[:160]) if m.type == 'error' and 'net::' not in m.text and 'Failed to load resource' not in m.text else None)
    page.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
    downloads = []
    page.on('download', lambda d: downloads.append(d.suggested_filename))
    await page.goto(BASE + route, wait_until='load'); await page.wait_for_timeout(7000)
    controls = await page.evaluate(ENUM)
    seen_links = set(); issues = []; clicked = 0; dead = []
    for c in controls:
        label = f"{c['tag']}#{c['id']} '{c['label']}'"
        if c['tag'] == 'a':
            href = c['href']
            if href.startswith('#') or href.startswith('javascript'): pass
            else:
                url = urlparse(href if '://' in href else BASE + (route.rsplit('/', 1)[0] + '/' if '/' in route else '') + href)
                key = url.scheme + url.netloc + url.path
                if key in seen_links: continue
                seen_links.add(key)
                if url.netloc in (M.BASE.split('/')[2], ''):
                    r = await page.request.get(BASE + url.path.lstrip('/'))
                    if r.status >= 400: issues.append(f'BROKEN LINK {label} -> {href} ({r.status})')
                elif url.scheme not in ('https', 'mailto', 'sms', 'tel'): issues.append(f'INSECURE LINK {label} -> {href}')
                elif c['target'] != '_blank' and not c['inNav']: pass
                continue
        if DANGER.search(c['label']): continue
        loc = page.locator(f'[data-audit-id="{c["id"]}"]')
        if not await loc.count(): continue
        before = await page.evaluate(SNAP); e0, c0 = len(errors), len(cons)
        try:
            if c['tag'] == 'select':
                for v in c['options'][1:3]:
                    await loc.select_option(v, timeout=2000); await page.wait_for_timeout(500)
            else:
                await loc.evaluate("e => e.scrollIntoView({ block: 'center', inline: 'center' })")
                await page.wait_for_timeout(120)
                try:
                    await loc.click(timeout=2500)
                except Exception as ex2:
                    if 'intercepts pointer events' in str(ex2):
                        cover = await loc.evaluate("e => { const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return top ? (top.id || top.className || top.tagName).toString().slice(0, 60) : '?'; }")
                        issues.append(f'COVERED {label}: tap lands on [{cover}] even when centered'); continue
                    raise
            clicked += 1
        except Exception as ex:
            msg = str(ex).split('\n')[0][:120]
            if 'intercepts pointer events' in str(ex): issues.append(f'COVERED {label}: another element intercepts the tap')
            elif 'not visible' in msg or 'detached' in msg or 'Timeout' in msg: pass
            else: issues.append(f'CLICK FAIL {label}: {msg}')
            continue
        await page.wait_for_timeout(900)
        after = await page.evaluate(SNAP)
        if after['url'].split('#')[0] != before['url'].split('#')[0]:
            await page.goto(BASE + route, wait_until='load'); await page.wait_for_timeout(4000); await page.evaluate(ENUM)  # fresh DOM, same order
            continue
        if len(errors) > e0: issues.append(f'PAGE ERROR after {label}: {errors[-1]}')
        if len(cons) > c0: issues.append(f'CONSOLE ERROR after {label}: {cons[-1]}')
        new_raw = set(RAW.findall(after['text'])) - set(RAW.findall(before['text']))
        if new_raw: issues.append(f'RAW TEXT after {label}: {sorted(new_raw)}')
        if c['tag'] != 'select' and before['html'] == after['html'] and before['scroll'] == after['scroll'] and before['open'] == after['open'] and before['hidden'] == after['hidden'] and not downloads:
            dead.append(label)
        await page.keyboard.press('Escape'); await page.wait_for_timeout(150)
    stuck = await page.evaluate("[...document.querySelectorAll('[aria-busy=true]')].filter(e => e.getBoundingClientRect().height > 0).map(e => e.id || e.className.toString().slice(0, 30))")
    if stuck: issues.append(f'STUCK BUSY at end: {stuck}')
    report.append({'route': route, 'view': vname, 'controls': len(controls), 'clicked': clicked, 'issues': issues, 'dead': dead, 'downloads': downloads, 'errors_total': len(errors)})
    print(f"{vname:7} {route:16} controls={len(controls):3} clicked={clicked:3} issues={len(issues)} dead={len(dead)} dl={downloads}", flush=True)
    for i in issues: print('   ', i, flush=True)
    for d in dead[:12]: print('    DEAD?', d, flush=True)
    await ctx.close()

async def main():
    report = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for vname, vp, mobile in VIEWS:
            for r in ROUTES:
                try: await audit_route(b, r, vname, vp, mobile, report)
                except Exception as ex: print(f'{vname} {r} CRASHED: {str(ex)[:200]}', flush=True)
        await b.close()
    json.dump(report, open('crawl_report.json', 'w'), indent=1)
if __name__ == "__main__": asyncio.run(main())
