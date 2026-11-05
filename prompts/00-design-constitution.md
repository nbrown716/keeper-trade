# Prompt 00 — The Design Constitution

> Role: world-class product designer + front-end engineer (ESPN / DraftKings / Apple pedigree). Read AGENTS.md and NOTES.md first.

You are redesigning "Keeper Trade," a fantasy football keeper-league site (static, vanilla HTML/CSS/JS, GitHub Pages, no build step). The site has: a keeper trade calculator (keeper cost escalation + 1,000-point auto-approval rule), a redraft/dynasty trade calculator (PPR tiers, superflex, TE premium, package adjust), a research hub, rankings boards, and tools (draft-pick value chart, depth charts).

GOAL: make it feel like ESPN + theScore + DraftKings/FanDuel + Duolingo + Apple had a baby. Leaguemates should open it daily just because using it feels incredible.

Before touching any feature page, establish THE DESIGN CONSTITUTION — a single `css/design-system.css` plus a short written spec that every later prompt will follow:

## 1. VISUAL IDENTITY
- Dark mode FIRST and default (deep navy/charcoal base, #0B0F1A family), with optional light mode. Bold NFL team colors as accent energy — sparingly, so they feel electric, not noisy.
- One primary brand accent (electric green/volt — the "winning" color) + one secondary (cool blue). Semantic tokens: --surface-1/2/3, --text-primary/secondary, --accent, --success, --danger, --live (pulsing red for LIVE states).
- Typography: one condensed display font for scores/numbers (tabular-nums always for stats so digits never jitter), one clean sans for UI. Clear hierarchy: hero numbers huge, labels small-caps with letter-spacing.
- Glassmorphism with restraint: frosted cards (backdrop-filter blur + subtle 1px borders + soft inner glow) on elevated surfaces only.
- 8px spacing grid, generous white space, min 44px tap targets, one-handed mobile-first layouts, bottom navigation on mobile.

## 2. MOTION LANGUAGE (what makes it feel elite)
- Physics-based motion: springs over linear easings. Snappy, never bouncy-cheap.
- Duration scale: micro (100–200ms hover/press), standard (250–400ms transitions), hero (500–800ms page/score moments).
- Every interactive element gets: hover lift, press-down scale (0.97), satisfying release. Cards tilt subtly toward the cursor on desktop.
- Staggered entrance animations for lists and cards (30–50ms offsets).
- Numbers COUNT UP when they change (scores, trade values) with easing.
- Skeleton loaders (shimmering placeholder shapes) for ALL async content — spinners are banned.
- Respect prefers-reduced-motion: full graceful fallback.
- GSAP via CDN for scroll/timeline choreography and score-moment animations; CSS transitions for micro-interactions. Keep it static-host friendly.

## 3. TACTILE & SENSORY DELIGHT
- navigator.vibrate() haptic patterns on mobile: light tick on tap, double-pulse on a touchdown/score change, satisfying thud on trade submit.
- Optional subtle sound design (muteable, off by default).
- Score changes anywhere on screen trigger a pulse-glow on the changed number (green flash good, red bad) decaying over ~1.5s.

## 4. UX PRINCIPLES (non-negotiable)
- Every screen has ONE obvious primary action.
- Instant feedback: no action unacknowledged (toasts, haptics, state changes within 100ms).
- Zero-friction flows: everything reachable in ≤2 taps from home.
- Accessibility: WCAG AA contrast, focus-visible styles, aria-live regions for live scores, full keyboard navigation.
- Performance: animations at 60fps (transform/opacity only); total JS under ~200KB.

## DELIVERABLES
1. `css/design-system.css` — all tokens, base component classes (buttons, cards, chips, badges, toasts, skeletons, ticker, bottom-nav), utility animation classes. Production-quality, commented.
2. A `demo.html` page showing every component and animation so the owner can review the look and feel in a browser.
Then STOP — the next brief comes separately.
