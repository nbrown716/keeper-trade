import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
REPO = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
import asyncio, glob, os, json
from playwright.async_api import async_playwright
ROOT = REPO
files = [p.replace(os.sep, '/')[len(ROOT)+1:] for p in glob.glob(ROOT + r"\js\**\*.js", recursive=True)] + ['worker/worker.js']
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); c = await b.new_context(service_workers='block'); pg = await c.new_page()
        await pg.goto('http://127.0.0.1:4173/offline.html')
        res = await pg.evaluate("""async files => { const out = {}; for (const f of files) {
            if (f.endsWith('sim.worker.js')) { try { new Worker('/' + f, { type: 'module' }); out[f]='ok-worker'; } catch(e) { out[f]=String(e); } continue; }
            try { await import('/' + f); out[f] = 'ok'; } catch (e) { out[f] = (e && e.name) + ': ' + (e && e.message); } } return out; }""", files)
        bad = {k: v for k, v in res.items() if not v.startswith('ok')}
        print(len(res), 'modules;', 'non-ok:', json.dumps(bad, indent=1))
        # Page-entry modules expect their own page's DOM, so on a blank page they throw "Cannot read properties of null".
        # Anything else (SyntaxError, a missing export, a bad import path) is a real break.
        real = {k: v for k, v in bad.items() if not (v.startswith('TypeError') and 'of null' in v)}
        print('SYNTAX', 'PASS' if not real else 'FAIL ' + json.dumps(real))
        await b.close()
asyncio.run(main())
