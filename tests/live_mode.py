"""Phase 6 live mode: The Drive on an in-progress week + Matchup Pill.
Uses the real current week when one is in progress; otherwise simulates one by rewriting the ESPN scoreboard so
the live paths are always exercised. Checks: no winner/touchdown while live, LIVE card with win %, honest summary,
pill appears with score + %, links to the Drive, dismisses for the session, hidden on drive.html."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, re, urllib.request
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)
nfl = json.load(urllib.request.urlopen(urllib.request.Request('https://api.sleeper.app/v1/state/nfl', headers={'User-Agent': 'KeeperTrade/1.0'})))
WEEK = int(nfl['week'])

# Force an in-progress week: first game final, second in the 3rd quarter, the rest not started.
async def live_scoreboard(route):
    from urllib.parse import urlparse
    query = urlparse(route.request.url).query
    response = await route.fetch(url='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?' + query, headers={'user-agent': 'KeeperTrade/1.0', 'accept': 'application/json'})
    data = json.loads(await response.body())
    events = data.get('events', [])
    for index, event in enumerate(events):
        state = 'post' if index == 0 else 'in' if index == 1 else 'pre'
        for holder in [event.get('status', {}), *(c.get('status', {}) for c in event.get('competitions', []))]:
            holder.setdefault('type', {})['state'] = state
            if state == 'in': holder['period'] = 3; holder['displayClock'] = '7:30'
    await route.fulfill(status=200, body=json.dumps(data), headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'})

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c = await make_context(b, {'width': 390, 'height': 844}, True)
        await c.add_init_script("localStorage.setItem('kt-drive-manager:v1','9')")
        await c.route(re.compile(rf'.*/espn/scoreboard\?dates=\d+&seasontype=2&week={WEEK}$'), live_scoreboard)
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(M.BASE + f'drive.html?week={WEEK}&mode=race'); await pg.wait_for_function("document.querySelector('#drive-loading').hidden", timeout=90000)
        await pg.evaluate("(() => { const p = document.querySelector('#drive-progress'); p.value = 48; p.dispatchEvent(new Event('input', { bubbles: true })); })()"); await pg.wait_for_timeout(400)
        await pg.locator('#drive-canvas').screenshot(path='review/live-race-end.png')
        status = await pg.inner_text('#drive-status')
        label = await pg.get_attribute('#drive-canvas', 'aria-label') or ''
        check('Live' in status and '% to win' in status, f'race end is LIVE with win % ("{status}")')
        check('wins' not in label.lower(), f'no winner announced while live ("{label[:90]}")')
        summary = await pg.inner_text('#drive-summary') if await pg.locator('#drive-summary').is_visible() else ''
        check('in progress' in summary.lower() and 'win by' not in summary.lower() and 'loss by' not in summary.lower(), f'summary is honest while live ("{summary[:80]}")')
        live = await pg.evaluate("(async () => { const m = await import('./js/features/drive-data.js'); const r = await m.loadDriveRecap('1370223929452433408', %d, 9); return r.race.live && { pA: r.race.live.pA, projA: r.race.live.projA, projB: r.race.live.projB, leftA: r.race.live.leftA, target: r.race.target, finalA: r.race.finalA }; })()" % WEEK)
        check(live and 0 <= live['pA'] <= 1 and live['projA'] >= live['finalA'] and live['target'] >= live['finalA'], f'race.live attached ({live})')
        await pg.click('[data-drive-mode="map"]'); await pg.wait_for_timeout(500)
        await pg.evaluate("(() => { const p = document.querySelector('#drive-progress'); p.value = 48; p.dispatchEvent(new Event('input', { bubbles: true })); })()"); await pg.wait_for_timeout(400)
        await pg.locator('#drive-canvas').screenshot(path='review/live-map-end.png')
        check(await pg.locator('.kt-matchup-pill').count() == 0, 'pill is not shown on The Drive itself')
        await pg.evaluate("window.__finales = 0; window.addEventListener('kt:drive-finale', () => { window.__finales += 1; })")
        await pg.click('[data-drive-mode="field"]'); await pg.wait_for_timeout(500)
        await pg.evaluate("(() => { const p = document.querySelector('#drive-progress'); p.value = 49; p.dispatchEvent(new Event('input', { bubbles: true })); })()"); await pg.wait_for_timeout(600)
        await pg.locator('#drive-canvas').screenshot(path='review/live-field-end.png')
        flabel = await pg.get_attribute('#drive-canvas', 'aria-label') or ''
        finales = await pg.evaluate('window.__finales')
        check('Live:' in flabel and finales == 0, f'field mode end is LIVE, no win celebration fired ("{flabel[:80]}", finales={finales})')
        check(not errs, f'drive no errors {errs}')
        # ---- pill on other pages
        for page in ['index.html', 'rankings.html']:
            pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(M.BASE + page)
            try: await pg.wait_for_selector('.kt-matchup-pill:not([hidden])', timeout=30000)
            except Exception: pass
            visible = await pg.locator('.kt-matchup-pill:not([hidden])').count()
            text = await pg.inner_text('.kt-matchup-pill') if visible else ''
            href = await pg.get_attribute('.kt-matchup-pill a', 'href') if visible else ''
            check(visible and re.search(r'\d+\.\d', text) and '%' in text and f'week={WEEK}' in (href or ''), f'{page}: pill shows live score + win % and links to the Drive ("{text.strip()[:40]}", {href})')
            if page == 'index.html':
                await pg.screenshot(path='review/live-pill.png')
                await pg.add_script_tag(url=M.AXE)
                ax = await pg.evaluate("axe.run(document.querySelector('.kt-matchup-pill'), { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa'] } }).then(r => r.violations.map(v => v.id + ':' + v.nodes.length))")
                check(not ax, f'pill passes axe WCAG AA (contrast, names) {ax}')
                box = await pg.locator('.kt-matchup-pill').bounding_box()
                check(box and box['x'] >= 0 and box['x'] + box['width'] <= 390, f'pill fits the phone screen ({box})')
                await pg.click('.kt-pill-close'); await pg.wait_for_timeout(200)
                await pg.reload(); await pg.wait_for_timeout(5000)
                check(await pg.locator('.kt-matchup-pill:not([hidden])').count() == 0, 'dismissed pill stays hidden for the session')
            check(not errs, f'{page} no errors {errs}')
        await c.close()
        # ---- live follow: Sleeper reports 6 more points for you mid-session -> The Drive updates by itself (60 s loop)
        c = await make_context(b, {'width': 390, 'height': 844}, True)
        await c.add_init_script("localStorage.setItem('kt-drive-manager:v1','9')")
        await c.route(re.compile(rf'.*/espn/scoreboard\?dates=\d+&seasontype=2&week={WEEK}$'), live_scoreboard)
        bump = {'on': False}
        async def matchups(route):
            response = await route.fetch()
            data = json.loads(await response.body())
            if bump['on']:
                for entry in data:
                    if entry.get('roster_id') == 9 and entry.get('starters'):
                        sid = entry['starters'][0]
                        entry['players_points'][sid] = float(entry['players_points'].get(sid, 0) or 0) + 6
                        entry['points'] = float(entry.get('points') or 0) + 6
            await route.fulfill(status=200, body=json.dumps(data), headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'})
        await c.route(re.compile(rf'https://api\.sleeper\.app/v1/league/\d+/matchups/{WEEK}$'), matchups)
        pg = await c.new_page()
        await pg.goto(M.BASE + f'drive.html?week={WEEK}&mode=race'); await pg.wait_for_function("document.querySelector('#drive-loading').hidden", timeout=90000)
        await pg.evaluate("(() => { const p = document.querySelector('#drive-progress'); p.value = 48; p.dispatchEvent(new Event('input', { bubbles: true })); })()"); await pg.wait_for_timeout(500)
        before = await pg.get_attribute('#drive-canvas', 'aria-label')
        bump['on'] = True
        await pg.wait_for_timeout(75000)
        await pg.evaluate("(() => { const p = document.querySelector('#drive-progress'); p.value = 48; p.dispatchEvent(new Event('input', { bubbles: true })); })()"); await pg.wait_for_timeout(500)
        after = await pg.get_attribute('#drive-canvas', 'aria-label')
        num = lambda t: float(re.search(r'win, ([\d.]+) to', t or '').group(1)) if re.search(r'win, ([\d.]+) to', t or '') else None
        check(num(before) is not None and num(after) is not None and abs(num(after) - num(before) - 6) < 0.05, f'live follow: +6 points appear without a reload ({num(before)} -> {num(after)})')
        await c.close()
        # ---- no team remembered -> no pill (never guess whose matchup it is)
        c = await make_context(b, {'width': 390, 'height': 844}, True); await c.route(re.compile(rf'.*/espn/scoreboard\?dates=\d+&seasontype=2&week={WEEK}$'), live_scoreboard)
        pg = await c.new_page(); await pg.goto(M.BASE + 'index.html'); await pg.wait_for_timeout(8000)
        check(await pg.locator('.kt-matchup-pill:not([hidden])').count() == 0, 'no remembered team: no pill')
        await b.close()
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
