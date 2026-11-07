// User-facing error text. Messages the app throws on purpose ("Season Sim is waiting for a league.")
// pass through; JavaScript runtime errors (TypeError etc.) never reach the screen as raw text.
const RUNTIME_ERRORS = [TypeError, ReferenceError, RangeError, SyntaxError];

export function friendlyError(error, fallback) {
  if (!error || RUNTIME_ERRORS.some(type => error instanceof type)) return fallback;
  const message = String(error.message || '').trim();
  if (!message || /undefined|null|is not a function|Cannot read|Failed to fetch|NetworkError|HTTP \d{3}|JSON/i.test(message)) return fallback;
  return message;
}
