// Mounts the shared Keeper Trade navigation on pages that predate the design system (see css/kt-shell.css).
// Usage: <body class="kt-shell-body" data-kt-active="tools"> + <script type="module" src="js/ui/kt-shell.js">.
import { mountNavigation } from './navigation.js';
import { mountPageTransitions } from './page-transitions.js';

mountNavigation({ active: document.body.dataset.ktActive || 'home' });
mountPageTransitions();
