export function homeProbability(summary) {
  if (!summary) return null;
  if (summary.game.state === 'post') return summary.game.home.winner ? 1 : summary.game.away.winner ? 0 : 0.5;
  return summary.probability?.at(-1)?.home ?? null;
}

export function probabilityBar(summary, label = 'Win probability') {
  const home = homeProbability(summary);
  if (home === null) return '<div class="kt-probability-empty">KICKOFF</div>';
  return `<div class="kt-probability" role="img" aria-label="${label}: home ${Math.round(home * 100)} percent"><span style="transform:scaleX(${home})"></span><b>${Math.round(home * 100)}%</b></div>`;
}

export function probabilityChart(summary) {
  const points = summary?.probability || [];
  if (!points.length) return '<div class="kt-probability-empty">Win probability appears after kickoff.</div>';
  const coordinates = points.map((point, index) => ({ x: points.length === 1 ? 500 : index / (points.length - 1) * 1000, y: 180 - point.home * 150 }));
  const line = coordinates.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const area = `${line} L1000 190 L0 190 Z`;
  return `<svg class="kt-sunday-chart" viewBox="0 0 1000 210" preserveAspectRatio="none" role="img" aria-label="Home team win probability graph"><defs><linearGradient id="kt-sunday-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c6ff4a" stop-opacity=".3"/><stop offset="1" stop-color="#c6ff4a" stop-opacity="0"/></linearGradient></defs><path class="kt-sunday-chart-grid" d="M0 30H1000M0 105H1000M0 180H1000"/><path class="kt-sunday-chart-area" d="${area}"/><path class="kt-sunday-chart-line" d="${line}"/></svg>`;
}
