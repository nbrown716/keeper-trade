"""Win probability: honest backtest + sanity laws.
- Backtest: for every completed week w >= 3, predict each matchup BEFORE kickoff using only weeks < w, then score
  against the real result (Brier score; 0.25 = coin flip). Must beat a coin flip and be calibrated (favourites
  win at roughly the rate claimed).
- Laws: a locked lead with nobody left = 100%; identical sides = 50%; more points banked = higher probability."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)

JS = r"""(async () => {
  const { winProbability, remainingShare } = await import('./js/data/win-prob.js');
  const { computeBaselines } = await import('./js/data/player-baselines.js');
  const { getLeagueBundle, getNflState } = await import('./js/data/sleeper.js');
  const { completedWeeks } = await import('./js/data/season-stats.js');
  const { getPlayerDatabase } = await import('./js/data/player-db.js');
  const L = '1370223929452433408';
  const players = await getPlayerDatabase();
  const first = await getLeagueBundle(L, 1);
  const through = completedWeeks(first.league, await getNflState());
  const weeks = [];
  for (let w = 1; w <= through; w += 1) weeks.push({ week: w, matchups: (await getLeagueBundle(L, w)).matchups });
  const pos = id => players.get(String(id))?.position || '';
  const preds = [];
  for (let w = 3; w <= through; w += 1) {
    const base = computeBaselines(weeks.filter(x => x.week < w), pos);
    const groups = {};
    weeks[w - 1].matchups.forEach(m => { if (m.matchup_id != null) (groups[m.matchup_id] ||= []).push(m); });
    Object.values(groups).filter(g => g.length === 2).forEach(([a, b]) => {
      const side = m => m.starters.filter(id => id !== '0').map(id => ({ id, position: pos(id), team: 'X', points: 0 }));
      const r = winProbability(side(a), side(b), { gameFor: () => ({ state: 'pre' }), baselines: base, sims: 3000 });
      preds.push({ week: w, p: r.pA, won: a.points > b.points ? 1 : a.points < b.points ? 0 : 0.5, projA: r.projA, projB: r.projB, actualA: a.points, actualB: b.points });
    });
  }
  // laws
  const one = [{ id: '1', position: 'WR', team: 'X', points: 20 }], two = [{ id: '2', position: 'WR', team: 'X', points: 10 }];
  const done = winProbability(one, two, { gameFor: () => ({ state: 'post' }) }).pA;
  const even = winProbability([{ id: '1', position: 'WR', team: 'X', points: 5 }], [{ id: '1', position: 'WR', team: 'X', points: 5 }], { gameFor: () => ({ state: 'pre' }) }).pA;
  const lead = winProbability([{ id: '1', position: 'WR', team: 'X', points: 12 }], [{ id: '2', position: 'WR', team: 'X', points: 2 }], { gameFor: () => ({ state: 'in', period: 3, clock: '7:30' }) }).pA;
  const shares = [remainingShare(null), remainingShare({ state: 'post' }), remainingShare({ state: 'pre' }), remainingShare({ state: 'in', period: 2, clock: '0:00' }), remainingShare({ state: 'in', period: 4, clock: '7:30' })];
  return { preds, done, even, lead, shares };
})()"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); c = await make_context(b, {'width': 390, 'height': 844}, True); pg = await c.new_page()
        await pg.goto(M.BASE + 'index.html'); r = await pg.evaluate(JS); await b.close()
    preds = r['preds']
    brier = sum((x['p'] - x['won']) ** 2 for x in preds) / len(preds)
    fav = [x for x in preds if abs(x['p'] - 0.5) > 0.05]
    fav_rate = sum((x['won'] if x['p'] > 0.5 else 1 - x['won']) for x in fav) / max(1, len(fav))
    claimed = sum(max(x['p'], 1 - x['p']) for x in fav) / max(1, len(fav))
    mae = sum(abs(x['projA'] - x['actualA']) + abs(x['projB'] - x['actualB']) for x in preds) / (2 * len(preds))
    print(f"backtest: {len(preds)} matchups (weeks 3+), Brier {brier:.3f} (coin flip 0.250), favourites won {fav_rate:.0%} vs claimed {claimed:.0%}, projection MAE {mae:.1f} pts")
    check(brier < 0.25, f'pre-game Brier {brier:.3f} beats a coin flip')
    check(abs(fav_rate - claimed) < 0.15, f'calibrated: favourites win {fav_rate:.0%} of the time vs the {claimed:.0%} claimed (within 15 pts)')
    check(r['done'] == 1, f'locked lead, nobody left = 100% ({r["done"]})')
    check(abs(r['even'] - 0.5) < 0.03, f'identical sides = 50% ({r["even"]:.3f})')
    check(r['lead'] > 0.6, f'a 10-point lead in the 3rd quarter is favoured ({r["lead"]:.2f})')
    s = r['shares']
    check(s[0] == 0 and s[1] == 0 and s[2] == 1 and abs(s[3] - 0.5) < 0.01 and abs(s[4] - 0.125) < 0.01, f'remaining share: bye 0, final 0, pre 1, halftime .5, mid-4th .125 ({s})')
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
