"""Calculator player card (owner bug 11/11: the photo card stayed up after typing a name and blocked the screen).
Picking a search result closes it; clicking a name pins it; clicking outside / the name again / Esc / x closes it;
a modified click still opens the FantasyPros profile. Desktop + phone."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)
SHOWN = "document.getElementById('pop').classList.contains('show')"

async def run(b, page_name, viewport, mobile):
    c = await make_context(b, viewport, mobile)
    pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(M.BASE + page_name); await pg.wait_for_selector('[data-search="A"]')
    tag = f'{page_name} {"phone" if mobile else "desktop"}:'
    box = pg.locator('[data-search="A"]'); await box.scroll_into_view_if_needed()
    await box.click(); await box.fill('bijan')
    first = pg.locator('[data-results="A"] .res').first; await first.wait_for()
    if not mobile:
        await first.hover(); await pg.wait_for_timeout(200)
        check(await pg.evaluate(SHOWN), f'{tag} hovering a search result previews the card')
    await first.click(); await pg.wait_for_timeout(300)
    check(not await pg.evaluate(SHOWN), f'{tag} picking a search result closes the card (the reported bug)')
    if mobile:  # phone search stays open for adding several players; tapping out leaves it
        await pg.locator('.kt-search-scrim').click(); await pg.wait_for_timeout(300)
        check(not await pg.evaluate(SHOWN), f'{tag} leaving search leaves no card behind')
    name = pg.locator('#listA .plink', has_text='Bijan').first
    if not await name.count(): name = pg.locator('.plink', has_text='Bijan').first
    await name.click(); await pg.wait_for_timeout(250)
    check(await pg.evaluate(SHOWN) and await pg.evaluate("document.getElementById('pop').classList.contains('pinned')"), f'{tag} clicking the name opens (pins) the card')
    check(len(c.pages) == 1, f'{tag} a plain click does not open a new tab')
    await pg.mouse.click(5, viewport['height'] - 5); await pg.wait_for_timeout(250)
    check(not await pg.evaluate(SHOWN), f'{tag} clicking outside closes it')
    await name.click(); await pg.wait_for_timeout(200); await name.click(); await pg.wait_for_timeout(250)
    check(not await pg.evaluate(SHOWN), f'{tag} clicking the name again closes it')
    await name.click(); await pg.wait_for_timeout(200); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
    check(not await pg.evaluate(SHOWN), f'{tag} Esc closes it')
    await name.click(); await pg.wait_for_timeout(200)
    link = await pg.get_attribute('#pop .pop-foot a', 'href')
    check(link and 'fantasypros.com/nfl/players/' in link, f'{tag} pinned card links the FantasyPros profile ({link})')
    await pg.click('#pop .pop-x'); await pg.wait_for_timeout(200)
    check(not await pg.evaluate(SHOWN), f'{tag} the x button closes it')
    check(not errs, f'{tag} no errors {errs}')
    await c.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await run(b, 'keeper.html', {'width': 1280, 'height': 900}, False)
        await run(b, 'keeper.html', {'width': 390, 'height': 844}, True)
        await b.close()
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
