import { mountNavigation } from '../ui/navigation.js?v=2';
import { mountPageTransitions } from '../ui/page-transitions.js';
import { liveData } from '../data/live-data.js';
import { dealerSource, normalizeDealerPlayers } from '../data/dynasty-dealer.js';
import { mascot } from '../ui/mascot.js';

const engine = window.TradeEngine;
const kind = document.querySelector('#segKeepers') ? 'keeper' : 'redraft';
const historyKey = `kt-trade-history:v1:${kind}`;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let latest;
let panel;
let returnFocus;
let dealerUnsubscribe;
let lastVerdict = '';
let shareCanvas;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function displayValue(value) {
  return Math.round(Number(value || 0) * (kind === 'keeper' ? 100 : 1)).toLocaleString();
}

function history() {
  try { return JSON.parse(localStorage.getItem(historyKey)) || []; } catch (_) { return []; }
}

function currentTrade() {
  return latest || history()[0];
}

function saveTrade(detail) {
  const entries = history().filter(entry => entry.signature !== detail.signature);
  entries.unshift({ ...detail, sides: structuredClone(detail.sides), verdict: document.querySelector('#vStamp').textContent, names: [...document.querySelectorAll('.team-name')].map(input => input.value), date: Date.now(), kind });
  try { localStorage.setItem(historyKey, JSON.stringify(entries.slice(0, 12))); } catch (_) {}
}

function mountHero() {
  const wrap = document.querySelector('main.wrap') || document.querySelector('.wrap');
  const hero = document.createElement('section');
  hero.className = 'trade-desk-hero';
  hero.innerHTML = `<div><span class="kt-eyebrow">${kind === 'keeper' ? 'Keeper league · War room' : 'Trade analyzer · War room'}</span><h1>${kind === 'keeper' ? 'The trade desk' : 'Redraft trade desk'}</h1><p>${kind === 'keeper' ? 'Build both sides. Audit every keeper cost. Know exactly when the 1,000-point rule clears your deal.' : 'Tune the league. Build both sides. Get a clear verdict with transparent values and a card worth sending to the chat.'}</p></div><div class="trade-desk-actions"><span class="kt-badge kt-badge-blue" id="dealer-status">Dynasty Dealer · 24h cache</span><button class="kt-btn kt-btn-sm" type="button" data-open-history>History</button><button class="kt-btn kt-btn-sm kt-btn-secondary" type="button" data-open-breakdown>Breakdown</button><button class="kt-btn kt-btn-sm kt-btn-primary" type="button" data-open-share>Share card</button></div>`;
  wrap.prepend(hero);
}

function mountGauge() {
  const verdict = document.querySelector('.verdict');
  verdict.insertAdjacentHTML('afterbegin', '<div class="trade-gauge" aria-hidden="true"><svg viewBox="0 0 200 120"><defs><linearGradient id="trade-gauge-gradient"><stop offset="0" stop-color="#72a7ff"/><stop offset="1" stop-color="#c6ff4a"/></linearGradient></defs><path class="trade-gauge-track" d="M20 100 A80 80 0 0 1 180 100"/><path class="trade-gauge-value" d="M20 100 A80 80 0 0 1 180 100" stroke-dasharray="251.2" stroke-dashoffset="125.6"/><line class="trade-gauge-threshold" x1="100" y1="12" x2="100" y2="28"/><line class="trade-gauge-needle" x1="100" y1="100" x2="100" y2="36"/><text class="trade-gauge-center" x="100" y="88">50%</text></svg></div>');
  verdict.querySelector('.scale')?.insertAdjacentHTML('beforeend', '<span class="trade-threshold-marker" aria-hidden="true"></span>');
  const character = document.createElement('div');
  character.className = 'kt-mascot-inline';
  verdict.append(character);
  mascot.mount(character);
}

