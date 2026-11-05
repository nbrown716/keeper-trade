import { mountNavigation } from '../ui/navigation.js?v=2';
import { mountPageTransitions } from '../ui/page-transitions.js';
import { openCommandPalette } from '../ui/command-palette.js?v=6';

mountNavigation({ active: 'more' });
mountPageTransitions();
window.addEventListener('kt:command-close', () => { window.location.href = 'index.html'; });
openCommandPalette();
