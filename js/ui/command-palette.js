import { icon } from './icons.js';

const pages = [
  { id: 'home', type: 'Pages', title: 'Home', meta: 'Your fantasy command center', icon: 'home', url: 'index.html', keywords: 'scores dashboard' },
  { id: 'keeper', type: 'Pages', title: 'Keeper Trade Calculator', meta: 'Keeper costs, escalation, and the 1,000-point rule', icon: 'keeper', url: 'keeper.html', keywords: 'trade dynasty league' },
  { id: 'redraft', type: 'Pages', title: 'Redraft Trade Calculator', meta: 'Redraft and dynasty values with league settings', icon: 'trade', url: 'redraft.html', keywords: 'trade ppr superflex' },
  { id: 'rankings', type: 'Pages', title: 'Rankings', meta: 'Keeper, redraft, and dynasty boards', icon: 'rankings', url: 'rankings.html', keywords: 'players values' },
  { id: 'research', type: 'Pages', title: 'Research Hub', meta: 'Player profiles, stats, standings, and news', icon: 'research', url: 'research.html', keywords: 'wire news stats' },
  { id: 'league', type: 'Pages', title: 'League Mode', meta: 'Sleeper rosters, standings, matchups, and trade wire', icon: 'spark', url: 'index.html#league', keywords: 'sleeper roster league' },
  { id: 'drive', type: 'Pages', title: 'The Drive', meta: 'Your cinematic weekly recap', icon: 'spark', url: 'drive.html', keywords: 'recap film replay week map' },
  { id: 'sunday', type: 'Pages', title: 'Sunday Command Center', meta: 'Every game and every fantasy stake', icon: 'scores', url: 'sunday.html', keywords: 'live scores red zone fantasy' },
  { id: 'war-room', type: 'Pages', title: 'The War Room', meta: 'AI Start/Sit, waivers, and trade counters', icon: 'spark', url: 'war-room.html', keywords: 'ai oracle waiver counter sonnet' },
  { id: 'mock-draft', type: 'Pages', title: 'Mock Draft Arena', meta: 'Snake draft against 11 AI personalities', icon: 'spark', url: 'mock-draft.html', keywords: 'draft simulator mock claude' },
  { id: 'season-sim', type: 'Pages', title: 'Season Sim', meta: 'Monte Carlo playoff odds and what-if scenarios', icon: 'spark', url: 'season-sim.html', keywords: 'playoffs monte carlo odds simulation magic number' },
  { id: 'pulse', type: 'Pages', title: 'League Pulse', meta: 'Storylines, awards, newsletter, trophies, and records', icon: 'news', url: 'pulse.html', keywords: 'league stories commissioner awards record book' },
  { id: 'deals', type: 'Pages', title: 'Deals', meta: 'Call your league’s real trades, then see the model’s read, market and team values', icon: 'spark', url: 'deals.html', keywords: 'trades vote call market risers fallers team values binder record trade database' },
  { id: 'wrapped', type: 'Pages', title: 'Season Wrapped', meta: 'Your season as a story: record, luck, MVP, Lineup IQ, trades, rivals', icon: 'spark', url: 'wrapped.html', keywords: 'wrapped recap season story year review archetype' },
  { id: 'weather', type: 'Pages', title: 'Weather Center', meta: 'Thursday-to-Monday kickoff weather for every game', icon: 'spark', url: 'weather.html', keywords: 'wind rain snow forecast cold' },
  { id: 'tools', type: 'Pages', title: 'Tools', meta: 'Draft-pick values and depth charts', icon: 'tools', url: 'tools.html', keywords: 'picks teams' }
];

const actions = [
  { id: 'new-trade', type: 'Actions', title: 'Start a keeper trade', meta: 'Open the trade desk', icon: 'trade', url: 'keeper.html', keywords: 'new calculate' },
  { id: 'theme', type: 'Actions', title: 'Toggle color theme', meta: 'Switch between dark and light mode', icon: 'sun', action: 'toggle-theme', keywords: 'dark light appearance' }
];

