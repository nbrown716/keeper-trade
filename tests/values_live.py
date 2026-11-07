"""Live values guard. Every value that feeds a trade or a ranking must come from a live, approved source and
refresh at least every 6 hours (owner rule, 2026-11-07). Checks:
1. Static: no code path reads a manual export (fp-data.json); every value source's cadence is <= 6 h.
2. Keeper: values are FantasyCalc + Dynasty Dealer live; if Dealer is down the status says so and values fall back
   to FantasyCalc alone (never the frozen seed); refreshes itself after 15 min on an open page.
3. Redraft + Rankings: refetch after 15 min on an open page.
4. Player baselines (Sunday "vs avg"): match an independent recomputation from raw Sleeper JSON."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
REPO = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
import asyncio, glob, json, re, statistics, urllib.request
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)
SIX_HOURS = 6 * 3600 * 1000
LIVE_PAGES = [p for p in glob.glob(_os.path.join(REPO, '*.html')) if not re.search(r'legacy|index-old|draft\.html$|kit\.html$|demo\.html$', p)]

def static_checks():
    code = {p: open(p, encoding='utf-8').read() for p in glob.glob(_os.path.join(REPO, 'js', '**', '*.js'), recursive=True) + LIVE_PAGES}
    users = [_os.path.relpath(p, REPO) for p, s in code.items() if 'fp-data.json' in s]
    check(not users, f'no live page or module reads the frozen fp-data.json export ({users})')
    sw = open(_os.path.join(REPO, 'sw.js'), encoding='utf-8').read()
    check('fp-data.json' not in sw, 'service worker no longer ships the frozen export')
    # every liveData.register for a value source must have cadence <= 6 h
    bad = []
    for path, s in code.items():
        if not path.endswith('.js'): continue
        for m in re.finditer(r"liveData\.register\([^;]*?(fantasycalc|dynastydealer)[^;]*?cadence:\s*([A-Z_]+|\d+)", s, re.S):
            raw = m.group(2)
            value = int(raw) if raw.isdigit() else int(re.search(rf'const {raw}\s*=\s*(\d+)', s).group(1))
            if value > SIX_HOURS: bad.append((_os.path.relpath(path, REPO), m.group(1), value))
    dd = open(_os.path.join(REPO, 'js', 'data', 'dynasty-dealer.js'), encoding='utf-8').read()
    cadence = int(re.search(r'const REFRESH = (\d+)', dd).group(1))
    check(cadence <= SIX_HOURS and 'cadence: REFRESH' in dd, f'Dynasty Dealer cadence {cadence / 60000:.0f} min (<= 6 h)')
    check(not bad, f'every FantasyCalc / Dynasty Dealer source refreshes within 6 h ({bad})')

async def count_requests(page, needle):
    n = {'c': 0}
    page.on('request', lambda r: n.__setitem__('c', n['c'] + 1) if needle in r.url else None)
    return n

async def main():
    static_checks()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---- Keeper: both live sources, status, refresh timer
        c = await make_context(b, {'width': 1280, 'height': 900}, False); pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.clock.install()
        fc = await count_requests(pg, 'api.fantasycalc.com'); dd = await count_requests(pg, 'dynastydealer.com')
        await pg.goto(M.BASE + 'keeper.html'); await pg.clock.run_for(8000); await pg.wait_for_timeout(4000); await pg.clock.run_for(2000)
        status = await pg.inner_text('#valStatus')
        check('FantasyCalc + Dynasty Dealer' in status and 'live' in status.lower(), f'Keeper values live from both sources ("{status.strip()}")')
        before = (fc['c'], dd['c'])
        await pg.clock.run_for(15 * 60 * 1000 + 1000); await pg.wait_for_timeout(4000); await pg.clock.run_for(2000)
        check(fc['c'] > before[0] and dd['c'] > before[1], f'Keeper refetches both sources after 15 min on an open page ({before} -> {(fc["c"], dd["c"])})')
        check(not errs, f'Keeper no errors {errs}')
        await c.close()
        # Dealer down -> FantasyCalc only, honest status, values not from the seed
        c = await make_context(b, {'width': 1280, 'height': 900}, False); await c.route(re.compile(r'https://www\.dynastydealer\.com/.*'), lambda r: r.abort())
        pg = await c.new_page(); await pg.goto(M.BASE + 'keeper.html'); await pg.wait_for_timeout(7000)
        status = await pg.inner_text('#valStatus')
        check('Dynasty Dealer reconnecting' in status, f'Dealer down: status is honest ("{status.strip()}")')
        await c.close()
        # ---- Redraft + Rankings: refresh after 15 min
        for page, needle in [('redraft.html', 'api.fantasycalc.com'), ('rankings.html', 'api.fantasycalc.com')]:
            c = await make_context(b, {'width': 1280, 'height': 900}, False); pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.clock.install(); n = await count_requests(pg, needle)
            await pg.goto(M.BASE + page); await pg.clock.run_for(6000); await pg.wait_for_timeout(4000); await pg.clock.run_for(1000)
            first = n['c']
            await pg.clock.run_for(15 * 60 * 1000 + 1000); await pg.wait_for_timeout(4000); await pg.clock.run_for(1000)
            check(first >= 1 and n['c'] > first and not errs, f'{page} refetches values after 15 min ({first} -> {n["c"]}) {errs}')
            await c.close()
        # ---- Rankings features
        c = await make_context(b, {'width': 390, 'height': 844}, True); await c.add_init_script("localStorage.setItem('kt-drive-manager:v1','9')")
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(M.BASE + 'rankings.html'); await pg.wait_for_function("document.querySelectorAll('#rk-rows tr:not(.rk-skel)').length > 20", timeout=60000); await pg.wait_for_timeout(1500)
        check(await pg.is_visible('#rk-tuned') and 'PPR' in await pg.inner_text('#rk-tuned'), f'Rankings tuned to the league ({await pg.inner_text("#rk-tuned")})')
        await pg.click('#rk-pos [data-v="TE"]'); await pg.wait_for_timeout(200)
        poss = await pg.evaluate("[...document.querySelectorAll('#rk-rows .rk-pos')].map(e => e.textContent.replace(/\\d+/g, ''))")
        check(poss and set(poss) == {'TE'}, f'position filter shows only TEs ({len(poss)} rows)')
        await pg.click('#rk-pos [data-v="ALL"]'); await pg.click('#rk-mine'); await pg.wait_for_timeout(300)
        mine = await pg.evaluate("[document.querySelectorAll('#rk-rows tr.is-mine').length, document.querySelectorAll('#rk-rows tr').length]")
        check(mine[0] > 3 and mine[0] == mine[1], f'"Your players" filter shows only your roster ({mine})')
        await pg.click('#rk-mine'); await pg.click('#rk-mode [data-v="keeper"]'); await pg.wait_for_timeout(3000)
        check('KEEPER' in (await pg.inner_text('h1')).upper() and await pg.evaluate("document.querySelectorAll('#rk-rows tr').length") > 20, 'Keeper board loads')
        await pg.fill('#rk-search', 'zzzz'); await pg.wait_for_timeout(400)
        check('No players match' in await pg.inner_text('#rk-rows'), 'empty search shows a friendly empty state')
        check(await pg.evaluate("[innerWidth, document.documentElement.scrollWidth]") == [390, 390], 'no horizontal page overflow at 390 px')
        check(not errs, f'Rankings no errors {errs}')
        await c.close()
        # ---- baselines vs independent recomputation
        c = await make_context(b, {'width': 390, 'height': 844}, True); pg = await c.new_page(); await pg.goto(M.BASE + 'index.html')
        js = await pg.evaluate("""(async () => { const m = await import('./js/data/player-baselines.js'); const r = await m.getPlayerBaselines('1370223929452433408');
          return { weeks: r.weeks, players: Object.fromEntries([...r.players].map(([id, v]) => [id, [v.games, Math.round(v.mean * 100) / 100]])) }; })()""")
        await c.close()
        L = '1370223929452433408'; get = lambda u: json.load(urllib.request.urlopen(urllib.request.Request('https://api.sleeper.app/v1/' + u, headers={'User-Agent': 'KeeperTrade/1.0'})))
        games = {}
        for w in js['weeks']:
            for m in get(f'league/{L}/matchups/{w}'):
                for pid, pts in (m.get('players_points') or {}).items():
                    if pts: games.setdefault(pid, []).append(pts)
        py = {pid: [len(v), round(statistics.mean(v), 2)] for pid, v in games.items()}
        mism = [(pid, js['players'].get(pid), v) for pid, v in py.items() if not js['players'].get(pid) or js['players'][pid][0] != v[0] or abs(js['players'][pid][1] - v[1]) > 0.011]  # 0.01 rounding tolerance
        check(not mism and len(py) == len(js['players']), f'baselines for {len(py)} players match an independent recomputation (weeks {js["weeks"][0]}-{js["weeks"][-1]}) {mism[:3]}')
        await b.close()
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
