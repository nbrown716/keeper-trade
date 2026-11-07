import { icon } from './icons.js';
import { mountCommandPalette } from './command-palette.js';

const destinations = [
  { id: 'home', label: 'Home', url: 'index.html', icon: 'home' },
  { id: 'scores', label: 'Scores', url: 'sunday.html', icon: 'scores' },
  { id: 'trade', label: 'Trade', url: 'keeper.html', icon: 'trade' },
  { id: 'research', label: 'Research', url: 'research.html', icon: 'research' },
  { id: 'more', label: 'More', icon: 'more' }
];

function updateThemeButton(theme) {
  const button = document.querySelector('.kt-theme-toggle');
  if (!button) return;
  const next = theme === 'dark' ? 'light' : 'dark';
  button.setAttribute('aria-label', `Switch to ${next} theme`);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0f1a' : '#f2f5f9');
}

export function mountNavigation({ active = 'home' } = {}) {
  if (document.querySelector('[data-site-header]')) return;
  const pageLinks = [
    ['home', 'Home', 'index.html'],
    ['scores', 'Sunday', 'sunday.html'],
    ['war', 'War Room', 'war-room.html'],
    ['draft', 'Mock Draft', 'mock-draft.html'],
    ['sim', 'Season Sim', 'season-sim.html'],
    ['pulse', 'Pulse', 'pulse.html'],
    ['weather', 'Weather', 'weather.html'],
    ['trade', 'Keeper', 'keeper.html'],
    ['redraft', 'Redraft', 'redraft.html'],
    ['rankings', 'Rankings', 'rankings.html'],
    ['research', 'Research', 'research.html'],
    ['league', 'League', 'index.html#league'],
    ['tools', 'Tools', 'tools.html']
  ];
  const activeIndex = destinations.findIndex(destination => destination.id === active);
  const activeTab = activeIndex >= 0 ? activeIndex : destinations.findIndex(destination => destination.id === 'more');

  document.body.insertAdjacentHTML('afterbegin', `<header class="kt-site-header" data-site-header><div class="kt-container kt-site-header-inner"><a class="kt-site-brand" href="index.html" aria-label="Keeper Trade home"><span class="kt-site-mark" aria-hidden="true">KT</span><span>Keeper <em>Trade</em></span></a><nav class="kt-desktop-nav" aria-label="Primary navigation">${pageLinks.map(([id, label, url]) => `<a href="${url}"${id === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav><div class="kt-header-actions"><a class="kt-btn kt-btn-ghost kt-command-trigger" href="command.html" data-command-open aria-label="Open command palette">${icon('search')}<span>Search anything</span><kbd class="kt-key">⌘K</kbd></a><button class="kt-btn kt-btn-ghost kt-icon-btn kt-theme-toggle" type="button" aria-label="Switch color theme">${icon('sun')}</button></div></div></header>`);

  document.body.insertAdjacentHTML('beforeend', `<nav class="kt-bottom-nav kt-site-tabs" aria-label="Mobile navigation" style="--kt-active-tab:${activeTab}"><span class="kt-tab-indicator" aria-hidden="true"></span>${destinations.map((destination, index) => {
    const current = destination.id === active ? ' aria-current="page"' : '';
    // The tab under the indicator reads as active (accent), including "More" for pages that live in it.
    const highlighted = index === activeTab ? ' is-active' : '';
    const content = `${icon(destination.icon)}<span>${destination.label}</span>`;
    return destination.id === 'more'
      ? `<a class="kt-site-tab${highlighted}" href="command.html" data-command-open aria-label="More — open command palette"${current}>${content}</a>`
      : `<a class="kt-site-tab${destination.id === 'trade' ? ' kt-site-tab-trade' : ''}${highlighted}" href="${destination.url}"${current}>${content}</a>`;
  }).join('')}</nav>`);

  document.querySelectorAll('[data-command-open]').forEach(link => {
    link.addEventListener('click', event => {
      if (window.matchMedia('(max-width: 48rem)').matches) return;
      event.preventDefault();
      window.dispatchEvent(new Event('kt:command'));
    });
  });
  document.querySelector('.kt-theme-toggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('gi-theme', theme); } catch (_) {}
    updateThemeButton(theme);
    if (window.matchMedia('(pointer:coarse)').matches && 'vibrate' in navigator && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate(8);
  });
  window.addEventListener('kt:theme-change', event => updateThemeButton(event.detail.theme));
  updateThemeButton(document.documentElement.dataset.theme || 'dark');
  mountCommandPalette();
}
