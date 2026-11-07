"""Second independent pass: draft steal, all-time H2H (lineage), best-week league rank, bust baseline, worst-decision legality."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
REPO = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, sys, os, urllib.request, statistics
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
B = 'https://api.sleeper.app/v1/'; L = '1370223929452433408'
def g(p): return json.load(urllib.request.urlopen(urllib.request.Request(B + p, headers={'User-Agent': 'KeeperTrade/1.0'})))
league = g('league/' + L); rosters = g(f'league/{L}/rosters'); W = 8
players = json.load(open('sleeper_raw/players.json', encoding='utf-8'))
pos = lambda pid: (players.get(pid) or {}).get('position') or ('DEF' if pid.isalpha() else '')
weeks = {w: g(f'league/{L}/matchups/{w}') for w in range(1, W + 1)}
owner = {r['roster_id']: r['owner_id'] for r in rosters}
log = []
for w, ms in weeks.items():
    for m in ms:
        for p in m['starters']:
            if p != '0': log.append((w, m['roster_id'], p, m['players_points'].get(p, 0)))
# draft steal (rounds > 1, by ratio to round mean of points-for-drafter)
picks = g(f"draft/{[d for d in g(f'league/{L}/drafts') if d['season'] == league['season']][0]['draft_id']}/picks")
pf = lambda rid, pid: sum(x[3] for x in log if x[1] == rid and x[2] == pid)
rows = [(pk['roster_id'], pk['round'], pk['player_id'], pf(pk['roster_id'], pk['player_id'])) for pk in picks if pk.get('player_id')]
rmean = {r: statistics.mean([x[3] for x in rows if x[1] == r]) for r in {x[1] for x in rows}}
steal = {}
for rid in owner:
    c = [(x[3] / rmean[x[1]], x) for x in rows if x[0] == rid and x[1] > 1 and rmean[x[1]] > 0]
    steal[rid] = max(c)[1][2] if c else None
# all-time H2H: previous season regular weeks + this season
h2h = {}
def meet(a, b, sa, sb):
    k = (a, b); e = h2h.setdefault(k, [0, 0, 0]); e[0 if sa > sb else 1 if sa < sb else 2] += 1
prev = league['previous_league_id']
while prev:
    pl = g('league/' + prev); pr = {r['roster_id']: r['owner_id'] for r in g(f'league/{prev}/rosters')}
    for w in range(1, int(pl['settings'].get('playoff_week_start', 15))):
        grp = {}
        for m in g(f'league/{prev}/matchups/{w}'):
            if m.get('matchup_id') is not None: grp.setdefault(m['matchup_id'], []).append(m)
        for a, b in [v for v in grp.values() if len(v) == 2]:
            meet(pr[a['roster_id']], pr[b['roster_id']], a['points'], b['points']); meet(pr[b['roster_id']], pr[a['roster_id']], b['points'], a['points'])
    prev = pl.get('previous_league_id')
    if prev in (None, '0', ''): break
for w, ms in weeks.items():
    grp = {}
    for m in ms: grp.setdefault(m['matchup_id'], []).append(m)
    for a, b in [v for v in grp.values() if len(v) == 2]:
        meet(owner[a['roster_id']], owner[b['roster_id']], a['points'], b['points']); meet(owner[b['roster_id']], owner[a['roster_id']], b['points'], a['points'])
cur_owners = set(owner.values())
def rivals(rid):
    o = owner[rid]; lst = [(k[1], v) for k, v in h2h.items() if k[0] == o and k[1] in cur_owners and sum(v) >= 2]
    if not lst: return None, None
    pctf = lambda v: (v[0] + v[2] / 2) / sum(v)
    nem = sorted(lst, key=lambda x: (pctf(x[1]), -x[1][1]))[0]; vic = sorted(lst, key=lambda x: (-pctf(x[1]), -x[1][0]))[0]
    return f'{nem[1][0]}-{nem[1][1]}', f'{vic[1][0]}-{vic[1][1]}'
# best-week league rank that week
best = {}
for rid in owner:
    ws = [(m['points'], w) for w, ms in weeks.items() for m in ms if m['roster_id'] == rid]
    pts, w = max(ws); best[rid] = (round(pts, 2), sorted([m['points'] for m in weeks[w]], reverse=True).index(pts) + 1)
# bust baseline: points per start by position across all starters
base = {}
for x in log: base.setdefault(pos(x[2]), []).append(x[3])
base = {k: round(statistics.mean(v), 2) for k, v in base.items()}

JS = """(async () => {
  const m = await import('./js/data/season-stats.js'); const s = await m.loadSeason('%s');
  const out = {}; s.teams.forEach((t, id) => { out[id] = { steal: t.bestValue?.id || null, nemesis: t.nemesis ? `${t.nemesis.wins}-${t.nemesis.losses}` : null, victim: t.victim ? `${t.victim.wins}-${t.victim.losses}` : null, best: [t.bestWeek.points, t.bestWeek.rank], wd: t.worstDecision && { slot: null, b: t.worstDecision.benched.position, s: t.worstDecision.started.position, swing: t.worstDecision.swing } }; });
  return { out, base: s.positionPpg, slots: s.league.slots };
})()""" % L
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); c = await make_context(b, {'width': 390, 'height': 844}, True); pg = await c.new_page()
        await pg.goto(M.BASE + 'index.html'); r = await pg.evaluate(JS); await b.close()
    bad = 0; n = 0
    def cmp(label, a, b_):
        nonlocal bad, n; n += 1
        if a != b_: bad += 1; print('  MISMATCH', label, 'js', a, 'py', b_)
    for rid in owner:
        js = r['out'][str(rid)]; nem, vic = rivals(rid)
        cmp(f'{rid} steal', js['steal'], steal[rid]); cmp(f'{rid} nemesis', js['nemesis'], nem); cmp(f'{rid} victim', js['victim'], vic)
        cmp(f'{rid} best', [round(js['best'][0], 2), js['best'][1]], list(best[rid]))
        wd = js['wd']
        if wd:  # legality: the benched player must be eligible for a slot the started player held (FLEX covers RB/WR/TE)
            n += 1; ok = wd['b'] == wd['s'] or (wd['b'] in ('RB', 'WR', 'TE') and wd['s'] in ('RB', 'WR', 'TE') and 'FLEX' in r['slots'])
            if not ok: bad += 1; print('  ILLEGAL swap', rid, wd)
    for k, v in base.items():
        if k in r['base']: cmp(f'baseline {k}', round(r['base'][k], 2), v)
    print(f'{n - bad}/{n} second-pass checks match')
asyncio.run(main())
