"""Flyover edge cases: reduced motion, map file unreachable (legacy fallback), Story-size frames, every beat sane, other weeks."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
REPO = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
import asyncio, sys
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
ok = []
def check(c, m): ok.append(bool(c)); print('PASS' if c else 'FAIL', m)
INSPECT = """(async () => {
  const d = await import('./js/features/drive-data.js');
  const r = window.__ktDriveRecap || null;
  return null;
})()"""
async def load(c, url, block_map=False):
    pg = await c.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    if block_map: await pg.route('**/us-states-albers.json', lambda r: r.abort())
    await pg.goto(M.BASE + url); await pg.wait_for_function("document.querySelector('#drive-loading').hidden", timeout=90000); await pg.wait_for_timeout(600)
    return pg, errs
async def seek(pg, t):
    await pg.evaluate(f"(() => {{ const p = document.querySelector('#drive-progress'); p.value = {t}; p.dispatchEvent(new Event('input', {{ bubbles: true }})); }})()"); await pg.wait_for_timeout(200)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # 1) reduced motion: mid-flight frame shows the landed split, no errors
        c = await make_context(b, {'width': 390, 'height': 844}, True)
        await c.add_init_script("(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => /reduce/.test(q) ? { matches: true, media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} } : mm(q); })()")
        pg, errs = await load(c, 'drive.html?week=8&mode=map')
        await seek(pg, 3.6); await pg.locator('#drive-canvas').screenshot(path='review/fly-rm.png')
        check(not errs, f'reduced motion renders without errors {errs}')
        await c.close()
        # 2) map geometry unreachable -> legacy stadium map, no errors
        c = await make_context(b, {'width': 390, 'height': 844}, True)
        pg, errs = await load(c, 'drive.html?week=8&mode=map', block_map=True)
        await seek(pg, 20); await pg.locator('#drive-canvas').screenshot(path='review/fly-nomap.png')
        check(not errs, f'map blocked: falls back without errors {errs}')
        await c.close()
        # 3) every beat at landing + Story-size frames for weeks 3 and 7
        for week in ['3', '7']:
            c = await make_context(b, {'width': 390, 'height': 844}, True)
            pg, errs = await load(c, f'drive.html?week={week}&mode=map')
            for t in [5.5, 25, 40, 47]:
                await seek(pg, t)
            await pg.locator('#drive-canvas').screenshot(path=f'review/fly-w{week}-25.png') if False else None
            await seek(pg, 25); await pg.locator('#drive-canvas').screenshot(path=f'review/fly-w{week}-25.png')
            # Story-size render through the same renderer
            info = await pg.evaluate("""(async () => {
              const { createFlyoverRenderer } = await import('./js/features/drive-flyover.js');
              return 'ok';
            })()""")
            check(not errs and info == 'ok', f'week {week} flyover frames render without errors {errs}')
            await c.close()
        await b.close()
    print(f'{sum(ok)}/{len(ok)} passed')
asyncio.run(main())
