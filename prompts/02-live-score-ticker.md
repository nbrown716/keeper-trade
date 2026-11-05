# Prompt 02 — The Live Score Ticker

> Read AGENTS.md, NOTES.md, css/design-system.css first. Build the ticker AND the reusable LiveData engine everything later depends on.

Build THE TICKER — a live NFL score strip.

## DATA
ESPN's public JSON endpoints (no API key, CORS-safe):
- Scoreboard: https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
- Filter by date: ?dates=YYYYMMDD
Poll every 30s during game windows, every 5min otherwise. Cache last-good response; if a fetch fails, keep showing stale data with a subtle "updating…" shimmer — never error out visually.
- Include a debug mode: `?debugdate=20251109` in the URL renders the ticker with that past date's games, so the owner can test in the offseason.

## PLACEMENT & BEHAVIOR
- Slim ticker pinned under the top nav (desktop) / above bottom nav (mobile).
- Each game = a compact chip: team logos, scores (tabular-nums), quarter + clock, red zone indicator (flashing RED ZONE pill when either team is inside the 20), possession dot. Live games pulse subtly; finals dim.
- Scores COUNT and FLASH when they change (green pulse on the scoring team).
- On a scoring play: haptic double-pulse on mobile + the chip briefly expands.
- Clicking a chip opens a game drawer (bottom sheet on mobile) with scoring summary — a stub is fine; the deep game view comes in the next brief.
- Horizontal scroll with momentum + edge fade; auto-scrolls to keep live/close games in view; pauses on user interaction.
- Mobile collapsed mode: single-line marquee ("KC 24 — BUF 21 · Q4 2:31") expanding to the full ticker on tap.
- Skeleton shimmer chips while loading; layout must never shift when data lands.

## ARCHITECTURE
Abstract the polling into a reusable `LiveData` class in /js/data (register sources, cadences, subscribers, stale-cache fallback). All future live widgets reuse this one engine — zero duplicate fetches.

## DELIVERABLES
Complete ticker module + LiveData engine, wired into the homepage. Update NOTES.md.
