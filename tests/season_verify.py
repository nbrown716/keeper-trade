"""Independent recomputation of Season engine KPIs from raw Sleeper JSON, compared to the browser engine.
Also checks the optimal-lineup math against Sleeper's own ppts (max potential points)."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
REPO = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, sys, os, urllib.request, statistics, itertools
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
B = 'https://api.sleeper.app/v1/'
L = '1370223929452433408'
def g(p, cache=None):
    if cache and os.path.exists(cache): return json.load(open(cache, encoding='utf-8'))
    d = json.load(urllib.request.urlopen(urllib.request.Request(B + p, headers={'User-Agent': 'KeeperTrade/1.0'})))
    if cache: json.dump(d, open(cache, 'w', encoding='utf-8'))
    return d
os.makedirs('sleeper_raw', exist_ok=True)
league = g('league/' + L); rosters = g(f'league/{L}/rosters'); users = g(f'league/{L}/users')
state = g('state/nfl')
W = min(int(league['settings']['playoff_week_start']) - 1, int(state['week']) - 1)
weeks = {w: (g(f'league/{L}/matchups/{w}'), g(f'league/{L}/transactions/{w}')) for w in range(1, W + 1)}
picks = g(f"draft/{[d for d in g(f'league/{L}/drafts') if d['season'] == league['season']][0]['draft_id']}/picks")
players = g('players/nfl', 'sleeper_raw/players.json')
pos = lambda pid: (players.get(pid) or {}).get('position') or ('DEF' if pid.isalpha() and pid.isupper() else '')
slots = [s for s in league['roster_positions'] if s not in ('BN', 'IR', 'TAXI')]
ELIG = {'QB': {'QB'}, 'RB': {'RB'}, 'WR': {'WR'}, 'TE': {'TE'}, 'K': {'K'}, 'DEF': {'DEF'}, 'FLEX': {'RB', 'WR', 'TE'}, 'SUPER_FLEX': {'QB', 'RB', 'WR', 'TE'}, 'WRRB_FLEX': {'RB', 'WR'}, 'REC_FLEX': {'WR', 'TE'}}
taxi = {r['roster_id']: set(r.get('taxi') or []) for r in rosters}

def optimal_bruteforce(pool):
    # exact: try every assignment of the flex slots from the leftover pool (independent of the JS greedy)
    dedicated = [s for s in slots if len(ELIG[s]) == 1]; flex = [s for s in slots if len(ELIG[s]) > 1]
    best_total = 0
    by = sorted(pool, key=lambda p: -p[1])
    # choose which players go to flex: enumerate combos of top-12 candidates
    cands = by[:14]
    for fl in itertools.combinations(cands, len(flex)):
        if not all(p[2] in ELIG[s] for p, s in zip(fl, flex)):
            ok = any(all(p[2] in ELIG[s] for p, s in zip(perm, flex)) for perm in itertools.permutations(fl))
            if not ok: continue
        used = {p[0] for p in fl}; tot = sum(p[1] for p in fl)
        for s in dedicated:
            c = [p for p in by if p[0] not in used and p[2] in ELIG[s]]
            if c: used.add(c[0][0]); tot += c[0][1]
        best_total = max(best_total, tot)
    return round(best_total, 2)

T = {r['roster_id']: dict(w=0, l=0, t=0, pf=0, pa=0, apw=0, apl=0, apt=0, cw=0, cl=0, opt=0, act=0, bench=0, weeks=[], starts={}, benchp={}) for r in rosters}
log = []
for w, (ms, _) in weeks.items():
    sc = {m['roster_id']: m['points'] for m in ms if m.get('matchup_id') is not None}
    grp = {}
    for m in ms:
        if m.get('matchup_id') is not None: grp.setdefault(m['matchup_id'], []).append(m)
    for pair in grp.values():
        for a, b in (pair, pair[::-1]):
            t = T[a['roster_id']]; own, opp = a['points'], b['points']
            t['pf'] += own; t['pa'] += opp
            r = 'W' if own > opp else 'L' if own < opp else 'T'
            t[{'W': 'w', 'L': 'l', 'T': 't'}[r]] += 1
            if abs(own - opp) < 10: t['cw' if r == 'W' else 'cl'] += 1
            for rid, s in sc.items():
                if rid == a['roster_id']: continue
                if own > s: t['apw'] += 1
                elif own < s: t['apl'] += 1
                else: t['apt'] += 1
            t['weeks'].append((w, own, r))
            st = set(a['starters'])
            pool = [(p, a['players_points'].get(p, 0), pos(p)) for p in a['players'] if p not in taxi[a['roster_id']] or p in st]
            o = optimal_bruteforce(pool)
            t['opt'] += max(o, own); t['act'] += own
            for p in a['starters']:
                if p == '0': continue
                pts = a['players_points'].get(p, 0); t['starts'].setdefault(p, []).append(pts); log.append((w, a['roster_id'], p, pts))
            for p, pts, _ in pool:
                if p not in st:
                    t['bench'] += pts
                    if pts > 0 and optimal_bruteforce([q for q in pool if q[0] != p]) < o - 0.005: t['benchp'][p] = t['benchp'].get(p, 0) + pts

def started_for(rid, pid, frm, excl=False):
    return round(sum(x[3] for x in log if x[2] == pid and x[0] >= frm and ((x[1] != rid) if excl else (x[1] == rid))), 2)
pick = {r['roster_id']: [] for r in rosters}; got = {r['roster_id']: [] for r in rosters}; trade = {r['roster_id']: 0 for r in rosters}; mv = {r['roster_id']: 0 for r in rosters}
for w, (_, txs) in weeks.items():
    for tx in txs:
        if tx['status'] != 'complete': continue
        leg = tx.get('leg') or w
        if tx['type'] == 'trade':
            for rid in tx['roster_ids']:
                mv[rid] += 1
                gain = sum(started_for(rid, p, leg) for p, to in (tx.get('adds') or {}).items() if to == rid)
                give = sum(started_for(tx['adds'][p], p, leg) for p, fr in (tx.get('drops') or {}).items() if fr == rid and (tx.get('adds') or {}).get(p))
                trade[rid] += gain - give
        elif tx['type'] in ('waiver', 'free_agent'):
            for p, rid in (tx.get('adds') or {}).items(): mv[rid] += 1; pick[rid].append((started_for(rid, p, leg), p))
            for p, rid in (tx.get('drops') or {}).items(): mv[rid] += 1; got[rid].append((started_for(rid, p, leg, True), p))

py = {}
for rid, t in T.items():
    g_ = t['w'] + t['l'] + t['t']; apg = t['apw'] + t['apl'] + t['apt']; ap = (t['apw'] + t['apt'] / 2) / apg
    mvp = max(t['starts'].items(), key=lambda kv: sum(kv[1]))
    py[rid] = dict(record=f"{t['w']}-{t['l']}-{t['t']}", pf=round(t['pf'], 2), pa=round(t['pa'], 2), allplay=f"{t['apw']}-{t['apl']}-{t['apt']}",
                   luck=round(t['w'] + t['t'] / 2 - ap * g_, 2), close=f"{t['cw']}-{t['cl']}", best=max(x[1] for x in t['weeks']), worst=min(x[1] for x in t['weeks']),
                   optimal=round(t['opt'], 2), iq=round(t['act'] / t['opt'], 4), bench=round(t['bench'], 2),
                   mvp=(mvp[0], round(sum(mvp[1]), 2)), benchRegret=max(t['benchp'].items(), key=lambda kv: kv[1])[0] if t['benchp'] else None,
                   pickup=round(max(pick[rid])[0], 2) if pick[rid] else None, gotAway=round(max(got[rid])[0], 2) if got[rid] else None,
                   tradeNet=round(trade[rid], 2), moves=mv[rid])
ppts = {r['roster_id']: r['settings'].get('ppts', 0) + r['settings'].get('ppts_decimal', 0) / 100 for r in rosters}
fpts = {r['roster_id']: r['settings'].get('fpts', 0) + r['settings'].get('fpts_decimal', 0) / 100 for r in rosters}

JS = """(async () => {
  const m = await import('./js/data/season-stats.js');
  const s = await m.loadSeason('%s');
  const out = {};
  s.teams.forEach((t, id) => { out[id] = { record: `${t.wins}-${t.losses}-${t.ties}`, pf: t.pf, pa: t.pa, allplay: `${t.allPlay.wins}-${t.allPlay.losses}-${t.allPlay.ties}`, luck: t.luck, close: `${t.close.wins}-${t.close.losses}`, best: t.bestWeek.points, worst: t.worstWeek.points, optimal: t.optimal, iq: Math.round(t.lineupIQ * 10000) / 10000, bench: t.benchPoints, mvp: [t.mvp.id, t.mvp.total], benchRegret: t.benchRegret?.id || null, pickup: t.bestPickup?.points ?? null, gotAway: t.gotAway?.points ?? null, tradeNet: t.tradeNet, moves: t.moves.total, archetype: t.archetype.title, name: t.name, nemesis: t.nemesis && `${t.nemesis.name} ${t.nemesis.wins}-${t.nemesis.losses}`, h2hGames: t.h2h.reduce((a, b) => a + b.games, 0) }; });
  return { through: s.throughWeek, complete: s.complete, seasons: s.league.seasons, out };
})()""" % L

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); c = await make_context(b, {'width': 390, 'height': 844}, True); pg = await c.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(M.BASE + 'index.html'); await pg.wait_for_timeout(500)
        res = await pg.evaluate(JS)
        await b.close()
    print('through week', res['through'], 'python W', W, 'complete', res['complete'], 'seasons', res['seasons'], 'errors', errs)
    bad = 0; checks = 0
    for rid, js in res['out'].items():
        rid = int(rid); pv = py[rid]
        for k, v in pv.items():
            jv = js[k]
            if isinstance(v, tuple): v = list(v)
            same = (abs(jv - v) < 0.011) if isinstance(v, float) and jv is not None else jv == v
            checks += 1
            if not same: bad += 1; print(f'  MISMATCH roster {rid} {k}: js={jv} py={v}')
        # cross-checks vs Sleeper's own season totals (only valid through the last scored week = W)
        print(f"roster {rid:>2} {js['name'][:22]:<22} {js['record']} PF {js['pf']:.2f} (sleeper {fpts[rid]:.2f}) optimal {js['optimal']:.2f} (sleeper ppts {ppts[rid]:.2f}) IQ {js['iq']:.3f} luck {js['luck']:+.2f} {js['archetype']} | nemesis {js['nemesis']} h2h {js['h2hGames']}")
    print(f'{checks - bad}/{checks} KPI values match the independent recomputation')
asyncio.run(main())
