# Prompt 01 — Homepage & Navigation Rebuild

> Read AGENTS.md, NOTES.md, and css/design-system.css first. Preserve the existing calculator logic — this task is homepage/nav only.

Using the Design Constitution, rebuild the homepage and global navigation.

## HOME
Replace the static link list with a living command center:
- Hero zone: "Your Edge On Draft Day & Every Trade" — but alive. Animated gradient mesh or subtle particle field behind it, headline with staggered word reveal, and a live "NOW" strip showing current NFL week, games-in-progress count, and trending players (stub the data behind clean functions; real data gets wired in later prompts).
- Feature cards for the 5 sections (Keeper Calculator, Redraft Calculator, Research Hub, Rankings, Tools): oversized glass cards with icon animations, hover tilt + lift, press physics, and a "NEW"/"LIVE" badge system. Each card shows one small live-data preview placeholder.
- A "For You" feed section skeleton that later prompts will fill.

## NAVIGATION
- Desktop: slim top bar with brand mark, section links with animated underline indicators, and a command-palette trigger (⌘K / Ctrl+K) — implement the command palette fully: fuzzy search across players, pages, and actions.
- Mobile: bottom tab bar (Home, Scores, Trade, Research, More) with animated active-tab indicator (sliding pill); center "Trade" button elevated and accented.
- Page transitions: shared-element style cross-fades, never hard cuts.

## IMPORTANT
- First, rename the existing homepage to `index-old.html` (preserve it as a fallback) and build the new one as `index.html`. Do not touch the calculator pages' logic.
- Build the command palette, bottom nav, and page-transition system as reusable modules in /js/ui.

## DELIVERABLES
Complete new homepage + nav modules + a working command palette, wired into the design system. Update NOTES.md when done.
