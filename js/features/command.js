import { mountNavigation } from '../ui/navigation.js';
import { mountPageTransitions } from '../ui/page-transitions.js';
import { openCommandPalette } from '../ui/command-palette.js';

mountNavigation({ active: 'more' });
mountPageTransitions();
window.addEventListener('kt:command-close', () => { window.location.href = 'index.html'; });
openCommandPalette();
