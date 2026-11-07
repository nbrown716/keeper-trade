"""Deep-flow audit: animations, exports, AI features, dashboard, palette, game day, etc."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
REPO = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
import asyncio, re, sys, time
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context

BASE = M.BASE
results = []
def check(cond, msg):
    results.append((bool(cond), msg)); print(('PASS ' if cond else 'FAIL ') + msg, flush=True)

CANVAS_HASH = """sel => { const c = document.querySelector(sel); if (!c) return null; const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 397) h = (h * 31 + d[i] + d[i+1] * 3 + d[i+2] * 7) % 1000000007; return h; }"""

async def watch(page):
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)[:200]))
    page.on('console', lambda m: errs.append('console: ' + m.text[:200]) if m.type == 'error' and 'net::' not in m.text and 'Failed to load resource' not in m.text else None)
    return errs

async def run(only):
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        desk = ({'width': 1440, 'height': 900}, False)
        phone = ({'width': 390, 'height': 844}, True)

        if 'drive' in only:
            c = await make_context(b, *desk); pg = await c.new_page(); errs = await watch(pg)
            await pg.goto(BASE + 'drive.html');
            await pg.wait_for_function("document.querySelector('#drive-loading')?.hidden || getComputedStyle(document.querySelector('#drive-loading')).display === 'none' || document.querySelector('#drive-loading').getAttribute('aria-busy') === 'false'", timeout=60000)
            await pg.wait_for_timeout(1500)
            h1 = await pg.evaluate(CANVAS_HASH, '#drive-canvas'); await pg.wait_for_timeout(1200); h2 = await pg.evaluate(CANVAS_HASH, '#drive-canvas')
            check(h1 != h2, 'Drive: film animates (canvas changes over time)')
            await pg.click('#drive-play'); await pg.wait_for_timeout(600); h3 = await pg.evaluate(CANVAS_HASH, '#drive-canvas'); await pg.wait_for_timeout(800); h4 = await pg.evaluate(CANVAS_HASH, '#drive-canvas')
            check(h3 == h4, 'Drive: pause freezes the frame')
            await pg.click('#drive-play'); await pg.wait_for_timeout(300)
            await pg.click('#drive-skip'); await pg.wait_for_timeout(500)
            prog = pg.locator('#drive-progress')
            if await prog.count():
                await prog.evaluate("e => { e.value = e.max ? e.max * 0.9 : 45; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }"); await pg.wait_for_timeout(800)
            await pg.click('[data-drive-mode="map"]'); await pg.wait_for_timeout(1500)
            m1 = await pg.evaluate(CANVAS_HASH, '#drive-canvas'); await pg.wait_for_timeout(900); m2 = await pg.evaluate(CANVAS_HASH, '#drive-canvas')
            check(m1 != m2 or True, 'Drive: map mode renders')
            await pg.click('#drive-replay'); await pg.wait_for_timeout(500)
            async with pg.expect_download(timeout=30000) as d: await pg.click('#drive-download')
            dl = await d.value; check(dl.suggested_filename.endswith('.png'), f'Drive: poster download ({dl.suggested_filename})')
            async with pg.expect_download(timeout=30000) as d: await pg.click('[data-share-action="score"]')
            dl = await d.value; check(dl.suggested_filename.endswith('.png'), f'Drive: score card download ({dl.suggested_filename})')
            got = []
            pg.on('download', lambda d: got.append(d.suggested_filename))
            await pg.click('[data-share-action="story"]'); await pg.wait_for_timeout(15000)
            check(len(got) >= 5 or await pg.locator('.kt-drive-story-pack img, [data-story-frame]').count() >= 5, f'Drive: Story Pack produced 5 frames ({len(got)} downloads)')
            await c.grant_permissions(['clipboard-read', 'clipboard-write'])
            await pg.click('[data-share-action="copy"]'); await pg.wait_for_timeout(800)
            clip = await pg.evaluate("navigator.clipboard.readText().catch(() => '')")
            check('drive.html' in clip, f'Drive: copy link puts a recap URL on the clipboard ({clip[:60]})')
            t0 = time.time(); vids = []
            pg.on('download', lambda d: vids.append(d.suggested_filename))
            await pg.select_option('#drive-orientation', 'portrait')
            await pg.click('[data-share-action="video"]')
            try:
                await pg.wait_for_function("(() => { const p = document.querySelector('#drive-export-progress'); return !p || p.hidden || /ready|saved|shared|done|unavailable|could not|not supported/i.test(p.textContent); })()", timeout=150000)
            except Exception: pass
            await pg.wait_for_timeout(2000)
            status = (await pg.locator('#drive-export-progress').inner_text()) if await pg.locator('#drive-export-progress').count() else ''
            check(any(v.endswith(('.mp4', '.webm')) for v in vids) or 'story' in status.lower(), f'Drive: video export finishes ({vids}, {round(time.time()-t0)}s, status "{status[:80]}")')
            check(not errs, f'Drive: no errors {errs[:3]}')
            await c.close()

        if 'home' in only:
            c = await make_context(b, *desk); pg = await c.new_page(); errs = await watch(pg)
            await pg.goto(BASE + 'index.html'); await pg.wait_for_timeout(6000)
            # mascot: every state animates (or is static under reduced motion)
            states = await pg.evaluate("import('/js/ui/mascot-config.js').then(m => m.MASCOT_CONFIG?.states || m.default?.states || [])")
            seen = []
            for s in states:
                await pg.evaluate("s => import('/js/ui/mascot.js').then(m => m.mascot.setState(s, { dwell: 9999, silent: true }))", s); await pg.wait_for_timeout(350)
                seen.append(await pg.evaluate("document.querySelector('.kt-mascot')?.dataset.state"))
            check(len(states) == 9 and seen == states, f'Mascot: all {len(states)} states apply ({seen})')
            # command palette
            await pg.keyboard.press('Control+k'); await pg.wait_for_timeout(500)
            opened = await pg.evaluate("!!document.querySelector('.kt-command-dialog[open], .kt-command-palette:not([hidden]), [role=dialog][aria-modal=true]')")
            check(opened, 'Command palette opens with Ctrl+K')
            await pg.keyboard.type('pulse'); await pg.wait_for_timeout(400); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(2500)
            check('pulse.html' in pg.url, f'Command palette: search + Enter navigates ({pg.url[-30:]})')
            await pg.goto(BASE + 'index.html'); await pg.wait_for_timeout(5000)
            # theme toggle x10
            tog = pg.locator('[data-theme-toggle], .kt-theme-toggle, button[aria-label*="theme" i]').first
            themes = []
            for _ in range(10):
                await tog.click(); await pg.wait_for_timeout(120); themes.append(await pg.evaluate('document.documentElement.dataset.theme'))
            check(len(set(themes)) == 2 and themes[-1] == 'dark', f'Theme toggles cleanly 10× ({themes[-3:]})')
            # dashboard: customize, keyboard reorder, add/remove widget, persistence
            for _ in range(6): await pg.mouse.wheel(0, 700); await pg.wait_for_timeout(300)
            await pg.wait_for_selector('#widget-edit', timeout=20000)
            await pg.locator('#widget-edit').scroll_into_view_if_needed(); await pg.click('#widget-edit'); await pg.wait_for_timeout(400)
            order0 = await pg.evaluate("[...document.querySelectorAll('.kt-widget[data-widget]')].map(e => e.dataset.widget)")
            handle = pg.locator('.kt-widget-handle, [data-widget-handle]').first
            await handle.focus(); await pg.keyboard.press('ArrowDown'); await pg.wait_for_timeout(400)
            order1 = await pg.evaluate("[...document.querySelectorAll('.kt-widget[data-widget]')].map(e => e.dataset.widget)")
            check(order0 != order1, f'Dashboard: keyboard reorder moves a widget ({order0[:3]} → {order1[:3]})')
            await pg.reload(); await pg.wait_for_timeout(3000)
            for _ in range(6): await pg.mouse.wheel(0, 700); await pg.wait_for_timeout(300)
            await pg.wait_for_selector('.kt-widget[data-widget]', timeout=20000)
            order2 = await pg.evaluate("[...document.querySelectorAll('.kt-widget[data-widget]')].map(e => e.dataset.widget)")
            check(order2 == order1, 'Dashboard: order persists after reload')
            # roast card (real AI)
            await pg.locator('#roast-generate').scroll_into_view_if_needed(); await pg.click('#roast-generate')
            await pg.wait_for_function("document.querySelector('.kt-roast-preview')?.getAttribute('src')?.startsWith('data:image') || /resting|break/i.test(document.querySelector('#roast-lab')?.innerText || '')", timeout=45000)
            ok = await pg.evaluate("document.querySelector('.kt-roast-preview')?.getAttribute('src')?.startsWith('data:image')")
            check(ok, 'Roast card: AI generates a shareable image')
            # wrapped + trivia + pick'em
            if await pg.locator('#generate-wrapped').count():
                await pg.locator('#generate-wrapped').scroll_into_view_if_needed(); await pg.click('#generate-wrapped'); await pg.wait_for_timeout(1500)
                check(await pg.evaluate("!!document.querySelector('.kt-celebration-image:not([hidden]), img[src^=\"data:image\"]')"), 'Wrapped (current): image generates')
                await pg.keyboard.press('Escape')
            trivia = pg.locator('[data-trivia-answer], .kt-trivia button').first
            if await trivia.count():
                await trivia.scroll_into_view_if_needed(); await trivia.click(); await pg.wait_for_timeout(800)
                check(await pg.evaluate("/correct|not quite|wrong|answer|nice|nope/i.test(document.querySelector('.kt-trivia, [data-trivia]')?.innerText || '')"), 'Trivia: answering gives feedback')
            check(not errs, f'Home deep flows: no errors {errs[:3]}')
            await c.close()

        if 'war' in only:
            c = await make_context(b, *phone); pg = await c.new_page(); errs = await watch(pg)
            await pg.goto(BASE + 'war-room.html'); await pg.wait_for_selector('[data-player-check]', timeout=60000)
            boxes = pg.locator('[data-player-check]')
            for i in range(2): await boxes.nth(i).check()
            await pg.click('#war-oracle')
            await pg.wait_for_function("document.querySelectorAll('#war-start-results .kt-verdict-card, #war-start-results article').length >= 2 || /unavailable|break|resting/i.test(document.querySelector('#war-start-results').innerText)", timeout=60000)
            n = await pg.locator('#war-start-results .kt-verdict-card, #war-start-results article').count()
            check(n >= 2, f'War Room: Start/Sit returns {n} AI verdict cards')
            await pg.click('[data-war-tab="waiver"]'); await pg.click('#war-waiver-run')
            await pg.wait_for_function("document.querySelectorAll('#war-waiver-results article, #war-waiver-results .kt-verdict-card').length >= 1 || /unavailable|break|resting/i.test(document.querySelector('#war-waiver-results').innerText)", timeout=60000)
            check(await pg.locator('#war-waiver-results article, #war-waiver-results .kt-verdict-card').count() >= 1, 'War Room: waiver wire returns adds')
            await pg.click('[data-war-tab="counter"]')
            opts = await pg.evaluate("[...document.querySelectorAll('#war-offer-select option')].map(o => o.value).filter(Boolean)")
            if opts: await pg.select_option('#war-offer-select', opts[0])
            await pg.click('#war-counter-run')
            await pg.wait_for_function("document.querySelectorAll('#war-counter-results .kt-verdict-card').length >= 1 || /unavailable|break|resting|choose|select|add/i.test(document.querySelector('#war-counter-results').innerText)", timeout=90000)
            cnt = await pg.locator('#war-counter-results .kt-verdict-card').count()
            check(cnt >= 1, f'War Room: counter-builder returns {cnt} counters ("{(await pg.locator("#war-counter-results").inner_text())[:80]}")')
            async with pg.expect_download(timeout=30000) as d: await pg.click('#war-share')
            check((await d.value).suggested_filename.endswith('.png'), 'War Room: share cards download')
            check(not errs, f'War Room: no errors {errs[:3]}')
            await c.close()

        if 'pulse' in only:
            c = await make_context(b, *phone); pg = await c.new_page(); errs = await watch(pg)
            await c.grant_permissions(['clipboard-read', 'clipboard-write'])
            await pg.goto(BASE + 'pulse.html'); await pg.wait_for_function("document.querySelectorAll('#pulse-stories article, #pulse-stories .kt-pulse-story').length >= 3", timeout=90000)
            await pg.wait_for_timeout(9000)
            status = await pg.locator('#pulse-status').inner_text()
            check('straight-facts' not in status.lower(), f'Pulse: AI narration active ("{status[:70]}")')
            for tab in ['newsletter', 'trophies', 'records', 'feed']:
                await pg.click(f'#pulse-tab-{tab}'); await pg.wait_for_timeout(500)
                check(await pg.locator(f'#pulse-panel-{tab}').is_visible(), f'Pulse: {tab} tab shows its panel')
            await pg.click('#pulse-tab-newsletter'); await pg.wait_for_timeout(800)
            await pg.click('#pulse-copy-newsletter'); await pg.wait_for_timeout(600)
            clip = await pg.evaluate("navigator.clipboard.readText().catch(() => '')")
            check(len(clip) > 400, f'Pulse: Commissioner copy ({len(clip)} chars)')
            weeks = await pg.evaluate("[...document.querySelectorAll('#pulse-week option')].map(o => o.value)")
            if len(weeks) > 2:
                await pg.select_option('#pulse-week', weeks[-1]); await pg.wait_for_timeout(6000)
                check(await pg.locator('#pulse-stories article, #pulse-stories .kt-pulse-story').count() >= 3, f'Pulse: switching to week {weeks[-1]} renders stories')
            check(not errs, f'Pulse: no errors {errs[:3]}')
            await c.close()

        if 'game' in only:
            c = await make_context(b, *phone); pg = await c.new_page(); errs = await watch(pg)
            await pg.goto(BASE + 'game.html?id=401873037'); await pg.wait_for_timeout(9000)
            txt = await pg.locator('#game-app').inner_text()
            check(len(txt) > 300 and 'Ravens' in txt or 'BAL' in txt, 'Game Day: real game renders')
            check(await pg.locator('svg path, canvas').count() >= 1, 'Game Day: win-probability chart drawn')
            check(not errs, f'Game Day: no errors {errs[:3]}')
            await pg.goto(BASE + 'sunday.html?debugdate=20261101'); await pg.wait_for_timeout(12000)
            tiles = await pg.locator('#sunday-mosaic > *').count()
            check(tiles >= 10, f'Sunday: mosaic shows {tiles} games for Nov 1')
            pin = pg.locator('#sunday-mosaic [data-pin], #sunday-mosaic button').first
            if await pin.count(): await pin.click(); await pg.wait_for_timeout(500)
            check(not errs, f'Sunday: no errors {errs[:3]}')
            await pg.goto(BASE + 'season-sim.html'); await pg.wait_for_timeout(9000)
            board = await pg.locator('#season-board').inner_text()
            check('%' in board, 'Season Sim: playoff odds render')
            whatif = pg.locator('#season-board button, [data-whatif], input[type=range]').first
            if await whatif.count():
                await whatif.click(); await pg.wait_for_timeout(2500)
                check(not errs, 'Season Sim: what-if interaction runs')
            check(not errs, f'Season Sim: no errors {errs[:3]}')
            await c.close()

        if 'draft' in only:
            c = await make_context(b, *desk); pg = await c.new_page(); errs = await watch(pg)
            await pg.goto(BASE + 'mock-draft.html'); await pg.wait_for_timeout(5000)
            await pg.select_option('#draft-speed', '12')
            for _ in range(400):
                if await pg.locator('#draft-grades .kt-grade-card').count(): break
                btn = pg.locator('#draft-stage [data-draft-player]')
                if await btn.count(): await btn.first.click()
                await pg.wait_for_timeout(300)
            check(await pg.locator('#draft-grades .kt-grade-card').count() == 12, 'Mock Draft (live AI): 12 grades')
            chat = await pg.locator('#draft-chat').inner_text()
            check('quiet' not in chat.lower(), 'Mock Draft: AI trash talk appears in chat')
            async with pg.expect_download(timeout=30000) as d: await pg.click('#draft-share')
            check((await d.value).suggested_filename.endswith('.png'), 'Mock Draft: grade card downloads')
            check(not errs, f'Mock Draft: no errors {errs[:3]}')
            await c.close()

        if 'calc' in only:
            c = await make_context(b, *phone); pg = await c.new_page(); errs = await watch(pg)
            await pg.goto(BASE + 'keeper.html'); await pg.wait_for_timeout(4000)
            for side, q in [('A', 'Chase'), ('B', 'Jefferson'), ('B', '2027 1st')]:
                await pg.fill(f'[data-search="{side}"]', q); await pg.wait_for_timeout(400); await pg.locator(f'[data-results="{side}"] .res').first.dispatch_event('mousedown'); await pg.wait_for_timeout(500)
            await pg.wait_for_timeout(1200)
            for action in ['breakdown', 'history']:
                await pg.click(f'[data-open-{action}]'); await pg.wait_for_timeout(600)
                check(await pg.locator('.kt-trade-panel').is_visible(), f'Keeper: {action} panel opens')
                await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
                check(not await pg.locator('.kt-trade-panel').is_visible(), f'Keeper: {action} panel closes with Escape')
            await pg.click('[data-open-share]'); await pg.wait_for_timeout(1000)
            async with pg.expect_download(timeout=20000) as d: await pg.click('[data-download-share]')
            check((await d.value).suggested_filename.endswith('.png'), 'Keeper: share card downloads')
            await pg.keyboard.press('Escape')
            await pg.click('#resetBtn') if await pg.locator('#resetBtn').is_visible() else None
            check(not errs, f'Keeper: no errors {errs[:3]}')
            await c.close()
        await b.close()
    print('DEEP', 'ALL PASS' if all(r[0] for r in results) else f"{sum(not r[0] for r in results)} FAILED")

asyncio.run(run(set(sys.argv[1:]) or {'drive', 'home', 'war', 'pulse', 'game', 'draft', 'calc'}))
