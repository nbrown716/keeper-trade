# Prompt 11 — THE DRIVE: Weekly Recap Cinematic ⭐ CROWN JEWEL

> Read AGENTS.md, NOTES.md first. Depends on Prompts 07 (Sleeper data) and 10 (stadiums.json). Use Plan mode first: propose the architecture, get owner approval, then build.

Build THE DRIVE — a personalized animated weekly fantasy recap that plays like a Strava year-in-sport film meets a luxury-car holiday dashboard video. The feature leaguemates screen-record for the group chat. It replays the user's week as a cinematic journey and must feel PREMIUM: art-directed, paced like a trailer, zero jank.

## DATA (already wired)
The user's Sleeper matchup for week N — starters, actual points, opponent, and each player's real game venue (player → team → data/stadiums.json).

## TWO MODES (build both, user toggles)

### MODE 1 — DRIVE DOWN THE FIELD
- Gorgeous stylized top-down NFL field (canvas, dark stadium-night look: floodlight gradients, glowing yard lines, subtle grain). Camera travels goal line to goal line.
- Each starter = one "play." As the camera advances, a play card animates in: "J. CHASE — 24.6 PTS" with a mini breakdown (8 REC, 112 YDS, 2 TD); yardage gained proportional to points vs position average. Great games = explosive plays (camera burst + light shake + particles). Busts (<5 pts) = tackled-for-loss beat (record-scratch energy, brief desaturation).
- Finale at the end zone: final score vs opponent, W/L stamp animation, margin, one-line AI verdict via askAI (if Prompt 09 done; otherwise a templated line), confetti (W) or rain (L).

### MODE 2 — THE MAP (the Strava-route one)
- Stylized dark US map (canvas; simplified state outlines or abstract dotted-grid — art over geography). Stadium markers for every venue where the user's starters played.
- Camera FLIES stadium to stadium (smooth bezier hops, GSAP timeline), tracing the week as a glowing route line drawn progressively behind it — Strava route reveal energy.
- At each stop: stadium pulses, infographic card springs up: player tile, points, key stats, micro-sparkline, weather badge if applicable. Chronological order (TNF → Sun 1pm → 4pm → SNF → MNF).
- Finale: zoom out to the whole glowing route + total points + result stamp + league week ranking ("#2 scorer this week").

## CRAFT REQUIREMENTS
- GSAP master timeline, fully scrubbable (progress bar + replay).
- 60fps canvas, devicePixelRatio-aware, flawless on mobile portrait (9:16 — must look native-vertical like a Strava story).
- Broadcast-grade type: huge condensed numbers counting up, small-caps labels, team-color accent lighting per stop.
- Sound-optional (muted default, subtle whoosh/sting toggle).
- Deterministic: same week data → same film (seed any randomness).
- Skeleton/poster state while loading; tap-to-skip per beat; 45–60s total runtime.

## DELIVERABLES
drive.js (orchestrator), drive-field.js, drive-map.js, drive-cards.js, integration into the matchup screen ("▶ Watch your week" button — make that button itself irresistible), poster-frame generator. Update NOTES.md.
