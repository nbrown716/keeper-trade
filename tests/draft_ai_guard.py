"""Mock draft must finish whatever the AI answers (11/19: an AI round named a player already drafted, the page threw
"That player is already drafted." and the draft froze on that pick). The AI is replaced by hostile answers: every
team told to take the same player, a player id that does not exist, and unparseable text. The draft must complete
with 12 graded teams, no duplicate player and no page error. No live AI is called."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, re
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)
HDR = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json'}

async def run(b, mode):
    c = await make_context(b, {'width': 1280, 'height': 900}, False); calls = {'n': 0}
    async def ai(route):
        if route.request.method == 'OPTIONS': return await route.fulfill(status=204, headers=HDR)
        feature = route.request.url.rsplit('/', 1)[-1]; body = json.loads(route.request.post_data or '{}'); calls['n'] += 1
        if feature != 'draft-round': return await route.fulfill(status=200, headers=HDR, body=json.dumps({'status': 'resting'}))
        top = (body.get('available') or [{}])[0].get('id'); teams = [t['id'] for t in body.get('teams', [])]
        if mode == 'same': text = json.dumps({'picks': [{'team': t, 'playerId': top} for t in teams]})            # one player for every team
        elif mode == 'ghost': text = json.dumps({'picks': [{'team': t, 'playerId': 'no-such-player'} for t in teams]})
        else: text = 'Sorry, I cannot decide {{'                                                                 # not JSON at all
        await route.fulfill(status=200, headers=HDR, body=json.dumps({'status': 'ready', 'feature': feature, 'text': text}))
    await c.route(re.compile(r'https://keeper-trade-ai\.nicholas-brown00\.workers\.dev/ai/.*'), ai)
    pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(M.BASE + 'mock-draft.html'); await pg.wait_for_selector('#draft-speed', timeout=60000); await pg.wait_for_timeout(4000)
    await pg.select_option('#draft-speed', '12')
    for _ in range(500):
        if await pg.locator('#draft-grades .kt-grade-card').count(): break
        btn = pg.locator('#draft-stage [data-draft-player]')
        if await btn.count(): await btn.first.click()
        await pg.wait_for_timeout(250)
    cards = await pg.locator('#draft-grades .kt-grade-card').count()
    label = {'same': 'every team told to take the same player', 'ghost': 'a player id that does not exist', 'junk': 'an answer that is not JSON'}[mode]
    check(cards == 12 and calls['n'] > 0 and not errs, f'AI answers with {label}: the draft still finishes with 12 graded teams and no page error ({cards} cards, {calls["n"]} AI calls) {errs[:2]}')
    await c.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for mode in ('same', 'ghost', 'junk'): await run(b, mode)
        await b.close()
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
