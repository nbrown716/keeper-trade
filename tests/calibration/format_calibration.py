"""Second calibration: TE premium. Real-trade reference = Qlinch 1QB+TEP / 1QB values (read 2026-11-12), relative to RBs (0.99).
Candidates: VOR ratio, and additive 'points gained over replacement x market value per VOR point'. Also shows QB 6pt-TD stability."""
import urllib.request, json, math
H = {'User-Agent': 'Mozilla/5.0'}
get = lambda u: json.load(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=30))
rows = get('https://api.sleeper.app/projections/nfl/2026?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&order_by=pts_ppr')
fc = get('https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&numTeams=12&ppr=1')
val = {str(r['player'].get('sleeperId')): r['value'] for r in fc}
STD = dict(pass_yd=.04, pass_td=4, pass_int=-2, pass_2pt=2, rush_yd=.1, rush_td=6, rush_2pt=2, rec=1, rec_yd=.1, rec_td=6, rec_2pt=2, fum_lost=-2)
def pts(s, sc, tep=0): return sum(float(s.get(k) or 0) * v for k, v in sc.items()) + float(s.get('rec') or 0) * tep
STARTERS = {'QB': 12, 'TE': 12 * 1.2}
Q = {'Bowers': (2.03, 1.74), 'McBride': (1.96, 1.64), 'Loveland': (1.34, 1.21), 'Warren': (1.32, 1.22), 'Kraft': (1.16, 1.06), 'LaPorta': (1.08, .98), 'Fannin Jr.': (1.11, .95),
     'Kincaid': (.87, .73), 'Kittle': (.81, .90), 'Pitts Sr.': (.73, .77), 'Kelce': (.54, .51), 'Hockenson': (.54, .47)}
real = {n: a / b / 0.99 for n, (a, b) in Q.items()}
def table(pos, league, tep, k, kind):
    L = [(r['player']['last_name'], str(r['player_id']), pts(r['stats'], league, tep), pts(r['stats'], STD)) for r in rows if r['player']['position'] == pos]
    rank = round(STARTERS[pos] * k) - 1
    rl = sorted((x[2] for x in L), reverse=True)[rank]; rs = sorted((x[3] for x in L), reverse=True)[rank]
    starters = sorted([x for x in L if x[1] in val], key=lambda x: -val[x[1]])[:round(STARTERS[pos])]
    slope = sum(val[x[1]] for x in starters) / max(1, sum(max(0, x[3] - rs) for x in starters))   # market value per projected VOR point
    out = {}
    for n, pid, l, s in L:
        if pid not in val or val[pid] < 800: continue
        d = (l - rl) - (s - rs)
        if kind == 'ratio': out[n] = (l - rl) / (s - rs) if s - rs > 8 else None
        else: out[n] = 1 + d * slope / val[pid]
    return out, slope
print('TE premium +0.5: model vs real-trade ratio')
for kind in ('ratio', 'slope'):
    for k in (1, 1.5, 2, 2.5):
        m, slope = table('TE', STD, 0.5, k, kind)
        pairs = [(m[n], real[n]) for n in real if m.get(n) is not None]
        rmse = math.sqrt(sum((a - b) ** 2 for a, b in pairs) / len(pairs)); bias = sum(a - b for a, b in pairs) / len(pairs)
        d = sum((a - 1) * (b - 1) for a, b in pairs) / sum((a - 1) ** 2 for a, b in pairs)
        print(f'  {kind:5s} k={k:<3} n={len(pairs):2d} rmse {rmse:.3f} bias {bias:+.3f} best damping {d:.2f} (doing nothing rmse {math.sqrt(sum((b - 1) ** 2 for a, b in pairs) / len(pairs)):.3f})', {n: round(m[n], 2) for n in list(real)[:6] if m.get(n)})
print('real:', {n: round(v, 2) for n, v in real.items()})
print('\nQB 6pt pass TD: multipliers by baseline (stability)')
for kind in ('ratio', 'slope'):
    for k in (1, 1.5, 2, 2.5):
        m, slope = table('QB', {**STD, 'pass_td': 6}, 0, k, kind)
        names = ['Allen', 'Jackson', 'Maye', 'Hurts', 'Daniels', 'Burrow', 'Lawrence', 'Purdy', 'Williams', 'Mahomes', 'Goff', 'Nix', 'Love']
        print(f'  {kind:5s} k={k:<3} slope {slope:6.1f}', {n: (round(m[n], 2) if m.get(n) else None) for n in names})
