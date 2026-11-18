"""AI answer parser: valid JSON, fenced JSON, prose around JSON, the real malformed start-sit answer from 11/18
(missing comma between two lines), missing comma between array items, trailing commas; garbage still throws."""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json
from playwright.async_api import async_playwright
import matrix as M
results = []
def check(ok, msg): results.append(bool(ok)); print('PASS' if ok else 'FAIL', msg)
REAL = '```json\n{\n  "players": [\n    {\n      "id": "8130",\n      "verdict": "START",\n      "confidence": 7,\n      "reason": "Primary tight end with a steady target share."\n      "risk": "MEDIUM"\n    },\n    {\n      "id": "9758",\n      "verdict": "SIT",\n      "confidence": 6,\n      "reason": "Tough matchup: \\"shadow\\" coverage likely.",\n      "risk": "HIGH"\n    }\n  ]\n}\n```'
CASES = {
  'plain': '{"a": 1, "b": [1, 2]}',
  'fenced': '```json\n{"a": 1}\n```',
  'prose': 'Here you go:\n{"a": {"b": 2}}\nHope that helps.',
  'real': REAL,
  'items': '{"list": [\n  {"x": 1}\n  {"x": 2}\n]}',
  'trailing': '{"a": 1,\n "b": [1, 2,],\n}',
  'numbers': '{\n "a": 1\n "b": true\n "c": null\n "d": "x"\n}',
  'garbage': 'I could not decide.',
  'broken': '{"a": 1 "b" 2}',
}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(service_workers='block')).new_page()
        await pg.goto(M.BASE + 'offline.html')
        r = await pg.evaluate("""async cases => { const { parseAiJson } = await import('./js/data/ai-json.js'); const out = {};
          for (const [k, v] of Object.entries(cases)) { try { out[k] = parseAiJson(v); } catch (e) { out[k] = 'THROW'; } } return out; }""", CASES)
        await b.close()
    check(r['plain'] == {'a': 1, 'b': [1, 2]} and r['fenced'] == {'a': 1} and r['prose'] == {'a': {'b': 2}}, 'valid, fenced and prose-wrapped JSON parse')
    check(r['real'] != 'THROW' and [x['verdict'] for x in r['real']['players']] == ['START', 'SIT'] and r['real']['players'][0]['risk'] == 'MEDIUM' and 'shadow' in r['real']['players'][1]['reason'], 'the real 11/18 answer (missing comma between two lines) is repaired, escaped quotes intact')
    check(r['items'] == {'list': [{'x': 1}, {'x': 2}]} and r['trailing'] == {'a': 1, 'b': [1, 2]}, 'missing comma between array items and trailing commas are repaired')
    check(r['numbers'] == {'a': 1, 'b': True, 'c': None, 'd': 'x'}, 'missing commas after numbers, true, null and strings are repaired')
    check(r['garbage'] == 'THROW' and r['broken'] == 'THROW', 'text that is not JSON still fails cleanly (nothing is invented)')
    print(f'{sum(results)}/{len(results)} passed')
asyncio.run(main())
