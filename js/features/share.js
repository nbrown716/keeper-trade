import { createFieldRenderer } from './drive-field.js';
import { createMapRenderer } from './drive-map.js';
import { drawBackdrop, drawBrand, rounded } from './drive-cards.js';

const VIDEO_DURATION = 50;
const VIDEO_BITRATE = 2000000;

export class ShareError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ShareError';
    this.code = code;
  }
}

export function negotiateVideoCodec() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
  const choices = [
    { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm' }
  ];
  return choices.find(choice => MediaRecorder.isTypeSupported(choice.mimeType)) || null;
}

function rendererFor(mode) {
  return mode === 'map' ? createMapRenderer() : createFieldRenderer();
}

function canvasBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

function drawExportFrame(output, source, orientation) {
  const context = output.getContext('2d');
  if (orientation === 'portrait') {
    context.drawImage(source, 0, 0);
    return;
  }
  const gradient = context.createLinearGradient(0, 0, output.width, output.height);
  gradient.addColorStop(0, '#060a12');
  gradient.addColorStop(0.5, '#172a41');
  gradient.addColorStop(1, '#060a12');
  context.fillStyle = gradient;
  context.fillRect(0, 0, output.width, output.height);
  const scale = Math.min(output.width / source.width, output.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  context.shadowColor = 'rgba(0,0,0,.5)';
  context.shadowBlur = 50;
  context.drawImage(source, (output.width - width) / 2, (output.height - height) / 2, width, height);
  context.shadowBlur = 0;
}

export async function renderDriveVideo(recap, { mode = 'field', orientation = 'portrait', onProgress = () => {}, signal } = {}) {
  const codec = negotiateVideoCodec();
  if (!codec) throw new ShareError('story-pack', 'Video recording is not supported in this browser.');
  if (!window.gsap) throw new ShareError('story-pack', 'The motion engine is unavailable.');
  const source = document.createElement('canvas');
  source.width = 1080;
  source.height = 1920;
  const output = document.createElement('canvas');
  output.width = orientation === 'landscape' ? 1920 : 1080;
  output.height = orientation === 'landscape' ? 1080 : 1920;
  output.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.append(output);
  const render = rendererFor(mode);
  const playhead = { time: 0 };
  const draw = () => {
    render(source.getContext('2d'), recap, 1080, 1920, playhead.time, false);
    drawExportFrame(output, source, orientation);
    onProgress(Math.min(99, Math.round(playhead.time / VIDEO_DURATION * 100)));
  };
  draw();
  const stream = output.captureStream(60);
  const chunks = [];
  let recorder;
  try {
    recorder = new MediaRecorder(stream, { ...codec, videoBitsPerSecond: VIDEO_BITRATE });
  } catch (_) {
    stream.getTracks().forEach(track => track.stop());
    output.remove();
    throw new ShareError('story-pack', 'This browser could not start the video recorder.');
  }

  return new Promise((resolve, reject) => {
    let aborted = false;
    const timeline = window.gsap.timeline({ paused: true });
    window.gsap.ticker.lagSmoothing(0);
    const cleanup = () => {
      timeline.kill();
      window.gsap.ticker.lagSmoothing(500, 33);
      stream.getTracks().forEach(track => track.stop());
      output.remove();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      aborted = true;
      timeline.pause();
      if (recorder.state !== 'inactive') recorder.stop();
    };
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => {
      cleanup();
      reject(new ShareError('story-pack', 'Video recording failed. Your Story Pack is ready instead.'));
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: codec.mimeType });
      cleanup();
      if (aborted) { reject(new DOMException('Export cancelled', 'AbortError')); return; }
      onProgress(100);
      resolve({ blob, extension: codec.extension, mimeType: codec.mimeType, width: output.width, height: output.height });
    };
    timeline.to(playhead, { time: VIDEO_DURATION, duration: VIDEO_DURATION, ease: 'none', onUpdate: draw }, 0);
    timeline.eventCallback('onComplete', () => {
      playhead.time = VIDEO_DURATION;
      draw();
      if (recorder.state !== 'inactive') recorder.stop();
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { cleanup(); reject(new DOMException('Export cancelled', 'AbortError')); return; }
    recorder.start(250);
    timeline.play(0);
  });
}

export async function renderStoryPack(recap, { mode = 'field', onProgress = () => {} } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext('2d');
  const render = rendererFor(mode);
  const leaders = recap.starters.map((player, index) => ({ player, index })).sort((a, b) => b.player.points - a.player.points).slice(0, 3);
  const times = [0, ...leaders.map(item => 3 + (item.index + 0.55) * recap.beatDuration), 50];
  const frames = [];
  for (let index = 0; index < times.length; index += 1) {
    const time = times[index];
    render(context, recap, canvas.width, canvas.height, time, true);
    const blob = await canvasBlob(canvas);
    if (!blob) throw new ShareError('export', 'This browser could not render PNG frames.');
    frames.push({ blob, name: `week-${recap.week}-${mode}-frame-${index + 1}.png`, time });
    onProgress(Math.round((index + 1) / times.length * 100));
  }
  return frames;
}

function projectMini(stadium, x, y, width, height) {
  return {
    x: x + Math.max(0, Math.min(1, (Number(stadium.lng) + 125) / 55)) * width,
    y: y + Math.max(0, Math.min(1, (50 - Number(stadium.lat)) / 25)) * height
  };
}

function drawMiniRoute(context, recap, x, y, width, height) {
  const players = recap.starters.filter(player => player.stadium);
  const points = players.map(player => ({ ...projectMini(player.stadium, x, y, width, height), color: player.color }));
  context.strokeStyle = 'rgba(198,255,74,.7)';
  context.lineWidth = 4;
  context.shadowColor = '#c6ff4a';
  context.shadowBlur = 12;
  context.beginPath();
  const unique = points.filter((point, index) => !index || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
  unique.forEach((point, index) => { if (!index) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y); });
  context.stroke();
  context.shadowBlur = 0;
  unique.forEach(point => {
    context.fillStyle = point.color;
    context.beginPath();
    context.arc(point.x, point.y, 7, 0, Math.PI * 2);
    context.fill();
  });
}

export async function renderScoreCard(recap) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext('2d');
  const leaders = recap.starters.slice().sort((a, b) => b.points - a.points).slice(0, 3);
  drawBackdrop(context, canvas.width, canvas.height, leaders[0]?.color || '#59a8ff', recap.week + 200);
  drawBrand(context, recap, canvas.width, canvas.height);
  context.fillStyle = '#c6ff4a';
  context.font = '700 28px "Barlow Condensed", sans-serif';
  context.fillText(`WEEK ${recap.week} · ${recap.manager.toUpperCase()}`, 70, 190);
  context.fillStyle = '#f4f7fb';
  context.font = '800 154px "Barlow Condensed", sans-serif';
  context.fillText(recap.total.toFixed(2), 65, 340);
  context.fillStyle = recap.result === 'W' ? '#c6ff4a' : '#ff5268';
  context.font = '800 70px "Barlow Condensed", sans-serif';
  context.fillText(`${recap.result} · ${recap.margin.toFixed(2)} PT MARGIN`, 70, 415);
  context.fillStyle = '#93a2b8';
  context.font = '600 28px "Barlow Condensed", sans-serif';
  context.fillText(`VS ${recap.opponent.toUpperCase()} · ${recap.opponentTotal.toFixed(2)} · #${recap.rank} OF ${recap.teams}`, 70, 462);
  leaders.forEach((player, index) => {
    const y = 515 + index * 145;
    context.fillStyle = 'rgba(17,26,43,.88)';
    rounded(context, 65, y, 950, 122, 22);
    context.fill();
    context.fillStyle = player.color;
    context.fillRect(65, y, 7, 122);
    context.fillStyle = '#93a2b8';
    context.font = '700 22px "Barlow Condensed", sans-serif';
    context.fillText(`0${index + 1} · ${player.position} · ${player.team}`, 95, y + 33);
    context.fillStyle = '#f4f7fb';
    context.font = '800 43px "Barlow Condensed", sans-serif';
    context.fillText(player.name.toUpperCase(), 95, y + 83);
    context.textAlign = 'right';
    context.fillStyle = '#c6ff4a';
    context.font = '800 61px "Barlow Condensed", sans-serif';
    context.fillText(player.points.toFixed(1), 980, y + 80);
    context.textAlign = 'left';
  });
  context.fillStyle = '#93a2b8';
  context.font = '700 22px "Barlow Condensed", sans-serif';
  context.fillText('THE WEEK, AS A ROUTE', 70, 1000);
  drawMiniRoute(context, recap, 85, 1025, 900, 205);
  context.fillStyle = '#8190a8';
  context.font = '600 21px "Barlow Condensed", sans-serif';
  context.fillText('KEEPER TRADE · THE DRIVE', 70, 1300);
  return canvasBlob(canvas);
}

