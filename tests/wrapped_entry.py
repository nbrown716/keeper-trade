"""Wrapped entry points: League-section link, Clubhouse card, command palette, and the one-time post-championship prompt."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, re
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)
LEAGUE = re.compile(r'https://api\.sleeper\.app/v1/league/\d+$')

async def complete_league(route):
    response = await route.fetch()
    data = await response.json()
    data['status'] = 'complete'
    await route.fulfill(response=response, body=json.dumps(data), headers={**response.headers, 'content-type': 'application/json'})

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # in-season: link present, no prompt
        c = await make_context(b, {'width': 390, 'height': 844}, True); pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(M.BASE + 'index.html#league'); await pg.wait_for_selector('#league .kt-standing-row', timeout=90000)
        check(await pg.locator('#league a[href="wrapped.html"]').count() == 1, 'League section links to Season Wrapped')
        check(await pg.locator('.kt-wrapped-prompt').count() == 0, 'no championship prompt while the season is in progress')
        check(await pg.locator('a[href="wrapped.html"]', has_text='Play my Wrapped').count() >= 1, 'Clubhouse card has "Play my Wrapped"')
        await pg.goto(M.BASE + 'command.html'); await pg.wait_for_selector('.kt-command-input', state='visible', timeout=15000)
        await pg.fill('.kt-command-input', 'wrapped'); await pg.wait_for_timeout(600)
        check('Season Wrapped' in await pg.inner_text('#kt-command-results'), 'command palette finds Season Wrapped')
        check(not errs, f'no errors {errs}')
        await c.close()
        # after the championship: prompt shows once; "Not now" dismisses for good
        c = await make_context(b, {'width': 390, 'height': 844}, True); await c.route(LEAGUE, complete_league)
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(M.BASE + 'index.html#league'); await pg.wait_for_selector('#league .kt-standing-row', timeout=90000)
        check(await pg.locator('.kt-wrapped-prompt').count() == 1, 'post-championship prompt appears')
        check(await pg.locator('.kt-wrapped-prompt a[href="wrapped.html?play=1"]').count() == 1, 'prompt deep-links straight into the story')
        await pg.click('.kt-wrapped-prompt button'); await pg.wait_for_timeout(200)
        check(await pg.locator('.kt-wrapped-prompt').count() == 0, '"Not now" removes the prompt')
        await pg.reload(); await pg.wait_for_selector('#league .kt-standing-row', timeout=90000); await pg.wait_for_timeout(500)
        check(await pg.locator('.kt-wrapped-prompt').count() == 0, 'dismissed prompt never returns')
        check(not errs, f'no errors {errs}')
        await b.close()
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
