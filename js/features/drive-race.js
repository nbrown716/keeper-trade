// The Drive · Head-to-Head: both lineups race down one field in the real order the weekend happened.
// Pure renderer: draw(context, recap, width, height, time, reducedMotion). Everything is a function of
// `time`, so playback, scrubbing, the poster and the MP4 export all produce identical frames.
// Data comes from recap.race (built in drive-data.js from js/data/replay.js). Spec: docs/next-features-spec.md §4.

const COLOR_A = '#c6ff4a';
const COLOR_B = '#ff7a59';
const PURPLE = '#b86bff';
const GOLD = '#ffc94a';
const INK = '#eef2f8';
const MUTED = '#8a97ad';
const EASE_IN_SECONDS = 0.7;
const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
const ET_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const easeOut = value => 1 - Math.pow(1 - clamp(value), 3);
const fmt = value => (Math.round(value * 10) / 10).toFixed(1);
const display = size => `800 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
const ui = (size, weight = 700) => `${weight} ${size}px Inter, system-ui, sans-serif`;

function rounded(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect ? context.roundRect(x, y, width, height, radius) : context.rect(x, y, width, height);
}

// Fit text into maxWidth: ellipsize from the end using real glyph widths.
function fit(context, text, maxWidth) {
  let value = String(text || '');
  if (context.measureText(value).width <= maxWidth) return value;
  while (value.length > 1 && context.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
  return `${value.trimEnd()}…`;
}

// Largest display size (down to min) at which text fits maxWidth.
function fitDisplay(context, text, size, min, maxWidth) {
  let current = size;
  context.font = display(current);
  while (current > min && context.measureText(text).width > maxWidth) { current -= 1; context.font = display(current); }
  return fit(context, text, maxWidth);
}

function initials(name) {
  return String(name || '').split(/\s+/).map(part => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

// Points each side has at film time t; every scoring play eases in over EASE_IN_SECONDS.
function totals(race, time) {
  let a = 0;
  let b = 0;
  const events = race.events;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.ft > time) break;
    const value = event.delta * easeOut((time - event.ft) / EASE_IN_SECONDS);
    if (event.rosterId === race.A) a += value; else b += value;
  }
  return { a, b };
}

// Precomputed F1-style circuit (unit square): a closed Catmull-Rom spline through hand-placed corners
// (hairpin, chicane, long straight), resampled by arc length so the dots move at an even speed.
const TRACK = (() => {
  const corners = [[0.10, 0.70], [0.08, 0.40], [0.18, 0.16], [0.42, 0.12], [0.55, 0.26], [0.70, 0.12], [0.90, 0.20], [0.92, 0.46], [0.74, 0.56], [0.66, 0.70], [0.84, 0.82], [0.70, 0.92], [0.40, 0.90], [0.22, 0.86]];
  const raw = [];
  const n = corners.length;
  for (let index = 0; index < n; index += 1) {
    const p0 = corners[(index - 1 + n) % n]; const p1 = corners[index]; const p2 = corners[(index + 1) % n]; const p3 = corners[(index + 2) % n];
    for (let step = 0; step < 24; step += 1) {
      const t = step / 24; const t2 = t * t; const t3 = t2 * t;
      raw.push([0, 1].map(axis => 0.5 * ((2 * p1[axis]) + (-p0[axis] + p2[axis]) * t + (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 + (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3)));
    }
  }
  raw.push(raw[0]);
  const lengths = [0];
  for (let index = 1; index < raw.length; index += 1) lengths.push(lengths[index - 1] + Math.hypot(raw[index][0] - raw[index - 1][0], raw[index][1] - raw[index - 1][1]));
  const total = lengths.at(-1);
  return { raw, at(fraction) {
    const target = clamp(fraction) * total;
    let low = 0;
    let high = lengths.length - 1;
    while (low < high) { const mid = (low + high) >> 1; if (lengths[mid] < target) low = mid + 1; else high = mid; }
    const index = Math.max(1, low);
    const span = lengths[index] - lengths[index - 1] || 1;
    const t = (target - lengths[index - 1]) / span;
    return [raw[index - 1][0] + (raw[index][0] - raw[index - 1][0]) * t, raw[index - 1][1] + (raw[index][1] - raw[index - 1][1]) * t];
  } };
})();

// Everything that never changes during playback is painted once per size into an offscreen layer.
let staticLayer = null;
function withStaticLayer(context, width, height, paint) {
  const transform = context.getTransform ? context.getTransform() : { a: 1 };
  const scale = Math.max(1, transform.a || 1);
  const key = `${width}x${height}@${scale}`;
  if (!staticLayer || staticLayer.key !== key) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const layer = canvas.getContext('2d');
    layer.scale(scale, scale);
    paint(layer);
    staticLayer = { key, canvas };
  }
  context.drawImage(staticLayer.canvas, 0, 0, width, height);
}

function drawBackground(context, width, height, unit) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#070b14');
  gradient.addColorStop(1, '#04070d');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  const glow = context.createRadialGradient(width * 0.85, 0, 0, width * 0.85, 0, width * 0.9);
  glow.addColorStop(0, 'rgba(198,255,74,0.10)');
  glow.addColorStop(1, 'rgba(198,255,74,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(169,183,204,0.05)';
  context.lineWidth = 1;
  for (let x = 0; x < width; x += 32 * unit) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
}

function realLabel(race, time, withDay = false) {
  const real = race.filmToReal(Math.max(race.intro, Math.min(race.playEnd, time)));
  return real ? `${(withDay ? ET_DAY : ET).format(new Date(real)).toUpperCase()} ET` : '';
}

function currentWindow(race, time) {
  return race.segments.find(segment => time >= segment.filmStart - 0.35 && time <= segment.filmEnd + 0.35) || (time < race.intro ? null : race.segments.at(-1));
}

function drawHeader(context, recap, race, width, unit, time) {
  const pad = 16 * unit;
  context.textBaseline = 'alphabetic';
  context.fillStyle = MUTED;
  context.font = ui(10.5 * unit, 800);
  context.textAlign = 'left';
  context.fillText(`WEEK ${recap.week} · HEAD-TO-HEAD`, pad, 26 * unit);
  const segment = currentWindow(race, time);
  context.textAlign = 'right';
  context.fillStyle = segment ? '#ff6b80' : MUTED;
  context.fillText(segment ? `● ${segment.label} · ${realLabel(race, time)}` : 'KICKOFF', width - pad, 26 * unit);
}

function drawTower(context, race, width, unit, now) {
  const pad = 12 * unit;
  const x = pad;
  const y = 38 * unit;
  const w = width - pad * 2;
  const rowH = 38 * unit;
  rounded(context, x, y, w, rowH * 2, 14 * unit);
  context.fillStyle = 'rgba(17,24,39,0.94)';
  context.fill();
  context.strokeStyle = 'rgba(169,183,204,0.16)';
  context.lineWidth = 1;
  context.stroke();
  const rows = [
    { name: race.nameA, score: now.a, color: COLOR_A },
    { name: race.nameB, score: now.b, color: COLOR_B }
  ].sort((p, q) => q.score - p.score);
  rows.forEach((row, index) => {
    const ry = y + rowH * index;
    if (index) { context.fillStyle = 'rgba(169,183,204,0.14)'; context.fillRect(x + 10 * unit, ry, w - 20 * unit, 1); }
    context.fillStyle = MUTED;
    context.font = display(15 * unit);
    context.textAlign = 'left';
    context.fillText(`P${index + 1}`, x + 12 * unit, ry + 25 * unit);
    context.fillStyle = row.color;
    rounded(context, x + 40 * unit, ry + 11 * unit, 4 * unit, 17 * unit, 2 * unit);
    context.fill();
    context.fillStyle = INK;
    context.font = ui(13 * unit, 700);
    context.fillText(fit(context, row.name, w - 52 * unit - 150 * unit), x + 52 * unit, ry + 24 * unit);
    context.textAlign = 'right';
    context.font = display(24 * unit);
    context.fillText(fmt(row.score), x + w - 72 * unit, ry + 27 * unit);
    context.font = ui(10.5 * unit, 800);
    if (index === 0) { context.fillStyle = row.color; context.fillText(Math.abs(now.a - now.b) < 0.05 ? 'LEVEL' : 'LEADER', x + w - 12 * unit, ry + 24 * unit); }
    else {
      const gap = rows[0].score - row.score;
      context.fillStyle = MUTED;
      context.fillText(gap < 0.05 ? 'LEVEL' : `+${fmt(gap)}${gap < 5 ? ' · DRS' : ''}`, x + w - 12 * unit, ry + 24 * unit);
    }
  });
}

function fieldGeometry(width, height, unit) {
  const top = 128 * unit;
  const bottom = height - 238 * unit;
  const x = 12 * unit;
  const w = width - 24 * unit;
  const endZone = 34 * unit;
  return { x, w, top, bottom, endZone, goal: top + endZone, own: bottom - 22 * unit };
}

// Static turf: painted once per size into the cached layer (see withStaticLayer).
function paintStaticField(context, geo, unit) {
  const { x, w, top, bottom, goal, own } = geo;
  context.save();
  rounded(context, x, top, w, bottom - top, 18 * unit);
  context.clip();
  context.fillStyle = '#0d2215';
  context.fillRect(x, top, w, bottom - top);
  for (let band = 0; band < 10; band += 1) {
    const y0 = goal + (own - goal) * band / 10;
    context.fillStyle = band % 2 ? '#0c2013' : '#0e2416';
    context.fillRect(x, y0, w, (own - goal) / 10 + 1);
  }
  context.fillStyle = 'rgba(255,255,255,0.04)';
  context.fillRect(x, own, w, bottom - own);
  // Yard lines every 10, numbered like a real field.
  context.font = display(10 * unit);
  for (let yard = 10; yard < 100; yard += 10) {
    const y = goal + (own - goal) * yard / 100;
    context.fillStyle = 'rgba(255,255,255,0.16)';
    context.fillRect(x, y, w, 1);
    context.fillStyle = 'rgba(255,255,255,0.38)';
    context.textAlign = 'left';
    context.fillText(String(yard <= 50 ? yard : 100 - yard), x + 6 * unit, y - 3 * unit);
  }
  context.setLineDash([5 * unit, 6 * unit]);
  context.strokeStyle = 'rgba(255,255,255,0.28)';
  context.beginPath(); context.moveTo(x + w / 2, goal); context.lineTo(x + w / 2, own); context.stroke();
  context.setLineDash([]);
  context.restore();
  context.font = display(11 * unit);
  context.fillStyle = 'rgba(238,242,248,0.25)';
  context.textAlign = 'center';
  context.fillText('O W N   G O A L', x + w / 2, bottom - 7 * unit);
}

function drawField(context, race, geo, unit, now, time, reducedMotion) {
  const { x, w, top, bottom, endZone, goal, own } = geo;
  context.save();
  rounded(context, x, top, w, bottom - top, 18 * unit);
  context.clip();
  const ez = context.createLinearGradient(0, top, 0, goal);
  const winnerColor = race.winner === race.A ? 'rgba(198,255,74,' : race.winner === race.B ? 'rgba(255,122,89,' : 'rgba(255,255,255,';
  const tdProgress = clamp((time - race.playEnd) / 0.8);
  ez.addColorStop(0, `${winnerColor}${0.22 + 0.4 * tdProgress})`);
  ez.addColorStop(1, `${winnerColor}${0.06 + 0.2 * tdProgress})`);
  context.fillStyle = ez;
  context.fillRect(x, top, w, endZone);
  context.fillStyle = 'rgba(238,242,248,0.82)';
  context.font = display(17 * unit);
  context.textAlign = 'center';
  context.fillText('E N D   Z O N E', x + w / 2, top + endZone * 0.68);

  const target = Math.max(race.finalA, race.finalB, 1);
  const lanes = [
    { key: 'a', cx: x + w * 0.27, color: COLOR_A, rgb: '198,255,74', score: now.a, final: race.finalA, id: race.A },
    { key: 'b', cx: x + w * 0.73, color: COLOR_B, rgb: '255,122,89', score: now.b, final: race.finalB, id: race.B }
  ];
  const leaderKey = now.a > now.b + 0.05 ? 'a' : now.b > now.a + 0.05 ? 'b' : '';
  const flash = race.leadChanges.find(change => time >= change.ft && time - change.ft < 0.9);
  lanes.forEach(lane => {
    const yardFraction = clamp(lane.score / target);
    const ballY = own - (own - goal) * yardFraction;
    if (lane.key === leaderKey) {
      const tint = context.createLinearGradient(lane.cx - w * 0.25, 0, lane.cx + w * 0.25, 0);
      tint.addColorStop(0, `rgba(${lane.rgb},0)`);
      tint.addColorStop(0.5, `rgba(${lane.rgb},${0.10 + (flash && flash.leader === lane.id ? 0.25 * (1 - (time - flash.ft) / 0.9) : 0)})`);
      tint.addColorStop(1, `rgba(${lane.rgb},0)`);
      context.fillStyle = tint;
      context.fillRect(lane.cx - w * 0.25, goal, w * 0.5, own - goal);
    }
    // first-down chain: next 10-yard marker ahead of the ball
    const chainYard = Math.min(100, Math.floor(yardFraction * 10 + 1) * 10);
    const chainY = own - (own - goal) * chainYard / 100;
    context.fillStyle = GOLD;
    context.globalAlpha = 0.85;
    context.fillRect(lane.cx - w * 0.2, chainY - 1, w * 0.4, 2 * unit);
    context.globalAlpha = 1;
    // trail
    const trail = context.createLinearGradient(0, ballY, 0, own);
    trail.addColorStop(0, `rgba(${lane.rgb},0.95)`);
    trail.addColorStop(1, `rgba(${lane.rgb},0)`);
    context.fillStyle = trail;
    rounded(context, lane.cx - 3 * unit, ballY, 6 * unit, Math.max(0, own - ballY), 3 * unit);
    context.fill();
    // pulse ring on a fresh scoring play
    const fresh = race.events.find(event => event.rosterId === lane.id && time >= event.ft && time - event.ft < 0.8 && event.delta >= 3);
    if (fresh && !reducedMotion) {
      const p = (time - fresh.ft) / 0.8;
      context.strokeStyle = `rgba(${lane.rgb},${0.8 * (1 - p)})`;
      context.lineWidth = 2 * unit;
      context.beginPath(); context.arc(lane.cx, ballY, (14 + 26 * p) * unit, 0, Math.PI * 2); context.stroke();
    }
    drawBall(context, lane.cx, ballY, unit, lane.rgb, reducedMotion ? 0 : time);
  });
  context.restore();
}

function drawBall(context, cx, cy, unit, rgb, time) {
  context.save();
  context.translate(cx, cy);
  context.rotate(-1.05 + Math.sin(time * 6) * 0.08);
  // Glow via a radial gradient: shadowBlur is the most expensive canvas op on software rasterizers.
  const halo = context.createRadialGradient(0, 0, 4 * unit, 0, 0, 24 * unit);
  halo.addColorStop(0, `rgba(${rgb},0.55)`);
  halo.addColorStop(1, `rgba(${rgb},0)`);
  context.fillStyle = halo;
  context.fillRect(-24 * unit, -24 * unit, 48 * unit, 48 * unit);
  const leather = context.createRadialGradient(-3 * unit, -3 * unit, 1, 0, 0, 14 * unit);
  leather.addColorStop(0, '#c98a55');
  leather.addColorStop(1, '#7b4421');
  context.fillStyle = leather;
  context.beginPath();
  context.ellipse(0, 0, 14 * unit, 9 * unit, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = 'rgba(0,0,0,0.35)';
  context.lineWidth = 1.5 * unit;
  context.stroke();
  context.strokeStyle = '#fff';
  context.lineWidth = 1.6 * unit;
  context.beginPath(); context.moveTo(-6 * unit, 0); context.lineTo(6 * unit, 0); context.stroke();
  for (let lace = -4; lace <= 4; lace += 2) { context.beginPath(); context.moveTo(lace * unit, -2 * unit); context.lineTo(lace * unit, 2 * unit); context.stroke(); }
  context.restore();
}

function drawTiles(context, race, width, height, unit, time) {
  const y = height - 230 * unit;
  const gap = 8 * unit;
  const tileW = (width - 24 * unit - gap) / 2;
  const tileH = 54 * unit;
  [[race.A, COLOR_A, 12 * unit], [race.B, COLOR_B, 12 * unit + tileW + gap]].forEach(([rosterId, color, x]) => {
    const recent = race.events.filter(event => event.rosterId === rosterId && event.ft <= time && time - event.ft < 6 && event.delta > 0.05);
    const event = recent.at(-1);
    const age = event ? time - event.ft : 99;
    const enter = easeOut(age / 0.35);
    context.save();
    context.globalAlpha = event ? Math.min(1, enter) * (age > 5.4 ? clamp((6 - age) / 0.6) : 1) : 0.45;
    context.translate(0, event ? (1 - enter) * 10 * unit : 0);
    rounded(context, x, y, tileW, tileH, 12 * unit);
    context.fillStyle = 'rgba(24,34,53,0.96)';
    context.fill();
    const big = event && event.delta >= 6;
    context.strokeStyle = big ? color : 'rgba(169,183,204,0.18)';
    context.lineWidth = big ? 1.5 * unit : 1;
    context.stroke();
    if (event) {
      const player = race.players.get(event.playerId);
      context.fillStyle = color;
      context.beginPath(); context.arc(x + 22 * unit, y + tileH / 2, 15 * unit, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#0b0f1a';
      context.font = ui(11 * unit, 800);
      context.textAlign = 'center';
      context.fillText(initials(event.name), x + 22 * unit, y + tileH / 2 + 4 * unit);
      context.textAlign = 'left';
      context.fillStyle = INK;
      context.font = ui(11 * unit, 700);
      const textWidth = tileW - 44 * unit - 52 * unit;
      context.fillText(fit(context, event.name, textWidth), x + 44 * unit, y + 23 * unit);
      context.fillStyle = MUTED;
      context.font = ui(9.5 * unit, 600);
      context.fillText(fit(context, `${event.label || 'Points'} · ${player?.position || ''}`, textWidth), x + 44 * unit, y + 39 * unit);
      context.textAlign = 'right';
      context.fillStyle = color;
      context.font = display(19 * unit);
      context.fillText(`+${fmt(event.delta)}`, x + tileW - 9 * unit, y + 33 * unit);
    } else {
      context.fillStyle = MUTED;
      context.font = ui(10 * unit, 600);
      context.textAlign = 'center';
      context.fillText(rosterId === race.A ? race.nameA : race.nameB, x + tileW / 2, y + tileH / 2 + 4 * unit);
    }
    context.restore();
  });
  // Fastest lap: the single biggest play of the weekend, once it has happened.
  const best = race.bestPlay;
  if (best && time >= best.ft) {
    const by = y + tileH + gap;
    context.save();
    context.globalAlpha = easeOut((time - best.ft) / 0.4);
    rounded(context, 12 * unit, by, width - 24 * unit, 34 * unit, 10 * unit);
    context.fillStyle = 'rgba(24,34,53,0.96)';
    context.fill();
    context.strokeStyle = 'rgba(184,107,255,0.55)';
    context.stroke();
    context.fillStyle = PURPLE;
    context.font = ui(10 * unit, 800);
    context.textAlign = 'left';
    context.fillText('⚡ FASTEST LAP', 24 * unit, by + 21 * unit);
    context.fillStyle = INK;
    context.font = ui(10.5 * unit, 600);
    context.fillText(fit(context, `${best.name} · ${best.label || ''}`, width - 112 * unit - 64 * unit), 112 * unit, by + 21 * unit);
    context.textAlign = 'right';
    context.fillStyle = PURPLE;
    context.font = display(16 * unit);
    context.fillText(fmt(best.delta), width - 24 * unit, by + 23 * unit);
    context.restore();
  }
}

function miniMapGeometry(height, unit) {
  const boxX = 12 * unit;
  const boxY = height - 132 * unit;
  const boxW = 156 * unit;
  const boxH = 92 * unit;
  return { boxX, boxY, boxW, boxH, tx: boxX + 10 * unit, ty: boxY + 14 * unit, tw: boxW - 20 * unit, th: boxH - 26 * unit };
}

// Static circuit: painted once per size into the cached layer.
function paintStaticMiniMap(context, height, unit) {
  const { boxX, boxY, boxW, boxH, tx, ty, tw, th } = miniMapGeometry(height, unit);
  rounded(context, boxX, boxY, boxW, boxH, 14 * unit);
  context.fillStyle = 'rgba(10,14,24,0.94)';
  context.fill();
  context.strokeStyle = 'rgba(169,183,204,0.16)';
  context.lineWidth = 1;
  context.stroke();
  context.strokeStyle = 'rgba(255,255,255,0.22)';
  context.lineWidth = 5 * unit;
  context.lineJoin = 'round';
  context.beginPath();
  TRACK.raw.forEach(([px, py], index) => { const X = tx + px * tw; const Y = ty + py * th; if (index) context.lineTo(X, Y); else context.moveTo(X, Y); });
  context.closePath();
  context.stroke();
  // start/finish line
  const [sx, sy] = TRACK.at(0);
  context.strokeStyle = '#fff';
  context.lineWidth = 2 * unit;
  context.beginPath(); context.moveTo(tx + sx * tw - 6 * unit, ty + sy * th); context.lineTo(tx + sx * tw + 6 * unit, ty + sy * th); context.stroke();
}

function drawMiniMap(context, race, width, height, unit, now, time) {
  const { boxX, boxY, boxW, tx, ty, tw, th } = miniMapGeometry(height, unit);
  const target = Math.max(race.finalA, race.finalB, 1);
  [[now.b, COLOR_B, '255,122,89'], [now.a, COLOR_A, '198,255,74']].forEach(([score, color, rgb]) => {
    const fraction = clamp(score / target) * 0.999;
    // glow trail: last few hundredths of the lap
    for (let step = 6; step >= 1; step -= 1) {
      const [px, py] = TRACK.at(Math.max(0, fraction - step * 0.006));
      context.fillStyle = `rgba(${rgb},${0.12 * (7 - step) / 6})`;
      context.beginPath(); context.arc(tx + px * tw, ty + py * th, 4 * unit, 0, Math.PI * 2); context.fill();
    }
    const [px, py] = TRACK.at(fraction);
    context.fillStyle = `rgba(${rgb},0.28)`;
    context.beginPath(); context.arc(tx + px * tw, ty + py * th, 8 * unit, 0, Math.PI * 2); context.fill();
    context.fillStyle = color;
    context.beginPath(); context.arc(tx + px * tw, ty + py * th, 4.6 * unit, 0, Math.PI * 2); context.fill();
  });
  // Gap + lead changes + window timeline (sectors), right of the map.
  const gx = boxX + boxW + 14 * unit;
  const gapValue = now.a - now.b;
  context.textAlign = 'left';
  context.fillStyle = MUTED;
  context.font = ui(10 * unit, 800);
  context.fillText('GAP', gx, boxY + 16 * unit);
  context.fillStyle = Math.abs(gapValue) < 0.05 ? INK : gapValue > 0 ? COLOR_A : COLOR_B;
  context.font = display(30 * unit);
  context.fillText(`${gapValue >= 0 ? '+' : '−'}${fmt(Math.abs(gapValue))}`, gx, boxY + 46 * unit);
  const changes = race.leadChanges.filter(change => change.ft <= time).length;
  context.fillStyle = MUTED;
  context.font = ui(10 * unit, 600);
  context.fillText(`Lead changes: ${changes}`, gx, boxY + 62 * unit);
  // sector strip: one block per window, purple = you won it, coral = opponent
  const stripW = width - gx - 74 * unit; // the page mascot sits bottom-right
  const totalFilm = race.segments.reduce((sum, segment) => sum + (segment.filmEnd - segment.filmStart), 0) || 1;
  let cursor = gx;
  race.segments.forEach(segment => {
    const segW = stripW * (segment.filmEnd - segment.filmStart) / totalFilm - 2 * unit;
    const done = time >= segment.filmEnd;
    const live = time >= segment.filmStart && !done;
    context.fillStyle = done ? (segment.winner === race.A ? PURPLE : segment.winner === race.B ? COLOR_B : '#5a6780') : live ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.12)';
    rounded(context, cursor, boxY + 70 * unit, Math.max(2, segW), 6 * unit, 3 * unit);
    context.fill();
    if (segW > 26 * unit) { context.fillStyle = MUTED; context.font = ui(7.5 * unit, 700); context.fillText(segment.label.replace('SUN ', ''), cursor, boxY + 88 * unit); }
    cursor += segW + 2 * unit;
  });
}

function drawIntro(context, race, width, height, unit, time) {
  const p = clamp(time / Math.max(0.5, race.intro));
  const fade = time < race.intro ? 1 : clamp(1 - (time - race.intro) / 0.5);
  if (fade <= 0) return;
  context.save();
  context.globalAlpha = fade;
  context.fillStyle = 'rgba(4,7,13,0.82)';
  context.fillRect(0, 0, width, height);
  context.textAlign = 'center';
  context.fillStyle = COLOR_A;
  context.font = ui(12 * unit, 800);
  context.fillText('THE DRIVE · HEAD-TO-HEAD', width / 2, height * 0.36);
  context.fillStyle = INK;
  const rise = (1 - easeOut(p * 1.4)) * 18 * unit;
  const maxW = width - 40 * unit;
  context.fillText(fitDisplay(context, race.nameA.toUpperCase(), 44 * unit, 24 * unit, maxW), width / 2, height * 0.44 + rise);
  context.fillStyle = MUTED;
  context.font = display(22 * unit);
  context.fillText('VS', width / 2, height * 0.49 + rise);
  context.fillStyle = COLOR_B;
  context.fillText(fitDisplay(context, race.nameB.toUpperCase(), 44 * unit, 24 * unit, maxW), width / 2, height * 0.555 + rise);
  context.fillStyle = MUTED;
  context.font = ui(11 * unit, 600);
  context.fillText('Every play, in the order it really happened.', width / 2, height * 0.61);
  context.restore();
}

function drawFinale(context, race, width, height, unit, time, reducedMotion) {
  if (time < race.playEnd) return;
  const p = clamp((time - race.playEnd) / 0.9);
  const tie = !race.winner;
  const color = race.winner === race.A ? COLOR_A : COLOR_B;
  const winnerName = race.winner === race.A ? race.nameA : race.nameB;
  const loserFinal = race.winner === race.A ? race.finalB : race.finalA;
  const target = Math.max(race.finalA, race.finalB, 1);
  const stoppedAt = Math.max(1, Math.round(100 - 100 * loserFinal / target));
  context.save();
  context.globalAlpha = easeOut(p);
  context.fillStyle = 'rgba(4,7,13,0.66)';
  context.fillRect(0, 0, width, height);
  if (!tie && !reducedMotion) {
    for (let index = 0; index < 70; index += 1) {
      const seed = Math.sin(index * 12.9898) * 43758.5453;
      const r = seed - Math.floor(seed);
      const x = width * ((index * 0.137 + r) % 1);
      const fall = ((time - race.playEnd) * (120 + 160 * r) * unit) % (height * 1.1);
      context.fillStyle = [color, GOLD, '#ffffff', '#72a7ff'][index % 4];
      context.save();
      context.translate(x, fall - 40 * unit);
      context.rotate((time * 4 + index) % 6.28);
      context.fillRect(-3 * unit, -1.5 * unit, 6 * unit, 3 * unit);
      context.restore();
    }
  }
  context.textAlign = 'center';
  context.fillStyle = tie ? INK : color;
  const scale = 0.85 + 0.15 * easeOut(p);
  context.font = display(64 * unit * scale);
  context.fillText(tie ? 'TIE GAME' : 'TOUCHDOWN', width / 2, height * 0.40);
  context.fillStyle = INK;
  context.font = display(28 * unit);
  context.fillText(tie ? 'Nobody scores.' : fitDisplay(context, winnerName.toUpperCase(), 28 * unit, 18 * unit, width - 40 * unit), width / 2, height * 0.46);
  context.font = display(40 * unit);
  context.fillStyle = COLOR_A;
  context.fillText(fmt(race.finalA), width / 2 - 62 * unit, height * 0.535);
  context.fillStyle = MUTED;
  context.font = display(22 * unit);
  context.fillText('–', width / 2, height * 0.53);
  context.fillStyle = COLOR_B;
  context.font = display(40 * unit);
  context.fillText(fmt(race.finalB), width / 2 + 62 * unit, height * 0.535);
  context.fillStyle = MUTED;
  context.font = ui(11.5 * unit, 600);
  const changes = race.leadChanges.length;
  const lines = tie ? ['Dead level at the final whistle.'] : [
    `${race.winner === race.A ? race.nameB : race.nameA} stopped at the ${stoppedAt}-yard line.`,
    `${changes} lead change${changes === 1 ? '' : 's'} · clinched ${realLabel(race, race.clinchedAt, true)}`
  ];
  lines.forEach((line, index) => context.fillText(line, width / 2, height * 0.585 + index * 18 * unit));
  if (race.approximate) { context.font = ui(9 * unit, 600); context.fillText('Some timing approximate where play-by-play was unavailable.', width / 2, height * 0.585 + 44 * unit); }
  context.restore();
}

export function createRaceRenderer() {
  return function draw(context, recap, width, height, time, reducedMotion = false) {
    const race = recap.race;
    const unit = Math.min(width / 360, height / 640);
    if (!race || !race.events) {
      drawBackground(context, width, height, unit);
      context.fillStyle = INK;
      context.font = display(28 * unit);
      context.textAlign = 'center';
      context.fillText('HEAD-TO-HEAD', width / 2, height * 0.45);
      context.fillStyle = MUTED;
      context.font = ui(12 * unit, 600);
      context.fillText('This week has no opponent to race.', width / 2, height * 0.5);
      return;
    }
    const t = reducedMotion && time < race.playEnd ? Math.max(time, race.intro) : time;
    const now = totals(race, t);
    withStaticLayer(context, width, height, layer => {
      drawBackground(layer, width, height, unit);
      paintStaticField(layer, fieldGeometry(width, height, unit), unit);
      paintStaticMiniMap(layer, height, unit);
    });
    drawHeader(context, recap, race, width, unit, t);
    drawTower(context, race, width, unit, now);
    const geo = fieldGeometry(width, height, unit);
    drawField(context, race, geo, unit, now, t, reducedMotion);
    drawTiles(context, race, width, height, unit, t);
    drawMiniMap(context, race, width, height, unit, now, t);
    if (!reducedMotion) drawIntro(context, race, width, height, unit, t);
    drawFinale(context, race, width, height, unit, t, reducedMotion);
  };
}
