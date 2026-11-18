"""Desktop header fit (11/12: adding two links made the menu wrap at 1280 and scroll the page sideways at 1536+).
At every common desktop width: the menu is one row, does not run under the search/theme buttons, and the page does
not scroll sideways. Checked on the widest-content pages too."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio
from playwright.async_api import async_playwright
import matrix as M
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)
JS = """(() => { const links = [...document.querySelectorAll('.kt-desktop-nav a')].filter(a => a.offsetParent);
  const rows = new Set(links.map(a => Math.round(a.getBoundingClientRect().top))).size; const wrapped = links.filter(a => a.scrollHeight > a.clientHeight + 2 || a.getClientRects().length > 1).map(a => a.textContent);
  const actions = document.querySelector('.kt-header-actions').getBoundingClientRect(); const last = links.length ? links[links.length - 1].getBoundingClientRect() : { right: 0 };
  const lineH = links.map(a => { const r = document.createRange(); r.selectNodeContents(a); return r.getClientRects().length; });
  return { shown: links.length, rows, twoLine: links.filter((a, i) => lineH[i] > 1).map(a => a.textContent), overlap: last.right > actions.left + 1, scrollW: document.documentElement.scrollWidth, w: innerWidth }; })()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for page in ('dynasty.html', 'index.html'):
            bad = []; shown = {}
            for w in (1000, 1100, 1200, 1280, 1366, 1440, 1536, 1680, 1920, 2560):
                c = await b.new_context(viewport={'width': w, 'height': 800}, service_workers='block'); pg = await c.new_page()
                await pg.goto(M.BASE + page); await pg.wait_for_selector('.kt-desktop-nav', state='attached'); await pg.wait_for_timeout(700)
                r = await pg.evaluate(JS); shown[w] = r['shown']
                if r['rows'] != 1 or r['twoLine'] or r['overlap'] or r['scrollW'] > r['w'] or r['shown'] < 9: bad.append((w, r))
                await c.close()
            check(not bad, f'{page}: header menu is one row, clear of the buttons, no sideways scroll at 1000-2560 px (links shown {shown}) {bad[:2]}')
        await b.close()
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
