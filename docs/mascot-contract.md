# The Keeper — native SVG character contract

## Built-in animated character

The Keeper uses the native SVG renderer in `js/ui/mascot-art.js`. It does not require a Rive file, a third-party runtime, a network request, or an owner-supplied asset. `assets/mascot-keeper.svg` remains the reduced-motion illustration.

- All artwork is local and scales without a canvas resize pass.
- The renderer supports blinking, breathing, pointer-aware eyes, facial expressions, head/body motion, sparkles, and celebration effects using transform/opacity animation.
- Offscreen characters pause their animations. Reduced-motion users receive the static illustration and no character animation.
- `js/ui/mascot-config.js` is the single list of supported states and personality copy. No feature flag disables the animated renderer.

## Personality states

| State | Meaning | Native treatment |
|---|---|---|
| `idle` | Default confident watchful state | Breathing, blinking, pointer-aware eyes |
| `happy` | Win or a user’s player scores | Bounce, raised arms, smile, sparkles |
| `devastated` | Losing week | Desaturated droop and frown |
| `judging` | Lopsided trade verdict | Tilted head, raised eyebrow, side-eye |
| `celebrating` | Streak milestone, badge, or mascot tap | Bounce, arms, sparkles, confetti |
| `nervous` | Close game/red-zone tension | Rapid shake and blinking |
| `hype` | Playoff clinch | Hero pop, aura pulse, sparkles |
| `sleeping` | Offseason/no-game state | Closed eyes, dimmed palette, drifting Zzz |
| `thinking` | AI request in flight | Thoughtful tilt, upward eyes, animated dots |

`mascot.setState(name, options)` selects a state and returns to idle after the requested dwell. `mascot.trigger(name)` plays a state without speech. Unknown states safely resolve to idle.

## App events

- `kt:gamification` → `celebrating`
- `kt:trade-verdict` (`lopsided`) → `judging`, otherwise `happy`
- `kt:player-score` → `happy`
- `kt:drive-finale` (`result`) → `happy` or `devastated`
- `kt:ai-loading` → `thinking` while busy
- `kt:scores-update` (red zone) → `nervous`
- `kt:playoff-clinch` → `hype`
- Offseason empty slate → `sleeping`

Emotional states dwell for 2–4 seconds before returning to idle. Speech uses the same config file and is capped at two bubbles per day. The dock, inline verdict, Drive finale, and Sunday placements all use the same renderer and event contract.
