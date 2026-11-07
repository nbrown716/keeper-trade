// Season Wrapped 2.0 slides: pure canvas renderers draw(context, width, height, t, reducedMotion).
// Every number comes from the season engine (js/data/season-stats.js); nothing on a slide is generated.
// Each slide also carries plain-text `alt` copy for screen readers and the share sheet.

const VOLT = '#c6ff4a';
const BLUE = '#59a8ff';
const CORAL = '#ff7a59';
const GOLD = '#ffd166';
const INK = '#eef2f8';
const MUTED = '#8f9bb3';
const BG = '#070b14';
const POSITION_NAMES = { QB: 'quarterback', RB: 'running back', WR: 'receiver', TE: 'tight end', K: 'kicker', DEF: 'defense' };

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const easeOut = value => 1 - Math.pow(1 - clamp(value), 3);
const spring = value => { const t = clamp(value); return t === 1 ? 1 : 1 - Math.pow(2, -9 * t) * Math.cos(t * 9.5); };
const fmt = (value, digits = 1) => Number(value || 0).toFixed(digits);
const pct = value => `${Math.round(value * 100)}%`;
const iq = value => `${(value * 100).toFixed(1)}%`;
const signed = (value, digits = 1) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}`;
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const ordinal = value => { const n = Math.round(value); const s = ['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th'; return `${n}${s}`; };
const display = size => `800 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
const ui = (size, weight = 700) => `${weight} ${size}px Inter, system-ui, sans-serif`;
const record = (w, l, t) => `${w}–${l}${t ? `–${t}` : ''}`;
const first = name => String(name || '').split(' ').slice(-1)[0];

function fit(context, text, maxWidth) {
  let value = String(text ?? '');
  if (context.measureText(value).width <= maxWidth) return value;
  while (value.length > 1 && context.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
  return `${value.trimEnd()}…`;
}
function fitDisplay(context, text, size, min, maxWidth) {
  let current = size;
  context.font = display(current);
  while (current > min && context.measureText(String(text)).width > maxWidth) { current -= 1; context.font = display(current); }
  return fit(context, text, maxWidth);
}
// Word-wrap within maxWidth; returns the y after the last line.
function wrap(context, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const words = String(text).split(/\s+/);
  let line = '';
  let lines = 0;
  for (let index = 0; index < words.length; index += 1) {
    const test = line ? `${line} ${words[index]}` : words[index];
    if (context.measureText(test).width > maxWidth && line) {
      lines += 1;
      if (lines === maxLines) { context.fillText(fit(context, `${line} ${words.slice(index).join(' ')}`, maxWidth), x, y); return y + lineHeight; }
      context.fillText(line, x, y);
      y += lineHeight;
      line = words[index];
    } else line = test;
  }
  if (line) { context.fillText(line, x, y); y += lineHeight; }
  return y;
}
function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  if (context.roundRect) context.roundRect(x, y, width, height, radius); else context.rect(x, y, width, height);
}

// Frame shared by every slide: backdrop, progress-safe header, brand footer.
function frame(context, width, height, unit, accent, eyebrow, season) {
  const bg = context.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#0c1424');
  bg.addColorStop(1, BG);
  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);
  const glow = context.createRadialGradient(width * 0.85, height * 0.08, 0, width * 0.85, height * 0.08, width * 0.9);
  glow.addColorStop(0, `${accent}33`);
  glow.addColorStop(1, `${accent}00`);
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
  context.textAlign = 'left';
  context.fillStyle = accent;
  context.font = ui(11 * unit, 800);
  context.fillText(fit(context, eyebrow.toUpperCase(), width * 0.56), 24 * unit, 64 * unit); // the player's controls sit top-right
  context.fillStyle = 'rgba(238,242,248,0.42)';
  context.font = ui(9.5 * unit, 800);
  context.fillText(`KEEPER TRADE · WRAPPED ${season.league.season}${season.complete ? '' : ' · SO FAR'}`, 24 * unit, height - 26 * unit);
}
function fadeIn(context, t, start, duration = 0.5, rise = 16, unit = 1) {
  const p = easeOut((t - start) / duration);
  context.globalAlpha = p;
  context.translate(0, (1 - p) * rise * unit);
  return p;
}
function stat(context, label, value, x, y, unit, color = INK, align = 'left', size = 30) {
  context.textAlign = align;
  context.fillStyle = color;
  context.font = display(size * unit);
  context.fillText(value, x, y);
  context.fillStyle = MUTED;
  context.font = ui(9.5 * unit, 700);
  context.fillText(label.toUpperCase(), x, y + 15 * unit);
}
function headline(context, text, x, y, unit, maxWidth, size = 46, color = INK) {
  context.fillStyle = color;
  context.textAlign = 'left';
  const lines = String(text).split('\n');
  lines.forEach((line, index) => context.fillText(fitDisplay(context, line, size * unit, 22 * unit, maxWidth), x, y + index * size * 0.98 * unit));
  return y + lines.length * size * 0.98 * unit;
}
function body(context, text, x, y, unit, maxWidth, color = 'rgba(238,242,248,0.82)', size = 13) {
  context.fillStyle = color;
  context.textAlign = 'left';
  context.font = ui(size * unit, 500);
  return wrap(context, text, x, y, maxWidth, size * 1.45 * unit);
}

