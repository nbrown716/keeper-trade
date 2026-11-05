# Prompt 06 — Trade Calculator Glow-Up ⚠️ SACRED MATH

> Read AGENTS.md (especially Sacred Rule #1), NOTES.md, design system first. This rebuilds the INTERFACE ONLY around the existing calculators — keeper cost escalation and the 1,000-point auto-approval rule must remain bit-for-bit identical. Study the existing calculator files before writing any code. If anything is ambiguous about the math, STOP and ask.

Rebuild the KEEPER TRADE CALCULATOR and REDRAFT CALCULATOR interfaces (keep existing calculation logic: 1,000-pt auto-approval, keeper cost escalation, PPR tiers, superflex, TE premium, package adjust).

## EXPERIENCE
- Two-sided "trade desk" layout: My Side vs Their Side — a proper war room. Player chips with headshot-style avatars (initials + team colors if no image). Drag players between sides on desktop; tap-to-add with a bottom-sheet player search (fuzzy, debounced, keyboard-first) on mobile.
- Live verdict gauge: a big animated dial/bar showing value balance that sweeps as players are added, with the auto-approval threshold marked. Crossing it triggers a satisfying green "AUTO-APPROVED" state (haptic + glow + stamp animation). Lopsided trades get a tasteful red warning with humor, not shame.
- Value breakdown drawer: per-player value, keeper cost, escalation math as clean line items — transparent and auditable.
- Share card: generate a canvas image of the graded trade (both sides, verdict, values) styled like a broadcast graphic — downloadable/copyable for the league group chat.
- Trade history: locally stored log of graded trades with re-open.
- Skeleton loaders everywhere async; optimistic UI on every interaction.

## DATA WIRING
Integrate live player values from the free Dynasty Dealer API (CORS-enabled, no key): GET https://www.dynastydealer.com/api/player-values (use current_value; supports ?position= and ?format=redraft&scoring=ppr&sf=true) — behind a clean adapter interface so the source can be swapped later. Cache values 24h.

## DELIVERABLES
Complete rebuilt calculators. This is the crown jewel — Bloomberg terminal for fantasy trades. Update NOTES.md.
