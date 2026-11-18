// Dynasty trade calculator: pure math (no DOM, no network), so every number is testable on its own.
//
// Values: the same live blend as the rest of the site (Dynasty Dealer + FantasyCalc, each normalized 0-100,
// display scale 0-10,000), priced in the active scoring format. This is NOT the Keeper calculator: no keeper
// cost, no 1,000-point house rule. Keeper math lives in keeper.html and is untouched.
//
// Package adjustment (a model setting, on by default, shown next to the straight sum): on each side the best
// piece counts in full, the 2nd at 85%, the 3rd at 75%, the 4th at 65%, the 5th at 55%, the rest at 50%.
// Reason: one roster spot of elite production is scarcer than the same total spread over several spots, so
// two good players do not buy one great one at face value.
export const PACKAGE_WEIGHTS = [1, 0.85, 0.75, 0.65, 0.55];
export const PACKAGE_FLOOR = 0.5;
export const FAIR_PCT = 0.05;  // sides within 5% of the bigger side: fair
export const LEAN_PCT = 0.15;  // 5-15%: leans; above: a clear win

export const weightAt = index => PACKAGE_WEIGHTS[index] ?? PACKAGE_FLOOR;

// pieces: [{ value, low, high }]. Returns { total, low, high, straight } on the display scale.
export function sideTotal(pieces, packageOn = true) {
  const sorted = [...pieces].sort((a, b) => b.value - a.value);
  const w = index => (packageOn ? weightAt(index) : 1);
  return {
    total: Math.round(sorted.reduce((sum, piece, index) => sum + piece.value * w(index), 0)),
    low: Math.round(sorted.reduce((sum, piece, index) => sum + (piece.low ?? piece.value) * w(index), 0)),
    high: Math.round(sorted.reduce((sum, piece, index) => sum + (piece.high ?? piece.value) * w(index), 0)),
    straight: Math.round(sorted.reduce((sum, piece) => sum + piece.value, 0))
  };
}

// a, b: sideTotal results for what Team A gives and what Team B gives. The team that gives LESS comes out ahead.
export function verdict(a, b) {
  const big = Math.max(a.total, b.total);
  const gap = Math.abs(a.total - b.total);
  const pct = big ? gap / big : 0;
  const state = !big ? 'empty' : pct <= FAIR_PCT ? 'fair' : pct <= LEAN_PCT ? 'lean' : 'win';
  const ahead = state === 'fair' || state === 'empty' ? null : a.total < b.total ? 'A' : 'B';
  const overlap = a.low <= b.high && b.low <= a.high;
  return { gap, pct, state, ahead, short: ahead, overlap };
}

// Best pieces to even the deal: added to the side that gives less, judged by the gap that would remain
// (so it is right with the package adjustment on). candidates: [{ value, low, high, ...any }].
export function evenUp(shortPieces, otherTotal, candidates, packageOn = true, limit = 3) {
  return candidates
    .map(candidate => ({ candidate, left: Math.abs(sideTotal([...shortPieces, candidate], packageOn).total - otherTotal) }))
    .filter(item => item.left <= FAIR_PCT * Math.max(otherTotal, 1))
    .sort((x, y) => x.left - y.left)
    .slice(0, limit);
}
