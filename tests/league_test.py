import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
REPO = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, sys
from playwright.async_api import async_playwright
import yahoo_test as Y  # reuse fixtures + mock handler

CUR, PREV = '1370223929452433408', '1255694966676537344'
BASE = 'http://127.0.0.1:4173/'
results = []
def check(cond, msg): results.append((bool(cond), msg)); print(('PASS ' if cond else 'FAIL ') + msg)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---------- storage unit checks ----------
        c = await b.new_context(service_workers='block'); pg = await c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE + 'offline.html')
        r = await pg.evaluate("""async ([CUR, PREV]) => {
          const m = await import('/js/data/league-connections.js'); const out = {};
          localStorage.clear();
          localStorage.setItem('kt-sleeper-league:v1', JSON.stringify({ id: CUR, savedAt: 1 }));
          out.migrated = m.getLeagueConnections().map(c => c.id);
          localStorage.setItem('kt-league-connections:v1', JSON.stringify([{ provider: 'sleeper', id: CUR }, { provider: 'sleeper', id: CUR }, { provider: 'sleeper', id: 'abc' }, { provider: 'espn', id: '1' }, null, 7]));
          out.deduped = m.getLeagueConnections().map(c => c.provider + ':' + c.id);
          let events = 0; window.addEventListener('kt:league-connection-change', () => events++);
          m.addLeagueConnection('sleeper', PREV, 'Prev season');
          out.activeAfterAdd = m.getActiveLeagueConnection().id;
          out.legacySynced = JSON.parse(localStorage.getItem('kt-sleeper-league:v1')).id;
          m.setActiveLeagueConnection('sleeper', CUR);
          out.activeAfterSet = m.getActiveLeagueConnection().id;
          m.addLeagueConnection('yahoo', '461.l.12345', 'Yahoo Test');
          out.yahooActive = m.getActiveLeagueConnection().provider;
          out.legacyCleared = localStorage.getItem('kt-sleeper-league:v1');
          out.fallback = m.removeLeagueConnection('yahoo', '461.l.12345')?.id;
          m.removeLeagueConnection('sleeper', CUR); m.removeLeagueConnection('sleeper', PREV);
          out.empty = m.getActiveLeagueConnection();
          try { m.addLeagueConnection('sleeper', '123'); out.badAccepted = true; } catch (_) { out.badAccepted = false; }
          localStorage.setItem('kt-league-connections:v1', '{not json'); out.corrupt = m.getLeagueConnections().length;
          localStorage.setItem('kt-league-connections:v1', JSON.stringify({ provider: 'sleeper', id: CUR })); out.wrongShape = m.getLeagueConnections().length;
          out.events = events;
          return out; }""", [CUR, PREV])
        check(r['migrated'] == [CUR], 'legacy kt-sleeper-league:v1 migrates')
        check(r['deduped'] == [f'sleeper:{CUR}'], f"dedupe + drop invalid entries: {r['deduped']}")
        check(r['activeAfterAdd'] == PREV and r['legacySynced'] == PREV, 'add activates + syncs legacy key')
        check(r['activeAfterSet'] == CUR, 'switch active')
        check(r['yahooActive'] == 'yahoo' and r['legacyCleared'] is None, 'Yahoo active clears legacy Sleeper key')
        check(r['fallback'] in (CUR, PREV), 'removing active falls back to remaining league')
        check(r['empty'] is None and r['badAccepted'] is False, 'empty after removing all; invalid ID rejected')
        check(r['corrupt'] == 0 and r['wrongShape'] == 0, 'malformed JSON / wrong shape tolerated')
        check(r['events'] >= 5, 'change events dispatched')
        await c.close()

        # ---------- real Sleeper UI: add both leagues, switch, reload, remove ----------
        c = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE + 'index.html#league'); await pg.wait_for_selector('#sleeper-id', timeout=30000)
        await pg.fill('#sleeper-id', f'https://sleeper.com/leagues/{CUR}/matchup'); await pg.click('#sleeper-connect button[type=submit]')
        await pg.wait_for_selector('.kt-standing-row', timeout=45000)
        rows = await pg.locator('.kt-standing-row').count()
        check(rows == 12, f'current league renders 12 standings rows ({rows})')
        text = await pg.locator('.kt-standings-card').inner_text()
        check('7–1' in text and '1217.1' in text, 'owner 7–1 / 1217.1 visible')
        await pg.click('#league-add'); await pg.wait_for_selector('#sleeper-id')
        await pg.fill('#sleeper-id', PREV); await pg.click('#sleeper-connect button[type=submit]')
        await pg.wait_for_selector('#league-active', timeout=45000); await pg.wait_for_selector('.kt-standing-row', timeout=45000)
        opts = await pg.locator('#league-active option').count()
        check(opts == 2, f'switcher lists 2 leagues ({opts})')
        # rapid switching: last selection must win
        for v in [f'sleeper:{CUR}', f'sleeper:{PREV}', f'sleeper:{CUR}']:
            await pg.select_option('#league-active', v); await pg.wait_for_timeout(120)
        await pg.wait_for_selector('.kt-standing-row', timeout=45000); await pg.wait_for_timeout(2500)
        sel = await pg.eval_on_selector('#league-active', 'e => e.value')
        stand = await pg.locator('.kt-standings-card').inner_text()
        check(sel == f'sleeper:{CUR}' and '7–1' in stand, 'rapid switching ends on the last-selected league')
        await pg.reload(); await pg.wait_for_selector('.kt-standing-row', timeout=45000)
        check(await pg.eval_on_selector('#league-active', 'e => e.value') == f'sleeper:{CUR}', 'active league persists after reload')
        pg.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.click('#league-remove'); await pg.wait_for_timeout(500); await pg.wait_for_selector('.kt-standing-row', timeout=45000)
        check(await pg.locator('#league-active option').count() == 1, 'remove active -> falls back to the other league')
        sim = await c.new_page(); await sim.goto(BASE + 'season-sim.html'); await sim.wait_for_timeout(9000)
        meta = await sim.locator('#season-league').inner_text()
        check(len(meta) > 5 and 'Week' in meta, f'other tools read the active league (Season Sim: {meta[:60]})')
        check(not errs, f'no page errors {errs}')
        await c.close()

        # ---------- Yahoo UI with mocked Worker ----------
        c = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, service_workers='block')
        await c.route('https://keeper-trade-ai.nicholas-brown00.workers.dev/yahoo/**', Y.handle)
        await c.route('https://api.sleeper.app/v1/players/nfl', lambda r: r.fulfill(status=200, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}, body=json.dumps(Y.SLEEPER_PLAYERS)))
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE + 'index.html?yahoo=connected#league')
        await pg.wait_for_selector('[data-yahoo-id]', timeout=30000)
        names = await pg.locator('[data-yahoo-id] strong').all_inner_texts()
        check(names == ['Yahoo Test League', 'Second <League>'], f'Yahoo league picker (escaped): {names}')
        check('yahoo=' not in pg.url, 'OAuth query removed from URL')
        await pg.locator('[data-yahoo-id]').first.click()
        await pg.wait_for_selector('.kt-standing-row', timeout=30000)
        check(await pg.locator('.kt-standing-row').count() == 4, 'Yahoo standings render 4 teams')
        check(await pg.locator('.kt-matchup-card').count() == 2, 'Yahoo matchups render 2 cards')
        check(await pg.locator('.kt-yahoo-attribution').count() >= 1, 'Yahoo attribution shown')
        wire = await pg.locator('.kt-wire-card').inner_text()
        print('   wire:', wire.replace(chr(10),' | ')[:200]); check(await pg.locator('.kt-wire-trade').count() == 1, 'Yahoo trade appears on trade wire')
        await pg.goto(BASE + 'index.html?yahoo=error#league'); await pg.wait_for_timeout(3000)
        await pg.click('#league-add'); await pg.wait_for_timeout(300)
        await pg.click('[data-provider=yahoo]'); await pg.click('#yahoo-connect'); await pg.wait_for_timeout(800)
        status = await pg.locator('#yahoo-status').inner_text()
        check('coming soon' in status, f'missing Worker config shows honest recovery text: {status[:70]}')
        check(not errs, f'no page errors {errs}')
        await c.close(); await b.close()
    print('ALL PASS' if all(r[0] for r in results) else 'SOME FAILED')
asyncio.run(main())
