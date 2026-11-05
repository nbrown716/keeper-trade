import { trackAction } from './gamification.js';

const player = new URLSearchParams(window.location.search).get('player');
let previous = '';
try { previous = sessionStorage.getItem('kt-last-player') || ''; } catch (_) {}
if (player && previous && previous !== player) trackAction('compare', { page: 'Research' });
else trackAction('research', { page: 'Research' });
if (player) {
  try { sessionStorage.setItem('kt-last-player', player); } catch (_) {}
}
