// Page-to-page motion is handled natively by `@view-transition { navigation: auto; }` in navigation.css.
// This module used to hide <body> until scripts ran and delayed every link click by 160ms; both made the
// site feel slow, so it now only marks the page ready (kept for callers and any CSS hooks).
export function mountPageTransitions() {
  const reveal = () => document.body.classList.add('kt-page-ready');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reveal, { once: true });
  else reveal();
  window.addEventListener('pageshow', reveal);
}
