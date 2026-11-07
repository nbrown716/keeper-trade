"""Deals/market engine vs the real Keeper calculator: players and picks must price the same.
Loads keeper.html (live values), sets 24 keepers gone, reads window.TradeEngine; computes the same assets with
js/data/trade-market.js in the same page and compares."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)

JS = r"""(async () => {
  const E = window.TradeEngine;
  const db = E.players().filter(p => !p.pick && p.ds != null && p.base > 0).slice(0, 120);
  const m = await import('./js/data/trade-market.js');
  const market = await m.getMarket('keeper');
  const players = db.map(p => { const mine = m.playerValue(market, p.sleeperId, p.n); return { name: p.n, calc: p.base, mine: mine ? mine.base : null }; });
  const ctx = { type: 'keeper', keepersGone: 24, teams: 12, nextDraft: 2027 };
  const picks = [];
  for (let round = 1; round <= 15; round += 1) for (let yr = 0; yr <= 2; yr += 1) {
    picks.push({ round, yr, calc: E.assetValue({ pick: true, round, yr }) * 100, mine: m.pickValue(market, { round, season: 2027 + yr }, ctx) });
  }
  return { players, picks, curve: [E.players().filter(p => !p.pick).length, market.players.length] };
})()"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); c = await make_context(b, {'width': 1280, 'height': 900}, False); pg = await c.new_page()
        await pg.goto(M.BASE + 'keeper.html')
        await pg.wait_for_function("/FantasyCalc \\+ Dynasty Dealer/.test(document.querySelector('#valStatus').textContent)", timeout=60000)
        await pg.click('#segKeepers [data-v="24"]'); await pg.wait_for_timeout(300)
        r = await pg.evaluate(JS); await b.close()
    bad = [x for x in r['players'] if x['mine'] is None or abs(x['mine'] - x['calc']) > 0.051]
    check(len(r['players']) >= 100 and not bad, f"{len(r['players'])} players price identically to the Keeper calculator (0-100 scale, ±0.05) {bad[:4]}")
    worst = max(r['picks'], key=lambda x: abs(x['mine'] - x['calc']) / max(1, x['calc']))
    err = abs(worst['mine'] - worst['calc']) / max(1, worst['calc'])
    print(f"   curve sizes calc/market {r['curve']}; worst pick gap {err:.1%} at round {worst['round']} +{worst['yr']}y ({worst['mine']} vs {worst['calc']:.0f})")
    check(err <= 0.03, f'all 45 keeper picks (rounds 1-15, 0-2 years out) within 3% of the calculator (worst {err:.1%})')
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
