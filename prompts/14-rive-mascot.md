# Prompt 14 — The Mascot (Rive-Powered League Character)

> Read AGENTS.md, NOTES.md first. The owner will supply a .riv file (assets/mascot.riv). If it's missing, build the wrapper with the static fallback first and ask the owner to drop in the file.

Build THE KEEPER — a living mascot character, using Rive (@rive-app/canvas via CDN). The Duolingo-owl move: a character with opinions about your team.

## SETUP
- Load the Rive web runtime from CDN.
- Wrapper module js/ui/mascot.js: loads the .riv, exposes mascot.setState(name) and mascot.trigger(name) mapped to state machine inputs, handles resize/layout (Fit.Contain), lazy-loads offscreen, fully respects prefers-reduced-motion (static fallback illustration).
- Structure the code so ANY .riv can be dropped in — if the file's state names differ from the contract below, adapt the mapping in one config object (don't hardcode state names everywhere).

## PERSONALITY STATES (the state machine contract for the artist)
idle, happy (W week), devastated (L week), judging (lopsided trade), celebrating (streak milestone/badge), nervous (close matchup Sunday night), hype (playoff clinch), sleeping (offseason), thinking (AI generating).

## PLACEMENT & BEHAVIOR
- Lives in a corner dock on home + appears inline at emotional moments (trade verdict, streak claim, Drive finale, command center when your guy scores).
- Reacts via the app's event bus: score changes, trade grades, streak events → mascot.setState with 2–4s dwell, then back to idle.
- Speech bubbles with personality microcopy (confident league-insider voice) — capped at 2/day so it stays charming, never annoying. All lines in ONE config file.
- Tap the mascot for an easter egg.

## DELIVERABLES
mascot.js, the state-machine contract doc, fallback static assets, integration into the emotional moments listed. Update NOTES.md.
