import { trackAction } from './gamification.js';

let lastSignature = '';
window.addEventListener('kt:trade-graded', event => {
  const signature = event.detail?.signature;
  if (!signature || signature === lastSignature) return;
  lastSignature = signature;
  trackAction('trade', { page: document.title.includes('Redraft') ? 'Redraft Calculator' : 'Keeper Calculator' });
});