export function recapUrl(recap) {
  const url = new URL('drive.html', window.location.href);
  url.search = new URLSearchParams({ week: String(recap.week), roster: String(recap.rosterId) });
  return url.href;
}

export async function copyRecapLink(recap) {
  const url = recapUrl(recap);
  let timer;
  try {
    await Promise.race([
      navigator.clipboard.writeText(url),
      new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error('Clipboard timeout')), 800); })
    ]);
    window.clearTimeout(timer);
    return url;
  } catch (_) {
    window.clearTimeout(timer);
    const input = document.createElement('textarea');
    input.value = url;
    input.style.cssText = 'position:fixed;opacity:0';
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new ShareError('clipboard', 'Copy is unavailable. Use the address bar instead.');
    return url;
  }
}

function download(blob, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

export async function shareOrDownload(blob, name, title = 'Keeper Trade — The Drive') {
  const file = new File([blob], name, { type: blob.type || 'image/png' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return { shared: true, downloaded: false };
    } catch (error) {
      if (error.name === 'AbortError') return { shared: false, downloaded: false, cancelled: true };
    }
  }
  download(blob, name);
  return { shared: false, downloaded: true };
}

export async function shareStoryPack(frames, recap) {
  const files = frames.map(frame => new File([frame.blob], frame.name, { type: 'image/png' }));
  if (navigator.share && navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title: `Week ${recap.week} — The Drive Story Pack` });
      return { shared: true, downloaded: false };
    } catch (error) {
      if (error.name === 'AbortError') return { shared: false, downloaded: false, cancelled: true };
    }
  }
  for (const frame of frames) {
    download(frame.blob, frame.name);
    await new Promise(resolve => window.setTimeout(resolve, 180));
  }
  return { shared: false, downloaded: true };
}
