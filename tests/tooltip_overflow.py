"""Weather badge tooltip must never widen the page (11/18: War Room scrolled sideways on phones the week a roster
player drew a wind advisory, live site included). Deterministic: a badge is added to every roster row, whatever
this week's weather is. Checks the page width at rest and with a tooltip open, and that the open tooltip is on screen."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)
ADD = """(() => { const rows = [...document.querySelectorAll('.kt-war-player-option')]; rows.forEach(row => { row.querySelector('.kt-weather-badge')?.remove();
  row.insertAdjacentHTML('beforeend', '<span class="kt-weather-badge" tabindex="0" data-tooltip="Wind advisory: sustained 25 mph, gusts to 40 mph. Deep passing and long kicks are harder.">WIND ADVISORY</span>'); }); return rows.length; })()"""
WIDTH = "[innerWidth, document.documentElement.scrollWidth]"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); c = await make_context(b, {'width': 390, 'height': 844}, True)
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(M.BASE + 'war-room.html'); await pg.wait_for_selector('.kt-war-player-option', timeout=60000)
        n = await pg.evaluate(ADD); await pg.wait_for_timeout(300)
        check(n >= 8 and await pg.evaluate(WIDTH) == [390, 390], f'a weather badge on all {n} roster rows does not widen the page ({await pg.evaluate(WIDTH)})')
        badge = pg.locator('.kt-war-player-option .kt-weather-badge').first; await badge.focus(); await pg.wait_for_timeout(300)
        tip = await pg.evaluate("""(() => { const b = document.activeElement; const cs = getComputedStyle(b, '::after'); const r = b.getBoundingClientRect(); const w = parseFloat(cs.width) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 2;
          return { display: cs.display, left: cs.right === '0px' ? r.right - w : r.left, right: cs.right === '0px' ? r.right : r.left + w, text: cs.content.length }; })()""")
        check(tip['display'] == 'block' and tip['text'] > 20 and tip['left'] >= 0 and tip['right'] <= 390, f'the open tooltip shows and sits fully on screen ({round(tip["left"])} to {round(tip["right"])} of 390)')
        check(await pg.evaluate(WIDTH) == [390, 390], 'the page still does not scroll sideways with a tooltip open')
        check(not errs, f'no page errors {errs}')
        await b.close()
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
