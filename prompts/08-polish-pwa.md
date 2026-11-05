# Prompt 08 — Polish, Performance & Ship-It Pass

> Read AGENTS.md, NOTES.md first. This is a whole-site quality pass over everything built so far.

1. PERFORMANCE AUDIT: 60fps everywhere (transform/opacity-only animations, will-change hygiene), lazy-load below-fold modules, IntersectionObserver reveals, debounced resize/scroll handlers, passive listeners, minimal reflows. Total payload diet.
2. ACCESSIBILITY: full keyboard walkthrough, focus traps in modals/palette, aria-live="polite" on the ticker and live scores, reduced-motion fallbacks, contrast check, 44px hit-target audit.
3. POLISH THE DETAILS: custom scrollbar, selection color, favicon + PWA manifest (installable, offline shell via service worker), meta/OG tags with a slick share image, 404 page with personality, page titles that update with live scores ("KC 24–21 BUF · Keeper Trade") during games.
4. MICROCOPY: rewrite all UI text with a confident, fun, league-insider voice. Empty states, errors, toasts — everything has personality.
5. EASTER EGGS: a konami-code-style surprise, a hidden "commissioner mode," funny loading quips. Small things leaguemates will discover and screenshot.
6. Final QA checklist + update NOTES.md with the full architecture summary.

## DELIVERABLES
All polish diffs + PWA additions + QA checklist. Update NOTES.md.
