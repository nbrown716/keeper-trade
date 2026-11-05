# Prompt 13 — Sunday Command Center

> Read AGENTS.md, NOTES.md first. Depends on Prompts 02, 03 (and 07 for fantasy overlays).

Build SUNDAY COMMAND CENTER — a live multi-game viewing screen inspired by ESPN's TournamentCast: every game that matters, at once, with fantasy stakes overlaid. THE Sunday screen.

## LAYOUT (responsive grid)
- Desktop: adaptive mosaic — one "hero" game (auto-selected: most of my/opp's starters, or closest late game) large; others as live tiles. Tiles reflow with FLIP animations when the hero changes.
- Mobile: vertical stack, hero on top, horizontal-snap rail of other games.

## EVERY TILE SHOWS
Score, quarter/clock, possession, red-zone pulse, win-probability micro-bar, weather glyph (if Prompt 10 done), and — the differentiator — a FANTASY EDGE indicator: live fantasy points the user's starters in THIS game have right now (Sleeper live matchup data), e.g. "YOUR GUYS: 34.2" with green/red delta vs projection.

## KILLER FEATURES
- RED ZONE AUTO-DIRECTOR: when any game enters the red zone, its tile flashes/borders red and the hero slot auto-switches to it (5s cooldown + "return" pill so it never feels hijacky; user can pin a game).
- MY PLAYERS RAIL: every starter playing right now with live point ticks counting up and flashing on scoring plays. Tap → that game's tile.
- CLOSE-GAME RADAR: banner when ≥2 games are within one score in the 4th.
- Win-probability graphs (Prompt 03 component) embedded per hero tile.
- Haptic pulse on any of the user's players' TDs. Sound-optional scoring stings.
- ONE polling loop via the shared LiveData engine, 30s cadence, zero duplicate fetches.
- Keep ?debugdate= support for offseason testing.

## DELIVERABLES
Complete command center. This screen should make someone's group chat ask "wait, what app is that?" Update NOTES.md.
