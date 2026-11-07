// The Drive · Activity Summary: a Strava-style breakdown of the head-to-head week, under the film.
// Pace chart (both cumulative lines over the real weekend), splits by game window, top performers and
// achievements, all computed from recap.race (the replay). Tapping the pace chart scrubs the film.
// Spec: docs/next-features-spec.md §4.6.

const ET_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
const fmt = value => (Math.round(value * 10) / 10).toFixed(1);

// Walk the events once: lead changes, biggest lead/deficit for side A, cumulative samples for the chart.
function analyse(race) {
  let a = 0;
  let b = 0;
  let maxLead = 0;
  let maxDeficit = 0;
  let firstScoreLeader = 0;
  let ledThroughout = true;
  const samples = [{ ft: race.intro, a: 0, b: 0 }];
  race.events.forEach(event => {
    if (event.rosterId === race.A) a += event.delta; else b += event.delta;
    maxLead = Math.max(maxLead, a - b);
    maxDeficit = Math.max(maxDeficit, b - a);
    if (!firstScoreLeader && Math.abs(a - b) > 0.005) firstScoreLeader = a > b ? race.A : race.B;
    if (firstScoreLeader && ((firstScoreLeader === race.A && b > a + 0.005) || (firstScoreLeader === race.B && a > b + 0.005))) ledThroughout = false;
    samples.push({ ft: event.ft, a, b });
  });
  samples.push({ ft: race.playEnd, a: race.finalA, b: race.finalB });
  return { maxLead, maxDeficit, wireToWire: ledThroughout && firstScoreLeader === race.winner && race.winner !== 0, samples };
}

function achievements(race, recap, stats) {
  const youWon = race.winner === race.A;
  const margin = Math.abs(race.finalA - race.finalB);
  const list = [];
  if (youWon && stats.maxDeficit >= 20) list.push(['★', 'gold', `Comeback · trailed by ${fmt(stats.maxDeficit)}`]);
  if (stats.wireToWire && youWon) list.push(['⇢', 'volt', 'Wire to wire']);
  if (!youWon && race.winner && stats.maxLead >= 15) list.push(['♡', 'blue', `Heartbreak · led by ${fmt(stats.maxLead)}`]);
  if (margin < 2 && race.winner) list.push(['◎', 'blue', `Photo finish · ${fmt(margin)} pts`]);
  if (margin >= 40) list.push(['⚑', 'volt', `${youWon ? 'Statement win' : 'Rough one'} · ${fmt(margin)} pts`]);
  if (recap.rank === 1) list.push(['♛', 'gold', 'Highest score in the league']);
  if (race.segments.length > 1 && race.segments.every(segment => segment.winner === race.A)) list.push(['⚡', 'purple', 'Won every window']);
  const late = race.segments.find(segment => race.clinchedAt >= segment.filmStart && race.clinchedAt <= segment.filmEnd + 0.8);
  if (youWon && late && /SNF|MNF/.test(late.label)) list.push(['☾', 'purple', `${late.label} hero · clinched late`]);
  if (race.leadChanges.length >= 4) list.push(['⇄', 'blue', `${race.leadChanges.length} lead changes`]);
  return list;
}

function topPerformers(race, rosterId) {
  const totals = new Map();
  race.events.forEach(event => { if (event.rosterId === rosterId) totals.set(event.playerId, (totals.get(event.playerId) || 0) + event.delta); });
  return [...totals.entries()].map(([id, points]) => ({ ...race.players.get(id), points })).sort((x, y) => y.points - x.points).slice(0, 3);
}

function paceChart(race, stats) {
  const width = 640;
  const height = 200;
  const pad = { l: 8, r: 8, t: 12, b: 26 };
  const maxY = Math.max(race.finalA, race.finalB, 1) * 1.04;
  const x = ft => pad.l + (ft - race.intro) / Math.max(1e-6, race.playEnd - race.intro) * (width - pad.l - pad.r);
  const y = value => height - pad.b - value / maxY * (height - pad.t - pad.b);
  const line = key => stats.samples.map((sample, index) => `${index ? 'L' : 'M'}${x(sample.ft).toFixed(1)} ${y(sample[key]).toFixed(1)}`).join(' ');
  const area = `${line('a')} L${x(race.playEnd).toFixed(1)} ${y(0)} L${x(race.intro).toFixed(1)} ${y(0)} Z`;
  const bands = race.segments.map((segment, index) => `<rect x="${x(segment.filmStart).toFixed(1)}" y="${pad.t}" width="${Math.max(1, x(segment.filmEnd) - x(segment.filmStart)).toFixed(1)}" height="${height - pad.t - pad.b}" fill="rgba(255,255,255,${index % 2 ? 0.025 : 0.05})"/>${x(segment.filmEnd) - x(segment.filmStart) >= 54 ? `<text x="${(x(segment.filmStart) + 4).toFixed(1)}" y="${height - 8}" class="kt-pace-label">${escapeHtml(segment.label)}</text>` : ''}`).join('');
  const changes = race.leadChanges.map(change => {
    const value = change.leader === race.A ? change.a : change.b;
    return `<circle cx="${x(change.ft).toFixed(1)}" cy="${y(value).toFixed(1)}" r="5" class="kt-pace-change"><title>Lead change</title></circle>`;
  }).join('');
  return `<svg class="kt-pace-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Pace chart: cumulative points for both teams across the weekend. ${race.leadChanges.length} lead changes. Tap to jump the film to that moment." preserveAspectRatio="none">${bands}<path d="${area}" class="kt-pace-area"/><path d="${line('b')}" class="kt-pace-line kt-pace-b"/><path d="${line('a')}" class="kt-pace-line kt-pace-a"/>${changes}<line class="kt-pace-cursor" x1="0" x2="0" y1="${pad.t}" y2="${height - pad.b}"/></svg>`;
}

