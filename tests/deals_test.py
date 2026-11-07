"""Deals: real league trades, vote → reveal, database, market, teams, binder, record. Verifies trade data against
raw Sleeper JSON (every completed trade in every season of the lineage appears, assets correct) and the model read
against an independent recomputation from the same market values."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, re, urllib.request
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)
L = '1370223929452433408'
get = lambda u: json.load(urllib.request.urlopen(urllib.request.Request('https://api.sleeper.app/v1/' + u, headers={'User-Agent': 'KeeperTrade/1.0'})))

def raw_trades():
    out = {}
    lid = L
    while lid and lid not in ('0', 'None'):
        league = get(f'league/{lid}')
        for w in range(1, 19):
            for tx in get(f'league/{lid}/transactions/{w}') or []:
                if tx['type'] == 'trade' and tx['status'] == 'complete' and len(tx.get('roster_ids') or []) == 2:
                    out[str(tx['transaction_id'])] = tx
        lid = str(league.get('previous_league_id') or '')
    return out

async def main():
    raw = raw_trades()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c = await make_context(b, {'width': 390, 'height': 844}, True); await c.add_init_script("localStorage.setItem('kt-drive-manager:v1','9'); localStorage.removeItem('kt-deal-votes:v1')")
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(M.BASE + 'deals.html'); await pg.wait_for_selector('.dl-card', timeout=120000)
        await pg.screenshot(path='review/deals-call.png', full_page=True)
        data = await pg.evaluate("""(async () => {
          const m = await import('./js/data/trade-market.js'); const { getPlayerDatabase } = await import('./js/data/player-db.js');
          const players = await getPlayerDatabase(); const trades = await m.loadLeagueTrades('%s', players);
          const market = await m.getMarket('keeper');
          const ctx = { type: 'keeper', keepersGone: 24, teams: 12, nextDraft: 2027, season: 2026 };
          return trades.map(t => { const r = m.modelRead(t, market, ctx); return { id: t.id, leagueId: t.leagueId, week: t.week, sides: t.sides.map(s => ({ production: s.production, rosterId: s.rosterId, players: s.gets.filter(a => a.kind === 'player').map(a => a.id).sort(), picks: s.gets.filter(a => a.kind === 'pick').map(a => a.season + '-' + a.round).sort() })), totals: r.sides.map(s => s.total), assetVals: r.sides.map(s => s.assets.map(a => a.value)), winner: r.winner, diff: r.diff }; });
        })()""" % L)
        ids = {t['id'] for t in data}
        check(set(raw) == ids, f'every completed 2-team trade in every season appears ({len(ids)} shown, {len(raw)} in Sleeper) missing={sorted(set(raw) - ids)[:3]} extra={sorted(ids - set(raw))[:3]}')
        wrong = []
        for t in data:
            tx = raw.get(t['id'])
            if not tx: continue
            for side in t['sides']:
                rid = side['rosterId']
                players = sorted(pid for pid, to in (tx.get('adds') or {}).items() if to == rid)
                picks = sorted(f"{pk['season']}-{pk['round']}" for pk in tx.get('draft_picks') or [] if pk['owner_id'] == rid and pk['previous_owner_id'] != rid)
                if players != side['players'] or picks != side['picks']: wrong.append((t['id'], rid))
        check(not wrong, f'each side shows exactly the players and picks it received {wrong[:3]}')
        # production since the trade, independently from raw matchups (that season, starters for the new team, weeks >= leg)
        mcache = {}
        def matchups(lid, w):
            if (lid, w) not in mcache: mcache[(lid, w)] = get(f'league/{lid}/matchups/{w}') or []
            return mcache[(lid, w)]
        off = []
        for t in data:
            for side in t['sides']:
                total = 0.0
                for w in range(t['week'], 19):
                    for m in matchups(t['leagueId'], w):
                        if m.get('roster_id') == side['rosterId']:
                            total += sum(float(m['players_points'].get(pid, 0) or 0) for pid in side['players'] if pid in (m.get('starters') or []))
                if abs(round(total, 1) - side['production']) > 0.11: off.append((t['id'], side['rosterId'], side['production'], round(total, 1)))
        check(not off, f'"since the trade" production matches raw Sleeper for every side of every trade {off[:3]}')
        bad_math = [t['id'] for t in data if any(abs(sum(v or 0 for v in vals) - tot) > 0.5 for vals, tot in zip(t['assetVals'], t['totals'])) or (abs(t['diff']) <= 1000) != (t['winner'] == -1) or (t['winner'] == 0) != (t['diff'] > 1000)]
        check(not bad_math, f'model read: totals = sum of assets; inside 1,000 = even, else bigger side wins {bad_math[:3]}')
        # vote → reveal
        hidden = await pg.locator('.dl-val').count()
        check(hidden == 0, 'values stay hidden before you vote')
        await pg.click('[data-vote="A"]'); await pg.wait_for_timeout(300)
        check(await pg.locator('.dl-reveal').count() == 1 and await pg.locator('.dl-val').count() > 0, 'voting reveals the model read and every value')
        verdict = await pg.inner_text('.dl-verdict')
        check(re.search(r'(won by [\d,]+|Even: [\d,]+ apart)', verdict), f'verdict states the margin ("{verdict.strip()[:80]}")')
        await pg.screenshot(path='review/deals-reveal.png', full_page=True)
        check(await pg.locator('.dl-crowd').count() == 0, 'league votes hidden while the Worker vote route is not deployed')
        stored = await pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('kt-deal-votes:v1') || '{}')).length")
        check(stored == 1, 'your vote is saved on this device')
        await pg.click('[data-revote]'); await pg.wait_for_timeout(200)
        check(await pg.locator('[data-vote]').count() == 3, '"Change my call" re-opens the vote')
        await pg.click('[data-vote="E"]'); await pg.wait_for_timeout(200)
        # tabs
        for tab in ['database', 'market', 'teams', 'binder', 'record']:
            await pg.click(f'[role="tab"][data-tab="{tab}"]'); await pg.wait_for_timeout(500)
            visible = await pg.locator(f'#dl-panel-{tab}').is_visible()
            text = await pg.inner_text(f'#dl-panel-{tab}')
            width = await pg.evaluate('[innerWidth, document.documentElement.scrollWidth]')
            check(visible and len(text) > 40 and not re.search(r'NaN|undefined|Infinity|null', text) and width == [390, 390], f'{tab} tab renders, no overflow ({len(text)} chars, {width})')
            await pg.screenshot(path=f'review/deals-{tab}.png', full_page=True)
        teams = await pg.evaluate("document.querySelectorAll('.dl-teams li').length") if await pg.locator('#dl-panel-teams').count() else 0
        await pg.click('[role="tab"][data-tab="teams"]'); await pg.wait_for_timeout(300)
        check(await pg.locator('.dl-teams li').count() == 12, 'team values rank all 12 teams')
        await pg.click('[role="tab"][data-tab="database"]'); await pg.fill('#dl-q', 'zzzz'); await pg.wait_for_timeout(300)
        check('No trades match' in await pg.inner_text('#dl-list'), 'database search: friendly empty state')
        await pg.fill('#dl-q', ''); await pg.wait_for_timeout(300)
        await pg.locator('[data-open-trade]').first.click(); await pg.wait_for_timeout(300)
        check(await pg.locator('#dl-panel-call').is_visible(), 'opening a trade from the database jumps to its card')
        await pg.focus('[role="tab"][data-tab="call"]'); await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(200)
        check(await pg.get_attribute('[role="tab"][data-tab="database"]', 'aria-selected') == 'true', 'tabs work with arrow keys')
        check(await pg.evaluate("[innerWidth, document.documentElement.scrollWidth]") == [390, 390], 'no horizontal overflow at 390 px')
        # binder: a saved keeper trade re-priced with today's values
        await pg.evaluate("""localStorage.setItem('kt-trade-history:v1:keeper', JSON.stringify([{ signature: 't1', date: Date.now() - 86400000, verdict: 'TEAM A WINS', names: ['Alpha', 'Bravo'],
          sides: { A: [{ uid: 1, ref: { n: "Ja'Marr Chase", p: 'WR', pick: false }, mv: 50 }], B: [{ uid: 2, ref: { n: '2027 Round 2', pick: true, round: 2, yr: 0 }, mv: 40 }] } }]))""")
        await pg.click('[role="tab"][data-tab="binder"]'); await pg.wait_for_timeout(400)
        binder = await pg.inner_text('#dl-panel-binder')
        now = await pg.evaluate("""(async () => { const m = await import('./js/data/trade-market.js'); const market = await m.getMarket('keeper');
          return [m.playerValue(market, null, "Ja'Marr Chase").value, m.pickValue(market, { round: 2, season: 2027 }, { type: 'keeper', keepersGone: 24, teams: 12, nextDraft: 2027 })]; })()""")
        exp_a = f"5,000 → {now[0]:,}"; exp_b = f"4,000 → {now[1]:,}"
        check(exp_a in binder and exp_b in binder, f'binder re-prices a saved trade: player and pick then → now ({exp_a}; {exp_b})')
        await pg.add_script_tag(url=M.AXE)
        ax = await pg.evaluate("axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa'] } }).then(r => r.violations.map(v => v.id + ':' + v.nodes.length + ':' + v.nodes[0].target.join(' ').slice(0, 50)))")
        check(not ax, f'axe WCAG AA clean {ax}')
        check(not errs, f'no page errors {errs}')
        # ---- with the Worker vote route live (mocked): the league split shows after you vote, and your vote posts
        c2 = await make_context(b, {'width': 390, 'height': 844}, True); await c2.add_init_script("localStorage.removeItem('kt-deal-votes:v1')")
        posted = []
        async def votes_route(route):
            req = route.request
            if req.method == 'GET':
                ids = re.search(r'trades=([\d,]+)', req.url).group(1).split(',')
                body = {'status': 'ok', 'counts': {i: {'A': 3, 'E': 1, 'B': 0} for i in ids}}
            else:
                payload = json.loads(req.post_data); posted.append(payload)
                body = {'status': 'ok', 'counts': {'A': 4 if payload['pick'] == 'A' else 3, 'E': 1, 'B': 0}}
            await route.fulfill(status=200, body=json.dumps(body), headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'})
        await c2.route(re.compile(r'https://keeper-trade-ai\.nicholas-brown00\.workers\.dev/votes.*'), votes_route)
        pg2 = await c2.new_page(); await pg2.goto(M.BASE + 'deals.html'); await pg2.wait_for_selector('[data-vote]', timeout=120000); await pg2.wait_for_timeout(1500)
        await pg2.click('[data-vote="A"]'); await pg2.wait_for_timeout(1500)
        crowd_text = await pg2.inner_text('.dl-crowd') if await pg2.locator('.dl-crowd').count() else ''
        check('5 votes' in crowd_text.lower() and '80%' in crowd_text, f'league split shows after voting ("{crowd_text.strip()[:70]}")')
        check(posted and posted[0]['pick'] == 'A' and re.fullmatch(r'[a-z0-9]{16,40}', posted[0]['voter']) and posted[0]['league'].isdigit(), f'vote posted with a valid anonymous device id ({posted[:1]})')
        await c2.close()
        await b.close()
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
