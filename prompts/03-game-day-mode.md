# Prompt 03 — Game Day Mode & Win Probability

> Read AGENTS.md, NOTES.md, the design system, and the LiveData engine from Prompt 02 first.

Build GAME DAY MODE — one immersive screen per game.

## DATA (ESPN hidden API, no key)
- Game summary: https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={gameId}
  (contains play-by-play, box score, drives, and win probability)
- Graph the win probability from the summary payload.

## FEATURES
- Full-screen dark "stadium" view: two team-color-lit halves that brighten/dim with win probability. The screen subtly breathes with the game.
- LIVE WIN PROBABILITY GRAPH: animated area chart (hand-rolled SVG or canvas — no chart library) that draws itself in real time, with a draggable scrubber to rewind through momentum swings. Scoring plays marked as dots on the line; tapping a dot jumps to that play in the feed.
- Play-by-play feed styled like a premium chat timeline (team-color accent bars, yard-line chips; scoring plays get a confetti-lite burst + haptic pulse).
- Box score in a sliding tab — beautiful stat table, leaders highlighted.
- "Red zone auto-alert": when ANY game enters the red zone, a floating pill invites jumping to it.
- Everything animates: drive charts draw themselves, stats count up, quarter transitions sweep.
- Entry point: clicking a ticker game chip (built in Prompt 02) opens this view.
- Keep the ?debugdate= support so it can be tested with past games.

## DELIVERABLES
Complete game-day module wired to the ticker. This should be the best-looking live game view any side project has ever shipped. Update NOTES.md.
