// Scoring format bar (Rankings, Keeper + Dynasty calculators, Trade Value Chart).
//   NON-PPR  HALF-PPR  PPR  TEP  MY LEAGUE      [Pass TD 4 | 6]   [1QB | Superflex]
// Connected Sleeper league: "My league" is on by default and every control shows the league's real settings.
// Not connected: the chips choose the format and "My league" links to connecting one.
// One choice for the whole site (localStorage kt-format:v1); pages re-price on 'kt:format-change'.
import { getActiveFormat, saveChoice, readChoice, formatLabel, PRESETS } from '../data/scoring-format.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function presetOf(format) {
  if (format.rec === 0) return 'std';
  if (format.rec === 0.5) return 'half';
  if (format.tep > 0) return 'tep';
  return 'ppr';
}

export function mountFormatBar(host, { onChange, showSf = true, showPassTd = true, connectHref = 'index.html#league' } = {}) {
  if (!host) return null;
  let current = null;
  host.classList.add('kt-fmt');
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', 'Scoring format');

  function render(format) {
    current = format;
    const usingLeague = format.source === 'league';
    const preset = usingLeague ? null : (readChoice()?.preset || presetOf(format));
    const league = format.leagueFormat;
    const chip = (key, label) => `<button type="button" class="kt-fmt-chip" data-preset="${key}" aria-pressed="${preset === key}">${label}</button>`;
    const seg = (name, value, label, on) => `<button type="button" data-${name}="${value}" aria-pressed="${on}">${label}</button>`;
    host.innerHTML = `
      <div class="kt-fmt-row">
        <div class="kt-fmt-chips">
          ${Object.entries(PRESETS).map(([key, p]) => chip(key, p.label)).join('')}
          <button type="button" class="kt-fmt-chip kt-fmt-league" data-preset="league" aria-pressed="${usingLeague}" ${league ? '' : 'data-connect="1"'}>${league ? 'My league' : 'Use my league'}<span aria-hidden="true">${league ? '' : ' ▾'}</span></button>
        </div>
        <div class="kt-fmt-segs">
          ${showPassTd ? `<div class="kt-fmt-seg" role="group" aria-label="Passing TD points"><span class="kt-fmt-seg-label">Pass TD</span>${seg('passtd', 4, '4 pt', format.passTd === 4)}${seg('passtd', 6, '6 pt', format.passTd === 6)}</div>` : ''}
          ${showSf ? `<div class="kt-fmt-seg" role="group" aria-label="Quarterbacks">${seg('sf', 0, '1QB', !format.sf)}${seg('sf', 1, 'Superflex', format.sf)}</div>` : ''}
        </div>
      </div>
      <p class="kt-fmt-note" aria-live="polite">${usingLeague
        ? `<span class="kt-fmt-dot is-synced"></span>Synced to <b>${escapeHtml(format.leagueName)}</b>: ${escapeHtml(formatLabel(format))}`
        : league
          ? `<span class="kt-fmt-dot"></span>Showing <b>${escapeHtml(formatLabel(format))}</b>. Your league is ${escapeHtml(formatLabel(league))}. <button type="button" class="kt-fmt-link" data-preset="league">Use my league</button>`
          : `<span class="kt-fmt-dot is-off"></span>No league synced. Showing <b>${escapeHtml(formatLabel(format))}</b>. <a class="kt-fmt-link" href="${escapeHtml(connectHref)}">Connect your league</a> to price everything in its exact scoring.`}</p>`;
  }

  async function refresh(notify) {
    const format = await getActiveFormat();
    render(format);
    if (notify) onChange?.(format);
    return format;
  }

  host.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !current) return;
    if (button.dataset.connect) { window.location.href = connectHref; return; }
    const base = current.source === 'league' ? { preset: presetOf(current), passTd: current.passTd, sf: current.sf } : { preset: readChoice()?.preset || presetOf(current), passTd: current.passTd, sf: current.sf };
    if (button.dataset.preset === 'league') saveChoice(null);
    else if (button.dataset.preset) saveChoice({ ...base, preset: button.dataset.preset });
    else if (button.dataset.passtd) saveChoice({ ...base, passTd: Number(button.dataset.passtd) });
    else if (button.dataset.sf) saveChoice({ ...base, sf: button.dataset.sf === '1' });
    else return;
    try { navigator.vibrate?.(8); } catch (_) {}
  });
  window.addEventListener('kt:format-change', () => refresh(true));
  window.addEventListener('storage', event => { if (event.key === 'kt-format:v1') refresh(true); });
  return { ready: refresh(false), get format() { return current; } };
}