const players = [
  { id: 'jahmyr-gibbs', title: 'Jahmyr Gibbs', meta: 'RB · Detroit Lions', position: 'RB' },
  { id: 'jaxon-smith-njigba', title: 'Jaxon Smith-Njigba', meta: 'WR · Seattle Seahawks', position: 'WR' },
  { id: 'drake-london', title: 'Drake London', meta: 'WR · Atlanta Falcons', position: 'WR' },
  { id: 'jayden-daniels', title: 'Jayden Daniels', meta: 'QB · Washington Commanders', position: 'QB' },
  { id: 'bijan-robinson', title: 'Bijan Robinson', meta: 'RB · Atlanta Falcons', position: 'RB' },
  { id: 'justin-jefferson', title: 'Justin Jefferson', meta: 'WR · Minnesota Vikings', position: 'WR' },
  { id: 'ceedee-lamb', title: 'CeeDee Lamb', meta: 'WR · Dallas Cowboys', position: 'WR' },
  { id: 'brock-bowers', title: 'Brock Bowers', meta: 'TE · Las Vegas Raiders', position: 'TE' },
  { id: 'puka-nacua', title: 'Puka Nacua', meta: 'WR · Los Angeles Rams', position: 'WR' },
  { id: 'josh-allen', title: 'Josh Allen', meta: 'QB · Buffalo Bills', position: 'QB' }
].map(player => ({ ...player, type: 'Players', icon: player.position, url: `research.html?player=${player.id}`, keywords: player.meta }));

let shell;
let dialog;
let input;
let results;
let activeIndex = 0;
let visibleItems = [];
let returnFocus;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function fuzzyMatch(query, item) {
  const needle = query.toLowerCase().trim();
  const title = item.title.toLowerCase();
  const haystack = `${item.title} ${item.meta} ${item.keywords || ''}`.toLowerCase();
  if (!needle) return { score: 0, indices: [] };
  if (title === needle) return { score: 1000, indices: [...title].map((_, index) => index) };
  if (title.startsWith(needle)) return { score: 800 - title.length, indices: [...needle].map((_, index) => index) };
  const titleIndex = title.indexOf(needle);
  if (titleIndex >= 0) return { score: 600 - titleIndex, indices: [...needle].map((_, index) => titleIndex + index) };
  if (haystack.includes(needle)) return { score: 350, indices: [] };

  let score = 100;
  let previous = -1;
  const indices = [];
  for (const character of needle) {
    if (character === ' ') { score += 2; continue; }
    const index = title.indexOf(character, previous + 1);
    if (index < 0) return null;
    indices.push(index);
    score += index === previous + 1 ? 8 : 2;
    score -= Math.min(index - previous - 1, 5);
    previous = index;
  }
  return { score, indices };
}

function highlight(title, indices) {
  const matches = new Set(indices);
  return [...title].map((character, index) => matches.has(index) ? `<mark>${escapeHtml(character)}</mark>` : escapeHtml(character)).join('');
}

function closeCommandPalette() {
  if (!shell || shell.hidden) return;
  shell.hidden = true;
  document.body.style.removeProperty('overflow');
  returnFocus?.focus();
  window.dispatchEvent(new Event('kt:command-close'));
}

function activate(item) {
  if (!item) return;
  closeCommandPalette();
  if (item.action === 'toggle-theme') {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('gi-theme', next); } catch (_) {}
    window.dispatchEvent(new CustomEvent('kt:theme-change', { detail: { theme: next } }));
  } else if (item.url) {
    window.location.href = item.url;
  }
}

function setActive(index) {
  if (!visibleItems.length) return;
  activeIndex = (index + visibleItems.length) % visibleItems.length;
  results.querySelectorAll('.kt-command-option').forEach((option, optionIndex) => {
    option.setAttribute('aria-selected', String(optionIndex === activeIndex));
  });
  const active = results.querySelector(`[data-index="${activeIndex}"]`);
  input.setAttribute('aria-activedescendant', active?.id || '');
  active?.scrollIntoView({ block: 'nearest' });
}