// ------------------------------------------------------------------ slides
export function buildSlides(season, rosterId) {
  const me = season.teams.get(rosterId);
  if (!me) return [];
  const teams = season.teams.size;
  const weeks = season.weeks.length;
  const allScores = [...season.teams.values()].flatMap(team => team.weekly.map(game => ({ points: game.points, mine: team.rosterId === rosterId, week: game.week }))).sort((a, b) => a.points - b.points);
  const bestRank = me.bestWeek ? allScores.slice().reverse().findIndex(score => score.mine && score.points === me.bestWeek.points) + 1 : 0;
  const yearLine = season.complete ? `${season.league.season}. You were there for all of it.` : `${season.league.season}, so far. Weeks 1–${season.throughWeek}.`;
  const slides = [];
  const add = (id, alt, draw, duration = 5.5) => slides.push({ id, alt, draw, duration });

  // 1. Cold open: weekly scores assemble as bars
  add('open', `${yearLine} ${me.name}'s season in Keeper Trade Wrapped.`, (c, w, h, t) => {
    const u = w / 360;
    frame(c, w, h, u, VOLT, season.league.name || 'Your league', season);
    const max = Math.max(...me.weekly.map(game => game.points), 1);
    const barW = (w - 48 * u) / Math.max(me.weekly.length, 1);
    me.weekly.forEach((game, index) => {
      const p = spring((t - 0.15 - index * 0.08) / 0.7);
      const barH = (game.points / max) * h * 0.34 * p;
      c.fillStyle = game.result === 'W' ? VOLT : game.result === 'L' ? 'rgba(255,122,89,0.75)' : MUTED;
      roundRect(c, 24 * u + index * barW + barW * 0.14, h * 0.78 - barH, barW * 0.72, barH, 4 * u);
      c.fill();
    });
    c.save(); fadeIn(c, t, 0.9, 0.6, 18, u);
    c.fillStyle = MUTED; c.font = ui(12 * u, 700); c.textAlign = 'left';
    c.fillText(season.complete ? 'THE FINAL CUT' : 'SEASON SO FAR', 24 * u, h * 0.2);
    headline(c, `${season.league.season}.\nYOU WERE THERE.`, 24 * u, h * 0.27, u, w - 48 * u, 58);
    body(c, season.complete ? 'Every start, every sit, every 3 a.m. waiver claim. Here’s what it added up to.' : `Weeks 1–${season.throughWeek} are in the books. The final cut unlocks after Week ${season.league.playoffStart - 1}.`, 24 * u, h * 0.42, u, w - 48 * u);
    c.restore();
    c.fillStyle = MUTED; c.font = ui(9 * u, 700); c.textAlign = 'center';
    c.fillText('EACH BAR IS ONE WEEK · GREEN = WIN', w / 2, h * 0.78 + 20 * u);
  });

  // 2. The record
  const recordAlt = `Record ${record(me.wins, me.losses, me.ties)}. ${fmt(me.pf, 2)} points scored, ${ordinal(me.ranks.pf)} of ${teams}. Against every team every week you'd be ${record(me.allPlay.wins, me.allPlay.losses, me.allPlay.ties)}.`;
  add('record', recordAlt, (c, w, h, t) => {
    const u = w / 360;
    frame(c, w, h, u, VOLT, 'The record', season);
    const p = easeOut((t - 0.2) / 1.2);
    c.textAlign = 'left'; c.fillStyle = INK; c.font = display(120 * u);
    c.fillText(`${Math.round(me.wins * p)}–${Math.round(me.losses * p)}${me.ties ? `–${me.ties}` : ''}`, 22 * u, h * 0.33);
    c.save(); fadeIn(c, t, 1.1, 0.5, 14, u);
    stat(c, `Points scored · ${ordinal(me.ranks.pf)} of ${teams}`, fmt(me.pf * easeOut((t - 1.1) / 0.9), 1), 24 * u, h * 0.45, u, VOLT);
    stat(c, `Points against · ${me.ranks.paHigh === 1 ? 'most in league' : me.ranks.paHigh === teams ? 'fewest in league' : `${ordinal(me.ranks.paHigh)} most`}`, fmt(me.pa, 1), w - 24 * u, h * 0.45, u, INK, 'right');
    c.restore();
    c.save(); fadeIn(c, t, 2, 0.6, 14, u);
    roundRect(c, 24 * u, h * 0.55, w - 48 * u, 150 * u, 18 * u); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill();
    c.fillStyle = MUTED; c.font = ui(10 * u, 800); c.textAlign = 'left';
    c.fillText('IF YOU PLAYED EVERYONE, EVERY WEEK', 40 * u, h * 0.55 + 30 * u);
    c.fillStyle = INK; c.font = display(52 * u);
    c.fillText(record(me.allPlay.wins, me.allPlay.losses, me.allPlay.ties), 40 * u, h * 0.55 + 86 * u);
    body(c, `That's a ${pct(me.allPlay.pct)} all-play win rate, ${ordinal(me.ranks.allPlay)} in the league.`, 40 * u, h * 0.55 + 118 * u, u, w - 80 * u, 'rgba(238,242,248,0.8)', 12);
    c.restore();
  });

  // 3. Luck meter
  const luckWord = me.luck >= 0.75 ? 'BLESSED' : me.luck <= -0.75 ? 'ROBBED' : 'FAIR';
  const luckCopy = me.luck >= 0.75 ? `You have ${fmt(me.luck, 1)} more wins than your scoring earned. Don't tell the group chat.`
    : me.luck <= -0.75 ? `Your scoring earned ${fmt(-me.luck, 1)} more wins than you got. The schedule owes you.`
    : 'Your record matches your scoring almost exactly. No excuses, no gifts.';
  add('luck', `Luck index ${signed(me.luck)} wins: ${luckWord.toLowerCase()}. ${luckCopy}`, (c, w, h, t) => {
    const u = w / 360;
    const color = luckWord === 'BLESSED' ? VOLT : luckWord === 'ROBBED' ? CORAL : BLUE;
    frame(c, w, h, u, color, 'Luck index', season);
    const cx = w / 2; const cy = h * 0.47; const r = 120 * u;
    c.lineCap = 'round';
    [[Math.PI, Math.PI * 1.33, CORAL], [Math.PI * 1.33, Math.PI * 1.67, BLUE], [Math.PI * 1.67, Math.PI * 2, VOLT]].forEach(([a0, a1, col]) => {
      c.strokeStyle = `${col}aa`; c.lineWidth = 16 * u; c.beginPath(); c.arc(cx, cy, r, a0 + 0.03, a1 - 0.03); c.stroke();
    });
    const span = Math.max(2, Math.abs(me.luck) * 1.25, weeks / 4);
    const target = clamp((me.luck + span) / (2 * span));
    const p = spring((t - 0.3) / 1.4);
    const angle = Math.PI + Math.PI * (0.5 + (target - 0.5) * p);
    c.strokeStyle = INK; c.lineWidth = 5 * u;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(angle) * (r - 26 * u), cy + Math.sin(angle) * (r - 26 * u)); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(cx, cy, 9 * u, 0, Math.PI * 2); c.fill();
    c.fillStyle = MUTED; c.font = ui(10 * u, 800);
    c.textAlign = 'left'; c.fillText('ROBBED', cx - r - 8 * u, cy + 26 * u);
    c.textAlign = 'right'; c.fillText('BLESSED', cx + r + 8 * u, cy + 26 * u);
    c.save(); fadeIn(c, t, 1.4, 0.5, 14, u);
    c.textAlign = 'center'; c.fillStyle = color; c.font = display(64 * u);
    c.fillText(luckWord, cx, h * 0.2);
    c.fillStyle = INK; c.font = display(30 * u);
    c.fillText(`${signed(me.luck)} WINS`, cx, h * 0.55 + 24 * u);
    c.restore();
    c.save(); fadeIn(c, t, 2, 0.5, 14, u);
    body(c, luckCopy, 24 * u, h * 0.66, u, w - 48 * u);
    c.fillStyle = MUTED; c.font = ui(9.5 * u, 600);
    wrap(c, 'Luck = actual wins minus the wins your weekly scores would earn against the whole league (all-play).', 24 * u, h * 0.84, w - 48 * u, 14 * u);
    c.restore();
  });

  // 4. Week of weeks
  if (me.bestWeek) {
    const best = me.bestWeek;
    add('week', `Your best week: Week ${best.week}, ${fmt(best.points, 2)} points, ${best.rank === 1 ? 'the highest score in the league that week' : `${ordinal(best.rank)} highest that week`}. It ranks ${ordinal(bestRank)} of all ${allScores.length} team scores this season.${me.records.includes('highest') ? ' An all-time league record.' : ''}`, (c, w, h, t) => {
      const u = w / 360;
      frame(c, w, h, u, GOLD, 'Your week of weeks', season);
      const max = allScores.at(-1)?.points || 1;
      const min = allScores[0]?.points || 0;
      const barW = (w - 48 * u) / allScores.length;
      allScores.forEach((score, index) => {
        const p = easeOut((t - 0.2 - index * 0.006) / 0.6);
        const height = (0.15 + 0.85 * (score.points - min) / Math.max(1, max - min)) * h * 0.28 * p;
        const isBest = score.mine && score.points === best.points;
        c.fillStyle = isBest ? GOLD : score.mine ? 'rgba(198,255,74,0.55)' : 'rgba(143,155,179,0.22)';
        c.fillRect(24 * u + index * barW, h * 0.8 - height, Math.max(1, barW - 1 * u), height);
      });
      c.save(); fadeIn(c, t, 0.9, 0.5, 14, u);
      c.textAlign = 'left'; c.fillStyle = MUTED; c.font = ui(12 * u, 700);
      c.fillText(`WEEK ${best.week}`, 24 * u, h * 0.19);
      c.fillStyle = GOLD; c.font = display(110 * u);
      c.fillText(fmt(best.points * easeOut((t - 0.9) / 1), 2), 20 * u, h * 0.32);
      c.restore();
      c.save(); fadeIn(c, t, 1.8, 0.5, 14, u);
      body(c, `${best.rank === 1 ? 'The highest score in the league that week.' : `${ordinal(best.rank)} highest score that week.`} Of all ${allScores.length} team scores this season, it ranks ${ordinal(bestRank)}.`, 24 * u, h * 0.38, u, w - 48 * u);
      if (me.records.includes('highest')) {
        roundRect(c, 24 * u, h * 0.47, 150 * u, 30 * u, 15 * u); c.fillStyle = GOLD; c.fill();
        c.fillStyle = BG; c.font = ui(11 * u, 900); c.textAlign = 'center'; c.fillText('★ ALL-TIME RECORD', 99 * u, h * 0.47 + 20 * u);
      }
      c.restore();
      c.fillStyle = MUTED; c.font = ui(9 * u, 700); c.textAlign = 'center';
      c.fillText(`ALL ${allScores.length} TEAM SCORES, LOW TO HIGH · YOURS IN GREEN`, w / 2, h * 0.8 + 20 * u);
    });
  }

  // 5. MVP
  if (me.mvp) {
    const share = me.pf ? me.mvp.total / me.pf : 0;
    add('mvp', `Your MVP: ${me.mvp.name}, ${fmt(me.mvp.total, 1)} points in your lineup over ${me.mvp.starts} starts, ${pct(share)} of everything you scored.`, (c, w, h, t) => {
      const u = w / 360;
      frame(c, w, h, u, VOLT, 'Your MVP', season);
      const cx = w / 2; const cy = h * 0.47; const r = 96 * u;
      c.lineWidth = 18 * u; c.strokeStyle = 'rgba(255,255,255,0.08)'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
      const p = easeOut((t - 0.5) / 1.3);
      c.strokeStyle = VOLT; c.lineCap = 'round'; c.beginPath(); c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share * p); c.stroke();
      c.textAlign = 'center'; c.fillStyle = INK; c.font = display(54 * u); c.fillText(pct(share * p), cx, cy + 12 * u);
      c.fillStyle = MUTED; c.font = ui(9.5 * u, 800); c.fillText('OF YOUR POINTS', cx, cy + 32 * u);
      c.save(); fadeIn(c, t, 0.2, 0.6, 16, u);
      c.textAlign = 'left'; c.fillStyle = MUTED; c.font = ui(12 * u, 700);
      c.fillText(`${me.mvp.position} · ${me.mvp.team}`, 24 * u, h * 0.17);
      headline(c, me.mvp.name.toUpperCase(), 24 * u, h * 0.24, u, w - 48 * u, 50, VOLT);
      c.restore();
      c.save(); fadeIn(c, t, 1.6, 0.5, 14, u);
      stat(c, 'Points for you', fmt(me.mvp.total, 1), 24 * u, h * 0.72, u, INK);
      stat(c, 'Starts', String(me.mvp.starts), w / 2, h * 0.72, u, INK, 'center');
      stat(c, 'Per start', fmt(me.mvp.ppg, 1), w - 24 * u, h * 0.72, u, INK, 'right');
      c.restore();
    });
  }

  // 6. Most reliable vs Boom king
  if (me.reliable || me.boom) {
    const rel = me.reliable;
    const boom = me.boom;
    add('split', `${rel ? `Most reliable: ${rel.name}, ${fmt(rel.ppg, 1)} points a start with the steadiest output on your team.` : ''} ${boom ? `Boom king: ${boom.name}, ${boom.booms} games of ${20}+ points.` : ''}`.trim(), (c, w, h, t) => {
      const u = w / 360;
      frame(c, w, h, u, BLUE, 'Steady vs. explosive', season);
      const half = (y, color, label, player, big, bigLabel, line, start) => {
        c.save(); fadeIn(c, t, start, 0.6, 18, u);
        roundRect(c, 20 * u, y, w - 40 * u, h * 0.36, 20 * u); c.fillStyle = 'rgba(255,255,255,0.045)'; c.fill();
        c.fillStyle = color; c.font = ui(10.5 * u, 800); c.textAlign = 'left'; c.fillText(label, 38 * u, y + 32 * u);
        if (!player) { body(c, line, 38 * u, y + 64 * u, u, w - 76 * u); c.restore(); return; }
        headline(c, player.name.toUpperCase(), 38 * u, y + 74 * u, u, w - 76 * u, 34, INK);
        c.fillStyle = color; c.font = display(62 * u); c.fillText(big, 38 * u, y + 150 * u);
        c.fillStyle = MUTED; c.font = ui(9.5 * u, 800); c.fillText(bigLabel, 38 * u, y + 168 * u);
        body(c, line, 38 * u, y + 196 * u, u, w - 76 * u, 'rgba(238,242,248,0.78)', 11.5);
        c.restore();
      };
      half(h * 0.14, BLUE, 'MOST RELIABLE', rel, rel ? fmt(rel.ppg, 1) : '', 'POINTS PER START', rel ? `${rel.starts} starts, the most consistent scorer on your roster (min ${me.minReliable} starts).` : `Nobody hit ${me.minReliable}+ starts at 8+ a game. Musical chairs all year.`, 0.2);
      half(h * 0.545, VOLT, 'BOOM KING', boom, boom ? String(boom.booms) : '', `GAMES OF ${20}+ POINTS`, boom ? `Best of them: ${fmt(boom.best.points, 1)} in Week ${boom.best.week}.` : 'Nobody on your team cracked 20 in a start. Yet.', 1);
    });
  }

  // 7. Worst performer (roast the player, never the manager)
  if (me.bust) {
    const b = me.bust;
    const role = POSITION_NAMES[b.position] || 'starter';
    add('bust', `We need to talk about ${b.name}: ${fmt(b.ppg, 1)} points a start over ${b.starts} starts, ${pct(b.vsPosition)} of what an average ${role} starter scored in this league.`, (c, w, h, t) => {
      const u = w / 360;
      frame(c, w, h, u, CORAL, 'The worst performer', season);
      c.save(); fadeIn(c, t, 0.2, 0.6, 16, u);
      c.textAlign = 'left'; c.fillStyle = MUTED; c.font = ui(14 * u, 700);
      c.fillText('We need to talk about…', 24 * u, h * 0.19);
      headline(c, b.name.toUpperCase(), 24 * u, h * 0.27, u, w - 48 * u, 54, CORAL);
      c.restore();
      const avg = season.positionPpg[b.position] || 1;
      const p = easeOut((t - 1) / 1.1);
      const barMax = w - 48 * u;
      const row = (y, label, value, color) => {
        c.fillStyle = MUTED; c.font = ui(10 * u, 800); c.textAlign = 'left'; c.fillText(label, 24 * u, y);
        roundRect(c, 24 * u, y + 10 * u, barMax, 26 * u, 13 * u); c.fillStyle = 'rgba(255,255,255,0.06)'; c.fill();
        roundRect(c, 24 * u, y + 10 * u, Math.max(26 * u, barMax * clamp(value / Math.max(avg, b.ppg)) * p), 26 * u, 13 * u); c.fillStyle = color; c.fill();
        c.fillStyle = BG; c.font = ui(12 * u, 900); c.fillText(fmt(value * p, 1), 34 * u, y + 28 * u);
      };
      row(h * 0.42, `${b.name.split(' ').slice(-1)[0].toUpperCase()} · POINTS PER START`, b.ppg, CORAL);
      row(h * 0.52, `AVERAGE ${b.position} STARTER IN YOUR LEAGUE`, avg, 'rgba(238,242,248,0.85)');
      c.save(); fadeIn(c, t, 2.2, 0.5, 14, u);
      c.fillStyle = INK; c.font = display(40 * u); c.textAlign = 'left';
      c.fillText(`${pct(b.vsPosition)} OF AVERAGE`, 24 * u, h * 0.68);
      body(c, `${b.starts} starts, ${fmt(b.total, 1)} points. ${first(b.name)} owes you an apology, and maybe a fruit basket.`, 24 * u, h * 0.74, u, w - 48 * u);
      c.restore();
    });
  }

  // 8. Bench regret
  add('bench', `Your bench scored ${fmt(me.benchPoints, 1)} points.${me.benchRegret ? ` Biggest regret: ${me.benchRegret.name}, ${fmt(me.benchRegret.points, 1)} points on your bench in weeks he belonged in your best lineup.` : ''} Your best possible lineups would have added ${fmt(me.leftOnBench, 1)} points.`, (c, w, h, t) => {
    const u = w / 360;
    frame(c, w, h, u, BLUE, 'Bench regret', season);
    c.save(); fadeIn(c, t, 0.2, 0.6, 16, u);
    c.textAlign = 'left'; c.fillStyle = MUTED; c.font = ui(12 * u, 700); c.fillText('YOUR BENCH SCORED', 24 * u, h * 0.18);
    c.fillStyle = BLUE; c.font = display(104 * u); c.fillText(fmt(me.benchPoints * easeOut((t - 0.2) / 1.2), 1), 20 * u, h * 0.3);
    c.restore();
    const p = easeOut((t - 1.2) / 1);
    const total = me.optimal || 1;
    const barW = w - 48 * u;
    c.fillStyle = MUTED; c.font = ui(10 * u, 800); c.textAlign = 'left';
    c.fillText('WHAT YOU SCORED vs. YOUR BEST POSSIBLE LINEUPS', 24 * u, h * 0.4);
    roundRect(c, 24 * u, h * 0.42, barW, 34 * u, 10 * u); c.fillStyle = 'rgba(89,168,255,0.25)'; c.fill();
    roundRect(c, 24 * u, h * 0.42, barW * (me.pf / total) * p, 34 * u, 10 * u); c.fillStyle = VOLT; c.fill();
    c.fillStyle = BG; c.font = ui(11 * u, 900); c.fillText(`${fmt(me.pf, 1)} SCORED`, 34 * u, h * 0.42 + 22 * u);
    c.save(); fadeIn(c, t, 2, 0.5, 14, u);
    c.fillStyle = INK; c.textAlign = 'left';
    c.fillText(fitDisplay(c, `${fmt(me.leftOnBench, 1)} POINTS LEFT ON THE PINE`, 34 * u, 20 * u, w - 48 * u), 24 * u, h * 0.53);
    if (me.benchRegret) {
      roundRect(c, 24 * u, h * 0.58, w - 48 * u, 112 * u, 18 * u); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill();
      c.fillStyle = MUTED; c.font = ui(10 * u, 800); c.fillText('BIGGEST BENCH REGRET', 40 * u, h * 0.58 + 28 * u);
      headline(c, me.benchRegret.name.toUpperCase(), 40 * u, h * 0.58 + 66 * u, u, w - 80 * u, 32, INK);
      c.fillStyle = BLUE; c.font = ui(11.5 * u, 800); c.fillText(fit(c, `${fmt(me.benchRegret.points, 1)} pts benched in weeks he belonged in your best lineup`, w - 80 * u), 40 * u, h * 0.58 + 92 * u);
    }
    c.restore();
  });

  // 9. Lineup IQ
  const wd = me.worstDecision;
  add('iq', `Lineup IQ ${iq(me.lineupIQ)}, ${ordinal(me.ranks.iq)} of ${teams}: you scored ${iq(me.lineupIQ)} of your best possible points. ${me.perfectWeeks} perfect lineup${me.perfectWeeks === 1 ? '' : 's'}.${wd ? ` Toughest call: Week ${wd.week}, ${wd.benched.name} scored ${fmt(wd.benched.points, 1)} on your bench while ${wd.started.name} scored ${fmt(wd.started.points, 1)}.` : ''}`, (c, w, h, t) => {
    const u = w / 360;
    frame(c, w, h, u, VOLT, 'Lineup IQ', season);
    const p = easeOut((t - 0.3) / 1.3);
    c.textAlign = 'left'; c.fillStyle = VOLT; c.font = display(140 * u);
    const finalWidth = c.measureText((me.lineupIQ * 100).toFixed(1)).width;
    c.fillText(`${(me.lineupIQ * 100 * p).toFixed(1)}`, 18 * u, h * 0.33);
    c.fillStyle = INK; c.font = display(40 * u); c.fillText('%', 24 * u + finalWidth, h * 0.33);
    c.save(); fadeIn(c, t, 1.3, 0.5, 14, u);
    body(c, `You started ${iq(me.lineupIQ)} of the points your best possible lineups would have scored. ${ordinal(me.ranks.iq)} of ${teams} managers.`, 24 * u, h * 0.39, u, w - 48 * u);
    stat(c, 'Perfect lineups', `${me.perfectWeeks} of ${weeks}`, 24 * u, h * 0.53, u, INK);
    stat(c, 'Points left', fmt(me.leftOnBench, 1), w - 24 * u, h * 0.53, u, INK, 'right');
    c.restore();
    if (wd) {
      c.save(); fadeIn(c, t, 2.2, 0.5, 14, u);
      roundRect(c, 24 * u, h * 0.6, w - 48 * u, 150 * u, 18 * u); c.fillStyle = 'rgba(255,122,89,0.10)'; c.fill();
      c.fillStyle = CORAL; c.font = ui(10 * u, 800); c.textAlign = 'left'; c.fillText(`THE ONE THAT STINGS · WEEK ${wd.week}`, 40 * u, h * 0.6 + 28 * u);
      c.fillStyle = INK; c.font = ui(13 * u, 700);
      c.fillText(fit(c, `Benched ${wd.benched.name}`, w - 150 * u), 40 * u, h * 0.6 + 60 * u);
      c.fillText(fit(c, `Started ${wd.started.name}`, w - 150 * u), 40 * u, h * 0.6 + 100 * u);
      c.textAlign = 'right'; c.font = display(28 * u);
      c.fillStyle = VOLT; c.fillText(fmt(wd.benched.points, 1), w - 40 * u, h * 0.6 + 62 * u);
      c.fillStyle = CORAL; c.fillText(fmt(wd.started.points, 1), w - 40 * u, h * 0.6 + 102 * u);
      c.fillStyle = MUTED; c.font = ui(10 * u, 700); c.textAlign = 'left';
      c.fillText(`A ${fmt(wd.swing, 1)}-point swing. It happens to everyone.`, 40 * u, h * 0.6 + 132 * u);
      c.restore();
    }
  });

  // 10. Front office: draft steal, best pickup, the one that got away
  const steal = me.bestValue;
  const pick = me.bestPickup && me.bestPickup.points > 0 ? me.bestPickup : null;
  const away = me.gotAway && me.gotAway.points > 0 ? me.gotAway : null;
  add('office', `Front office. ${steal ? `Draft steal: ${steal.name}, round ${steal.round}, ${fmt(steal.points, 1)} points for you, ${fmt(steal.ratio, 1)} times a typical round ${steal.round} pick.` : ''} ${pick ? `Best pickup: ${pick.name}, ${fmt(pick.points, 1)} points in your lineup since Week ${pick.week}.` : 'No pickup has scored for you yet.'} ${away ? `The one that got away: ${away.name}, ${fmt(away.points, 1)} points for other teams since you dropped him in Week ${away.week}.` : ''} ${me.moves.total} roster moves, ${ordinal(me.ranks.moves)} most in the league.`, (c, w, h, t) => {
    const u = w / 360;
    frame(c, w, h, u, GOLD, 'The front office', season);
    c.save(); fadeIn(c, t, 0.2, 0.5, 14, u);
    c.textAlign = 'left'; c.fillStyle = INK; c.font = display(46 * u);
    c.fillText(plural(me.moves.total, 'MOVE').toUpperCase(), 24 * u, h * 0.17);
    c.fillStyle = MUTED; c.font = ui(11 * u, 700);
    c.fillText(`${plural(me.moves.adds, 'add')} · ${plural(me.moves.drops, 'drop')} · ${plural(me.moves.trades, 'trade')} · ${ordinal(me.ranks.moves)} busiest`, 24 * u, h * 0.17 + 22 * u);
    c.restore();
    const card = (y, color, label, title, big, detail, start) => {
      c.save(); fadeIn(c, t, start, 0.5, 18, u);
      roundRect(c, 20 * u, y, w - 40 * u, 128 * u, 18 * u); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill();
      c.fillStyle = color; c.font = ui(10 * u, 800); c.textAlign = 'left'; c.fillText(label, 36 * u, y + 28 * u);
      if (!title) { c.fillStyle = MUTED; c.font = ui(12 * u, 600); c.fillText(detail, 36 * u, y + 64 * u); c.restore(); return; }
      c.fillStyle = INK; c.font = display(28 * u); c.fillText(fit(c, title.toUpperCase(), w - 150 * u), 36 * u, y + 62 * u);
      c.fillStyle = color; c.font = display(40 * u); c.textAlign = 'right'; c.fillText(big, w - 36 * u, y + 66 * u);
      c.fillStyle = 'rgba(238,242,248,0.75)'; c.font = ui(11 * u, 600); c.textAlign = 'left';
      wrap(c, detail, 36 * u, y + 92 * u, w - 72 * u, 15 * u, 2);
      c.restore();
    };
    card(h * 0.25, GOLD, 'DRAFT STEAL', steal?.name, steal ? fmt(steal.points, 0) : '', steal ? `Round ${steal.round}, pick ${steal.pickNo}${steal.keeper ? ' (keeper)' : ''}. ${fmt(steal.ratio, 1)}× a typical round ${steal.round} pick (${fmt(steal.expected, 0)}).` : 'No draft data for this season.', 0.8);
    card(h * 0.25 + 140 * u, VOLT, 'BEST PICKUP', pick?.name, pick ? fmt(pick.points, 0) : '', pick ? `Added Week ${pick.week}${pick.bid ? ` for $${pick.bid}` : ''}. Points in your lineup since.` : 'No pickup has started and scored for you yet.', 1.4);
    card(h * 0.25 + 280 * u, CORAL, 'THE ONE THAT GOT AWAY', away?.name, away ? fmt(away.points, 0) : '', away ? `Dropped Week ${away.week}. Points he has scored in other teams’ lineups since.` : 'Nobody you dropped has hurt you. Yet.', 2);
  });

  // 11. Trade ledger
  add('trades', me.trades.length ? `Trade ledger: ${plural(me.trades.length, 'trade')}, ${me.trades.every(trade => trade.early) ? 'too early to call: no games played since' : `net ${signed(me.tradeNet)} points`}. ${me.trades.map(trade => `Week ${trade.week}: received ${trade.received.map(p => p.name).join(', ') || 'picks'} (${fmt(trade.gained, 1)} pts for you), sent ${trade.sent.map(p => p.name).join(', ') || 'picks'} (${fmt(trade.given, 1)} pts for them).`).join(' ')}` : 'No trades this season.', (c, w, h, t) => {
    const u = w / 360;
    const judged = me.trades.filter(trade => !trade.early);
    const color = me.tradeNet > 0 ? VOLT : me.tradeNet < 0 ? CORAL : BLUE;
    frame(c, w, h, u, color, 'Trade ledger', season);
    if (!me.trades.length) {
      c.save(); fadeIn(c, t, 0.2, 0.6, 16, u);
      headline(c, 'ZERO TRADES.', 24 * u, h * 0.3, u, w - 48 * u, 64, INK);
      body(c, 'Loyal? Stubborn? Waiting for the perfect offer? Whatever it is, your roster is 100% you.', 24 * u, h * 0.38, u, w - 48 * u);
      c.restore();
      return;
    }
    c.save(); fadeIn(c, t, 0.2, 0.5, 14, u);
    c.textAlign = 'left'; c.fillStyle = color; c.font = display(judged.length ? 78 * u : 54 * u);
    c.fillText(judged.length ? signed(me.tradeNet) : fitDisplay(c, 'TOO EARLY TO CALL', 54 * u, 24 * u, w - 44 * u), 22 * u, h * 0.22);
    c.fillStyle = MUTED; c.font = ui(10.5 * u, 800); c.fillText(judged.length ? 'NET POINTS FROM YOUR TRADES (STARTERS ONLY)' : `${plural(me.trades.length, 'trade')}, no games played since`.toUpperCase(), 24 * u, h * 0.22 + 22 * u);
    c.restore();
    const list = me.trades.slice(0, 4);
    list.forEach((trade, index) => {
      const y = h * 0.3 + index * 118 * u;
      c.save(); fadeIn(c, t, 0.9 + index * 0.35, 0.5, 16, u);
      c.fillStyle = MUTED; c.font = ui(10 * u, 800); c.textAlign = 'left'; c.fillText(`WEEK ${trade.week}${trade.early ? ' · TOO EARLY TO CALL' : trade.net > 0 ? ' · WON' : trade.net < 0 ? ' · LOST' : ' · EVEN'}`, 24 * u, y + 14 * u);
      const total = trade.gained + trade.given || 2;
      const p = easeOut((t - 1.2 - index * 0.35) / 0.8);
      const barW = w - 48 * u;
      const mid = 24 * u + barW * ((trade.gained + trade.given ? trade.gained : 1) / total);
      roundRect(c, 24 * u, y + 22 * u, barW, 18 * u, 9 * u); c.fillStyle = 'rgba(255,255,255,0.06)'; c.fill();
      c.fillStyle = trade.early ? 'rgba(198,255,74,0.35)' : VOLT; c.fillRect(24 * u, y + 22 * u, (mid - 24 * u) * p, 18 * u);
      c.fillStyle = trade.early ? 'rgba(255,122,89,0.35)' : CORAL; c.fillRect(24 * u + barW - (24 * u + barW - mid) * p, y + 22 * u, (24 * u + barW - mid) * p, 18 * u);
      c.font = ui(11 * u, 700); c.fillStyle = INK;
      c.fillText(fit(c, `IN: ${[...trade.received.map(p_ => p_.name), ...trade.picksIn].join(', ') || '—'}`, barW - 50 * u), 24 * u, y + 60 * u);
      c.fillText(fit(c, `OUT: ${[...trade.sent.map(p_ => p_.name), ...trade.picksOut].join(', ') || '—'}`, barW - 50 * u), 24 * u, y + 80 * u);
      c.textAlign = 'right'; c.fillStyle = VOLT; c.fillText(fmt(trade.gained, 1), w - 24 * u, y + 60 * u);
      c.fillStyle = CORAL; c.fillText(fmt(trade.given, 1), w - 24 * u, y + 80 * u);
      c.restore();
    });
    if (me.trades.length > 4) { c.fillStyle = MUTED; c.font = ui(10 * u, 700); c.textAlign = 'left'; c.fillText(`+ ${me.trades.length - 4} more`, 24 * u, h * 0.3 + 4 * 118 * u); }
    c.fillStyle = MUTED; c.font = ui(9 * u, 600); c.textAlign = 'left';
    wrap(c, 'Points each side’s players scored in their new team’s starting lineup after the trade. Draft picks are listed, not valued.', 24 * u, h * 0.9, w - 48 * u, 13 * u);
  });

  // 12. Rivals
  if (me.nemesis || me.victim) {
    const seasons = season.league.seasons;
    add('rivals', `${me.nemesis ? `Nemesis: ${me.nemesis.name}, you're ${record(me.nemesis.wins, me.nemesis.losses, me.nemesis.ties)} against them all-time.` : ''} ${me.victim && me.victim.ownerId !== me.nemesis?.ownerId ? `Favorite victim: ${me.victim.name}, ${record(me.victim.wins, me.victim.losses, me.victim.ties)}.` : ''}`.trim(), (c, w, h, t) => {
      const u = w / 360;
      frame(c, w, h, u, CORAL, `Rivals · ${seasons > 1 ? `all-time, ${seasons} seasons` : 'this season'}`, season);
      const block = (y, color, label, rival, line, start) => {
        if (!rival) return;
        c.save(); fadeIn(c, t, start, 0.6, 18, u);
        c.fillStyle = color; c.font = ui(11 * u, 800); c.textAlign = 'left'; c.fillText(label, 24 * u, y);
        headline(c, rival.name.toUpperCase(), 24 * u, y + 44 * u, u, w - 48 * u, 44, INK);
        c.fillStyle = color; c.font = display(80 * u); c.fillText(record(rival.wins, rival.losses, rival.ties), 22 * u, y + 124 * u);
        body(c, line, 24 * u, y + 152 * u, u, w - 48 * u, 'rgba(238,242,248,0.78)', 12);
        c.restore();
      };
      block(h * 0.15, CORAL, 'YOUR NEMESIS', me.nemesis, me.nemesis ? `${me.nemesis.games} meetings. They have your number.` : '', 0.2);
      if (me.victim && me.victim.ownerId !== me.nemesis?.ownerId) block(h * 0.53, VOLT, 'FAVORITE VICTIM', me.victim, `${me.victim.games} meetings. You own this matchup.`, 1.2);
    });
  }

  // 13. Archetype reveal
  const arch = me.archetype;
  const proof = archetypeProof(me, teams);
  add('archetype', `Your archetype: ${arch.title}. ${arch.line} ${proof.map(item => `${item.label}: ${item.value}.`).join(' ')}`, (c, w, h, t) => {
    const u = w / 360;
    frame(c, w, h, u, GOLD, 'Your archetype', season);
    const flip = clamp((t - 0.3) / 0.9);
    const scaleX = Math.abs(Math.cos(flip * Math.PI));
    const revealed = flip > 0.5;
    const cardW = w - 64 * u; const cardH = h * 0.5;
    c.save(); c.translate(w / 2, h * 0.42); c.scale(Math.max(0.02, scaleX), 1);
    roundRect(c, -cardW / 2, -cardH / 2, cardW, cardH, 24 * u);
    if (!revealed) {
      const back = c.createLinearGradient(-cardW / 2, -cardH / 2, cardW / 2, cardH / 2); back.addColorStop(0, '#1a2540'); back.addColorStop(1, '#0d1424');
      c.fillStyle = back; c.fill(); c.strokeStyle = 'rgba(255,209,102,0.5)'; c.lineWidth = 2 * u; c.stroke();
      c.fillStyle = GOLD; c.font = display(60 * u); c.textAlign = 'center'; c.fillText('?', 0, 20 * u);
    } else {
      const face = c.createLinearGradient(-cardW / 2, -cardH / 2, cardW / 2, cardH / 2); face.addColorStop(0, '#2a2412'); face.addColorStop(1, '#101624');
      c.fillStyle = face; c.fill(); c.strokeStyle = GOLD; c.lineWidth = 2.5 * u; c.stroke();
      c.textAlign = 'center'; c.fillStyle = GOLD; c.font = ui(10 * u, 800); c.fillText('YOU ARE', 0, -cardH / 2 + 44 * u);
      c.fillStyle = INK; c.fillText(fitDisplay(c, arch.title.toUpperCase(), 52 * u, 26 * u, cardW - 40 * u), 0, -cardH / 2 + 104 * u);
      c.fillStyle = 'rgba(238,242,248,0.8)'; c.font = ui(13 * u, 600);
      wrap(c, arch.line, 0, -cardH / 2 + 140 * u, cardW - 56 * u, 19 * u, 3);
      proof.forEach((item, index) => {
        const y = cardH / 2 - (proof.length - index) * 40 * u;
        c.fillStyle = MUTED; c.font = ui(9.5 * u, 800); c.textAlign = 'left'; c.fillText(item.label.toUpperCase(), -cardW / 2 + 28 * u, y);
        c.fillStyle = INK; c.font = display(22 * u); c.textAlign = 'right'; c.fillText(item.value, cardW / 2 - 28 * u, y + 2 * u);
      });
    }
    c.restore();
    c.save(); fadeIn(c, t, 1.4, 0.5, 14, u);
    const badges = me.badges.slice(0, 3);
    let x = 24 * u;
    c.font = ui(10.5 * u, 800);
    badges.forEach(badge => {
      const text = `${ordinal(badge.rank)} in ${badge.label}`;
      const bw = c.measureText(text).width + 24 * u;
      if (x + bw > w - 24 * u) return;
      roundRect(c, x, h * 0.73, bw, 28 * u, 14 * u); c.fillStyle = 'rgba(198,255,74,0.14)'; c.fill();
      c.fillStyle = VOLT; c.textAlign = 'left'; c.fillText(text, x + 12 * u, h * 0.73 + 18.5 * u);
      x += bw + 8 * u;
    });
    c.restore();
  });

  // 14. Summary poster
  add('poster', `${me.name}, ${season.league.season}${season.complete ? '' : ` through Week ${season.throughWeek}`}: ${record(me.wins, me.losses, me.ties)}, ${fmt(me.pf, 1)} points, Lineup IQ ${iq(me.lineupIQ)}, luck ${signed(me.luck)}, MVP ${me.mvp?.name || 'none'}, archetype ${arch.title}.`, (c, w, h, t) => {
    const u = w / 360;
    frame(c, w, h, u, VOLT, `${season.complete ? 'Final' : `Weeks 1–${season.throughWeek}`} · ${season.league.name || 'Season'}`, season);
    c.save(); fadeIn(c, t, 0.1, 0.5, 14, u);
    headline(c, me.name.toUpperCase(), 24 * u, h * 0.17, u, w - 48 * u, 46, INK);
    c.fillStyle = GOLD; c.font = ui(12 * u, 800); c.textAlign = 'left'; c.fillText(arch.title.toUpperCase(), 24 * u, h * 0.17 + 30 * u);
    c.restore();
    const tiles = [
      ['Record', record(me.wins, me.losses, me.ties), VOLT],
      ['Points', fmt(me.pf, 1), INK],
      ['Lineup IQ', iq(me.lineupIQ), VOLT],
      ['Luck', signed(me.luck), me.luck >= 0 ? VOLT : CORAL],
      ['Best week', me.bestWeek ? fmt(me.bestWeek.points, 1) : '—', GOLD],
      ['All-play', record(me.allPlay.wins, me.allPlay.losses, me.allPlay.ties), BLUE]
    ];
    const tileW = (w - 60 * u) / 2; const tileH = 96 * u;
    tiles.forEach(([label, value, color], index) => {
      const x = 24 * u + (index % 2) * (tileW + 12 * u);
      const y = h * 0.27 + Math.floor(index / 2) * (tileH + 12 * u);
      c.save(); fadeIn(c, t, 0.4 + index * 0.12, 0.45, 14, u);
      roundRect(c, x, y, tileW, tileH, 16 * u); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill();
      c.fillStyle = MUTED; c.font = ui(9.5 * u, 800); c.textAlign = 'left'; c.fillText(label.toUpperCase(), x + 14 * u, y + 26 * u);
      c.fillStyle = color; c.fillText(fitDisplay(c, value, 40 * u, 22 * u, tileW - 28 * u), x + 14 * u, y + 72 * u);
      c.restore();
    });
    c.save(); fadeIn(c, t, 1.3, 0.5, 14, u);
    const y = h * 0.27 + 3 * (tileH + 12 * u) + 20 * u;
    c.fillStyle = MUTED; c.font = ui(10 * u, 800); c.textAlign = 'left'; c.fillText('MVP', 24 * u, y);
    c.fillStyle = INK; c.font = display(28 * u); c.fillText(fit(c, (me.mvp?.name || '—').toUpperCase(), w - 140 * u), 24 * u, y + 30 * u);
    c.fillStyle = VOLT; c.textAlign = 'right'; c.fillText(me.mvp ? fmt(me.mvp.total, 1) : '', w - 24 * u, y + 30 * u);
    c.restore();
  });

  // Mini version when the season has barely started (spec §3.4)
  if (weeks < 3) return slides.filter(slide => ['open', 'record', 'mvp', 'archetype', 'poster'].includes(slide.id));
  return slides;
}

