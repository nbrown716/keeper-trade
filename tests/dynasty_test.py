"""Dynasty Trade Calculator. Engine math vs an independent Python implementation (random trades); then the page:
adding players and picks, totals, package adjustment, values in 1sts, the call, even-up suggestions, league rosters
vs raw Sleeper, player card (opens on click, closes on outside click / Esc / x / second click), share link, reload,
format switching, unsynced state, phone layout."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, math, random, re, urllib.request
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)
jsround = lambda x: math.floor(x + 0.5)
W = [1, 0.85, 0.75, 0.65, 0.55]
w_at = lambda i: W[i] if i < len(W) else 0.5
def side_total(values, pkg=True):
    s = sorted(values, reverse=True)
    return jsround(sum(v * (w_at(i) if pkg else 1) for i, v in enumerate(s)))
num = lambda text: int(re.sub(r'[^\d]', '', text) or 0)
LEAGUE = '1370223929452433408'
get = lambda u: json.load(urllib.request.urlopen(urllib.request.Request('https://api.sleeper.app/v1/' + u, headers={'User-Agent': 'KeeperTrade/1.0'})))

async def pieces(pg, side):
    return await pg.evaluate(f"[...document.querySelectorAll('#dy-pieces-{side} .dy-piece')].map(li => [li.querySelector('.dy-name, .dy-name-text').textContent, li.querySelector('.dy-val').textContent])")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c = await make_context(b, {'width': 1280, 'height': 900}, False); await c.grant_permissions(['clipboard-read', 'clipboard-write'])
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(M.BASE + 'dynasty.html'); await pg.wait_for_selector('#dy-browse-A .dy-row', timeout=60000)
        # ---- engine vs independent Python (200 random trades)
        random.seed(7); cases = [([random.randint(50, 10000) for _ in range(random.randint(0, 7))], [random.randint(50, 10000) for _ in range(random.randint(0, 7))], random.random() < 0.7) for _ in range(200)]
        js = await pg.evaluate("""async cases => { const E = await import('./js/data/dynasty-engine.js');
          return cases.map(([a, b, pkg]) => { const A = E.sideTotal(a.map(v => ({ value: v, low: v * 0.9, high: v * 1.1 })), pkg), B = E.sideTotal(b.map(v => ({ value: v, low: v * 0.9, high: v * 1.1 })), pkg); const v = E.verdict(A, B); return [A.total, B.total, A.straight, v.state, v.ahead, v.gap]; }); }""", cases)
        bad = []
        for (a, bb, pkg), got in zip(cases, js):
            ta, tb = side_total(a, pkg), side_total(bb, pkg); big = max(ta, tb); pct = abs(ta - tb) / big if big else 0
            state = 'empty' if not big else 'fair' if pct <= 0.05 else 'lean' if pct <= 0.15 else 'win'
            ahead = None if state in ('fair', 'empty') else ('A' if ta < tb else 'B')
            if got != [ta, tb, sum(a), state, ahead, abs(ta - tb)]: bad.append((a, bb, pkg, got))
        check(not bad, f'engine: totals, package weights, fair / lean / win and who is ahead match Python on 200 random trades {bad[:2]}')
        # ---- build a trade from the lists
        first = await pg.evaluate("[...document.querySelectorAll('#dy-browse-A .dy-row')].slice(0, 3).map(r => [r.querySelector('b').textContent, r.querySelector('.dy-val').textContent])")
        await pg.click('#dy-browse-A .dy-row >> nth=0'); await pg.wait_for_timeout(200)
        pa = await pieces(pg, 'A')
        check(pa == [first[0]] and num(await pg.inner_text('#dy-total-A')) == num(first[0][1]), f'adding a player moves him to the side with his value ({pa})')
        check(first[0][0] not in await pg.inner_text('#dy-browse-B'), 'a player in the trade leaves both add lists')
        await pg.click('#dy-browse-B .dy-row >> nth=3'); await pg.click('#dy-browse-B .dy-row >> nth=6'); await pg.click('[data-dy-pick="B"]'); await pg.wait_for_selector('#dy-picker-B [data-pick]')
        pick_label = await pg.evaluate("document.querySelector('#dy-picker-B [data-pick$=\".1.mid\"]').dataset.pick")
        unit_text = await pg.inner_text(f'#dy-picker-B [data-pick="{pick_label}"] small')
        await pg.click(f'#dy-picker-B [data-pick="{pick_label}"]'); await pg.wait_for_timeout(250)
        pb = await pieces(pg, 'B'); vals = [num(v) for _, v in pb]
        check(len(pb) == 3 and pb[2][0].endswith('1st (Mid)') and vals[2] == num(unit_text), f'adding a rookie pick from + Pick ({pb[2]})')
        check(num(await pg.inner_text('#dy-total-B')) == side_total(vals), f'side total = package-weighted sum of the shown values ({vals} -> {side_total(vals)})')
        counts = await pg.evaluate("[...document.querySelectorAll('#dy-pieces-B .dy-piece small')].map(e => e.textContent)")
        order = sorted(range(3), key=lambda i: -vals[i])
        check(all((f'counts {int(w_at(order.index(i)) * 100)}%' in counts[i]) == (order.index(i) > 0) for i in range(3)), f'each piece shows the share it counts ({counts})')
        await pg.click('#dy-pkg [data-v="0"]'); await pg.wait_for_timeout(150)
        check(num(await pg.inner_text('#dy-total-B')) == sum(vals), f'package adjustment off = straight sum ({sum(vals)})')
        await pg.click('#dy-pkg [data-v="1"]'); await pg.click('#dy-unit [data-v="firsts"]'); await pg.wait_for_timeout(150)
        shown = float(await pg.inner_text('#dy-total-B')); unit = num(unit_text)
        check(abs(shown - side_total(vals) / unit) < 0.006, f'values in 1sts = total / next-draft mid 1st ({shown} vs {side_total(vals) / unit:.2f})')
        await pg.click('#dy-unit [data-v="points"]'); await pg.wait_for_timeout(150)
        # ---- the call + even-up
        ta, tb = num(await pg.inner_text('#dy-total-A')), num(await pg.inner_text('#dy-total-B')); pct = abs(ta - tb) / max(ta, tb)
        line = await pg.inner_text('.dy-call-line'); expect = 'Fair deal' if pct <= 0.05 else 'Leans Team' if pct <= 0.15 else 'wins this'
        check(expect in line and (pct <= 0.05 or f'Team {"A" if ta < tb else "B"}' in line), f'the call follows the 5% / 15% rule and names the team giving less ("{line}", {pct:.1%})')
        chips = await pg.locator('#dy-verdict [data-suggest]').count()
        if chips:
            await pg.click('#dy-verdict [data-suggest] >> nth=0'); await pg.wait_for_timeout(300)
            ta, tb = num(await pg.inner_text('#dy-total-A')), num(await pg.inner_text('#dy-total-B'))
            check(abs(ta - tb) / max(ta, tb) <= 0.05 and 'Fair deal' in await pg.inner_text('.dy-call-line'), f'an even-up suggestion lands the deal inside 5% ({ta} vs {tb})')
        else: check('No single pick or player' in await pg.inner_text('#dy-verdict'), 'no single piece evens it: says so')
        rng = await pg.evaluate("[...document.querySelectorAll('.dy-score-side small')].map(e => e.textContent)")
        check(len(rng) == 2 and all(' to ' in r for r in rng), f'each side shows the range between the two markets ({rng})')
        # ---- player card: the calculator bug class (card must close)
        shown_js = "(() => { const c = document.getElementById('dy-card'); return !!c && !c.hidden; })()"
        name = pg.locator('#dy-pieces-A .dy-name').first
        await name.click(); await pg.wait_for_timeout(150); check(await pg.evaluate(shown_js), 'clicking a name opens the player card')
        card = await pg.inner_text('#dy-card'); check('DYNASTY DEALER' in card.upper() and 'FANTASYCALC' in card.upper() and 'Real trades with' in card, 'card shows both market values and a link to real trades')
        await pg.mouse.click(5, 895); await pg.wait_for_timeout(150); check(not await pg.evaluate(shown_js), 'clicking outside closes it')
        await name.click(); await pg.wait_for_timeout(100); await name.click(); await pg.wait_for_timeout(150); check(not await pg.evaluate(shown_js), 'clicking the name again closes it')
        await name.click(); await pg.wait_for_timeout(100); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150); check(not await pg.evaluate(shown_js), 'Esc closes it')
        await name.click(); await pg.wait_for_timeout(100); await pg.click('#dy-card .dy-card-x'); await pg.wait_for_timeout(150); check(not await pg.evaluate(shown_js), 'the x button closes it')
        await name.click(); await pg.wait_for_timeout(100); await pg.click('#dy-browse-A .dy-row >> nth=0'); await pg.wait_for_timeout(200); check(not await pg.evaluate(shown_js), 'adding a player closes it')
        # ---- share link + reload
        before = [await pieces(pg, 'A'), await pieces(pg, 'B')]
        await pg.click('#dy-share'); await pg.wait_for_timeout(200); link = await pg.evaluate('navigator.clipboard.readText()')
        check('?a=' in link and '&b=' in link and 'Link copied' in await pg.inner_text('#dy-share'), f'Copy link copies a link that holds the trade ({link.split("?")[-1][:60]})')
        pg2 = await c.new_page(); await pg2.goto(link); await pg2.wait_for_selector('#dy-pieces-A .dy-piece', timeout=60000); await pg2.wait_for_timeout(300)
        check([await pieces(pg2, 'A'), await pieces(pg2, 'B')] == before, 'opening the link rebuilds the same trade and values')
        await pg2.goto(M.BASE + 'dynasty.html?a=99999999&b=2031.9.mid,abc'); await pg2.wait_for_selector('#dy-browse-A .dy-row', timeout=60000)
        check(await pg2.locator('.dy-piece').count() == 0, 'a link with unknown ids or bad picks adds nothing (no blank rows)'); await pg2.close()
        # ---- league rosters vs raw Sleeper
        rosters, users = get(f'league/{LEAGUE}/rosters'), get(f'league/{LEAGUE}/users')
        await pg.click('#dy-clear'); await pg.wait_for_selector('#dy-team-A option >> nth=1', state='attached')
        rid = rosters[0]['roster_id']; owner = next(u for u in users if u['user_id'] == rosters[0]['owner_id']); team = (owner.get('metadata') or {}).get('team_name') or owner['display_name']
        await pg.select_option('#dy-team-A', str(rid)); await pg.wait_for_timeout(300)
        ids = await pg.evaluate("[...document.querySelectorAll('#dy-browse-A .dy-row')].map(r => r.dataset.add)")
        check(ids and set(ids) <= set(map(str, rosters[0]['players'])) and team.strip().lower() in (await pg.inner_text('#dy-name-A')).lower(), f'Load a team: the list is that roster only and the side takes the team name ({len(ids)} valued players, "{team.strip()}")')
        await pg.click('[data-dy-pick="A"]'); await pg.wait_for_selector('#dy-picker-A .dy-picker-own')
        traded = get(f'league/{LEAGUE}/traded_picks'); years = await pg.evaluate("[...document.querySelectorAll('#dy-picker-A [data-year]')].map(b => +b.dataset.year)")
        rounds = min(4, int(get(f'league/{LEAGUE}')['settings'].get('draft_rounds') or 4)); want = 0   # the league trades this many rounds
        for y in years:
            for r in range(1, rounds + 1):
                t = [x for x in traded if int(x['season']) == y and x['round'] == r]
                want += (0 if any(x['roster_id'] == rid and x['owner_id'] != rid for x in t) else 1) + sum(1 for x in t if x['owner_id'] == rid and x['roster_id'] != rid)
        own = await pg.locator('#dy-picker-A .dy-picker-own [data-pick]').count()
        check(own == want, f"the team's own picks match Sleeper's traded-picks record ({own} vs {want}, {rounds} rounds x {len(years)} years)")
        # ---- format switching
        await pg.select_option('#dy-team-A', ''); await pg.click('[data-dy-pos="A"] [data-v="QB"]'); await pg.wait_for_timeout(200)
        qb1 = await pg.evaluate("[document.querySelector('#dy-browse-A .dy-row b').textContent, document.querySelector('#dy-browse-A .dy-row .dy-val').textContent]")
        check('Synced to' in await pg.inner_text('#dy-format .kt-fmt-note'), 'starts synced to the connected league')
        await pg.click('#dy-format [data-sf="1"]'); await pg.wait_for_function("/Superflex/.test(document.querySelector('#dy-status').textContent)", timeout=30000); await pg.wait_for_timeout(300)
        qb2 = await pg.evaluate("[document.querySelector('#dy-browse-A .dy-row b').textContent, document.querySelector('#dy-browse-A .dy-row .dy-val').textContent]")
        check(num(qb2[1]) > num(qb1[1]) * 1.4, f'switching to Superflex re-prices quarterbacks ({qb1} -> {qb2})')
        note = await pg.inner_text('#dy-format .kt-fmt-note'); check('Your league is' in note and 'Use my league' in note, 'off the league format: says what the league is and offers the way back')
        await pg.click('#dy-format .kt-fmt-note [data-preset="league"]'); await pg.wait_for_function("/1QB/.test(document.querySelector('#dy-status').textContent)", timeout=30000)
        check('Synced to' in await pg.inner_text('#dy-format .kt-fmt-note'), '"Use my league" returns to the league format')
        check(not errs, f'no page errors {errs}'); await c.close()
        # ---- no league + phone
        c = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(M.BASE + 'dynasty.html'); await pg.wait_for_selector('#dy-browse-A .dy-row', timeout=60000)
        note = await pg.inner_text('#dy-format .kt-fmt-note')
        check('No league synced' in note and 'PPR · 4pt pass TD · 1QB' in note and await pg.locator('#dy-format .kt-fmt-note a[href="index.html#league"]').count() == 1, f'no league: says so, shows the default format, links to connect ("{note.strip()[:70]}")')
        check(await pg.is_hidden('#dy-team-wrap-A'), 'no league: the team loader stays hidden')
        await pg.click('#dy-example'); await pg.wait_for_selector('.dy-score'); await pg.locator('#dy-pieces-A .dy-name').first.click(); await pg.wait_for_timeout(200)
        box = await pg.evaluate("(() => { const r = document.getElementById('dy-card').getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom, innerWidth, innerHeight]; })()")
        check(await pg.evaluate(shown_js) and box[1] - box[0] > 200 and box[0] >= 0 and box[1] <= box[4] and box[2] >= 0 and box[3] <= box[5], f'phone: the player card fits on screen ({[round(x) for x in box]})')
        await pg.touchscreen.tap(380, 60); await pg.wait_for_timeout(200); check(not await pg.evaluate(shown_js), 'phone: tapping outside closes the card')
        check(await pg.evaluate('[innerWidth, document.documentElement.scrollWidth]') == [390, 390], 'phone: no sideways page scroll')
        check(not errs, f'phone: no page errors {errs}')
        await b.close()
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
