// One tolerant parser for every AI answer (War Room, Pulse, Mock Draft).
//
// The AI is asked for JSON, but models slip: code fences, prose around the object, a missing comma between two
// lines, a trailing comma. The Worker caches each answer, so a single slip used to switch a feature off ("Start/Sit
// is unavailable right now") for everyone until the cache expired. Found 11/18: a start-sit answer came back with
// `"reason": "..."` directly followed by `"risk": "MEDIUM"` on the next line, no comma.
// Order: parse as is; parse the outermost {...}; then repair the two slips above and parse again. Anything else throws.
function repair(text) {
  return text
    .replace(/("|\d|\]|\}|true|false|null)[ \t]*\r?\n([ \t]*"(?:[^"\\\n]|\\.)*"\s*:)/g, '$1,\n$2') // missing comma before the next key
    .replace(/([}\]])[ \t]*\r?\n([ \t]*[{[])/g, '$1,\n$2')                                              // missing comma between array items
    .replace(/,(\s*[}\]])/g, '$1');                                                                       // trailing comma
}

export function parseAiJson(raw) {
  const text = String(raw ?? '').replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/g, '').trim();
  const attempts = [text];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) attempts.push(text.slice(start, end + 1));
  for (const candidate of attempts) { try { return JSON.parse(candidate); } catch (_) { /* try the next form */ } }
  for (const candidate of attempts) { try { return JSON.parse(repair(candidate)); } catch (_) { /* try the next form */ } }
  throw new Error('AI returned an unexpected format.');
}
