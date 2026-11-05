import { drawBackdrop, drawBrand, drawIntro, drawPlayCard, drawFinale, easeOut, seeded } from './drive-cards.js';

function beat(recap, time) {
  if (time < 3) return { type: 'intro', progress: time / 3 };
  if (time >= 43) return { type: 'finale', progress: (time - 43) / 7 };
  const elapsed = time - 3;
  const index = Math.min(recap.starters.length - 1, Math.floor(elapsed / recap.beatDuration));
  return { type: 'play', index, player: recap.starters[index], progress: elapsed / recap.beatDuration - index };
}

function drawField(context, recap, width, height, time, current, reducedMotion) {
  const travel = Math.max(0, Math.min(1, (time - 3) / 40));
  const worldHeight = height * 1.7;
  const camera = easeOut(travel) * (worldHeight - height);
  const shake = current.player?.explosive && !reducedMotion ? Math.sin(current.progress * 48) * (1 - current.progress) * 5 : 0;
  context.save();
  context.translate(shake, 0);
  const left = width * 0.065;
  const fieldWidth = width * 0.87;
  const fieldGradient = context.createLinearGradient(left, 0, left + fieldWidth, 0);
  fieldGradient.addColorStop(0, '#071b1a');
  fieldGradient.addColorStop(0.5, '#123b31');
  fieldGradient.addColorStop(1, '#071b1a');
  context.fillStyle = fieldGradient;
  context.fillRect(left, -camera, fieldWidth, worldHeight);
  for (let stripe = 0; stripe < 20; stripe += 1) {
    context.fillStyle = stripe % 2 ? 'rgba(255,255,255,.014)' : 'rgba(0,0,0,.025)';
    context.fillRect(left, stripe * worldHeight / 20 - camera, fieldWidth, worldHeight / 20);
  }
  context.fillStyle = 'rgba(89,168,255,.16)';
  context.fillRect(left, -camera, fieldWidth, height * 0.13);
  context.fillStyle = 'rgba(198,255,74,.15)';
  context.fillRect(left, worldHeight - height * 0.13 - camera, fieldWidth, height * 0.13);
  context.strokeStyle = 'rgba(198,255,74,.65)';
  context.lineWidth = 2;
  context.shadowColor = '#c6ff4a';
  context.shadowBlur = 7;
  for (let yard = 0; yard <= 100; yard += 10) {
    const y = height * 0.13 + yard / 100 * (worldHeight - height * 0.26) - camera;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(left + fieldWidth, y);
    context.stroke();
    context.shadowBlur = 0;
    context.fillStyle = 'rgba(244,247,251,.45)';
    context.font = `600 ${width * 0.025}px "Barlow Condensed", sans-serif`;
    context.fillText(String(yard === 0 ? 'GOAL' : yard), left + 10, y - 9);
  }
  context.shadowBlur = 0;
  context.strokeStyle = 'rgba(255,255,255,.7)';
  context.lineWidth = 2;
  context.strokeRect(left, -camera, fieldWidth, worldHeight);
  const ballY = height * 0.13 + travel * (worldHeight - height * 0.26) - camera;
  context.fillStyle = '#c6ff4a';
  context.beginPath();
  context.arc(width / 2, ballY, 7, 0, Math.PI * 2);
  context.fill();
  context.restore();
  if (current.player?.bust) {
    context.fillStyle = 'rgba(10,15,24,.25)';
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(255,82,104,.16)';
    for (let index = 0; index < 5; index += 1) context.fillRect(0, seeded(index, recap.week) * height, width, 2);
  }
  if (current.player?.explosive && !reducedMotion) {
    context.strokeStyle = 'rgba(198,255,74,.5)';
    context.lineWidth = 2;
    for (let index = 0; index < 24; index += 1) {
      const angle = seeded(index, current.index + 1) * Math.PI * 2;
      const length = 20 + seeded(index + 40, recap.week) * 80;
      const radius = current.progress * 180;
      context.beginPath();
      context.moveTo(width / 2 + Math.cos(angle) * radius, height * 0.35 + Math.sin(angle) * radius);
      context.lineTo(width / 2 + Math.cos(angle) * (radius + length), height * 0.35 + Math.sin(angle) * (radius + length));
      context.stroke();
    }
  }
}

export function createFieldRenderer() {
  return (context, recap, width, height, time, reducedMotion = false) => {
    const current = beat(recap, time);
    const accent = current.player?.color || '#59a8ff';
    drawBackdrop(context, width, height, accent, recap.week);
    if (current.type === 'intro') {
      drawBrand(context, recap, width, height);
      drawIntro(context, recap, width, height, current.progress, reducedMotion);
      return;
    }
    if (current.type === 'finale') {
      drawBrand(context, recap, width, height);
      drawFinale(context, recap, width, height, current.progress, reducedMotion);
      return;
    }
    if (current.player?.bust) context.filter = 'saturate(.45)';
    drawField(context, recap, width, height, time, current, reducedMotion);
    context.filter = 'none';
    drawBrand(context, recap, width, height);
    context.fillStyle = '#93a2b8';
    context.font = `600 ${width * 0.022}px "Barlow Condensed", sans-serif`;
    context.fillText(`${current.player.game ? `${current.player.game.away.abbreviation} AT ${current.player.game.home.abbreviation}` : 'BYE WEEK'} · ${current.player.stadium?.venue || 'NO GAME'}`, width * 0.065, height * 0.15);
    drawPlayCard(context, current.player, recap, current.index, width, height, current.progress, reducedMotion);
  };
}
