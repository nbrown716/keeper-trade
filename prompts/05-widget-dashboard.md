# Prompt 05 — The Widget Dashboard

> Read AGENTS.md, NOTES.md, design system, LiveData engine, and gamification state first.

Build a customizable WIDGET DASHBOARD on the homepage — iOS-home-screen energy. Users add, remove, drag to rearrange, and resize widgets; layout persists in localStorage.

## WIDGETS (build all, each self-contained)
- Live Scores mini-board (from the LiveData engine)
- Trending Players (risers/fallers with sparklines)
- My Watchlist (user-picked players with quick stats)
- Trade Value Movers (biggest value swings this week — stub the data behind a clean adapter interface; wired to the values API in Prompt 06)
- Streak & XP status card
- Pick'Em countdown card (next lock time, picks remaining)
- NFL Countdown (days/hours/min/sec to next kickoff, or to the draft in the offseason)
- News Wire (latest headlines list with time-ago stamps)

## SYSTEM
- Drag-and-drop grid via pointer events (works on touch), snap physics, reflow animations when widgets move.
- Edit mode (long-press or pencil toggle): widgets wiggle like iOS, show remove buttons.
- Each widget has a skeleton loading state and an empty state with personality.
- Widgets poll on their own sensible cadences through the shared LiveData engine — no duplicate fetches.

## DELIVERABLES
Complete dashboard system integrated into the homepage. Update NOTES.md.
