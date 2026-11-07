// The Drive · Home Of: a night-lights flyover of the US. Slot by slot (QB vs QB, RB vs RB...), both
// managers' players launch as spinning footballs from their previous stadium and land on the SAME frame
// (long flights fly faster), then the frame splits like a broadcast into two "home of the" title cards.
// Pure renderer of film time: draw(context, recap, width, height, time, reducedMotion). Spec §5.

import { METROS, albers } from '../data/us-map.js';
import { createMapRenderer } from './drive-map.js';

const COLOR_A = '#c6ff4a';
const COLOR_B = '#ff7a59';
const RGB_A = '198,255,74';
const RGB_B = '255,122,89';
const INK = '#eef2f8';
const MUTED = '#8a97ad';
const INTRO = 3;
const BEATS_END = 44;
const FLIGHT = 1.3;
const ZOOM_IN = 0.5;
const ZOOM_OUT = 0.4;
const LAYER_SCALE = 3;
const START = [487.5, 330]; // the heartland: both balls kick off from mid-America

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const easeInOut = value => { const t = clamp(value); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeOut = value => 1 - Math.pow(1 - clamp(value), 3);
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = value => (Math.round(value * 10) / 10).toFixed(1);
const display = size => `800 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
const ui = (size, weight = 700) => `${weight} ${size}px Inter, system-ui, sans-serif`;

function seeded(seed) { let state = seed % 2147483647; return () => (state = state * 16807 % 2147483647) / 2147483647; }

function fit(context, text, maxWidth) {
  let value = String(text || '');
  if (context.measureText(value).width <= maxWidth) return value;
  while (value.length > 1 && context.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
  return `${value.trimEnd()}…`;
}
function fitDisplay(context, text, size, min, maxWidth) {
  let current = size;
  context.font = display(current);
  while (current > min && context.measureText(text).width > maxWidth) { current -= 1; context.font = display(current); }
  return fit(context, text, maxWidth);
}

// ---- static night map layer (built once, in map units × LAYER_SCALE) ----
let mapLayer = null;
function buildLayer(map) {
  if (mapLayer?.map === map) return mapLayer.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((map.width + 120) * LAYER_SCALE);
  canvas.height = Math.round((map.height + 120) * LAYER_SCALE);
  const context = canvas.getContext('2d');
  context.scale(LAYER_SCALE, LAYER_SCALE);
  context.translate(60, 60);
  const land = new Path2D();
  map.rings.forEach(ring => { land.moveTo(ring[0], ring[1]); for (let i = 2; i < ring.length; i += 2) land.lineTo(ring[i], ring[i + 1]); land.closePath(); });
  context.fillStyle = '#0e1c34';
  context.fill(land, 'evenodd');
  context.save();
  context.clip(land, 'evenodd');
  context.strokeStyle = 'rgba(114,167,255,0.10)';
  context.lineWidth = 6;
  map.rings.forEach(ring => { context.beginPath(); context.moveTo(ring[0], ring[1]); for (let i = 2; i < ring.length; i += 2) context.lineTo(ring[i], ring[i + 1]); context.closePath(); context.stroke(); });
  context.restore();
  // state lines, then the coastline
  map.arcs.forEach((arc, index) => {
    const coast = map.coast.has(index);
    context.strokeStyle = coast ? 'rgba(114,167,255,0.42)' : 'rgba(114,167,255,0.13)';
    context.lineWidth = coast ? 0.75 : 0.4;
    context.beginPath();
    context.moveTo(arc[0], arc[1]);
    for (let i = 2; i < arc.length; i += 2) context.lineTo(arc[i], arc[i + 1]);
    context.stroke();
  });
  // city lights: dense amber clusters around real metros + faint scattered towns, all seeded
  const random = seeded(20261107);
  const dot = (x, y, r, color) => { context.fillStyle = color; context.beginPath(); context.arc(x, y, r, 0, Math.PI * 2); context.fill(); };
  METROS.forEach(([lng, lat, pop]) => {
    if (lat < 24) return;
    const [cx, cy] = albers(lng, lat);
    const count = Math.round(30 + pop * 70);
    const sigma = 1.6 + pop * 0.9;
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(-2 * Math.log(Math.max(1e-6, random()))) * sigma * 0.6;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius * 0.85;
      const hot = random() > 0.72;
      dot(x, y, 0.22 + random() * (hot ? 0.45 : 0.3), hot ? `rgba(255,214,140,${0.55 + random() * 0.4})` : `rgba(255,150,60,${0.3 + random() * 0.45})`);
    }
    const glow = context.createRadialGradient(cx, cy, 0, cx, cy, sigma * 3);
    glow.addColorStop(0, `rgba(255,170,80,${Math.min(0.32, 0.08 + pop * 0.02)})`);
    glow.addColorStop(1, 'rgba(255,170,80,0)');
    context.fillStyle = glow;
    context.fillRect(cx - sigma * 3, cy - sigma * 3, sigma * 6, sigma * 6);
  });
  for (let i = 0; i < 2600; i += 1) {
    const x = random() * map.width;
    const y = random() * map.height;
    if (context.isPointInPath(land, (x + 60) * LAYER_SCALE, (y + 60) * LAYER_SCALE, 'evenodd')) dot(x, y, 0.18 + random() * 0.2, `rgba(255,170,90,${0.12 + random() * 0.25})`);
  }
  mapLayer = { map, canvas };
  return canvas;
}

// Where a player's ball goes: the stadium on the map, or an edge beacon for international venues.
function target(player, previous) {
  if (!player || player.bye || !player.venue) return { xy: previous, bye: true };
  if (player.venue.xy) return { xy: player.venue.xy, bye: false };
  const { lat, lng } = player.venue;
  if (lng > -60) return { xy: [1010, lat > 30 ? 150 : 520], bye: false, abroad: true };
  if (lng < -130 || lat < -10) return { xy: [-40, 540], bye: false, abroad: true };
  return { xy: [lng < -100 ? 400 : 560, 660], bye: false, abroad: true };
}

// Positions of both balls at each beat (chained from the previous stadium).
function plan(flyover) {
  if (flyover._plan) return flyover._plan;
  let a = START;
  let b = START;
  const beats = flyover.beats.map(beat => {
    const ta = target(beat.a, a);
    const tb = target(beat.b, b);
    const leg = { from: [a, b], to: [ta.xy, tb.xy], ta, tb, beat };
    a = ta.xy;
    b = tb.xy;
    return leg;
  });
  flyover._plan = beats;
  return beats;
}

function arcPoint(from, to, u) {
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const control = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - Math.min(160, 40 + distance * 0.35)];
  const v = 1 - u;
  return [v * v * from[0] + 2 * v * u * control[0] + u * u * to[0], v * v * from[1] + 2 * v * u * control[1] + u * u * to[1]];
}

function drawBall(context, x, y, size, rgb, time, squash = 1) {
  context.save();
  context.translate(x, y);
  context.rotate(-0.6);
  const halo = context.createRadialGradient(0, 0, size * 0.3, 0, 0, size * 2.2);
  halo.addColorStop(0, `rgba(${rgb},0.55)`);
  halo.addColorStop(1, `rgba(${rgb},0)`);
  context.fillStyle = halo;
  context.fillRect(-size * 2.2, -size * 2.2, size * 4.4, size * 4.4);
  // spiral: the short axis breathes as the ball rotates on its long axis
  const spin = 0.55 + 0.45 * Math.abs(Math.cos(time * 14));
  context.scale(1 / Math.sqrt(squash), squash);
  const leather = context.createRadialGradient(-size * 0.25, -size * 0.25, 1, 0, 0, size);
  leather.addColorStop(0, '#c98a55');
  leather.addColorStop(1, '#6f3b1b');
  context.fillStyle = leather;
  context.beginPath(); context.ellipse(0, 0, size, size * 0.62 * spin, 0, 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#fff';
  context.lineWidth = Math.max(1, size * 0.1);
  context.beginPath(); context.moveTo(-size * 0.4, 0); context.lineTo(size * 0.4, 0); context.stroke();
  context.restore();
}

function view(width, height) {
  // overview: whole map across the frame, vertically centred in the middle band
  const k = width / 915;
  return { k, ox: (width - 975 * k) / 2 - 6 * k, oy: height * 0.5 - 305 * k };
}

function drawMap(context, layer, k, ox, oy) {
  context.drawImage(layer, ox - 60 * k, oy - 60 * k, layer.width / LAYER_SCALE * k, layer.height / LAYER_SCALE * k);
}

function drawRoutes(context, legs, uptoIndex, k, ox, oy, alpha) {
  [[0, RGB_A], [1, RGB_B]].forEach(([side, rgb]) => {
    context.strokeStyle = `rgba(${rgb},${alpha})`;
    context.lineWidth = 1.6;
    context.setLineDash([4, 5]);
    for (let index = 0; index < uptoIndex; index += 1) {
      const leg = legs[index];
      const from = leg.from[side];
      const to = leg.to[side];
      if (from[0] === to[0] && from[1] === to[1]) continue;
      context.beginPath();
      for (let step = 0; step <= 24; step += 1) { const [x, y] = arcPoint(from, to, step / 24); const px = ox + x * k; const py = oy + y * k; if (step) context.lineTo(px, py); else context.moveTo(px, py); }
      context.stroke();
    }
    context.setLineDash([]);
  });
}

function stadiumMarker(context, x, y, rgb, unit, pulse) {
  context.fillStyle = `rgba(${rgb},0.9)`;
  context.beginPath(); context.arc(x, y, 3 * unit, 0, Math.PI * 2); context.fill();
  if (pulse > 0) {
    context.strokeStyle = `rgba(${rgb},${0.8 * (1 - pulse)})`;
    context.lineWidth = 2 * unit;
    context.beginPath(); context.arc(x, y, (6 + 34 * pulse) * unit, 0, Math.PI * 2); context.stroke();
    context.strokeStyle = `rgba(${rgb},${0.45 * (1 - pulse)})`;
    context.beginPath(); context.arc(x, y, (4 + 18 * pulse) * unit, 0, Math.PI * 2); context.stroke();
  }
}

function titleCard(context, player, color, rgb, x, y, maxWidth, unit, appear, label) {
  if (!player || appear <= 0) return;
  context.save();
  context.globalAlpha = appear;
  context.translate(0, (1 - appear) * 14 * unit);
  const shade = context.createLinearGradient(0, y - 92 * unit, 0, y + 20 * unit);
  shade.addColorStop(0, 'rgba(4,7,13,0)');
  shade.addColorStop(1, 'rgba(4,7,13,0.78)');
  context.fillStyle = shade;
  context.fillRect(0, y - 92 * unit, x + maxWidth + 40 * unit, 112 * unit);
  context.textAlign = 'left';
  context.fillStyle = MUTED;
  context.font = ui(9.5 * unit, 800);
  context.fillText(fit(context, String(label || '').toUpperCase(), maxWidth), x, y - 78 * unit);
  const city = player.bye ? 'BYE WEEK' : (player.venue?.city || player.team || '').toUpperCase();
  context.fillStyle = '#ffffff';
  context.fillText(fitDisplay(context, city, 44 * unit, 22 * unit, maxWidth), x, y - 40 * unit);
  context.fillStyle = 'rgba(255,255,255,0.86)';
  context.font = ui(11.5 * unit, 500);
  context.fillText(player.bye ? 'no game this week' : 'home of the', x + 2 * unit, y - 24 * unit);
  context.fillStyle = color;
  context.fillText(fitDisplay(context, String(player.name || '').toUpperCase(), 26 * unit, 14 * unit, maxWidth), x, y);
  context.fillStyle = 'rgba(255,255,255,0.86)';
  context.font = ui(10.5 * unit, 700);
  context.fillText(fit(context, `${fmt(player.points)} PTS${player.play ? ` · ${player.play}` : ''}`, maxWidth), x, y + 15 * unit);
  context.restore();
}

function header(context, recap, race, width, unit, text) {
  context.textAlign = 'left';
  context.fillStyle = MUTED;
  context.font = ui(10.5 * unit, 800);
  context.fillText(`HOME OF · WEEK ${recap.week}`, 16 * unit, 26 * unit);
  context.textAlign = 'right';
  context.fillStyle = INK;
  context.fillText(text, width - 16 * unit, 26 * unit);
}

function scoreboard(context, race, width, height, unit, a, b) {
  const y = 70 * unit;
  context.textAlign = 'left';
  context.fillStyle = COLOR_A;
  context.font = display(30 * unit);
  context.fillText(fmt(a), 16 * unit, y);
  context.fillStyle = MUTED;
  context.font = ui(9.5 * unit, 700);
  context.fillText(fit(context, race.nameA, width * 0.38), 16 * unit, y + 15 * unit);
  context.textAlign = 'right';
  context.fillStyle = COLOR_B;
  context.font = display(30 * unit);
  context.fillText(fmt(b), width - 16 * unit, y);
  context.fillStyle = MUTED;
  context.font = ui(9.5 * unit, 700);
  context.fillText(fit(context, race.nameB, width * 0.38), width - 16 * unit, y + 15 * unit);
}

export function createFlyoverRenderer() {
  const legacy = createMapRenderer();
  return function draw(context, recap, width, height, time, reducedMotion = false) {
    const race = recap.race;
    const flyover = race?.flyover;
    const unit = Math.min(width / 360, height / 640);
    const bg = context.createRadialGradient(width / 2, height * 0.45, 0, width / 2, height * 0.45, height * 0.8);
    bg.addColorStop(0, '#0b1528');
    bg.addColorStop(1, '#03060c');
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
    // No map geometry (offline first visit) or no lineups: the original stadium map still tells the story.
    if (!flyover?.beats?.length || !flyover.map) return legacy(context, recap, width, height, time, reducedMotion);
    const layer = buildLayer(flyover.map);
    const legs = plan(flyover);
    const base = view(width, height);
    const beatLength = (BEATS_END - INTRO) / legs.length;
    let t = time;
    const index = Math.min(legs.length - 1, Math.max(0, Math.floor((t - INTRO) / beatLength)));
    let local = t - INTRO - index * beatLength;
    if (reducedMotion && t >= INTRO && t < BEATS_END) local = Math.max(local, FLIGHT + ZOOM_IN + 0.6);
    const leg = legs[index];
    const totals = (upto, includeCurrent) => legs.slice(0, upto + (includeCurrent ? 1 : 0)).reduce((sum, item) => [sum[0] + (item.beat.a?.points || 0), sum[1] + (item.beat.b?.points || 0)], [0, 0]);

    // ----- intro and finale: overview only -----
    if (t < INTRO || t >= BEATS_END) {
      drawMap(context, layer, base.k, base.ox, base.oy);
      const done = t >= BEATS_END;
      drawRoutes(context, legs, done ? legs.length : 0, base.k, base.ox, base.oy, 0.55);
      if (done) legs.forEach(item => {
        [[item.to[0], RGB_A], [item.to[1], RGB_B]].forEach(([xy, rgb]) => stadiumMarker(context, base.ox + xy[0] * base.k, base.oy + xy[1] * base.k, rgb, unit, 0));
      });
      const p = done ? easeOut((t - BEATS_END) / 0.8) : 1 - clamp((t - INTRO + 0.6) / 0.6);
      context.save();
      context.globalAlpha = done ? p : 1;
      context.textAlign = 'center';
      if (!done) {
        context.fillStyle = COLOR_A; context.font = ui(12 * unit, 800);
        context.fillText('THE DRIVE · HOME OF', width / 2, height * 0.165);
        context.fillStyle = INK; context.font = display(46 * unit);
        context.fillText('EVERY PLAYER.', width / 2, height * 0.225);
        context.fillText('EVERY STADIUM.', width / 2, height * 0.282);
        context.fillStyle = MUTED; context.font = ui(11 * unit, 600);
        context.fillText('Position by position, landing at the same moment.', width / 2, height * 0.8);
      } else {
        const winnerA = race.finalA >= race.finalB;
        context.fillStyle = race.finalA === race.finalB ? INK : winnerA ? COLOR_A : COLOR_B;
        context.font = display(50 * unit);
        context.fillText(race.finalA === race.finalB ? 'TIE GAME' : 'WINNER', width / 2, height * 0.2);
        context.fillStyle = INK;
        context.fillText(fitDisplay(context, (winnerA ? race.nameA : race.nameB).toUpperCase(), 30 * unit, 16 * unit, width - 40 * unit), width / 2, height * 0.255);
        context.fillStyle = MUTED; context.font = ui(11 * unit, 600);
        context.fillText(`${legs.length} duels · ${legs.filter(item => (item.beat.a?.points || 0) > (item.beat.b?.points || 0)).length}–${legs.filter(item => (item.beat.b?.points || 0) > (item.beat.a?.points || 0)).length} in head-to-head slots`, width / 2, height * 0.8);
      }
      context.restore();
      header(context, recap, race, width, unit, done ? 'FINAL' : 'KICKOFF');
      const [a, b] = done ? [race.finalA, race.finalB] : [0, 0];
      scoreboard(context, race, width, height, unit, a, b);
      return;
    }

    // ----- a beat: flight (overview) → zoom to split → hold → zoom out -----
    const u = easeInOut(local / FLIGHT);
    const landedAt = FLIGHT;
    const holdEnd = beatLength - ZOOM_OUT;
    const zoom = local < landedAt ? 0 : local < landedAt + ZOOM_IN ? easeInOut((local - landedAt) / ZOOM_IN) : local < holdEnd ? 1 : 1 - easeInOut((local - holdEnd) / ZOOM_OUT);
    const position = side => (leg.to[side] === leg.from[side] ? leg.to[side] : arcPoint(leg.from[side], leg.to[side], u));
    const ballA = position(0);
    const ballB = position(1);
    const sinceLanding = local - landedAt;
    const bounce = side => {
      if (sinceLanding < 0 || sinceLanding > 0.5 || (side === 0 ? leg.ta.bye : leg.tb.bye)) return [0, 1];
      const p = sinceLanding / 0.5;
      return [-Math.sin(Math.PI * p) * 10 * (1 - p), p < 0.12 ? 0.7 + p * 2.5 : 1];
    };

    const halves = [
      { side: 0, xy: ballA, to: leg.to[0], clip: [0, 0, width, height / 2], center: [width * 0.62, height * 0.2], color: COLOR_A, rgb: RGB_A, player: leg.beat.a, label: race.nameA },
      { side: 1, xy: ballB, to: leg.to[1], clip: [0, height / 2, width, height / 2], center: [width * 0.62, height * 0.7], color: COLOR_B, rgb: RGB_B, player: leg.beat.b, label: race.nameB }
    ];
    const zoomK = base.k * 3.1;
    halves.forEach(half => {
      context.save();
      if (zoom > 0) { context.beginPath(); context.rect(...half.clip); context.clip(); }
      // camera: anchored on this side's stadium; at zoom 0 it is exactly the shared overview
      const anchor = half.to;
      const startScreen = [base.ox + anchor[0] * base.k, base.oy + anchor[1] * base.k];
      const drift = zoom * (local - landedAt) * 3 * unit;
      const screen = [lerp(startScreen[0], half.center[0] - drift, zoom), lerp(startScreen[1], half.center[1], zoom)];
      const k = lerp(base.k, zoomK, zoom);
      const ox = screen[0] - anchor[0] * k;
      const oy = screen[1] - anchor[1] * k;
      drawMap(context, layer, k, ox, oy);
      drawRoutes(context, legs, index, k, ox, oy, 0.4);
      // the other side's ball is visible too in overview; in split each half shows its own
      const sides = zoom > 0.05 ? [half.side] : [0, 1];
      sides.forEach(side => {
        const rgb = side === 0 ? RGB_A : RGB_B;
        const xy = side === 0 ? ballA : ballB;
        const from = leg.from[side];
        const to = leg.to[side];
        const moving = !(from[0] === to[0] && from[1] === to[1]);
        if (moving && u < 1) {
          for (let step = 10; step >= 1; step -= 1) {
            const [tx, ty] = arcPoint(from, to, Math.max(0, u - step * 0.018));
            context.fillStyle = `rgba(${rgb},${0.38 * (11 - step) / 10})`;
            context.beginPath(); context.arc(ox + tx * k, oy + ty * k, (1.2 + (11 - step) * 0.18) * unit, 0, Math.PI * 2); context.fill();
          }
        }
        const pulse = sinceLanding >= 0 && sinceLanding < 0.9 && moving ? sinceLanding / 0.9 : 0;
        stadiumMarker(context, ox + to[0] * k, oy + to[1] * k, rgb, unit, pulse);
        const [dy, squash] = bounce(side);
        drawBall(context, ox + xy[0] * k, oy + xy[1] * k + dy * unit, (7 + 3 * zoom) * unit, rgb, reducedMotion ? 0 : time, squash);
      });
      // title card once landed and zooming in
      const appear = zoom > 0 ? clamp((sinceLanding - 0.2) / 0.35) * (local < holdEnd ? 1 : 1 - easeInOut((local - holdEnd) / ZOOM_OUT)) : 0;
      const bottomHalf = half.side === 1;
      titleCard(context, half.player, half.color, half.rgb, 16 * unit, half.clip[1] + half.clip[3] - (bottomHalf ? 62 : 30) * unit, width - (bottomHalf ? 104 : 32) * unit, unit, appear, half.label);
      context.restore();
    });
    // divider + duel chip in split
    if (zoom > 0) {
      context.save();
      context.globalAlpha = zoom;
      context.fillStyle = '#04070d';
      context.fillRect(0, height / 2 - 1.5 * unit, width, 3 * unit);
      const pa = leg.beat.a?.points || 0;
      const pb = leg.beat.b?.points || 0;
      const text = `${leg.beat.slot} DUEL · ${fmt(pa)} – ${fmt(pb)}`;
      context.font = ui(10.5 * unit, 800);
      const w = context.measureText(text).width + 26 * unit;
      context.fillStyle = 'rgba(11,15,26,0.95)';
      context.strokeStyle = pa > pb ? COLOR_A : pb > pa ? COLOR_B : 'rgba(255,255,255,0.3)';
      context.lineWidth = 1.5 * unit;
      context.beginPath();
      context.roundRect ? context.roundRect(width / 2 - w / 2, height / 2 - 13 * unit, w, 26 * unit, 13 * unit) : context.rect(width / 2 - w / 2, height / 2 - 13 * unit, w, 26 * unit);
      context.fill(); context.stroke();
      context.fillStyle = INK;
      context.textAlign = 'center';
      context.fillText(text, width / 2, height / 2 + 4 * unit);
      context.restore();
    }
    header(context, recap, race, width, unit, `${leg.beat.slot} · ${index + 1} OF ${legs.length}`);
    if (zoom < 0.05) {
      const [a, b] = totals(index, sinceLanding >= 0);
      scoreboard(context, race, width, height, unit, a, b);
    }
  };
}
