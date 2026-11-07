"""Calculator Market read: numbers must equal an independent recomputation from the calculator's own engine.
Keeper: side totals in 1st-round-pick units, gap, closest single balancing pick. Redraft: gap + suggested players
within 15%. Both: link to similar real trades in Deals, which opens with the search prefilled."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, re
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c = await make_context(b, {'width': 1280, 'height': 900}, False)
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(M.BASE + 'keeper.html')
        await pg.wait_for_function("/FantasyCalc \\+ Dynasty Dealer/.test(document.querySelector('#valStatus').textContent)", timeout=60000)
        await pg.wait_for_selector('#kt-market-read:not([hidden])', timeout=15000)
        text = await pg.inner_text('#kt-market-read')
        expect = await pg.evaluate("""(() => {
          const E = window.TradeEngine, S = E.state;
          const tot = side => S.sides[side].reduce((sum, e) => sum + E.adjustedValue(e), 0);
          const A = tot('A'), B = tot('B'), unit = E.assetValue({ pick: true, round: 1, yr: 0 });
          const f = v => (v / unit).toFixed(v / unit < 1 ? 2 : 1);
          const gap = Math.abs(A - B); let best = null;
          for (let r = 1; r <= 15; r++) { const v = E.assetValue({ pick: true, round: r, yr: 0 }); if (!best || Math.abs(v - gap) < Math.abs(best.v - gap)) best = { r, v }; }
          return { a: f(A), b: f(B), gap: Math.round(gap * 100).toLocaleString(), inBand: gap * 100 <= 1000, round: best.r };
        })()""")
        check(f"≈ {expect['a']} 1sts" in text and f"≈ {expect['b']} 1sts" in text, f"keeper: both sides in 1st-round units match the engine ({expect['a']} / {expect['b']})")
        if expect['inBand']:
            check('auto-approves' in text, 'keeper: inside the band says it already auto-approves')
        else:
            check(f"≈{expect['gap']} more on" in text and f"Round {expect['round']} " in text, f"keeper: gap {expect['gap']} and closest pick Round {expect['round']} match the engine")
        link = await pg.get_attribute('#kt-market-read .kt-market-link', 'href')
        check(link and link.startswith('deals.html?tab=database&q='), f'keeper: links to similar real trades ({link})')
        await pg.screenshot(path='review/market-read-keeper.png')
        check(not errs, f'keeper no errors {errs}')
        # redraft
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(M.BASE + 'redraft.html'); await pg.wait_for_timeout(5000)
        await pg.wait_for_selector('#kt-market-read:not([hidden])', timeout=15000)
        text = await pg.inner_text('#kt-market-read')
        r = await pg.evaluate("""(() => {
          const E = window.TradeEngine, S = E.state;
          const tot = side => { const vals = S.sides[side].map(e => E.adjustedValue(e)).sort((a, b) => b - a); return S.pkgAdj ? vals.reduce((s, v, i) => s + v * Math.pow(0.95, i), 0) : vals.reduce((s, v) => s + v, 0); };
          return Math.abs(tot('A') - tot('B'));
        })()""")
        m = re.search(r'≈([\d,]+) more on', text)
        check(m and abs(int(m.group(1).replace(',', '')) - r) <= 1, f'redraft: gap matches the engine ({m.group(1) if m else None} vs {r:.0f})')
        names = re.findall(r'([A-Z][^,(]+) \(([\d,]+)\)', text.split('worth about that:')[-1]) if 'worth about that' in text else []
        check(all(abs(int(v.replace(',', '')) - r) <= r * 0.15 + 1 for _, v in names), f'redraft: suggested players are within 15% of the gap ({names[:3]})')
        check(not errs, f'redraft no errors {errs}')
        # deep link prefill
        pg = await c.new_page(); await pg.goto(M.BASE + 'deals.html?tab=database&q=Justin%20Jefferson'); await pg.wait_for_selector('#dl-list li', timeout=120000)
        value = await pg.input_value('#dl-q'); count = await pg.inner_text('#dl-count')
        rows = await pg.inner_text('#dl-list')
        check(value == 'Justin Jefferson' and 'Justin Jefferson' in rows, f'Deals opens with the search prefilled and filtered ({count})')
        await b.close()
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