function render() {
  const query = input.value;
  const matches = [...pages, ...actions, ...players]
    .map(item => ({ item, match: fuzzyMatch(query, item) }))
    .filter(entry => entry.match)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, query ? 12 : 9);
  visibleItems = matches.map(entry => entry.item);
  activeIndex = 0;

  if (!matches.length) {
    results.innerHTML = `<div class="kt-command-empty">No players, pages, or actions match “${escapeHtml(query)}”.<br><span class="kt-subtle">Try a name, team, or destination.</span></div>`;
    input.removeAttribute('aria-activedescendant');
    return;
  }

  let previousGroup = '';
  results.innerHTML = matches.map(({ item, match }, index) => {
    const group = item.type !== previousGroup ? `<div class="kt-command-group" role="presentation">${item.type}</div>` : '';
    previousGroup = item.type;
    return `${group}<button class="kt-command-option" id="kt-command-option-${index}" type="button" role="option" aria-selected="${index === 0}" data-index="${index}"><span class="kt-command-option-icon">${item.type === 'Players' ? escapeHtml(item.position) : icon(item.icon)}</span><span class="kt-command-option-copy"><span class="kt-command-option-title">${highlight(item.title, match.indices)}</span><span class="kt-command-option-meta">${escapeHtml(item.meta)}</span></span><span class="kt-command-option-enter">↵</span></button>`;
  }).join('');

  results.querySelectorAll('.kt-command-option').forEach(option => {
    option.addEventListener('pointerup', event => {
      event.preventDefault();
      activate(visibleItems[Number(option.dataset.index)]);
    });
    option.addEventListener('pointermove', () => setActive(Number(option.dataset.index)), { passive: true });
  });
  setActive(0);
}

function trapFocus(event) {
  if (event.key !== 'Tab') return;
  const focusable = [...dialog.querySelectorAll('button:not(:disabled), input, [tabindex="0"]')];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

export function openCommandPalette() {
  if (!shell) return;
  if (!shell.hidden) { input.focus(); return; }
  returnFocus = document.activeElement;
  shell.hidden = false;
  document.body.style.overflow = 'hidden';
  input.value = '';
  render();
  if (!window.matchMedia('(pointer: coarse)').matches) input.focus();
}

export function mountCommandPalette() {
  if (shell) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="kt-command-shell" hidden><div class="kt-command-backdrop" aria-hidden="true"></div><section class="kt-command-dialog" role="dialog" aria-modal="true" aria-label="Command palette"><div class="kt-command-search">${icon('search')}<input class="kt-command-input" type="search" placeholder="Search players, pages, and actions…" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="kt-command-results"><button class="kt-btn kt-btn-ghost kt-icon-btn" type="button" aria-label="Close command palette" data-command-close>${icon('close')}</button></div><div class="kt-command-results" id="kt-command-results" role="listbox" aria-label="Search results"></div><div class="kt-command-footer"><span><kbd class="kt-key">↑</kbd><kbd class="kt-key">↓</kbd> navigate</span><span><kbd class="kt-key">↵</kbd> open</span><span><kbd class="kt-key">esc</kbd> close</span><span class="kt-command-hint">Keeper Trade</span></div></section></div>`);
  shell = document.querySelector('.kt-command-shell');
  dialog = shell.querySelector('.kt-command-dialog');
  input = dialog.querySelector('.kt-command-input');
  results = dialog.querySelector('.kt-command-results');

  input.addEventListener('input', render);
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(activeIndex + 1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(activeIndex - 1); }
    if (event.key === 'Enter') { event.preventDefault(); activate(visibleItems[activeIndex]); }
  });
  shell.querySelectorAll('[data-command-close]').forEach(button => button.addEventListener('click', closeCommandPalette));
  dialog.addEventListener('keydown', trapFocus);
  document.addEventListener('keydown', event => {
    const target = event.target;
    const editing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if (event.key === 'Escape' && !shell.hidden) {
      event.preventDefault();
      closeCommandPalette();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      shell.hidden ? openCommandPalette() : closeCommandPalette();
    } else if (event.key === '/' && !editing && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      openCommandPalette();
    }
  });
  window.addEventListener('kt:command', () => openCommandPalette());
}
