"""Trade Value Chart. Week = Sleeper's NFL state. Values = the calculators' own market (itself checked against an
independent recomputation in format_verify.py); "This season" values are recomputed here from the raw FantasyCalc
redraft payload. Opponents and byes are checked for every row against raw Sleeper weekly projections."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, math, re, urllib.request
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)
jsround = lambda x: math.floor(x + 0.5)
H = {'User-Agent': 'KeeperTrade/1.0'}
get = lambda u: json.load(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=30))
TEAM = lambda t: {'JAC': 'JAX', 'WSH': 'WAS', 'LA': 'LAR'}.get(t, t)
ROWS = """[...document.querySelectorAll('.tv-section')].map(s => ({ pos: s.id.slice(3), rows: [...s.querySelectorAll('tbody tr[data-id]')].map(tr => ({ id: tr.dataset.id, rank: tr.querySelector('.tv-rank').textContent, name: tr.querySelector('.tv-name').childNodes[0].textContent, team: tr.children[2].textContent, value: +tr.querySelector('.tv-value strong').textContent.replace(/,/g, ''), opp: [...tr.querySelectorAll('.tv-opp')].map(td => td.textContent), mine: tr.classList.contains('is-mine') })) }))"""

async def main():
    state = get('https://api.sleeper.app/v1/state/nfl'); week = int(state.get('display_week') or state['week']); season = state['season']
    weeks = [w for w in (week, week + 1, week + 2) if w <= 18]
    sched = {}
    for w in weeks:
        sched[w] = {TEAM(r['team']): TEAM(r['opponent']) for r in get(f'https://api.sleeper.app/projections/nfl/{season}/{w}?season_type=regular&position[]=QB&order_by=pts_ppr') if r.get('team') and r.get('opponent')}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c = await make_context(b, {'width': 1280, 'height': 900}, False); await c.add_init_script("localStorage.setItem('kt-drive-manager:v1','9')")
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); raw = {}
        async def grab(resp):
            try:
                if 'api.fantasycalc.com/values/current' in resp.url and 'isDynasty=false' in resp.url: raw['redraft'] = await resp.json()
            except Exception: pass
        pg.on('response', lambda r: asyncio.ensure_future(grab(r)))
        await pg.goto(M.BASE + 'trade-values.html'); await pg.wait_for_selector('#tv-QB tbody tr[data-id]', timeout=60000); await pg.wait_for_timeout(500)
        eyebrow = await pg.inner_text('#tv-eyebrow'); title = await pg.title()
        check(f'WEEK {week}' in eyebrow.upper() and f'Week {week} ' in title and season in eyebrow, f'chart is labelled with the live NFL week ("{eyebrow}", "{title}")')
        check(await pg.get_attribute('#tv-mode [data-v="longterm"]', 'aria-pressed') == 'true', 'a keeper league opens on Keeper & Dynasty values')
        check('Synced to' in await pg.inner_text('#tv-format .kt-fmt-note') and '6pt pass TD' in await pg.inner_text('#tv-status'), 'synced to the league scoring, and the status line names it')
        sections = await pg.evaluate(ROWS)
        market = await pg.evaluate("""(async () => { const m = await import('./js/data/trade-market.js'); const k = await m.getMarket('keeper'); return Object.fromEntries(k.players.filter(p => p.sleeperId).map(p => [p.sleeperId, p.value])); })()""")
        allrows = [r for s in sections for r in s['rows']]
        check(len(sections) == 4 and [len(s['rows']) for s in sections] == [24, 40, 48, 18], f'four position tables with the top players ({[(s["pos"], len(s["rows"])) for s in sections]})')
        bad = [(r['name'], r['value'], market.get(r['id'])) for r in allrows if market.get(r['id']) != r['value']]
        check(not bad, f'every value equals the Keeper calculator market for that player ({len(allrows)} rows) {bad[:3]}')
        order = all([r['value'] for r in s['rows']] == sorted([r['value'] for r in s['rows']], reverse=True) and [r['rank'] for r in s['rows']] == [f'{s["pos"]}{i + 1}' for i in range(len(s['rows']))] for s in sections)
        check(order, 'each table is sorted by value and ranked QB1, QB2, ...')
        heads = await pg.evaluate("[...document.querySelectorAll('#tv-QB thead th')].map(th => th.textContent)")
        check(heads[5:] == [f'Wk {w}' for w in weeks], f'matchup columns are the next three weeks ({heads[5:]})')
        wrong = [(r['name'], r['team'], r['opp'], [sched[w].get(TEAM(r['team']), 'BYE') for w in weeks]) for r in allrows if r['team'] != 'FA' and r['opp'] != [sched[w].get(TEAM(r['team']), 'BYE') for w in weeks]]
        byes = sum(o == 'BYE' for r in allrows for o in r['opp'])
        check(not wrong and byes > 0, f'every opponent and bye matches raw Sleeper data ({len(allrows)} rows x {len(weeks)} weeks, {byes} byes) {wrong[:2]}')
        roster = set(map(str, next(r for r in get('https://api.sleeper.app/v1/league/1370223929452433408/rosters') if r['roster_id'] == 9)['players']))
        mine = {r['id'] for r in allrows if r['mine']}
        check(mine and mine == {r['id'] for r in allrows} & roster, f'your own players are highlighted, and only yours ({len(mine)})')
        await pg.click('#tv-TE .tv-more'); await pg.wait_for_timeout(200); n = await pg.locator('#tv-TE tbody tr[data-id]').count()
        check(n > 18 and 'Show top 18' in await pg.inner_text('#tv-TE .tv-more'), f'"Show all" expands a table ({n} tight ends)')
        # ---- This season (redraft): recompute non-QB values from the raw FantasyCalc payload
        await pg.click('#tv-mode [data-v="redraft"]'); await pg.wait_for_function("/Live · FantasyCalc ·/.test(document.querySelector('#tv-status').textContent)", timeout=60000); await pg.wait_for_timeout(400)
        sections = await pg.evaluate(ROWS); fc = raw.get('redraft') or []
        top = max((r['value'] for r in fc if r['player']['position'] in ('QB', 'RB', 'WR', 'TE')), default=0)
        want = {str(r['player'].get('sleeperId')): jsround(r['value']) for r in fc if r['player'].get('sleeperId')} if top else {}   # FantasyCalc's own number, as on Rankings (Redraft)
        rows = [r for s in sections if s['pos'] != 'QB' for r in s['rows']]
        bad = [(r['name'], r['value'], want.get(r['id'])) for r in rows if want.get(r['id']) != r['value']]
        check(top > 0 and len(rows) > 90 and not bad, f'This season: {len(rows)} RB / WR / TE values are FantasyCalc\'s raw redraft values {bad[:3]}')
        rk = await c.new_page(); await rk.goto(M.BASE + 'rankings.html?mode=redraft'); await rk.wait_for_function("document.querySelectorAll('#rk-rows tr:not(.rk-skel)').length > 20", timeout=60000); await rk.wait_for_timeout(800)
        board = dict(await rk.evaluate("[...document.querySelectorAll('#rk-rows tr')].map(tr => [tr.querySelector('.rk-name').childNodes[0].textContent, +tr.querySelector('.rk-value strong').textContent.replace(/,/g, '')])")); await rk.close()
        both = [(r['name'], r['value'], board[r['name']]) for s in sections for r in s['rows'] if r['name'] in board]
        check(len(both) > 100 and all(a == b2 for _, a, b2 in both), f'This season values equal the Rankings Redraft board, QBs included ({len(both)} players) {[x for x in both if x[1] != x[2]][:3]}')
        check('mode=redraft' in pg.url, 'the chosen chart is kept in the address (shareable)')
        check(not errs, f'no page errors {errs}'); await c.close()
        # ---- phone, no league
        c = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(M.BASE + 'trade-values.html'); await pg.wait_for_selector('#tv-QB tbody tr[data-id]', timeout=60000)
        check(await pg.get_attribute('#tv-mode [data-v="redraft"]', 'aria-pressed') == 'true' and 'No league synced' in await pg.inner_text('#tv-format .kt-fmt-note'), 'no league: opens on This season and says no league is synced')
        check(await pg.evaluate('[innerWidth, document.documentElement.scrollWidth]') == [390, 390], 'phone: no sideways page scroll (tables scroll inside their cards)')
        check(not errs, f'phone: no page errors {errs}')
        await b.close()
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
