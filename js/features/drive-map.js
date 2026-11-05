import { drawBackdrop, drawBrand, drawIntro, drawPlayCard, drawFinale, easeOut, seeded } from './drive-cards.js';

function beat(recap, time) {
  if (time < 3) return { type: 'intro', progress: time / 3 };
  if (time >= 43) return { type: 'finale', progress: (time - 43) / 7 };
  const elapsed = time - 3;
  const index = Math.min(recap.starters.length - 1, Math.floor(elapsed / recap.beatDuration));
  return { type: 'play', index, player: recap.starters[index], progress: elapsed / recap.beatDuration - index };
}

function project(stadium, width, height) {
  const left = width * 0.08;
  const top = height * 0.16;
  const mapWidth = width * 0.84;
  const mapHeight = height * 0.43;
  const lng = Number(stadium?.lng || -98);
  const lat = Number(stadium?.lat || 38);
  return {
    x: left + Math.max(0, Math.min(1, (lng + 125) / 55)) * mapWidth,
    y: top + Math.max(0, Math.min(1, (50 - lat) / 25)) * mapHeight
  };
}

function hop(from, to, progress) {
  const t = easeOut(Math.min(1, progress * 1.8));
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 90 };
  return {
    x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * control.x + t ** 2 * to.x,
    y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * control.y + t ** 2 * to.y
  };
}

function drawMapBase(context, recap, width, height) {
  const left = width * 0.08;
  const top = height * 0.16;
  const mapWidth = width * 0.84;
  const mapHeight = height * 0.43;
  context.fillStyle = 'rgba(147,162,184,.16)';
  for (let row = 0; row < 18; row += 1) {
    for (let column = 0; column < 32; column += 1) {
      const x = left + column / 31 * mapWidth;
      const y = top + row / 17 * mapHeight;
      if ((row < 3 && (column < 5 || column > 26)) || (row > 14 && column < 10)) continue;
      context.beginPath();
      context.arc(x, y, 1.2, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.strokeStyle = 'rgba(89,168,255,.28)';
  context.lineWidth = 2;
  context.beginPath();
  const outline = [[0.02,0.22],[0.12,0.06],[0.34,0.02],[0.54,0.14],[0.68,0.08],[0.83,0.16],[0.96,0.05],[0.98,0.3],[0.9,0.48],[0.92,0.66],[0.8,0.82],[0.72,1],[0.62,0.82],[0.46,0.76],[0.34,0.9],[0.22,0.72],[0.08,0.6],[0.02,0.38]];
  outline.forEach(([x, y], index) => {
    if (!index) context.moveTo(left + x * mapWidth, top + y * mapHeight);
    else context.lineTo(left + x * mapWidth, top + y * mapHeight);
  });
  context.closePath();
  context.stroke();
}

function drawRoute(context, recap, width, height, current, reducedMotion) {
  const stops = recap.starters.filter(player => player.stadium);
  const points = stops.map(player => project(player.stadium, width, height));
  const currentPlayerIndex = stops.indexOf(current.player);
  const visiblePoints = current.type === 'finale' ? points : points.slice(0, currentPlayerIndex + 1);
  const unique = visiblePoints.filter((point, index) => !index || point.x !== visiblePoints[index - 1].x || point.y !== visiblePoints[index - 1].y);
  const currentPoint = points[currentPlayerIndex] || { x: width / 2, y: height * 0.35 };
  const previousPoint = points[currentPlayerIndex - 1] || currentPoint;
  const camera = current.type === 'play' ? hop(previousPoint, currentPoint, current.progress) : { x: width / 2, y: height * 0.36 };
  const zoom = current.type === 'finale' ? 1 : 1.28;
  context.save();
  context.translate(width / 2 - camera.x * zoom, height * 0.36 - camera.y * zoom);
  context.scale(zoom, zoom);
  drawMapBase(context, recap, width, height);
  context.strokeStyle = '#c6ff4a';
  context.lineWidth = 4;
  context.shadowColor = '#c6ff4a';
  context.shadowBlur = 14;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  unique.forEach((point, index) => { if (!index) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y); });
  context.stroke();
  context.shadowBlur = 0;
  points.forEach((point, index) => {
    const active = index === currentPlayerIndex;
    context.fillStyle = stops[index].color;
    context.beginPath();
    context.arc(point.x, point.y, active ? 8 : 5, 0, Math.PI * 2);
    context.fill();
    if (active && !reducedMotion) {
      context.strokeStyle = stops[index].color;
      context.globalAlpha = 1 - current.progress;
      context.beginPath();
      context.arc(point.x, point.y, 12 + current.progress * 30, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }
  });
  context.restore();
  return { currentPoint, count: unique.length };
}

export function createMapRenderer() {
  return (context, recap, width, height, time, reducedMotion = false) => {
    const current = beat(recap, time);
    drawBackdrop(context, width, height, current.player?.color || '#59a8ff', recap.week + 100);
    if (current.type === 'intro') {
      drawBrand(context, recap, width, height);
      drawIntro(context, recap, width, height, current.progress, reducedMotion);
      return;
    }
    if (current.type === 'finale') {
      context.globalAlpha = 0.32;
      drawRoute(context, recap, width, height, current, true);
      context.globalAlpha = 1;
      drawBrand(context, recap, width, height);
      drawFinale(context, recap, width, height, current.progress, reducedMotion, true);
      return;
    }
    drawRoute(context, recap, width, height, current, reducedMotion);
    drawBrand(context, recap, width, height);
    context.fillStyle = '#93a2b8';
    context.font = `600 ${width * 0.022}px "Barlow Condensed", sans-serif`;
    context.fillText(current.player.stadium ? `${current.player.stadium.city.toUpperCase()} · ${current.player.stadium.venue.toUpperCase()}` : 'BYE WEEK · NO STADIUM STOP', width * 0.065, height * 0.15);
    drawPlayCard(context, current.player, recap, current.index, width, height, current.progress, reducedMotion);
  };
}