function updateVerdict(detail) {
  latest = detail;
  const total = detail.totals.A + detail.totals.B;
  const percent = total ? detail.totals.A / total : 0.5;
  const gauge = document.querySelector('.trade-gauge-value');
  const needle = document.querySelector('.trade-gauge-needle');
  if (gauge) gauge.style.strokeDashoffset = 251.2 * (1 - percent);
  if (needle) needle.style.transform = `rotate(${-90 + percent * 180}deg)`;
  const center = document.querySelector('.trade-gauge-center');
  if (center) center.textContent = `${Math.round(percent * 100)}%`;
  const stamp = document.querySelector('#vStamp').textContent;
  latest.verdict = stamp;
  latest.names = [...document.querySelectorAll('.team-name')].map(input => input.value);
  if (stamp !== lastVerdict) {
    const element = document.querySelector('#vStamp');
    element.classList.remove('is-celebrating');
    void element.offsetWidth;
    element.classList.add('is-celebrating');
    if (stamp.includes('Auto-Approved') && !reducedMotion.matches && window.matchMedia('(pointer: coarse)').matches && 'vibrate' in navigator) navigator.vibrate([30, 35, 55]);
    window.dispatchEvent(new CustomEvent('kt:trade-verdict', { detail: { verdict: stamp, lopsided: Math.abs(detail.totals.A - detail.totals.B) > 1000 } }));
    lastVerdict = stamp;
  }
  if (detail.sides.A.length && detail.sides.B.length) saveTrade(detail);
}

function mountDrag() {
  document.querySelectorAll('.team[data-side]').forEach(team => {
    team.addEventListener('dragover', event => { event.preventDefault(); team.classList.add('is-drop-target'); });
    team.addEventListener('dragleave', () => team.classList.remove('is-drop-target'));
    team.addEventListener('drop', event => {
      event.preventDefault();
      team.classList.remove('is-drop-target');
      try {
        const { uid, from } = JSON.parse(event.dataTransfer.getData('application/x-keeper-trade'));
        engine.moveAsset(Number(uid), from, team.dataset.side);
      } catch (_) {}
    });
  });
  const observer = new MutationObserver(() => {
    document.querySelectorAll('.players').forEach(list => {
      const side = list.dataset.list;
      list.querySelectorAll('.pcard').forEach((card, index) => {
        const entry = engine.state.sides[side][index];
        if (!entry) return;
        card.draggable = finePointer.matches;
        card.dataset.uid = entry.uid;
        card.addEventListener('dragstart', event => {
          event.dataTransfer.setData('application/x-keeper-trade', JSON.stringify({ uid: entry.uid, from: side }));
          event.dataTransfer.effectAllowed = 'move';
        });
        const image = card.querySelector('img');
        if (image && !image.dataset.fallback) {
          image.dataset.fallback = 'true';
          image.addEventListener('error', () => {
            const avatar = document.createElement('span');
            avatar.className = 'trade-avatar';
            avatar.textContent = (entry.ref.name || entry.ref.n).split(' ').map(part => part[0]).slice(0, 2).join('');
            avatar.style.background = `hsl(${[...(entry.ref.team || entry.ref.t || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 17 % 360} 45% 28%)`;
            image.replaceWith(avatar);
          }, { once: true });
        }
      });
    });
  });
  document.querySelectorAll('.players').forEach(list => observer.observe(list, { childList: true, subtree: true }));
}

function mountMobileSearch() {
  const scrim = document.createElement('div');
  scrim.className = 'kt-search-scrim';
  scrim.hidden = true;
  document.body.appendChild(scrim);
  document.addEventListener('focusin', event => {
    if (!event.target.matches('[data-search]') || !window.matchMedia('(max-width: 48rem)').matches) return;
    scrim.hidden = false;
    document.body.classList.add('is-searching');
  });
  document.addEventListener('focusout', event => {
    if (!event.target.matches('[data-search]')) return;
    window.setTimeout(() => {
      scrim.hidden = true;
      document.body.classList.remove('is-searching');
    }, 150);
  });
  scrim.addEventListener('click', () => {
    document.querySelectorAll('[data-search]').forEach(input => input.blur());
    scrim.hidden = true;
    document.body.classList.remove('is-searching');
  });
}

function lineItems(side) {
  return currentTrade().sides[side].map(entry => {
    const adjusted = engine.adjustedValue(entry);
    const market = kind === 'keeper' ? entry.mv : entry.ref.val;
    const cost = kind === 'keeper' ? (entry.ref.pick ? 'Draft-pick cost is the pick itself' : entry.cost === 1 ? 'Escalates to 1st + 3rd' : entry.cost === 2 ? 'Escalates to a 1st' : `Round ${entry.cost} · −1 round per year`) : 'Current format value';
    return `<div class="trade-line-item"><div><strong>${escapeHtml((entry.ref.name || entry.ref.n))}</strong><small>${escapeHtml(entry.ref.pos || entry.ref.p || 'PICK')} · ${escapeHtml((entry.ref.team || entry.ref.t || ''))}</small></div><b>${displayValue(adjusted)}</b><small>Market ${displayValue(market)} · ${escapeHtml(cost)}</small></div>`;
  }).join('') || '<p class="kt-muted">No assets on this side.</p>';
}