export function renderSummary(container, recap, { onSeek } = {}) {
  const race = recap?.race;
  if (!container) return;
  if (!race || !race.events?.length) { container.hidden = true; return; }
  const stats = analyse(race);
  const youWon = race.winner === race.A;
  const margin = Math.abs(race.finalA - race.finalB);
  const clinched = race.filmToReal(race.clinchedAt);
  const headline = race.winner === 0 ? `Dead level at ${fmt(race.finalA)}.` : `${youWon ? 'Win' : 'Loss'} by ${fmt(margin)}.`;
  const clinchedLine = clinched && race.winner ? `Decided ${ET_DAY.format(new Date(clinched))} ET` : '';
  const splits = race.segments.map(segment => {
    const diff = segment.a - segment.b;
    return `<tr><th scope="row">${escapeHtml(segment.label)}</th><td>${fmt(segment.a)}</td><td>${fmt(segment.b)}</td><td class="${diff > 0.05 ? 'is-up' : diff < -0.05 ? 'is-down' : ''}">${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))}</td></tr>`;
  }).join('');
  const performer = (player, rank) => `<li><span class="kt-summary-rank">${rank}</span><div><strong>${escapeHtml(player.name || 'Player')}</strong><small>${escapeHtml([player.position, player.team].filter(Boolean).join(' · '))}</small></div><b class="kt-num">${fmt(player.points)}</b></li>`;
  const badges = achievements(race, recap, stats);
  container.hidden = false;
  container.innerHTML = `<div class="kt-summary-head"><span class="kt-eyebrow">Activity summary · Week ${recap.week}</span><h2 id="drive-summary-title">${escapeHtml(headline)}</h2><p>${escapeHtml(race.nameA)} vs ${escapeHtml(race.nameB)}${clinchedLine ? ` · ${escapeHtml(clinchedLine)}` : ''}</p></div>
  <dl class="kt-summary-kpis"><div><dt>Points</dt><dd class="kt-num">${fmt(race.finalA)}</dd></div><div><dt>Lead changes</dt><dd class="kt-num">${race.leadChanges.length}</dd></div><div><dt>Biggest lead</dt><dd class="kt-num">${fmt(stats.maxLead)}</dd></div><div><dt>Week rank</dt><dd class="kt-num">${recap.rank}<small>/${recap.teams}</small></dd></div></dl>
  <section class="kt-summary-card"><h3>Pace</h3><div class="kt-pace-legend"><span class="kt-pace-key is-a">${escapeHtml(race.nameA)}</span><span class="kt-pace-key is-b">${escapeHtml(race.nameB)}</span></div>${paceChart(race, stats)}</section>
  <section class="kt-summary-card"><h3>Splits</h3><table class="kt-summary-splits"><thead><tr><th scope="col">Window</th><th scope="col">You</th><th scope="col">Opp</th><th scope="col">Split</th></tr></thead><tbody>${splits}</tbody></table></section>
  <section class="kt-summary-card kt-summary-best"><h3>Best efforts</h3><div><div><span class="kt-pace-key is-a">${escapeHtml(race.nameA)}</span><ol>${topPerformers(race, race.A).map((player, index) => performer(player, index + 1)).join('')}</ol></div><div><span class="kt-pace-key is-b">${escapeHtml(race.nameB)}</span><ol>${topPerformers(race, race.B).map((player, index) => performer(player, index + 1)).join('')}</ol></div></div></section>
  ${badges.length ? `<section class="kt-summary-card"><h3>Achievements</h3><ul class="kt-summary-badges">${badges.map(([icon, tone, label]) => `<li class="is-${tone}"><i aria-hidden="true">${icon}</i>${escapeHtml(label)}</li>`).join('')}</ul></section>` : ''}
  ${race.approximate ? '<p class="kt-summary-note">Some timing is approximate where play-by-play was unavailable. Totals are official.</p>' : ''}`;
  // Tap or drag on the pace chart to scrub the film to that moment.
  const svg = container.querySelector('.kt-pace-chart');
  const cursor = container.querySelector('.kt-pace-cursor');
  const toFilm = event => {
    const rect = svg.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    return race.intro + ratio * (race.playEnd - race.intro);
  };
  svg.addEventListener('pointerdown', event => { svg.setPointerCapture?.(event.pointerId); onSeek?.(toFilm(event)); });
  svg.addEventListener('pointermove', event => { if (event.buttons) onSeek?.(toFilm(event)); });
  return {
    update(time) {
      const ratio = Math.max(0, Math.min(1, (time - race.intro) / (race.playEnd - race.intro)));
      const x = 8 + ratio * (640 - 16);
      cursor.setAttribute('x1', x.toFixed(1));
      cursor.setAttribute('x2', x.toFixed(1));
    }
  };
}
