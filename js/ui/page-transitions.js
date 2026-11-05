export function mountPageTransitions() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reveal = () => {
    document.body.classList.remove('kt-page-leaving');
    requestAnimationFrame(() => document.body.classList.add('kt-page-ready'));
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reveal, { once: true });
  else reveal();
  window.addEventListener('pageshow', reveal);

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target || link.hasAttribute('download') || link.dataset.noTransition !== undefined) return;
    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin || !['http:', 'https:'].includes(destination.protocol)) return;
    const current = new URL(window.location.href);
    if (destination.pathname === current.pathname && destination.search === current.search && destination.hash) return;
    if (destination.href === current.href) return;

    event.preventDefault();
    if (reducedMotion.matches) {
      window.location.href = destination.href;
      return;
    }
    document.body.classList.add('kt-page-leaving');
    window.setTimeout(() => { window.location.href = destination.href; }, 160);
  });
}
