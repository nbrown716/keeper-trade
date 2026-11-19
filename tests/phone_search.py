"""Phone search on the calculators (owner report 11/19, iPhone): typed names were invisible, results sat under the
keyboard and could not be scrolled, and nothing showed a pick had been added. Also: every calculator opens empty.

Keeper + Redraft + Dynasty at phone size, driven by real touch taps. The iPhone keyboard is simulated the way iOS
reports it: window.visualViewport shrinks while the page height stays the same."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)
KEYBOARD = 336   # iPhone keyboard height in CSS px
KB_ON = f"(() => {{ const h = innerHeight - {KEYBOARD}; Object.defineProperty(visualViewport, 'height', {{ get: () => h, configurable: true }}); visualViewport.dispatchEvent(new Event('resize')); return h; }})()"
KB_OFF = "(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); })()"
SIDES = "[window.TradeEngine.state.sides.A.length, window.TradeEngine.state.sides.B.length]"
GEO = """side => { const i = document.querySelector(`[data-search="${side}"]`); const r = document.querySelector(`[data-results="${side}"]`); const ir = i.getBoundingClientRect(), rr = r.getBoundingClientRect();
  const at = document.elementFromPoint(ir.left + ir.width / 2, ir.top + ir.height / 2);
  return { inputTop: ir.top, inputBottom: ir.bottom, listTop: rr.top, listBottom: rr.bottom, onTop: at === i, fixedBoxes: [...document.querySelectorAll('[data-search]')].filter(e => getComputedStyle(e).position === 'fixed').length,
    rows: r.querySelectorAll('.res[data-i]').length, font: parseFloat(getComputedStyle(i).fontSize), canScroll: r.scrollHeight > r.clientHeight + 4, vh: innerHeight }; }"""
LAST_ROW = """side => { const r = document.querySelector(`[data-results="${side}"]`); r.scrollTop = r.scrollHeight; const rows = r.querySelectorAll('.res'); const last = rows[rows.length - 1].getBoundingClientRect(); return [r.scrollTop, last.top, last.bottom]; }"""

async def calculator(b, page, ready, name_sel, has_picks):
    tag = page.replace('.html', '')
    c = await make_context(b, {'width': 390, 'height': 844}, True)
    pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(M.BASE + page); await pg.wait_for_function(ready, timeout=60000); await pg.wait_for_timeout(1500)
    check(await pg.evaluate(SIDES) == [0, 0] and await pg.locator(f'[data-list] {name_sel}').count() == 0, f'{tag}: opens empty, 0 / 0 (no sample trade)')
    order = await pg.evaluate("[document.querySelector('.team.a').getBoundingClientRect().top, document.querySelector('.team.b').getBoundingClientRect().top, document.querySelector('.verdict').getBoundingClientRect().top]")
    check(order[0] < order[1] < order[2], f'{tag}: on a phone both teams come before the verdict ({[round(x) for x in order]})')
    # ---- open the sheet for Team A
    await pg.locator('[data-search="A"]').tap(); await pg.wait_for_timeout(400)
    g = await pg.evaluate(GEO, 'A')
    check(await pg.evaluate("document.body.classList.contains('is-searching')") and g['fixedBoxes'] == 1 and g['onTop'], f"{tag}: one search box on screen and it is the one being typed in (was two stacked: {g['fixedBoxes']} now)")
    check(g['inputTop'] < 160 and g['listTop'] >= g['inputBottom'], f"{tag}: search box at the top ({round(g['inputTop'])} px), list starts below it ({round(g['listTop'])} px)")
    check(g['rows'] >= 15, f"{tag}: an empty box already lists players to scroll ({g['rows']} rows)")
    check(g['font'] >= 16, f"{tag}: search text is {g['font']:.0f}px (16px or more, so iOS does not zoom the page)")
    kb_top = await pg.evaluate(KB_ON); await pg.wait_for_timeout(200); g = await pg.evaluate(GEO, 'A')
    check(g['listBottom'] <= kb_top + 1 and g['listBottom'] - g['listTop'] >= 200, f"{tag}: with the keyboard up the list ends at the keyboard ({round(g['listBottom'])} of {kb_top}) and keeps {round(g['listBottom'] - g['listTop'])} px of names visible")
    last = await pg.evaluate(LAST_ROW, 'A')
    check(g['canScroll'] and last[0] > 0 and last[2] <= kb_top + 1, f"{tag}: the list scrolls and its last name is reachable above the keyboard (last row ends at {round(last[2])})")
    await pg.keyboard.type('bij'); await pg.wait_for_timeout(500); g = await pg.evaluate(GEO, 'A')
    first = await pg.locator('[data-results="A"] .res').first.inner_text()
    check(await pg.input_value('[data-search="A"]') == 'bij' and g['onTop'] and 'Bijan' in first, f'{tag}: what you type shows in the box and filters the list ("{first.splitlines()[0][:30]}")')
    await pg.locator('[data-results="A"] .res').first.tap(); await pg.wait_for_timeout(900)
    names = await pg.locator(f'[data-list="A"] {name_sel}').all_inner_texts(); toast = await pg.inner_text('.kt-sheet-toast')
    check(await pg.evaluate(SIDES) == [1, 0] and names and 'Bijan' in names[0], f'{tag}: tapping a name adds him to the trade ({names})')
    closed = await pg.evaluate("[document.body.classList.contains('is-searching'), document.documentElement.classList.contains('kt-sheet-open'), !document.querySelector('.kt-search-sheet').hidden]")
    team = await pg.evaluate("(() => { const r = document.querySelector('.team.a').getBoundingClientRect(); return [r.top, innerHeight]; })()")
    check(closed == [False, False, False] and 'Added' in toast and 'Bijan' in toast and 40 <= team[0] < team[1] * 0.6, f'{tag}: the sheet closes, the page returns to Team A and confirms it ("{toast}")')
    await pg.evaluate(KB_OFF)
    # ---- Team B: typing visible, Done closes without adding
    await pg.locator('[data-search="B"]').tap(); await pg.wait_for_timeout(400); await pg.keyboard.type('cha'); await pg.wait_for_timeout(400); g = await pg.evaluate(GEO, 'B')
    title = await pg.inner_text('.kt-search-sheet-title')
    check(await pg.input_value('[data-search="B"]') == 'cha' and g['onTop'] and g['fixedBoxes'] == 1 and 'TEAM B' in title.upper(), f'{tag}: Team B search shows its own typing under its own title ("{title}")')
    await pg.locator('.kt-search-done').tap(); await pg.wait_for_timeout(500)
    check(await pg.evaluate(SIDES) == [1, 0] and not await pg.evaluate("document.body.classList.contains('is-searching') || document.documentElement.classList.contains('kt-sheet-open')") and await pg.locator('[data-results="B"] .res').count() == 0, f'{tag}: Done closes the search and adds nothing')
    # ---- quick filters
    await pg.locator('[data-search="A"]').tap(); await pg.wait_for_timeout(300); await pg.locator('.kt-search-filters [data-filter="qb"]').tap(); await pg.wait_for_timeout(400)
    rows = await pg.locator('[data-results="A"] .res[data-i]').all_inner_texts()
    check(len(rows) >= 10 and all('QB' in r.upper().split('·')[0][:40] or r.upper().startswith('QB') or 'QB' in r.upper() for r in rows), f'{tag}: the QB filter lists quarterbacks without typing ({len(rows)} rows)')
    if has_picks:
        await pg.locator('.kt-search-filters [data-filter="draft"]').tap(); await pg.wait_for_timeout(400)
        rows = await pg.locator('[data-results="A"] .res[data-i]').all_inner_texts()
        check(len(rows) >= 5 and all(r.upper().startswith('PICK') for r in rows), f'{tag}: the Picks filter lists draft picks ({len(rows)} rows)')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    # ---- names hold, trade does not
    name = pg.locator('.team-name').first; await name.fill('Nick'); await pg.wait_for_timeout(200)
    await pg.reload(); await pg.wait_for_function(ready, timeout=60000); await pg.wait_for_timeout(800)
    check(await pg.locator('.team-name').first.input_value() == 'Nick' and await pg.evaluate(SIDES) == [0, 0], f'{tag}: after a reload the team name is kept and the desk is empty again')
    check(await pg.evaluate('[innerWidth, document.documentElement.scrollWidth]') == [390, 390], f'{tag}: no sideways page scroll')
    check(not errs, f'{tag}: no page errors {errs}')
    await c.close()
    # desktop: unchanged dropdown, still opens empty
    c = await make_context(b, {'width': 1280, 'height': 900}, False); pg = await c.new_page()
    await pg.goto(M.BASE + page); await pg.wait_for_function(ready, timeout=60000); await pg.wait_for_timeout(800)
    await pg.click('[data-search="A"]'); await pg.keyboard.type('bij'); await pg.wait_for_timeout(400)
    desk = await pg.evaluate("[document.body.classList.contains('is-searching'), getComputedStyle(document.querySelector('[data-search=\"A\"]')).position, document.querySelector('.kt-search-sheet').hidden]")
    await pg.locator('[data-results="A"] .res').first.click(); await pg.wait_for_timeout(300)
    check(desk == [False, 'static', True] or desk[0] is False and desk[2] is True, f'{tag}: desktop keeps the normal dropdown (no sheet) {desk}')
    check(await pg.evaluate(SIDES) == [1, 0] and await pg.evaluate("document.activeElement === document.querySelector('[data-search=\"A\"]')"), f'{tag}: desktop pick adds the player and keeps the cursor in the box')
    await c.close()

async def dynasty(b):
    c = await make_context(b, {'width': 390, 'height': 844}, True)
    await c.add_init_script("if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('kt-dynasty-trade:v1', JSON.stringify({ a: '4984', b: '9509,2027.1.mid', unit: 'points', pkg: true })); }")
    pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(M.BASE + 'dynasty.html'); await pg.wait_for_selector('#dy-browse-A .dy-row', timeout=60000); await pg.wait_for_timeout(500)
    check(await pg.locator('.dy-piece').count() == 0, 'dynasty: opens empty even when an older visit saved a trade on this device')
    await pg.locator('#dy-search-A').tap(); await pg.wait_for_timeout(400)
    kb_top = await pg.evaluate(KB_ON); await pg.wait_for_timeout(200)
    g = await pg.evaluate("""(() => { const add = document.querySelector('#dy-add-A').getBoundingClientRect(), i = document.querySelector('#dy-search-A'), ir = i.getBoundingClientRect(), l = document.querySelector('#dy-browse-A'), lr = l.getBoundingClientRect();
      const at = document.elementFromPoint(ir.left + 20, ir.top + ir.height / 2); l.scrollTop = l.scrollHeight; const rows = l.querySelectorAll('.dy-row'); const last = rows[rows.length - 1].getBoundingClientRect();
      return { sheet: document.querySelector('#dy-add-A').classList.contains('is-sheet'), top: add.top, bottom: add.bottom, width: add.width, inputTop: ir.top, onTop: at === i, listTop: lr.top, listBottom: lr.bottom, lastBottom: last.bottom, scrolled: l.scrollTop, font: parseFloat(getComputedStyle(i).fontSize), done: !!document.querySelector('[data-dy-done="A"]').offsetParent }; })()""")
    check(g['sheet'] and g['top'] <= 1 and g['width'] == 390 and g['done'] and g['inputTop'] < 140 and g['onTop'], f"dynasty: search opens full screen with the box at the top ({round(g['inputTop'])} px) and a Done button")
    check(g['bottom'] <= kb_top + 1 and g['listBottom'] <= kb_top + 1 and g['listBottom'] - g['listTop'] >= 180 and g['scrolled'] > 0 and g['lastBottom'] <= kb_top + 1, f"dynasty: with the keyboard up the list ends at the keyboard ({round(g['listBottom'])} of {kb_top}), scrolls, and its last name is reachable")
    check(g['font'] >= 16, f"dynasty: search text is {g['font']:.0f}px (no iOS zoom)")
    await pg.keyboard.type('allen'); await pg.wait_for_timeout(500)
    check(await pg.input_value('#dy-search-A') == 'allen' and 'Allen' in await pg.locator('#dy-browse-A .dy-row').first.inner_text(), 'dynasty: typing shows in the box and filters the list')
    await pg.locator('#dy-browse-A .dy-row').first.tap(); await pg.wait_for_timeout(900)
    piece = await pg.locator('#dy-pieces-A .dy-name').all_inner_texts(); toast = await pg.inner_text('.kt-sheet-toast')
    state = await pg.evaluate("[document.querySelector('#dy-add-A').classList.contains('is-sheet'), document.documentElement.classList.contains('kt-sheet-open'), document.querySelector('#dy-search-A').value]")
    side = await pg.evaluate("document.querySelector('.dy-side[data-side=\"A\"]').getBoundingClientRect().top")
    check(len(piece) == 1 and 'Allen' in piece[0] and state == [False, False, ''] and 'Added' in toast and 40 <= side < 500, f'dynasty: tapping a name adds him, closes the sheet and returns to Team A ("{toast}")')
    await pg.evaluate(KB_OFF)
    await pg.locator('#dy-search-B').tap(); await pg.wait_for_timeout(300); await pg.locator('[data-dy-done="B"]').tap(); await pg.wait_for_timeout(300)
    check(not await pg.evaluate("document.querySelector('#dy-add-B').classList.contains('is-sheet') || document.documentElement.classList.contains('kt-sheet-open')") and await pg.locator('#dy-pieces-B .dy-piece').count() == 0, 'dynasty: Done closes the search and adds nothing')
    await pg.reload(); await pg.wait_for_selector('#dy-browse-A .dy-row', timeout=60000); await pg.wait_for_timeout(400)
    check(await pg.locator('.dy-piece').count() == 0 and '?' not in pg.url, 'dynasty: a reload starts empty again')
    await pg.goto(M.BASE + 'dynasty.html?a=4984&b=2027.1.mid'); await pg.wait_for_selector('#dy-pieces-A .dy-piece', timeout=60000); await pg.wait_for_timeout(400)
    check(await pg.locator('.dy-piece').count() == 2 and '?' not in pg.url, 'dynasty: a copied link still opens its trade, then leaves the address clean')
    await pg.reload(); await pg.wait_for_selector('#dy-browse-A .dy-row', timeout=60000); await pg.wait_for_timeout(400)
    check(await pg.locator('.dy-piece').count() == 0, 'dynasty: reloading after a link starts empty')
    check(await pg.evaluate('[innerWidth, document.documentElement.scrollWidth]') == [390, 390] and not errs, f'dynasty: no sideways scroll, no page errors {errs}')
    await c.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await calculator(b, 'keeper.html', "/FantasyCalc/.test(document.querySelector('#valStatus').textContent) && /live/.test(document.querySelector('#valStatus').textContent)", '.pname', True)
        await calculator(b, 'redraft.html', "window.TradeEngine && window.TradeEngine.players().length > 100", '.pname, .nm', False)
        await dynasty(b)
        await b.close()
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
