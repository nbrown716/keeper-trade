# Prompt 07 — League Mode (Sleeper Integration)

> Read AGENTS.md, NOTES.md first. Ask the owner for their Sleeper league ID before starting (it's the number in their sleeper.app league URL).

Build LEAGUE MODE using the free Sleeper API (read-only, no auth, CORS-safe, base: https://api.sleeper.app/v1). Users paste their Sleeper league ID once (stored locally).

## FEATURES
- League dashboard: real rosters, standings, and this week's matchups with live fantasy scores (GET /league/{id}/matchups/{week}); team names/avatars from /league/{id}/users and /rosters. Get the current week from /state/nfl.
- Matchup cards: live projected-vs-actual, win-odds bar per matchup, "closest matchup" highlighting.
- Trade wire: recent league transactions incl. trades (GET /league/{id}/transactions/{week}) rendered as a beautiful activity feed — and a "Grade this trade" button that loads any real league trade directly into the trade calculator. THIS is the killer loop.
- Power rankings: simple weekly power rankings computed from scores + record, with week-over-week movement arrows.
- Player database: GET /players/nfl (it's several MB — cache in IndexedDB, refresh weekly) for names/teams/positions/injury status.
- Graceful degradation: with no league ID set, all league widgets show elegant "connect your league" empty states with a 2-step setup.

## DELIVERABLES
Complete league module wired into nav, homepage widgets, and the trade calculator. Update NOTES.md.
