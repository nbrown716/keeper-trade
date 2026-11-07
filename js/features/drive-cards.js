export function seeded(index, seed = 17) {
  const value = Math.sin(index * 9283.31 + seed * 77.17) * 43758.5453;
  return value - Math.floor(value);
}

export function easeOut(value) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 3);
}

export function spring(value) {
  const t = Math.max(0, Math.min(1, value));
  return 1 - Math.exp(-6 * t) * Math.cos(t * 10);
}

function font(size, weight = 700) {
  return `${weight} ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
}

export function rounded(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export function drawBackdrop(context, width, height, accent = '#59a8ff', seed = 17) {
  const gradient = context.createRadialGradient(width * 0.18, 0, 0, width * 0.18, 0, height * 1.1);
  gradient.addColorStop(0, `${accent}38`);
  gradient.addColorStop(0.48, '#111a2b');
  gradient.addColorStop(1, '#060a12');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.fillStyle = 'rgba(255,255,255,.035)';
  const count = Math.floor(width * height / 4200);
  for (let index = 0; index < count; index += 1) {
    context.fillRect(seeded(index, seed) * width, seeded(index + 900, seed) * height, 1, 1);
  }
  const light = context.createLinearGradient(0, 0, width, 0);
  light.addColorStop(0, 'rgba(255,255,255,.04)');
  light.addColorStop(0.5, 'rgba(255,255,255,0)');
  light.addColorStop(1, 'rgba(255,255,255,.025)');
  context.fillStyle = light;
  context.fillRect(0, 0, width, height);
}

export function drawBrand(context, recap, width, height) {
  const unit = width / 720;
  context.fillStyle = '#c6ff4a';
  rounded(context, 36 * unit, 34 * unit, 48 * unit, 48 * unit, 13 * unit);
  context.fill();
  context.fillStyle = '#152000';
  context.font = font(27 * unit, 800);
  context.textAlign = 'center';
  context.fillText('KT', 60 * unit, 68 * unit);
  context.textAlign = 'left';
  context.fillStyle = '#f4f7fb';
  context.font = font(22 * unit, 800);
  context.fillText('THE DRIVE', 100 * unit, 57 * unit);
  context.fillStyle = '#93a2b8';
  context.font = font(15 * unit, 600);
  context.fillText(`WEEK ${recap.week} · ${recap.leagueName.toUpperCase()}`, 100 * unit, 78 * unit);
  context.textAlign = 'right';
  context.fillStyle = '#93a2b8';
  context.font = font(15 * unit, 600);
  context.fillText('KEEPER TRADE ORIGINAL', width - 36 * unit, 57 * unit);
  context.textAlign = 'left';
}

export function drawIntro(context, recap, width, height, progress, reducedMotion) {
  const unit = width / 720;
  const enter = reducedMotion ? 1 : spring(progress / 0.45);
  context.save();
  context.translate(0, (1 - enter) * 45 * unit);
  context.globalAlpha = Math.min(1, progress * 4 + 0.01);
  context.fillStyle = '#c6ff4a';
  context.font = font(19 * unit, 700);
  context.fillText('A WEEK IN THE LIFE OF', 46 * unit, height * 0.32);
  context.fillStyle = '#f4f7fb';
  context.font = font(86 * unit, 800);
  const name = recap.manager.toUpperCase();
  const lines = name.length > 18 ? name.split(/\s+/) : [name];
  lines.slice(0, 2).forEach((line, index) => context.fillText(line, 42 * unit, height * 0.32 + 92 * unit + index * 82 * unit));
  context.fillStyle = '#93a2b8';
  context.font = font(25 * unit, 600);
  context.fillText(`${recap.starters.length} PLAYS. ONE FIELD. NO MERCY.`, 46 * unit, height * 0.32 + 130 * unit + (lines.length - 1) * 82 * unit);
  context.fillStyle = '#f4f7fb';
  context.font = font(19 * unit, 600);
  context.fillText('YOUR WEEK, IN MOTION', 46 * unit, height - 70 * unit);
  context.restore();
}

export function drawSparkline(context, player, x, y, width, height, accent) {
  const points = [player.average * 0.85, player.average, player.average * 1.08, player.points];
  const max = Math.max(...points, 1);
  context.beginPath();
  points.forEach((value, index) => {
    const px = x + index / (points.length - 1) * width;
    const py = y + height - value / max * height;
    if (!index) context.moveTo(px, py); else context.lineTo(px, py);
  });
  context.strokeStyle = accent;
  context.lineWidth = 3;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.stroke();
}

export function drawWeatherBadge(context, weather, x, y, unit) {
  const impact = weather?.impacts?.[0];
  if (!impact) return 0;
  context.fillStyle = '#172a41';
  rounded(context, x, y, 190 * unit, 34 * unit, 8 * unit);
  context.fill();
  context.fillStyle = '#8fd3ff';
  context.font = font(16 * unit, 700);
  context.fillText(impact.label, x + 10 * unit, y + 23 * unit);
  return 44 * unit;
}

export function drawPlayCard(context, player, recap, index, width, height, localProgress, reducedMotion) {
  const unit = width / 720;
  const enter = reducedMotion ? 1 : spring(localProgress / 0.24);
  const cardHeight = 300 * unit;
  const y = height - cardHeight - 100 * unit;
  context.save();
  context.translate(width / 2, y + cardHeight / 2);
  context.scale(0.88 + enter * 0.12, 0.88 + enter * 0.12);
  context.translate(-width / 2, -(y + cardHeight / 2));
  context.globalAlpha = Math.min(1, localProgress * 8 + 0.02);
  const glow = context.createLinearGradient(0, y, width, y + cardHeight);
  glow.addColorStop(0, `${player.color}50`);
  glow.addColorStop(0.5, 'rgba(17,26,43,.96)');
  glow.addColorStop(1, 'rgba(8,13,23,.98)');
  context.fillStyle = glow;
  rounded(context, 34 * unit, y, width - 68 * unit, cardHeight, 24 * unit);
  context.fill();
  context.strokeStyle = `${player.color}aa`;
  context.lineWidth = 1.5 * unit;
  context.stroke();
  context.fillStyle = '#93a2b8';
  context.font = font(16 * unit, 700);
  context.fillText(`PLAY ${index + 1} / ${recap.starters.length} · ${player.position} · ${player.team}`, 62 * unit, y + 42 * unit);
  context.fillStyle = '#f4f7fb';
  context.font = font(44 * unit, 800);
  context.fillText(player.name.toUpperCase(), 60 * unit, y + 94 * unit);
  const counted = reducedMotion ? player.points : player.points * easeOut(localProgress * 2.2);
  context.textAlign = 'right';
  context.fillStyle = player.bust ? '#ff5268' : '#c6ff4a';
  context.font = font(82 * unit, 800);
  context.fillText(counted.toFixed(1), width - 62 * unit, y + 102 * unit);
  context.font = font(17 * unit, 700);
  context.fillText('FANTASY PTS', width - 62 * unit, y + 128 * unit);
  context.textAlign = 'left';
  context.fillStyle = '#c8d2df';
  context.font = font(22 * unit, 600);
  context.fillText(player.stats.join('  ·  '), 62 * unit, y + 158 * unit);
  context.fillStyle = '#8190a8';
  context.font = font(16 * unit, 600);
  context.fillText(`POSITION AVG ${player.average.toFixed(1)} · ${player.yards >= 0 ? '+' : ''}${player.yards} YARD DRIVE`, 62 * unit, y + 194 * unit);
  drawSparkline(context, player, 62 * unit, y + 216 * unit, 180 * unit, 44 * unit, player.color);
  let badgeX = 272 * unit;
  if (player.explosive) {
    context.fillStyle = '#c6ff4a';
    context.font = font(19 * unit, 800);
    context.fillText('EXPLOSIVE PLAY', badgeX, y + 248 * unit);
    badgeX += 190 * unit;
  } else if (player.bust) {
    context.fillStyle = '#ff5268';
    context.font = font(19 * unit, 800);
    context.fillText('TACKLED FOR LOSS', badgeX, y + 248 * unit);
    badgeX += 190 * unit;
  }
  drawWeatherBadge(context, player.weather, badgeX, y + 224 * unit, unit);
  context.restore();
}

export function wrapText(context, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const words = String(text || '').split(/\s+/);
  let line = '';
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (context.measureText(test).width > maxWidth && line) {
      context.fillText(line, x, y + lines * lineHeight);
      line = word;
      lines += 1;
      if (lines >= maxLines - 1) break;
    } else line = test;
  }
  if (line && lines < maxLines) context.fillText(line, x, y + lines * lineHeight);
}

export function drawFinale(context, recap, width, height, progress, reducedMotion, showRank = false) {
  const unit = width / 720;
  const enter = reducedMotion ? 1 : spring(progress / 0.35);
  context.save();
  context.globalAlpha = Math.min(1, progress * 5 + 0.01);
  context.translate(0, (1 - enter) * 30 * unit);
  context.textAlign = 'center';
  context.fillStyle = '#93a2b8';
  context.font = font(20 * unit, 700);
  context.fillText(recap.live ? 'LIVE · STILL BEING PLAYED' : 'FINAL · END ZONE', width / 2, height * 0.25);
  context.fillStyle = '#f4f7fb';
  context.font = font(104 * unit, 800);
  const counted = reducedMotion ? recap.total : recap.total * easeOut(progress * 2);
  context.fillText(counted.toFixed(2), width / 2, height * 0.25 + 110 * unit);
  context.fillStyle = '#93a2b8';
  context.font = font(32 * unit, 600);
  context.fillText(`${recap.opponentTotal.toFixed(2)} · ${recap.opponent.toUpperCase()}`, width / 2, height * 0.25 + 156 * unit);
  context.save();
  context.translate(width / 2, height * 0.25 + 230 * unit);
  context.rotate(-0.055);
  context.strokeStyle = recap.live ? '#59a8ff' : recap.result === 'W' ? '#c6ff4a' : recap.result === 'L' ? '#ff5268' : '#59a8ff';
  context.lineWidth = 5 * unit;
  rounded(context, -95 * unit, -58 * unit, 190 * unit, 116 * unit, 15 * unit);
  context.stroke();
  context.fillStyle = context.strokeStyle;
  context.font = font(104 * unit, 800);
  if (recap.live) { context.font = font(64 * unit, 800); context.fillText(`${Math.round(recap.live.pA * 100)}%`, 0, 22 * unit); } else context.fillText(recap.result, 0, 34 * unit);
  context.restore();
  context.fillStyle = '#f4f7fb';
  context.font = font(25 * unit, 700);
  context.fillText(recap.live ? `TO WIN · PROJECTED ${recap.live.projA.toFixed(1)} – ${recap.live.projB.toFixed(1)}` : `${recap.result === 'W' ? 'WON' : recap.result === 'L' ? 'LOST' : 'TIED'} BY ${recap.margin.toFixed(2)}${showRank ? ` · #${recap.rank} OF ${recap.teams} THIS WEEK` : ''}`, width / 2, height * 0.25 + 310 * unit);
  context.font = font(22 * unit, 600);
  context.fillStyle = '#c8d2df';
  wrapText(context, recap.verdict, width / 2, height * 0.25 + 360 * unit, width * 0.7, 30 * unit, 3);
  context.textAlign = 'left';
  if (!reducedMotion && !recap.live) {
    for (let index = 0; index < 55; index += 1) {
      const x = seeded(index, recap.week) * width;
      const speed = 50 + seeded(index + 100, recap.week) * 160;
      const y = (seeded(index + 200, recap.week) * height + progress * speed * 4) % height;
      context.fillStyle = recap.result === 'W' ? ['#c6ff4a', '#59a8ff', '#f4f7fb'][index % 3] : 'rgba(89,168,255,.45)';
      if (recap.result === 'W') context.fillRect(x, y, 5 * unit, 12 * unit);
      else context.fillRect(x, y, 1.5 * unit, 20 * unit);
    }
  }
  context.restore();
}