function openPanel(type) {
  const trade = currentTrade();
  if (!trade) return;
  returnFocus = document.activeElement;
  let title;
  let content;
  if (type === 'breakdown') {
    title = 'Value breakdown';
    content = `<p class="kt-muted">Every number below comes directly from the active trade engine. Nothing is hidden.</p><section class="trade-breakdown-side"><h3>${escapeHtml(trade.names?.[0] || 'Team A')}</h3>${lineItems('A')}<strong>Total ${displayValue(trade.totals.A)}</strong></section><section class="trade-breakdown-side"><h3>${escapeHtml(trade.names?.[1] || 'Team B')}</h3>${lineItems('B')}<strong>Total ${displayValue(trade.totals.B)}</strong></section>`;
  } else if (type === 'history') {
    title = 'Trade history';
    const entries = history();
    content = entries.length ? `<div class="trade-history-list">${entries.map((entry, index) => `<article class="trade-history-item"><strong>${escapeHtml(entry.verdict)}</strong><span>${new Date(entry.date).toLocaleString()} · ${displayValue(entry.totals.A)} for ${displayValue(entry.totals.B)}</span><button class="kt-btn kt-btn-sm" type="button" data-reopen="${index}">Re-open trade</button></article>`).join('')}</div>` : '<p class="kt-muted">Your next graded trade will be saved here.</p>';
  } else {
    title = 'Share the verdict';
    shareCanvas = buildShareCanvas(trade);
    content = `<img class="kt-share-preview" src="${shareCanvas.toDataURL('image/png')}" alt="Broadcast-style trade grade"><div class="kt-share-actions"><button class="kt-btn kt-btn-primary" type="button" data-download-share>Download</button><button class="kt-btn" type="button" data-copy-share>Copy image</button></div>`;
  }
  panel.querySelector('.kt-trade-panel-content').innerHTML = `<div class="kt-trade-panel-head"><h2>${title}</h2><button class="kt-btn kt-btn-ghost kt-icon-btn" type="button" data-close-panel aria-label="Close panel">×</button></div>${content}`;
  panel.hidden = false;
  document.body.style.overflow = 'hidden';
  panel.querySelector('[data-close-panel]').addEventListener('click', closePanel);
  panel.querySelector('[data-close-panel]').focus();
  panel.querySelectorAll('[data-reopen]').forEach(button => button.addEventListener('click', () => {
    const entry = history()[Number(button.dataset.reopen)];
    engine.state.sides = structuredClone(entry.sides);
    engine.render('A');
    engine.render('B');
    closePanel();
  }));
  panel.querySelector('[data-download-share]')?.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `keeper-trade-${kind}-${Date.now()}.png`;
    link.href = shareCanvas.toDataURL('image/png');
    link.click();
  });
  panel.querySelector('[data-copy-share]')?.addEventListener('click', async event => {
    try {
      const blob = await new Promise(resolve => shareCanvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      event.target.textContent = 'Copied';
    } catch (_) {
      const link = document.createElement('a');
      link.download = `keeper-trade-${kind}.png`;
      link.href = shareCanvas.toDataURL('image/png');
      link.click();
      event.target.textContent = 'Downloaded';
    }
  });
}

function closePanel() {
  panel.hidden = true;
  document.body.style.removeProperty('overflow');
  returnFocus?.focus();
}

function buildShareCanvas(trade) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 675;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 1200, 675);
  gradient.addColorStop(0, '#111827');
  gradient.addColorStop(1, '#07101f');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1200, 675);
  context.fillStyle = '#c6ff4a';
  context.fillRect(0, 0, 1200, 12);
  context.font = '700 26px Arial';
  context.fillText('KEEPER TRADE · TRADE DESK', 55, 70);
  context.fillStyle = '#f4f7fb';
  context.font = '800 64px Arial';
  context.fillText(trade.verdict.toUpperCase(), 55, 150);
  const names = trade.names || ['Team A', 'Team B'];
  const sides = [trade.sides.A, trade.sides.B];
  sides.forEach((players, side) => {
    const x = side ? 630 : 55;
    context.fillStyle = '#8190a8';
    context.font = '700 20px Arial';
    context.fillText(side ? names[1] : names[0], x, 220);
    context.fillStyle = '#c6ff4a';
    context.font = '700 46px Arial';
    context.fillText(displayValue(side ? trade.totals.B : trade.totals.A), x, 275);
    let y = 330;
    players.slice(0, 4).forEach(entry => {
      context.fillStyle = '#f4f7fb';
      context.font = '24px Arial';
      context.fillText((entry.ref.name || entry.ref.n), x, y);
      context.fillStyle = '#a9b7cc';
      context.textAlign = 'right';
      context.fillText(displayValue(engine.adjustedValue(entry)), x + 500, y);
      context.textAlign = 'left';
      y += 52;
    });
    if (players.length > 4) {
      context.fillStyle = '#8190a8';
      context.fillText(`+ ${players.length - 4} more assets`, x, y);
    }
  });
  context.fillStyle = '#8190a8';
  context.font = '20px Arial';
  context.fillText(kind === 'keeper' ? 'Keeper-adjusted value · 1,000-point auto-approval rule' : 'League-adjusted trade value', 55, 625);
  return canvas;
}

