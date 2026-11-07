import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
REPO = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
import asyncio, re, sys
from playwright.async_api import async_playwright
import matrix as M

BASE = M.BASE
results = []
def check(cond, msg): results.append((bool(cond), msg)); print(('PASS ' if cond else 'FAIL ') + msg, flush=True)

async def ctx_for(b, mobile=True, league=True, down=False, sw='block'):
    c = await b.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1440, 'height': 900}, is_mobile=mobile, has_touch=mobile, service_workers=sw)
    if league: await c.add_init_script(M.LEAGUE)
    if down: await c.route(re.compile(r'^https?://(?!127\.0\.0\.1).*'), lambda r: r.abort())
    else: await c.route(re.compile(r'https://keeper-trade-ai\.nicholas-brown00\.workers\.dev/espn/.*'), M.espn_proxy)
    return c

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()

        # ---------------- Keeper calculator (mobile) ----------------
        c = await ctx_for(b); pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE + 'keeper.html'); await pg.wait_for_timeout(4000)
        await pg.fill('[data-search="A"]', 'Chase'); await pg.wait_for_timeout(500)
        box = await pg.locator('[data-results="A"]').bounding_box()
        check(box and box['height'] > 40, f"mobile search results visible (height {box and round(box['height'])}px, was 2px)")
        await pg.locator('[data-results="A"] .res').first.dispatch_event('mousedown'); await pg.wait_for_timeout(300)
        val = await pg.locator('[data-list="A"] input[data-k="mv"]').first.input_value()
        check(val.isdigit() and int(val) > 0, f'keeper value field shows a number ({val!r}, was blank)')
        await pg.locator('[data-list="A"] input[data-k="mv"]').first.fill('3000')
        await pg.locator('[data-list="A"] input[data-k="cost"]').first.fill('9')
        await pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); await pg.wait_for_timeout(2500)
        e = await pg.evaluate("(() => { const e = TradeEngine.state.sides.A[0]; return { mv: Math.round(e.mv * 100), cost: e.cost, edited: e.mvEdited }; })()")
        check(e == {'mv': 3000, 'cost': 9, 'edited': True}, f'user-edited value/round survive market refresh ({e})')
        check(await pg.evaluate("Array.isArray(TradeEngine.players()) && TradeEngine.players().length > 100"), 'TradeEngine.players() works')
        await pg.fill('[data-search="B"]', 'Jefferson'); await pg.wait_for_timeout(400)
        await pg.locator('[data-results="B"] .res').first.dispatch_event('mousedown'); await pg.wait_for_timeout(1200)
        await pg.fill('[data-search="B"]', 'Bijan'); await pg.wait_for_timeout(400)
        await pg.locator('[data-results="B"] .res').first.dispatch_event('mousedown'); await pg.wait_for_timeout(1200)
        await pg.locator('.team-name').first.fill('<img src=x onerror="window.__xss=1">'); await pg.wait_for_timeout(1200)
        check(await pg.evaluate('window.__xss') is None, 'team-name HTML is escaped (no script execution)')
        hist = await pg.evaluate("JSON.parse(localStorage.getItem('kt-trade-history:v1:keeper') || '[]').length")
        check(hist >= 2, f'trade history keeps multiple trades ({hist})')
        stamp = await pg.locator('#vStamp').inner_text()
        check(stamp.strip() and stamp.strip().lower() != 'add players', f'verdict computed: {stamp.strip()}')
        check(not errs, f'keeper no page errors {errs[:2]}')
        await c.close()

        # ---------------- Redraft format race ----------------
        c = await ctx_for(b, mobile=False); pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        async def slow_dynasty(route):
            if 'isDynasty=true' in route.request.url: await asyncio.sleep(3)
            await route.continue_()
        await c.route(re.compile(r'https://api\.fantasycalc\.com/.*'), slow_dynasty)
        await pg.goto(BASE + 'redraft.html'); await pg.wait_for_timeout(3500)
        fmt_buttons = pg.locator('[data-v="dynasty"], [data-v="redraft"]')
        if await fmt_buttons.count() >= 2:
            await pg.click('[data-v="dynasty"]'); await pg.wait_for_timeout(200); await pg.click('[data-v="redraft"]'); await pg.wait_for_timeout(4500)
            fmt = await pg.evaluate("document.querySelector('[data-v=\"redraft\"]').getAttribute('aria-pressed')")
            check(fmt == 'true', 'redraft format selection stays on the last choice after a slow response')
        check(not errs, f'redraft no page errors {errs[:2]}')
        await c.close()

        # ---------------- Research deep link ----------------
        c = await ctx_for(b, mobile=False); pg = await c.new_page()
        await pg.goto(BASE + 'research.html?player=justin-jefferson'); await pg.wait_for_timeout(7000)
        txt = await pg.locator('#pcontent').inner_text()
        check('Jefferson' in txt, 'command-palette deep link opens the player profile')
        await c.close()

        # ---------------- Storage growth after heavy pages ----------------
        c = await ctx_for(b); pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        for r in ['sunday.html?debugdate=20261101', 'drive.html', 'index.html', 'keeper.html', 'redraft.html', 'pulse.html', 'season-sim.html', 'war-room.html']:
            await pg.goto(BASE + r); await pg.wait_for_timeout(9000)
        ls = await pg.evaluate("Object.keys(localStorage).reduce((s, k) => s + k.length + (localStorage.getItem(k) || '').length, 0)")
        big = await pg.evaluate("Object.keys(localStorage).filter(k => (localStorage.getItem(k) || '').length > 65536)")
        idb = await pg.evaluate("new Promise(res => { const r = indexedDB.open('kt-livedata'); r.onsuccess = () => { const tx = r.result.transaction('cache'); const q = tx.objectStore('cache').count(); q.onsuccess = () => res(q.result); }; r.onerror = () => res(-1); })")
        check(ls < 1.3e6, f'localStorage bounded after Sunday/Drive/etc: {ls/1e6:.2f}M chars (agent measured ~5.0M before)')
        check(not big, f'no oversized localStorage entries {big}')
        check(idb > 5, f'large payloads live in IndexedDB ({idb} records)')
        # write still works afterwards (previously silently failed at quota)
        ok_write = await pg.evaluate("(() => { try { localStorage.setItem('kt-quota-probe', 'x'.repeat(200000)); localStorage.removeItem('kt-quota-probe'); return true; } catch (e) { return false; } })()")
        check(ok_write, 'localStorage still has room for app state writes')
        # second visit uses fresh cache: count network requests to dealer
        dealer = []
        pg.on('request', lambda r: dealer.append(r.url) if 'dynastydealer' in r.url or 'fantasycalc' in r.url else None)
        await pg.goto(BASE + 'index.html'); await pg.wait_for_timeout(6000)
        check(len(dealer) == 0, f'fresh cached market data is not re-downloaded on the next page ({len(dealer)} requests)')
        check(not errs, f'no page errors across heavy pages {errs[:2]}')
        await c.close()

        # ---------------- Mock Draft with every third-party API down ----------------
        c = await ctx_for(b, mobile=False, league=False, down=True); pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE + 'mock-draft.html'); await pg.wait_for_timeout(3000)
        await pg.select_option('#draft-speed', '12')
        for _ in range(240):
            if await pg.locator('#draft-grades .kt-grade-card').count(): break
            btn = pg.locator('#draft-stage [data-draft-player]')
            if await btn.count(): await btn.first.click()
            await pg.wait_for_timeout(250)
        picks = await pg.evaluate("document.querySelectorAll('#draft-board [data-pick], #draft-board .kt-draft-pick, #draft-board .is-picked').length")
        grades = await pg.locator('#draft-grades .kt-grade-card').count()
        # Owner rule: live values only, no frozen exports. Cold cache + every API down = honest reconnect state.
        stage = await pg.inner_text('#draft-stage')
        check(grades == 0 and 'draft room reconnecting' in stage.lower() and await pg.locator('#draft-retry').count() == 1, f'cold offline: honest reconnect state with Retry, no stale board ("{stage[:60]}")')
        check(not errs, f'mock draft no page errors {errs[:2]}')
        await c.close()
        # Warm cache: one online visit, then every API down -> the draft runs on the last live values, labelled
        c = await ctx_for(b, mobile=False, league=False, down=False); pg = await c.new_page()
        await pg.route(re.compile(r'https://www\.dynastydealer\.com/.*'), lambda r: r.abort())
        await pg.goto(BASE + 'mock-draft.html'); await pg.wait_for_timeout(5000)
        await pg.unroute(re.compile(r'https://www\.dynastydealer\.com/.*'))
        await c.route(re.compile(r'^https?://(?!127\.0\.0\.1).*'), lambda r: r.abort())
        await pg.reload(); await pg.wait_for_timeout(3000)
        label = await pg.inner_text('#draft-available-count')
        await pg.select_option('#draft-speed', '12')
        for _ in range(240):
            if await pg.locator('#draft-grades .kt-grade-card').count(): break
            btn = pg.locator('#draft-stage [data-draft-player]')
            if await btn.count(): await btn.first.click()
            await pg.wait_for_timeout(250)
        grades = await pg.locator('#draft-grades .kt-grade-card').count()
        check(grades == 12 and 'FantasyCalc' in label and 'ECR' not in label, f'warm offline: mock draft completes on cached live values with an honest label ({grades} grades, "{label}")')
        await c.close()

        # ---------------- Offline service worker v56 ----------------
        c = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, service_workers='allow')
        await c.add_init_script(M.LEAGUE)
        await c.route(re.compile(r'https://keeper-trade-ai\.nicholas-brown00\.workers\.dev/espn/.*'), M.espn_proxy)
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE + 'index.html'); await pg.wait_for_timeout(2000)
        ver = await pg.evaluate("navigator.serviceWorker.ready.then(() => caches.keys())")
        await pg.wait_for_timeout(6000)
        import re as _re
        shell = _re.search(r'keeper-trade-shell-v\d+', open(_os.path.join(REPO, 'sw.js'), encoding='utf-8').read()).group(0)
        count = await pg.evaluate(f"caches.open('{shell}').then(c => c.keys()).then(k => k.length)")
        check(shell in ver and count >= 94, f'SW {shell} installed with {count} shell assets (old caches: {[v for v in ver if v != shell]})')
        await pg.goto(BASE + 'index.html#league'); await pg.wait_for_selector('.kt-standing-row', timeout=45000)
        await c.set_offline(True)
        offline_ok = []
        for r in ['index.html#league', 'keeper.html', 'redraft.html', 'rankings.html', 'research.html', 'tools.html', 'sunday.html', 'war-room.html', 'mock-draft.html', 'season-sim.html', 'pulse.html', 'drive.html', 'game.html', 'command.html', 'nonexistent-page.html']:
            try:
                await pg.goto(BASE + r, timeout=20000); await pg.wait_for_timeout(2500)
                t = await pg.evaluate("document.body.innerText.length")
                offline_ok.append((r, t > 20))
            except Exception as e:
                offline_ok.append((r, False))
        bad = [r for r, ok in offline_ok if not ok]
        check(not bad, f'all routes load offline from the shell (failed: {bad})')
        await pg.goto(BASE + 'index.html#league'); await pg.wait_for_timeout(5000)
        rows = await pg.locator('.kt-standing-row').count()
        check(rows == 12, f'offline League shows cached standings ({rows} rows)')
        check(not errs, f'offline no page errors {errs[:3]}')
        await c.close(); await b.close()
    print('FEATURES', 'ALL PASS' if all(r[0] for r in results) else 'SOME FAILED')

if __name__ == '__main__': asyncio.run(main())
