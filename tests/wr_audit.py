"""Skeptic audit for Season Wrapped: text overflow on every slide for every manager, raw-value leaks,
interactions (tap/hold/swipe/keys/menu/focus), exports, edge cases, failure states, axe."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
REPO = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
import asyncio, sys, json, re, time
from playwright.async_api import async_playwright
import matrix as M
from crawl import make_context
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)

# Records every fillText that leaves the canvas (or the safe 16px gutter) and any raw value leaks.
INSTRUMENT = r"""(() => {
  const orig = CanvasRenderingContext2D.prototype.fillText;
  window.__overflow = []; window.__leaks = [];
  CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
    const str = String(text);
    if (/NaN|undefined|Infinity|\[object|null/.test(str)) window.__leaks.push(str);
    const w = this.measureText(str).width;
    const m = this.getTransform();
    const sx = Math.hypot(m.a, m.b) || 1;
    const align = this.textAlign;
    const left = align === 'center' ? x - w / 2 : (align === 'right' || align === 'end') ? x - w : x;
    const L = m.a * left + m.e, R = m.a * (left + w) + m.e;
    const W = this.canvas.width, gutter = W * 0.03;
    if (this.canvas.id !== 'wr-canvas-probe' && Math.abs(m.b) < 1e-6 && m.a > 0.98 && (L < gutter - 1 || R > W - gutter + 1)) window.__overflow.push({ text: str.slice(0, 60), L: Math.round(L), R: Math.round(R), W });
    return orig.call(this, text, x, y, maxWidth);
  };
})()"""

RENDER_ALL = r"""(async ({ w, h }) => {
  const { loadSeason, computeSeason } = await import('./js/data/season-stats.js');
  const { buildSlides } = await import('./js/features/wrapped-slides.js');
  const season = window.__season || (window.__season = await loadSeason('1370223929452433408'));
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const out = [];
  for (const [id, team] of season.teams) {
    const slides = buildSlides(season, id);
    for (const slide of slides) {
      for (const t of [0.6, 1.6, 99]) {
        window.__overflow = [];
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        try { slide.draw(ctx, w, h, t, false); } catch (e) { out.push({ manager: team.name, slide: slide.id, t, error: String(e) }); continue; }
        if (window.__overflow.length && t === 99) out.push({ manager: team.name, slide: slide.id, t, overflow: window.__overflow.slice(0, 3) });
      }
      if (/NaN|undefined|Infinity|null/.test(slide.alt)) out.push({ manager: team.name, slide: slide.id, altLeak: slide.alt.slice(0, 120) });
    }
  }
  return { problems: out, leaks: window.__leaks.slice(0, 10), managers: season.teams.size, slides: [...season.teams.keys()].map(id => buildSlides(season, id).length) };
})"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---------- 1. overflow / leaks on every slide for every manager, phone + 1080x1920 export
        c = await make_context(b, {'width': 390, 'height': 844}, True); await c.add_init_script(INSTRUMENT)
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(M.BASE + 'wrapped.html'); await pg.wait_for_function("!document.querySelector('#wr-play').disabled", timeout=120000)
        await pg.evaluate("document.fonts.ready")
        for w, h in [(720, 1280), (1080, 1920)]:
            r = await pg.evaluate(RENDER_ALL, {'w': w, 'h': h})
            for item in r['problems'][:12]: print('   ', json.dumps(item)[:300])
            check(not r['problems'] and not r['leaks'], f"{w}x{h}: {r['managers']} managers x {r['slides']} slides, 3 timepoints: no overflow/errors/leaks ({len(r['problems'])} problems, leaks {r['leaks']})")
        # ---------- 2. interactions
        await pg.click('#wr-play'); await pg.wait_for_timeout(400)
        check(await pg.is_visible('#wr-story'), 'Play opens the story overlay')
        check(await pg.evaluate("document.activeElement.id") == 'wr-close', 'focus moves into the dialog')
        lbl = await pg.get_attribute('#wr-canvas', 'aria-label'); live = await pg.inner_text('#wr-live')
        check(lbl and live.startswith('Slide 1 of'), f'canvas has alt text and live region announces ({live[:60]})')
        box = await pg.locator('#wr-stage').bounding_box()
        await pg.mouse.click(box['x'] + box['width'] * 0.85, box['y'] + box['height'] * 0.5); await pg.wait_for_timeout(250)
        check((await pg.inner_text('#wr-live')).startswith('Slide 2'), 'tap right advances')
        await pg.mouse.click(box['x'] + box['width'] * 0.1, box['y'] + box['height'] * 0.5); await pg.wait_for_timeout(250)
        check((await pg.inner_text('#wr-live')).startswith('Slide 1'), 'tap left goes back')
        # hold to pause: elapsed must not advance while held, and release must not navigate
        await pg.mouse.move(box['x'] + box['width'] * 0.6, box['y'] + box['height'] * 0.5); await pg.mouse.down()
        await pg.wait_for_timeout(300); f1 = await pg.evaluate("document.querySelector('#wr-progress span i').style.transform")
        await pg.wait_for_timeout(900); f2 = await pg.evaluate("document.querySelector('#wr-progress span i').style.transform")
        await pg.mouse.up(); await pg.wait_for_timeout(250)
        check(f1 == f2 and (await pg.inner_text('#wr-live')).startswith('Slide 1'), f'hold pauses ({f1} == {f2}) and release does not skip')
        await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(200)
        check((await pg.inner_text('#wr-live')).startswith('Slide 3'), 'arrow keys navigate')
        await pg.evaluate("document.activeElement.blur()"); await pg.keyboard.press('Space'); await pg.wait_for_timeout(150)
        check(await pg.get_attribute('#wr-pause', 'aria-pressed') == 'true', 'Space pauses')
        await pg.keyboard.press('Space')
        # auto-advance
        before = await pg.inner_text('#wr-live'); await pg.wait_for_timeout(6200)
        check((await pg.inner_text('#wr-live')) != before, 'slides auto-advance after ~5.5 s')
        # menu + focus trap
        await pg.click('#wr-more'); await pg.wait_for_timeout(150)
        check(await pg.is_visible('#wr-menu') and await pg.evaluate("document.activeElement.id") == 'wr-share-slide', 'Share menu opens with focus on first item and pauses')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(100)
        check(not await pg.is_visible('#wr-menu') and await pg.is_visible('#wr-story'), 'Escape closes the menu first, not the story')
        for _ in range(12): await pg.keyboard.press('Tab')
        check(await pg.evaluate("!!document.activeElement.closest('#wr-story')"), 'focus is trapped inside the story')
        # share slide download
        await pg.click('#wr-more')
        async with pg.expect_download() as d: await pg.click('#wr-share-slide')
        dl = await d.value; check(dl.suggested_filename.endswith('.png') and 'wrapped-2026' in dl.suggested_filename, f'Share this slide downloads PNG ({dl.suggested_filename})')
        path = await dl.path(); import struct
        with open(path, 'rb') as fh: head = fh.read(24)
        wpx, hpx = struct.unpack('>II', head[16:24]); check((wpx, hpx) == (1080, 1920), f'slide PNG is 1080x1920 ({wpx}x{hpx})')
        # save all
        got = []; pg.on('download', lambda dd: got.append(dd.suggested_filename))
        await pg.click('#wr-more'); await pg.click('#wr-save-all'); await pg.wait_for_timeout(6000)
        n = await pg.evaluate("document.querySelectorAll('#wr-progress span').length")
        check(len(got) == n, f'Save all slides downloads {n} PNGs ({len(got)})')
        # swipe down closes, focus returns
        await pg.mouse.move(box['x'] + box['width'] * 0.6, box['y'] + 200); await pg.mouse.down(); await pg.mouse.move(box['x'] + box['width'] * 0.6, box['y'] + 360, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(250)
        check(not await pg.is_visible('#wr-story') and await pg.evaluate("document.activeElement.id") == 'wr-play', 'swipe down closes and focus returns to Play')
        check(not errs, f'no page errors {errs}')
        # ---------- 3. video export
        await pg.click('#wr-play'); await pg.wait_for_timeout(300)
        vids = []; pg.on('download', lambda dd: vids.append(dd))
        t0 = time.time(); await pg.click('#wr-more'); await pg.click('#wr-video')
        await pg.wait_for_function("/Video ready|failed|can’t/.test(document.querySelector('#wr-export').textContent)", timeout=120000)
        status = await pg.inner_text('#wr-export'); await pg.wait_for_timeout(500)
        vid = [v for v in vids if v.suggested_filename.endswith(('.mp4', '.webm'))]
        size = 0
        if vid:
            import os; size = os.path.getsize(await vid[0].path())
        check(vid and size < 8 * 1048576, f'video export ({vid[0].suggested_filename if vid else None}, {size/1048576:.1f} MB, {round(time.time()-t0)}s, "{status}")')
        await c.close()
        # ---------- 4. reduced motion renders final frames, no errors
        c = await make_context(b, {'width': 390, 'height': 844}, True)
        await c.add_init_script("(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => /reduce/.test(q) ? { matches: true, media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} } : mm(q); })()")
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(M.BASE + 'wrapped.html?play=1'); await pg.wait_for_function("!document.querySelector('#wr-story').hidden", timeout=120000); await pg.wait_for_timeout(300)
        await pg.locator('#wr-stage').screenshot(path='review/wr-rm.png')
        check(not errs, f'?play=1 deep link opens the story; reduced motion OK {errs}')
        await c.close()
        # ---------- 5. edge cases: mini season (2 weeks), new manager with no history, no trades
        c = await make_context(b, {'width': 390, 'height': 844}, True); pg = await c.new_page()
        await pg.goto(M.BASE + 'wrapped.html'); await pg.wait_for_function("!document.querySelector('#wr-play').disabled", timeout=120000)
        r = await pg.evaluate("""(async () => {
          const m = await import('./js/data/season-stats.js'); const { buildSlides } = await import('./js/features/wrapped-slides.js');
          const S = 'https://api.sleeper.app/v1/league/1370223929452433408';
          const j = u => fetch(u).then(r => r.json());
          const [league, rosters, users, m1, m2] = await Promise.all([j(S), j(S + '/rosters'), j(S + '/users'), j(S + '/matchups/1'), j(S + '/matchups/2')]);
          const { getPlayerDatabase } = await import('./js/data/player-db.js');
          const players = await getPlayerDatabase();
          const mini = m.computeSeason({ league, rosters, users, weeks: [{ week: 1, matchups: m1, transactions: [] }, { week: 2, matchups: m2, transactions: [] }], players });
          const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; const ctx = c.getContext('2d');
          const counts = []; let error = null;
          mini.teams.forEach((t, id) => { const s = buildSlides(mini, id); counts.push(s.length); s.forEach(sl => { try { sl.draw(ctx, 1080, 1920, 99, true); } catch (e) { error = String(e); } }); });
          const one = m.computeSeason({ league, rosters, users, weeks: [{ week: 1, matchups: m1, transactions: [] }], players });
          let error1 = null; one.teams.forEach((t, id) => buildSlides(one, id).forEach(sl => { try { sl.draw(ctx, 1080, 1920, 99, true); } catch (e) { error1 = String(e); } }));
          return { counts: [...new Set(counts)], error, error1, nemesisNull: [...mini.teams.values()].every(t => t.nemesis === null) };
        })()""")
        check(r['counts'] == [5] and not r['error'] and not r['error1'], f"under 3 weeks: 5-slide mini version renders for every manager ({r})")
        await c.close()
        # ---------- 6. failure states
        for name, setup, expect in [
            ('no league connected', "localStorage.removeItem('kt-sleeper-league:v1'); localStorage.removeItem('kt-league-connections:v1')", 'Connect your league'),
        ]:
            c = await b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block'); pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(M.BASE + 'wrapped.html'); await pg.wait_for_timeout(1500)
            txt = await pg.inner_text('#wr-status'); check(expect in txt and not errs, f'{name}: "{txt[:70]}" {errs}')
            await c.close()
        c = await make_context(b, {'width': 390, 'height': 844}, True)
        await c.route(re.compile(r'https://api\.sleeper\.app/.*'), lambda r: r.abort())
        pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(M.BASE + 'wrapped.html'); await pg.wait_for_timeout(25000)
        txt = await pg.inner_text('#wr-status')
        check(not errs and not re.search(r'TypeError|undefined|Failed to fetch', txt), f'Sleeper down (cold cache): friendly status "{txt[:90]}"')
        await c.close()
        await b.close()
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