function mountPanel() {
  document.body.insertAdjacentHTML('beforeend', '<div class="kt-trade-panel-shell" hidden><div class="kt-trade-panel-backdrop" data-close-panel></div><aside class="kt-trade-panel" role="dialog" aria-modal="true" aria-label="Trade details"><div class="kt-trade-panel-content"></div></aside></div>');
  panel = document.querySelector('.kt-trade-panel-shell');
  panel.querySelector('[data-close-panel]').addEventListener('click', closePanel);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) closePanel();
    if (event.key === 'Tab' && !panel.hidden) {
      const buttons = [...panel.querySelectorAll('button')];
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
    }
  });
  document.querySelector('[data-open-history]').addEventListener('click', () => openPanel('history'));
  document.querySelector('[data-open-breakdown]').addEventListener('click', () => openPanel('breakdown'));
  document.querySelector('[data-open-share]').addEventListener('click', () => openPanel('share'));
}

function loadPendingTrade() {
  if (kind !== 'keeper' || !new URLSearchParams(window.location.search).has('fromLeague')) return;
  let pending;
  try { pending = JSON.parse(localStorage.getItem('kt-pending-trade:v1')); } catch (_) {}
  if (!pending?.sides) return;
  let uid = Date.now();
  ['A', 'B'].forEach(side => {
    engine.state.sides[side] = pending.sides[side].map(asset => {
      const entry = { uid: uid++, ref: asset.ref, mv: asset.mv, cost: 0, mvEdited: false };
      engine.setMarketValue(entry, asset.ref.pick ? engine.assetValue(asset.ref) : asset.mv);
      return entry;
    });
    engine.render(side);
  });
  const badge = document.querySelector('#dealer-status');
  if (badge) badge.textContent = `${pending.origin || 'Sleeper'} · Trade wire`;
  try { localStorage.removeItem('kt-pending-trade:v1'); } catch (_) {}
}

function subscribeDealer() {
  dealerUnsubscribe?.();
  const settings = kind === 'redraft' ? { format: engine.state.format, scoring: engine.state.ppr === '1' ? 'ppr' : undefined, superflex: engine.state.qb === '2' } : {};
  dealerUnsubscribe = liveData.subscribe(dealerSource(settings), ({ data, status }) => {
    const players = normalizeDealerPlayers(data);
    const badge = document.querySelector('#dealer-status');
    if (badge) badge.textContent = status === 'stale' ? 'Dynasty Dealer · Cached 24h' : 'Dynasty Dealer · Live values';
    if (!players.length) return;
    const byName = new Map(players.map(player => [player.name.toLowerCase(), player]));
    ['A', 'B'].forEach(side => {
      engine.state.sides[side].forEach(entry => {
        const player = byName.get((entry.ref.name || entry.ref.n).toLowerCase());
        if (player) engine.setMarketValue(entry, kind === 'keeper' ? player.value / 100 : player.value);
      });
      engine.render(side);
    });
  });
}

if (engine) {
  document.body.classList.add('trade-desk-body');
  mountNavigation({ active: kind === 'keeper' ? 'trade' : 'redraft' });
  mountPageTransitions();
  mountHero();
  mountGauge();
  mountDrag();
  mountMobileSearch();
  mountPanel();
  loadPendingTrade();
  subscribeDealer();
  document.querySelectorAll('.settings .seg').forEach(segment => segment.addEventListener('click', () => window.setTimeout(subscribeDealer, 0)));
  window.addEventListener('kt:trade-graded', event => updateVerdict(event.detail));
}