function archetypeProof(me, teams) {
  const rank = key => `${ordinal(me.ranks[key])} of ${teams}`;
  const map = {
    tinkerer: [['Roster moves', `${me.moves.total} · ${rank('moves')}`], ['Adds', String(me.moves.adds)], ['Trades', String(me.moves.trades)]],
    oracle: [['Lineup IQ', `${pct(me.lineupIQ)} · ${rank('iq')}`], ['Perfect lineups', String(me.perfectWeeks)], ['Left on bench', fmt(me.leftOnBench, 1)]],
    gambler: [['Weekly swing (SD)', fmt(me.weeklySd, 1)], ['Best week', fmt(me.bestWeek?.points, 1)], ['Worst week', fmt(me.worstWeek?.points, 1)]],
    coldbench: [['Bench points', `${fmt(me.benchPoints, 1)} · ${rank('bench')}`], ['Left on bench', fmt(me.leftOnBench, 1)], ['Lineup IQ', pct(me.lineupIQ)]],
    closer: [['Close games (<10)', record(me.close.wins, me.close.losses, me.close.ties)], ['Record', record(me.wins, me.losses, me.ties)], ['Luck', `${me.luck >= 0 ? '+' : ''}${fmt(me.luck, 1)}`]],
    baron: [['Trade ledger', `${me.tradeNet >= 0 ? '+' : ''}${fmt(me.tradeNet, 1)}`], ['Trades', String(me.moves.trades)], ['Record', record(me.wins, me.losses, me.ties)]],
    lucky: [['Luck', `+${fmt(me.luck, 1)} wins`], ['Record', record(me.wins, me.losses, me.ties)], ['All-play', record(me.allPlay.wins, me.allPlay.losses, me.allPlay.ties)]],
    phoenix: [['Record', record(me.wins, me.losses, me.ties)], ['Longest win streak', String(me.longestWin)], ['Points', fmt(me.pf, 1)]],
    juggernaut: [['Points scored', `${fmt(me.pf, 1)} · ${rank('pf')}`], ['All-play', record(me.allPlay.wins, me.allPlay.losses, me.allPlay.ties)], ['Best week', fmt(me.bestWeek?.points, 1)]],
    snakebitten: [['Points against', `${fmt(me.pa, 1)} · ${ordinal(me.ranks.paHigh)} most`], ['Luck', `${fmt(me.luck, 1)} wins`], ['All-play', record(me.allPlay.wins, me.allPlay.losses, me.allPlay.ties)]],
    rebuild: [['Points scored', `${fmt(me.pf, 1)} · ${rank('pf')}`], ['Best week', fmt(me.bestWeek?.points, 1)], ['MVP', me.mvp ? first(me.mvp.name) : '—']],
    contender: [['Record', record(me.wins, me.losses, me.ties)], ['All-play', record(me.allPlay.wins, me.allPlay.losses, me.allPlay.ties)], ['Points', `${fmt(me.pf, 1)} · ${rank('pf')}`]],
    steady: [['Record', record(me.wins, me.losses, me.ties)], ['Points', `${fmt(me.pf, 1)} · ${rank('pf')}`], ['Lineup IQ', pct(me.lineupIQ)]]
  };
  return (map[me.archetype.id] || map.steady).map(([label, value]) => ({ label, value }));
}
