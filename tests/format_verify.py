"""League scoring sync: every value vs an INDEPENDENT recomputation from the raw API payloads the page received.
Formats: (1) the connected league (PPR, 6-pt passing TD, 1QB), (2) manual Superflex + TE premium, (3) manual Non-PPR.
Python re-implements the spec (scoring, waiver-level replacement, 0.6 strength, caps, Dealer format shift, blend) from
scratch and compares all players + rookie picks. Also: untouched positions move by exactly nothing; picks never move."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, math, re
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)

POS = ['QB', 'RB', 'WR', 'TE']
STANDARD = dict(pass_yd=.04, pass_td=4, pass_int=-2, pass_2pt=2, rush_yd=.1, rush_td=6, rush_2pt=2, rec=1, rec_yd=.1, rec_td=6, rec_2pt=2, fum_lost=-2, bonus_rec_te=0, bonus_rec_rb=0, bonus_rec_wr=0)
DEPTH, STRENGTH, LOW, HIGH = 2.5, 0.6, 0.8, 1.25
jsround = lambda x: math.floor(x + 0.5)
r1 = lambda x: jsround(x * 10) / 10

def key_of(name):
    k = re.sub(r"[.''’]", '', str(name or '').lower()); k = re.sub(r'\s+', ' ', k).strip()
    k = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', k); k = re.sub(r'\s+', ' ', k).strip()
    return 'cameron ' + k[4:] if k.startswith('cam ') else k

def fc_ppr(rec): return min([0, 0.5, 1], key=lambda s: (abs(s - rec), 0 if s == 1 else 1) if abs(s - rec) == abs(1 - rec) else (abs(s - rec), 1))

def points(stats, sc, pos):
    t = sum(float(stats.get(k) or 0) * float(sc.get(k) or 0) for k in STANDARD if not k.startswith('bonus_rec_'))
    bonus = {'TE': sc.get('bonus_rec_te'), 'RB': sc.get('bonus_rec_rb'), 'WR': sc.get('bonus_rec_wr')}.get(pos)
    return t + (float(stats.get('rec') or 0) * float(bonus) if bonus else 0)

def repl_rank(pos, roster, teams):
    n = lambda s: sum(1 for x in roster if x == s)
    flex = n('FLEX') + n('WRRB_FLEX') * .9 + n('REC_FLEX') * .6; sf = n('SUPER_FLEX')
    per = {'QB': n('QB') + sf * .9, 'RB': n('RB') + flex * .45, 'WR': n('WR') + flex * .45 + n('REC_FLEX') * .3, 'TE': n('TE') + flex * .1}[pos] or 1
    return max(1, jsround(per * teams))

def multipliers(proj, league_sc, source_sc, roster, teams):
    out = {}
    for pos in POS:
        L = [(str(r['player_id']), points(r['stats'], league_sc, pos), points(r['stats'], source_sc, pos)) for r in proj
             if str((r.get('player') or {}).get('position') or '').upper() == pos and r.get('player_id') and r.get('stats')]
        if not L: continue
        rank = jsround(repl_rank(pos, roster, teams) * DEPTH)
        rl = sorted((x[1] for x in L), reverse=True)[min(rank, len(L)) - 1]; rs = sorted((x[2] for x in L), reverse=True)[min(rank, len(L)) - 1]
        top = max(x[2] - rs for x in L)
        for pid, l, s in L:
            m = 1.0
            if abs(l - s) > 1e-9:
                raw = (l - rl) / (s - rs) if s - rs > 0.1 * top else (l + 10) / (s + 10)
                m = min(HIGH, max(LOW, 1 + STRENGTH * (raw - 1)))
            out[pid] = m
    return out

def recompute(fc_fmt, fc_base, dealer, mult):
    """-> {sleeperId: display value}, plus anchors. Mirrors the documented blend; written independently of the JS."""
    is_player = lambda r: str(r['player'].get('position') or '').upper() in POS and r['player'].get('name')
    fc_max = max(r['value'] for r in fc_fmt if is_player(r))
    shift, median = None, {}
    if fc_base is not None:   # Dealer is a Superflex PPR market: move each value by FantasyCalc's (format / Superflex PPR)
        base = {str(r['player'].get('sleeperId')): r['value'] for r in fc_base if r['player'].get('sleeperId')}
        shift = {str(r['player'].get('sleeperId')): r['value'] / base[str(r['player'].get('sleeperId'))] for r in fc_fmt if r['player'].get('sleeperId') and base.get(str(r['player'].get('sleeperId')), 0) > 0}
        for pos in POS:
            ks = sorted(shift[str(r['player'].get('sleeperId'))] for r in fc_fmt if str(r['player'].get('position') or '').upper() == pos and str(r['player'].get('sleeperId')) in shift)
            median[pos] = ks[len(ks) // 2] if ks else 1
    shift_of = lambda r: 1 if shift is None else shift.get(str(r.get('sleeper_id') or ''), median.get(r['position'], 1))
    d_max = max(float(r['current_value'] or 0) * shift_of(r) for r in dealer['players'] if r['position'] != 'PICK')
    d_id, d_name = {}, {}
    for r in dealer['players']:
        if r['position'] == 'PICK': continue
        sid = str(r.get('sleeper_id') or '')
        v = float(r['current_value'] or 0) * shift_of(r) * mult.get(sid, 1)
        if sid: d_id[sid] = v / d_max * 100
        d_name[key_of(r['name'])] = v / d_max * 100
    best = {}
    for r in fc_fmt:
        if not is_player(r): continue
        sid = str(r['player'].get('sleeperId') or ''); v = float(r['value'] or 0) * mult.get(sid, 1); k = key_of(r['player']['name'])
        if v > best.get(k, (0,))[0]: best[k] = (v, sid)
    out = {}
    for k, (v, sid) in best.items():
        fc_norm = v / fc_max * 100
        d = d_id.get(sid) if sid and sid in d_id else d_name.get(k)
        basev = r1((r1(d) + fc_norm) / 2) if d is not None else r1(fc_norm)
        if sid: out[sid] = jsround(basev * 100)
    return out, fc_max, d_max

PAGE_JS = r"""(async () => {
  const m = await import('./js/data/trade-market.js'); const F = await import('./js/data/scoring-format.js');
  const format = await F.getActiveFormat(); const market = await m.getMarket('dynasty');
  const picks = {}; for (const y of m.dynastyPickYears(market)) for (const r of [1,2,3,4]) for (const s of ['early','mid','late']) picks[`${y}.${r}.${s}`] = m.dynastyPick(market, { season: y, round: r, slot: s });
  return { label: F.formatLabel(format), source: format.source, scoring: format.scoring, roster: format.roster, teams: format.teams, sf: format.sf, rec: format.rec,
    players: market.players.filter(p => p.sleeperId).map(p => [p.sleeperId, p.name, p.pos, p.value, p.adj]), picks, fcMax: market.fcMax, dMax: market.dMax, projected: market.projected };
})()"""

async def run(b, name, choice, expect_label):
    c = await make_context(b, {'width': 1280, 'height': 900}, False)
    if choice is not None: await c.add_init_script(f"try{{localStorage.setItem('kt-format:v1', JSON.stringify({json.dumps(choice)}))}}catch(e){{}}")
    pg = await c.new_page(); raw = {}
    async def grab(resp):
        u = resp.url
        try:
            if 'api.fantasycalc.com/values/current' in u: raw['fc:' + re.search(r'numQbs=(\d)', u).group(1) + ':' + re.search(r'ppr=([\d.]+)', u).group(1)] = await resp.json()
            elif 'dynastydealer.com/api/player-values' in u: raw['dealer'] = await resp.json()
            elif 'api.sleeper.app/projections/nfl/' in u and 'position[]=RB' in u.replace('%5B%5D', '[]'): raw['proj'] = await resp.json()
        except Exception: pass
    pg.on('response', lambda r: asyncio.ensure_future(grab(r)))
    await pg.goto(M.BASE + 'offline.html'); page = await pg.evaluate(PAGE_JS); await pg.wait_for_timeout(500); await c.close()
    check(page['label'] == expect_label, f'{name}: active format is "{page["label"]}"')
    qbs, ppr = (2 if page['sf'] else 1), fc_ppr(page['rec'])
    fc_fmt = raw.get(f'fc:{qbs}:{ppr:g}'); fc_base = None if (qbs, ppr) == (2, 1) else raw.get('fc:2:1')
    need_proj = any(abs(float(page['scoring'].get(k, 0)) - v) > 1e-9 for k, v in dict(pass_td=4, bonus_rec_te=0, bonus_rec_rb=0, bonus_rec_wr=0).items()) or ppr != page['rec']
    check(fc_fmt is not None and raw.get('dealer') is not None and ((qbs, ppr) == (2, 1) or fc_base is not None) and (not need_proj or raw.get('proj')),
          f'{name}: page fetched FantasyCalc numQbs={qbs} ppr={ppr:g}, Dealer{", FantasyCalc Superflex PPR (the Dealer format)" if fc_base is not None else ""}{", Sleeper projections" if need_proj else ""} ({sorted(raw)})')
    mult = multipliers(raw['proj'], page['scoring'], {**page['scoring'], 'rec': ppr, 'pass_td': 4, 'bonus_rec_te': 0, 'bonus_rec_rb': 0, 'bonus_rec_wr': 0}, page['roster'], page['teams']) if need_proj else {}
    mine, fc_max, d_max = recompute(fc_fmt, fc_base, raw['dealer'], mult)
    diffs = [(n, v, mine.get(sid)) for sid, n, pos, v, adj in page['players'] if mine.get(sid) is None or abs(mine[sid] - v) > 10]
    exact = sum(1 for sid, n, pos, v, adj in page['players'] if mine.get(sid) == v)
    check(len(page['players']) > 300 and not diffs, f'{name}: {len(page["players"])} players match an independent recomputation ({exact} exact, rest within 10 points of 10,000) {diffs[:4]}')
    check(abs(fc_max - page['fcMax']) < 1e-6 and abs(d_max - page['dMax']) < 1e-6, f'{name}: each source is scaled against its own raw top value ({fc_max:.0f} / {d_max:.0f})')
    moved = {pos: sum(1 for sid, n, p, v, adj in page['players'] if p == pos and abs(adj - 1) > 1e-9) for pos in POS}
    return page, raw, mult, moved

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page, raw, mult, moved = await run(b, 'League', None, 'PPR · 6pt pass TD · 1QB')
        check(page['source'] == 'league' and page['scoring']['pass_td'] == 6 and page['scoring']['fum_lost'] == -1, "League: scoring comes from the league's own Sleeper settings (pass TD 6, fumble -1)")
        check(moved['QB'] > 20 and moved['RB'] == moved['WR'] == moved['TE'] == 0, f'League: a 6-point passing TD moves QBs only ({moved})')
        qb = {n: adj for sid, n, pos, v, adj in page['players'] if pos == 'QB'}
        top = [(n, round(a, 3)) for n, a in qb.items() if n in ('Josh Allen', 'Joe Burrow', 'Jalen Hurts', 'Lamar Jackson', 'Jared Goff')]
        check(all(1.0 <= a <= 1.25 for n, a in top) and qb.get('Joe Burrow', 0) > qb.get('Jalen Hurts', 9), f'League: pocket passers gain more than rushing QBs, all within the caps ({top})')
        # picks: straight from the two markets, never touched by the scoring rules
        ords = ['1st', '2nd', '3rd', '4th']; fcp = {r['player']['name']: r['value'] for r in raw['fc:1:1'] if r['player']['position'] == 'PICK'}; dp = {r['sleeper_id']: r['current_value'] for r in raw['dealer']['players'] if r['position'] == 'PICK'}
        bad = []
        for key, got in page['picks'].items():
            y, r, s = key.split('.'); d = dp.get(f'pick_{y}_{r}_{s}'); dm = dp.get(f'pick_{y}_{r}_mid')
            f = fcp.get(f'{y} {ords[int(r) - 1]} ({s.capitalize()})')
            if f is None:
                g = fcp.get(f'{y} {ords[int(r) - 1]}'); f = None if g is None else (g * d / dm if s != 'mid' and d and dm else g)
            parts = [x for x in [d / page['dMax'] * 100 if d is not None else None, f / page['fcMax'] * 100 if f is not None else None] if x is not None]
            want = jsround(sum(parts) / len(parts) * 100) if parts else None
            if (got or {}).get('value') != want: bad.append((key, got, want))
        check(len(page['picks']) == 36 and not bad, f'League: all 36 rookie picks (3 years x 4 rounds x early/mid/late) match the two markets {bad[:3]}')
        page2, raw2, mult2, moved2 = await run(b, 'Superflex + TEP', {'preset': 'tep', 'passTd': 4, 'sf': True}, 'PPR · 4pt pass TD · TE +0.5/rec · Superflex')
        check(moved2['TE'] > 20 and moved2['QB'] == moved2['RB'] == moved2['WR'] == 0, f'Superflex + TEP: TE premium moves TEs only ({moved2})')
        v1 = {sid: v for sid, n, pos, v, adj in page['players']}; names = {sid: n for sid, n, pos, v, adj in page2['players']}; v2 = {sid: v for sid, n, pos, v, adj in page2['players']}
        allen = next(sid for sid, n in names.items() if n == 'Josh Allen')
        check(v2[allen] > v1[allen] * 1.4 and v2[allen] <= 10000, f'Superflex: Josh Allen is worth far more than in the 1QB league and stays on the 10,000 scale ({v1[allen]:,} -> {v2[allen]:,})')
        fc1 = {str(r['player'].get('sleeperId')): r['value'] for r in raw['fc:1:1']}; top1 = max(r['value'] for r in raw['fc:1:1'] if r['player']['position'] != 'PICK')
        check(abs(v1[allen] / 100 - fc1[allen] / top1 * 100 * mult[allen]) < 8, f"1QB league: Allen sits near FantasyCalc's 1QB market, not the Dealer's Superflex number ({v1[allen] / 100:.1f} vs FC 1QB {fc1[allen] / top1 * 100 * mult[allen]:.1f})")
        te = {n: round(adj, 3) for sid, n, pos, v, adj in page2['players'] if n in ('Brock Bowers', 'Trey McBride', 'Sam LaPorta')}
        check(all(1.05 <= a <= 1.2 for a in te.values()), f'TE premium: elite TEs gain 5-20%, the range real TEP trade markets show ({te})')
        page3, raw3, mult3, moved3 = await run(b, 'Non-PPR', {'preset': 'std', 'passTd': 4, 'sf': False}, 'Non-PPR · 4pt pass TD · 1QB')
        check(sum(moved3.values()) == 0 and not mult3, 'Non-PPR: FantasyCalc prices this format itself, so no projection adjustment is applied')
        await b.close()
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
