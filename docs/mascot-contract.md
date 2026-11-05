# The Keeper — Rive state-machine contract

## Drop-in asset

Place the Rive export at `assets/mascot.riv`. The site currently uses `assets/mascot-keeper.svg` because the Rive file has not been supplied. No code change is needed after adding the file.

- Runtime: `@rive-app/canvas` 2.30.0 from CDN, loaded only when a valid `.riv` exists.
- State machine name: **`Keeper`**.
- Fit: `Fit.Contain` with canvas resizing.
- Mapping: edit only `js/ui/mascot-config.js` if the artist uses different input names.
- Reduced motion and missing/failed assets always retain the static illustration.

## Inputs

| Personality state | Input | Type | Meaning |
|---|---|---|---|
| `idle` | `idle` | Boolean | Default confident watchful state |
| `happy` | `happy` | Boolean | Win or a user’s player scores |
| `devastated` | `devastated` | Boolean | Losing week |
| `judging` | `judging` | Boolean | Lopsided trade verdict |
| `celebrating` | `celebrating` | Trigger | Streak milestone, badge, or mascot tap |
| `nervous` | `nervous` | Boolean | Close game/red-zone tension |
| `hype` | `hype` | Boolean | Playoff clinch |
| `sleeping` | `sleeping` | Boolean | Offseason/no-game state |
| `thinking` | `thinking` | Boolean | AI request in flight |

Boolean inputs should be mutually exclusive. The wrapper turns the selected boolean on and all others off. Trigger inputs use `fire()`.

## App events

- `kt:gamification` → `celebrating`
- `kt:trade-verdict` (`lopsided`) → `judging`, otherwise `happy`
- `kt:player-score` → `happy`
- `kt:drive-finale` (`result`) → `happy` or `devastated`
- `kt:ai-loading` → `thinking` while busy
- `kt:scores-update` (red zone) → `nervous`
- `kt:playoff-clinch` → `hype`
- Offseason empty slate → `sleeping`

Emotional states dwell for 2–4 seconds before returning to idle. Speech uses the same config file and is capped at two bubbles per day.
