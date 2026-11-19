// Phone search sheets (Keeper, Redraft and Dynasty calculators).
//
// Why this exists (owner report, 11/19, iPhone): the old phone search pinned its results to the BOTTOM of the
// screen, which is where the keyboard is, so names sat under the keyboard and could not be scrolled. It also pinned
// both teams' search boxes to the same spot, so Team B's empty box covered the one being typed in.
//
// The fix has one rule: a search sheet is laid out from the TOP down, and stops where the keyboard starts.
// iOS does not shrink the page for the keyboard; only window.visualViewport knows the visible area. This module
// keeps two CSS variables current so sheets can use them:
//   --kt-vv-top  how far iOS has scrolled the visible area down the page (usually 0)
//   --kt-kb      height covered by the keyboard (0 when it is closed)
const root = document.documentElement;
let tracking = false;

function measure() {
  const vv = window.visualViewport;
  const top = vv ? Math.max(0, vv.offsetTop) : 0;
  const keyboard = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  root.style.setProperty('--kt-vv-top', `${Math.round(top)}px`);
  root.style.setProperty('--kt-kb', `${Math.round(keyboard)}px`);
}

export function trackKeyboard() {
  measure();
  if (tracking) return;
  tracking = true;
  window.visualViewport?.addEventListener('resize', measure);
  window.visualViewport?.addEventListener('scroll', measure);
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('orientationchange', measure, { passive: true });
}

export const isPhone = () => window.matchMedia('(max-width: 48rem)').matches;

// The page behind a sheet must not scroll while the sheet is open.
export function lockScroll(locked) { root.classList.toggle('kt-sheet-open', locked); }

let toastTimer = 0;
export function toast(message) {
  let el = document.querySelector('.kt-sheet-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'kt-sheet-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('is-shown'), 2400);
  try { navigator.vibrate?.(10); } catch (_) {}
}

// Brief highlight on the row that was just added, so the eye lands on it.
export function flash(element) {
  if (!element) return;
  element.classList.remove('kt-just-added');
  void element.offsetWidth;
  element.classList.add('kt-just-added');
  window.setTimeout(() => element.classList.remove('kt-just-added'), 1600);
}
