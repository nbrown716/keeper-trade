# Keeper Trade: Next-Level Feature Spec

**Wrapped 2.0 · The Drive: Head-to-Head · Home Of: The Stadium Flyover**

Prepared 2026-11-07 for the owner (ntbrown1997, Crouchh fanclub) by Claude Code, using the project's eleven-persona review method. This is a build-ready specification, not a mood board. Every number, data field and fallback below was checked against the current codebase and live data sources unless marked **VERIFY**.

---

## 0. Executive summary

You asked for three things, plus permission to make them better than the brief:

| Your concept | What this spec turns it into | The "how did you do that" moment |
|---|---|---|
| Wrapped with better KPIs | **Season Wrapped 2.0**: a tap-through story (like Spotify Wrapped / Instagram stories) built from your real Sleeper season, with 30+ computed KPIs, an archetype, league awards and per-slide share cards | "Your bench outscored 4 teams in Week 6." Every claim is a real computed fact from your league |
| The Drive as a Strava-style race | **The Drive: Head-to-Head**: both lineups race down a split field in a real chronological replay of the weekend, with an F1-style mini-map, a timing tower, player KPI tiles that pop as points land, and a touchdown for the winner. Then a Strava-style **Activity Summary** (splits, pace chart, best efforts, achievements) | It is not simulated noise. Every surge happens in the order it really happened on Sunday, reconstructed from ESPN play-by-play timestamps |
| Stadium map with *Draft Day* "home of the" flyovers and synced lines | **Home Of: The Stadium Flyover**: a night-lights US map where you and your opponent's players fly as spinning footballs, slot-by-slot (QB vs QB, RB vs RB…), landing at **the same frame** in a broadcast split-screen, each with a cinematic "SEATTLE / home of the / JAXON SMITH-NJIGBA 24.3" title card | Lines of different lengths always land together. Long flights fly faster, so the arrivals hit like a drumbeat, with shockwave and bounce on impact |

One new engine powers all three, so they stay consistent and cheap to maintain:

1. **Replay engine** (`js/data/replay.js`): turns ESPN play-by-play plus Sleeper final points into a timestamped fantasy-point timeline for every starter on both teams.
2. **Season engine** (`js/data/season-stats.js`): turns every week of Sleeper matchups, transactions and drafts into season KPIs (reuses Pulse's lineage loader).
3. **Film clock** (`js/ui/film-clock.js`): one master timeline (play/pause/scrub/speed/export) that Drive race, Flyover and Wrapped all render from. This guarantees sync and makes MP4 export deterministic.

**Decisions I need from you** (section 9 has the detail):
1. Approve a **route-budget exception** only if you choose the optional real-3D map (Option B). My recommendation (Option A) stays inside the 200 KiB budget.
2. Confirm the **AI usage** in Wrapped (one Sonnet call per manager per season, cached; about $0.02 each, under the $1 daily cap).
3. Pick the **build order**. Recommended: Replay engine → Drive Head-to-Head → Flyover → Wrapped 2.0 (Wrapped is most valuable at season's end, Drive is used every week).

---

## 1. How this was designed (the persona panel)

Each concept passed through the roles defined in `reference/Keeper-Trade-Persona-Prompt-Pack.md`:

- **A · Sports UX researcher**: game-day glance (under 3s) vs weekday deep-dive; the emotional peak of fantasy is *Sunday comeback tension*, so the Drive race leans into lead changes.
- **B · PM / IA**: every feature is reachable in 2 taps, has loading/empty/error/offline/no-league states, and ships in independently useful phases.
- **C · Senior designer**: hierarchy first; one hero element per frame; team color at most about 20% of any frame; tabular numerals everywhere.
- **E · Motion designer**: causality (every motion explains where something came from), one master clock, celebration tiers, and nothing decorative delays data.
- **F · Behavioral designer**: Wrapped celebrates without shaming. Worst-performer slides punch *up* at players, never at the manager.
- **G · Data-viz engineer**: hand-rolled canvas/SVG, legible at 390px, text alternative for every chart.
- **H · Accessibility**: reduced-motion versions of all three films, captions for every beat, keyboard scrubbing, screen-reader summaries.
- **I · Performance**: 60fps on a mid-tier Android over LTE; deterministic rendering so exports match playback.
- **J · Content voice**: league insider, funny but never cruel, no tech words on screen.
- **K · Security**: no new secrets; all new data is public Sleeper/ESPN; AI only through the existing Worker with caps.

---

## 2. Shared foundation (build first)

### 2.1 Replay engine: real chronological fantasy points

**Problem it solves:** Sleeper only gives *final* points per player. A race needs to know *when* the points happened.

**Verified data (checked live 2026-11-07 on ESPN summary for event 401873037):**
- `drives.previous[].plays[]` contains `wallclock` (real UTC timestamp, e.g. `2026-11-06T01:18:06Z`), `text` (e.g. "T.Lawrence pass deep right to N.Boerkircher to BLT 21 for 52 yards"), `statYardage`, `scoringPlay`, `type`, `period`, `clock`, `isTurnover`, `teamParticipants`.
- `boxscore.players[]` has per-player stat lines (passing, rushing, receiving, fumbles, kicking…) to cross-check totals.
- `participants` (athlete IDs) is **not** present on plays, so players are matched by abbreviated name (see the algorithm).

**Algorithm:**
1. For each starter on **both** rosters, resolve their NFL team and that week's ESPN game (already done in `drive-data.js` via `teamGames`).
2. Build each player's play-name key: first initial + last name as ESPN prints it (`N.Boerkircher`, `J.Smith-Njigba`). Handle suffixes (Jr., III), apostrophes (Ja'Marr → `J.Chase`), hyphens, and same-team name collisions (fall back to position context: "pass … to X" = receiver, "X pass" = passer, "X up the middle/left end" = rusher).
3. Walk plays in `wallclock` order and assign **provisional fantasy points** with the league's scoring settings (`bundle.league.scoring_settings` from Sleeper: `rec`, `rec_yd`, `rush_yd`, `pass_yd`, `pass_td`, `rec_td`, `rush_td`, `pass_int`, `fum_lost`, `bonus_*`, kicker fields). Parse yards from `statYardage`, TDs from `scoringPlay` plus text, INT/fumble from `isTurnover` plus text.
4. **Anchor to truth:** scale each player's provisional points so they sum exactly to Sleeper's official `players_points[id]`. If parsing found nothing for a player who scored (an edge case), distribute their official points evenly across their game's plays. Every replay therefore ends on the real score, to the hundredth.
5. **D/ST and kickers:** kicker points from FG/XP plays; D/ST points from sacks/INT/fumbles/TD plays credited to that defense, with points-allowed tiers applied at the final whistle (shown as a single "final adjustment" event, labeled honestly).
6. Output: `events[] = { t (ms UTC), rosterId, playerId, delta, kind: 'yards'|'td'|'turnover'|'final-adjust', text }` plus `cumulative(rosterId, t)`.

**Film-time compression ("dead-air removal"):** a real weekend spans about 100 hours (TNF → MNF). The film shows **windows** (TNF, SUN EARLY, SUN LATE, SNF, MNF, plus intl/Sat when present). Each window gets film time proportional to points scored in it (with a 3s minimum), and the gaps between windows collapse into a 0.6s "time-lapse wipe" with a day/time stamp ("SUN 1:00 PM ET"). Total film: 45s default (30/45/60 selectable).

**Caching:** replay results are stored in LiveData/IndexedDB keyed by `replay:v1:{leagueId}:{week}:{rosterA}:{rosterB}:{fingerprint of both totals}`. Completed weeks never recompute. Live weeks recompute on the 60s Sleeper cadence (yes, the race works **live on Sunday**, and that should be marketed).

**Fallback ladder:** full play-by-play → boxscore-only (points spread across the game's real start→end wallclock) → no ESPN (points spread across the window by kickoff time) → no schedule (even spread). The UI labels the lower tiers subtly ("Approximate timing").

### 2.2 Season engine

Reuses `pulse-data.js` lineage loading (`getLeagueLineage`) and the stable owner IDs added for the record book. One pass over all completed weeks builds per-manager and per-player aggregates (section 3.2). Cached per `{leagueId}:{lastCompletedWeek}`, so it costs zero after the first build each week.

Additional Sleeper endpoints (public, keyless):
- `GET /league/{id}/drafts` → `GET /draft/{draft_id}/picks` (draft round/pick per player, needed for draft ROI).
- `GET /league/{id}/transactions/{week}` (already used) for waiver/trade attribution.
- **VERIFY (optional):** `https://api.sleeper.app/projections/nfl/{season}/{week}?season_type=regular` is unofficial. Use it only for "beat your projection" stats, behind a feature check; everything else works without it.

### 2.3 Film clock + choreography grammar

- One `requestAnimationFrame` loop drives a single `t` (0…duration). Renderers are pure functions `draw(ctx, t, data)`, so playback, scrubbing and MP4 export render identical frames (this already holds for The Drive's export and is kept).
- Speeds 0.5× / 1× / 2×, scrub bar with event ticks (lead changes in volt, TDs in gold), keyboard: Space play/pause, ←/→ 1s, Shift+←/→ jump to the previous/next event.
- **Motion tokens** for the three films: micro 120ms, beat 400ms, hero 700ms; spring `cubic-bezier(.2,1.25,.3,1)` for arrivals; no element bounces twice; camera moves ease-in-out-sine; nothing linear except constant-speed travel.
- **Celebration tiers:** tier 1 a points tick (number count-up + 1px glow); tier 2 a big play of 6+ points (tile flip, haptic 12ms); tier 3 a lead change or TD (screen-edge flash in team color, haptic pattern, sting sound if sound is on); tier 4 the winner's touchdown (full confetti, only once per film).
- **Reduced motion:** every film has a "storyboard" mode that cross-fades between key frames with the same captions and numbers; no camera moves, no confetti.

---

## 3. Concept A: Season Wrapped 2.0

### 3.1 Experience

- **Entry points:** clubhouse card ("Your season, wrapped"), League section after the final regular-season week, and an auto-prompt **once** after the championship (dismissible, never repeated).
- **Format:** full-screen 9:16 stories with segmented progress bars at the top. Tap right/left to advance/rewind, hold to pause, swipe down to close, arrow keys and Space on desktop. 12-16 slides at 4-6s each with count-up numbers, then a **summary poster**.
- **Tone:** celebratory, specific, funny. Worst-performer slides roast *players*, never the manager ("Kyle Pitts owes you an apology: 3.1 points a start").
- **Every slide is shareable** as a 1080×1920 PNG; the whole Wrapped exports as a 30s MP4 (reusing `share.js`).

### 3.2 KPI catalog (all computed from real league data)

Notation: weeks W = completed regular-season weeks; starters S; bench B (roster players minus starters minus IR/taxi, matching Pulse's verified bench rule).

**Results**
| KPI | Formula | Source |
|---|---|---|
| Record, PF, PA | wins/losses/ties; Σ points (with `fpts_decimal/100`) | rosters.settings |
| PF rank / PA rank | rank among league | rosters |
| **All-play record** | each week, beat-count vs every other team; Σ over weeks | matchups |
| **Luck index** | actual wins − all-play expected wins (all-play win% × games) | derived |
| Close-game record | games decided by < 10 pts | matchups |
| Best / worst week | max/min weekly total, with league rank that week | matchups |
| Longest win / losing streak | consecutive results | matchups |
| Points above league average | Σ (your weekly − league weekly mean) | matchups |

**Players**
| KPI | Formula |
|---|---|
| **MVP** | most total points as a starter for you |
| **Most reliable** | lowest coefficient of variation among players with 6+ starts |
| **Boom king** | most weeks ≥ 20 pts |
| **Biggest bust (worst performer)** | lowest points per start relative to the positional starter average (min 4 starts) |
| **Best single game** | max player-week as your starter |
| **Bench regret** | most points scored on your bench by one player |
| Positional rooms | your QB/RB/WR/TE/FLEX/K/DEF season points vs league rank per room ("Your WR room ranked 2nd") |

**Decisions (manager skill)**
| KPI | Formula |
|---|---|
| **Lineup IQ** | Σ actual starter points ÷ Σ optimal lineup points (optimal = best legal lineup from that week's roster under league slot rules) |
| Points left on bench | Σ (optimal − actual) |
| **Best pickup** | waiver/FA add with most points scored *for you after the add date* |
| **The one that got away** | your drop with most points scored *for anyone after the drop* |
| **Trade ledger** | for each trade: points received players scored for you after the trade vs points sent players scored for the other team after; net = trade win/loss |
| **Draft ROI** | points per draft round; best value pick = points ÷ expected points for that round (league average of that round) |
| Busiest GM | adds + drops + trades count vs league |

**Rivalry and identity**
| KPI | Formula |
|---|---|
| **Nemesis** | opponent with your worst H2H record (lineage-aware, so it includes past seasons) |
| **Favorite victim** | your best H2H record |
| **Archetype** | rule-based: *The Tinkerer* (top-3 in transactions), *The Oracle* (Lineup IQ ≥ 92%), *The Gambler* (highest weekly variance), *The Cold Bench* (most bench points), *The Closer* (best close-game record), *The Robber Baron* (best trade ledger), *The Lucky Charm* (luck index ≥ +2), *The Phoenix* (best record after a 0-2/1-3 start). Ties go to the strongest z-score |
| League percentile badges | "Top 10% in Lineup IQ" style chips |

**Records tie-in:** any KPI that sets an all-time record (from the IndexedDB record book) gets a gold "RECORD" stamp.

### 3.3 Slide storyboard (default 14)

1. **Cold open:** "2026. You were there for all of it." Season logo assembles from your weekly scores as bars.
2. **The record:** 7–1 count-up, PF rank, all-play record ("You'd be 58–30 against everyone").
3. **Luck index meter:** needle swings from "Robbed" to "Blessed". Copy adapts to the sign.
4. **Your week of weeks:** best week as a tall bar among the whole league's weeks; "highest score in the league that week".
5. **MVP:** player photo (Sleeper CDN headshot), season points, share of your total as a ring.
6. **Most reliable vs Boom king:** split card.
7. **The worst performer:** "We need to talk about…" playful roast card, points per start vs position average.
8. **Bench regret:** "Your bench scored 412.6. That's 3 teams' worth of weeks." Optimal-lineup bar.
9. **Lineup IQ:** big percentage, league rank, one best and one worst lineup decision.
10. **Front office:** best pickup and the one that got away, as before/after mini charts.
11. **Trade ledger:** each trade as a tug-of-war bar; net verdict.
12. **Rivals:** nemesis and favorite victim, H2H across seasons.
13. **Archetype reveal:** card flip with title, rarity line and 3 supporting stats.
14. **Summary poster:** 6 headline numbers, archetype and league name; share/save/export video.

**AI touch (optional, recommended):** one Sonnet call per manager-season writes the archetype paragraph and two slide captions from the computed facts only, under the existing numeric guardrails (`numbersSupported`). Cached for the season. If AI is unavailable, the deterministic copy bank is used. No slide depends on AI.

### 3.4 Edge cases
- Mid-season: Wrapped becomes "Season so far" (weeks to date) with a "Final cut unlocks after Week N" note.
- New managers or orphaned teams: the lineage uses owner ID; if an owner changed, stats split by owner.
- Yahoo leagues: identical once Yahoo per-player weekly points are added (open item from the connector work).
- Fewer than 3 weeks of data: show a 5-slide mini version rather than empty slides.

### 3.5 Acceptance tests
- Every KPI recomputed independently in Python from raw Sleeper JSON for Crouchh fanclub matches the UI to 0.01.
- Optimal lineup respects league `roster_positions` (including FLEX/SUPER_FLEX eligibility).
- 390px: no text overflow on any slide with the longest manager/player names in the league; axe clean; story navigation works with keyboard and VoiceOver.
- Export: 14 PNGs at 1080×1920 and an MP4 under 8 MB.

---

## 4. Concept B: The Drive, Head-to-Head

### 4.1 The idea in one line
Your lineup and your opponent's lineup race down the same field in the true order the weekend happened. The leader's ball is ahead, lead changes swap the lanes' glow, and **the winner's final points carry them into the end zone for a touchdown** at the exact frame the matchup was decided.

### 4.2 Layout (portrait 9:16, the primary format)
```
┌───────────────────────────────┐
│ WEEK 9 · CROUCHH FANCLUB   ●LIVE│  ← header; LIVE pill when the replay is live
│ ntbrown1997 112.4  ▲ +6.2      │  ← timing tower (F1 style): P1/P2, gap, last-scorer chip
│ tanake      106.2              │
├───────────────────────────────┤
│  [ end zone ]                 │
│  ════════ lane A (you) ══════ │  ← vertical field, two lanes, your lane on the left
│        🏈→                     │     ball position = cumulative points / winning total × 100 yd
│  ════════ lane B (opp) ══════ │
│  [ goal line 50 40 30 20 10 ] │
├───────────────────────────────┤
│ ┌KPI tile┐ ┌KPI tile┐          │  ← player tiles pop as their points land (last 3, auto-stack)
│ │J.Chase │ │+6 TD   │          │
├───────────────────────────────┤
│ mini-map ⬭  ●A ●B   SUN 4:05PM │  ← F1 mini-map (bottom-left) + window/time stamp
│ ━━━━━━━●━━━━━━━━━━━━━━━━  ▶ 1× │  ← scrubber with lead-change and TD ticks
└───────────────────────────────┘
```
Landscape (desktop/TV) moves the tower and tiles to a right rail and runs the field horizontally.

### 4.3 Field race rules
- **Distance:** 100 yards = the **winning** final total. The winner reaches the goal line exactly at the end; the loser stops at their share ("tanake stopped at the 6-yard line"). Ties reach the 1-yard line together; overtime is not a thing, so it reads "Tie game. Nobody scores."
- **Ball motion:** position interpolates the cumulative-points function with a critically damped spring (no overshoot), so 6-point TD jumps feel like a burst, not a teleport. At 60fps, positions are computed from `t`, never accumulated, so they are frame-rate independent and export-safe.
- **Down markers:** first-down chains appear every 10 "yards" a team gains, a subtle broadcast nod that also gives the eye rhythm.
- **Lead changes:** the leading lane's turf glows volt; a lead change triggers tier-3 feedback, with a counter in the tower ("Lead changes: 4").
- **Red zone:** when either ball passes the 20 with more than 4 points of game time left to settle, the field tints red-zone red and the mini-map pulses (borrowing Sunday's red-zone language).
- **Touchdown:** the winner's ball crosses → the camera pushes in, end zone fills with the winner's color, "TOUCHDOWN" in Barlow Condensed 800, final score count-up, confetti (tier 4) and the mascot "celebrating" state (existing SVG mascot).

### 4.4 Player KPI tiles
- Each tile: headshot (Sleeper CDN, initials fallback), name, slot (WR2), live points (count-up), the play that just counted ("52-yd catch"), and a micro-sparkline of that player's cumulative points.
- Pops in from the lane edge where the ball is (causality), stacks at most 3 per team, and older tiles compress to chips. Big plays (6+) get tier-2 treatment.
- A "Fastest lap" tile (F1 nod) shows the single biggest play of the game, with a purple accent.

### 4.5 F1-style mini-map
- A stylized circuit (an asymmetric loop with a chicane, drawn as one SVG path) in the bottom-left, 120×80px.
- **One lap = the whole weekend.** Each team's dot position is the *point share of its own final total so far*, mapped onto path length with `getPointAtLength` on a pre-sampled 512-point lookup table (smooth and allocation-free each frame).
- **Sectors = windows** (TNF, SUN EARLY, SUN LATE, SNF, MNF). A sector lights **purple** for the team that won that window, like F1's fastest-sector colors.
- Gap readout under the map ("+6.2") updates with tabular numerals; a "DRS"-style chevron appears when the trailing team is within 5 points.
- Dots use 3px team-colored glow trails (last 0.4s of motion) so the "car going around the grid" feel reads even on a small phone.

### 4.6 After the race: the Strava-style Activity Summary
A scrollable card under the film (and slides 2-4 of the export):
- **Headline:** "Week 9 · Win by 6.2 · 4 lead changes · Clinched at SNF 9:48 PM."
- **Pace chart (Strava "elevation" equivalent):** both teams' cumulative points over the weekend as two area lines, windows shaded, lead changes marked. Tap to scrub the film to that moment.
- **Splits table:** per window, points for/against, split winner, and a "pace" (points per hour of game time).
- **Best efforts:** player performances that are season-bests ("PR" badge), position-rank of the week, and "segments" (QB duel, RB duel… slot vs slot).
- **Achievements (Strava trophies):** "Comeback: trailed by 20+", "Wire to wire", "Photo finish (< 2 pts)", "Bench would have won", "Highest score this week", "Shutout window". Trophies feed the gamification badges (real action, so the full celebration is allowed).
- **Kudos:** share card plus a "send to league chat" share sheet (Web Share API).

### 4.7 Live mode (the show-off feature)
During games, The Drive runs the race **live**: the film plays to "now" and then follows in real time on the existing 30s/60s LiveData cadence, with new events animating in. That is the thing you pull out at a watch party.

### 4.8 Acceptance tests
- For 3 completed real weeks, both teams' final positions equal official totals to 0.01; the TD frame equals the moment the winner's cumulative points became uncatchable or the final event, as configured.
- Race renders at 60fps (16.7ms average, 0 frames > 50ms) on 4× CPU throttle at 390px, which is the same harness used in the performance audit.
- The MP4 export frame at t equals the live render at t (pixel diff < 1%).
- Reduced-motion storyboard shows the same numbers and captions; screen-reader summary lists lead changes and the deciding play.

---

## 5. Concept C: Home Of, the Stadium Flyover

### 5.1 The idea in one line
A night-time map of the US glows like the *Draft Day* aerials. Slot by slot (QB vs QB, RB1 vs RB1, …), your player and your opponent's player launch as spinning footballs from their previous stadiums, fly arcs of different lengths, and **land at exactly the same frame**. Each landing triggers a shockwave, a bounce and a cinematic title card: big condensed city name, "home of the", and the *player* and their weekly line instead of the team.

### 5.2 Why slot-by-slot sync (better than your brief)
Pure real-time would scatter arrivals randomly. Syncing by **lineup slot** gives every beat meaning (a positional duel), keeps the drumbeat you asked for, and lets the screen compare the two players directly: "QB DUEL · Mahomes 24.3 vs Allen 19.1".

### 5.3 Visual design
- **Base map:** dark navy, state outlines at 6% opacity, and procedurally placed "city light" particles (warm amber, sized by population) from a bundled list of the ~300 largest US places (public-domain Census coordinates), with subtle twinkle. This recreates the amber city-grid look of the reference without any licensed imagery.
- **Projection:** Albers USA (pre-projected `us-atlas@3/states-albers-10m.json`, about 115 KB, loaded lazily from jsDelivr, cached by the service worker), plus the 32 stadium coordinates already in `data/stadiums.json`.
- **2.5D drone camera:** the map is drawn on a canvas with a perspective tilt (simulated via a homography/scale-y plus parallax layers), and the camera eases between beats: a slow push-in and 6-10° bearing drift toward each landing pair, like a drone pan. Between beats, a quick pull-out to the full country shows all trails so far.
- **Split-screen on landing:** because two players land in two cities at once, the frame splits horizontally like a broadcast. Top = you (your color rail), bottom = opponent. Each half zooms to its stadium with the "home of" card, and after 1.2s the halves slide back together into the overview.
- **Title card typography (the *Draft Day* lockup):** city name huge in Barlow Condensed 800 with wide tracking (e.g. "SEATTLE"), a small lowercase "home of the" in Inter 500, then the **player name** in the team's color with the stat line ("24.3 PTS · 7 REC · 112 YDS · TD"). No NFL logos or film footage, for legal reasons; team identity comes from color and city typography only.
- **The ball:** a vector football that spins on its long axis (sprite rotation 720°/s) and follows a great-circle arc projected to Albers, with a comet trail in team color fading over 0.6s. On landing: a squash-and-stretch bounce (one bounce only, per the motion rules), an expanding ring shockwave, and a light bloom on the city particles within 40px.

### 5.4 Sync math (guaranteed same-frame arrivals)
- Beat duration D (default 2.4s): flight 1.2s, landing + card 1.0s, transition 0.2s.
- For each slot k, both balls depart at `t_k` and must land at `t_k + 1.2s`. Each ball's speed is `arcLength / 1.2s`, so long flights fly faster, short flights slower. Arrival is exact by construction.
- Easing is the same curve for both (ease-in-out-cubic over normalized progress), so they *look* synchronized all the way, not just at the end.
- Players on bye or without a game: the ball "hovers" at the previous stadium and the card reads "BYE WEEK · 0.0".
- Same-stadium duels (both players in one game): the balls arrive from two directions and clink (two bounces offset by 80ms), a fun beat.
- Order: QB, RB, RB, WR, WR, TE, FLEX…, K, DEF (league `roster_positions`); the final beat is a synchronized pull-out to the totals and a winner banner over the winner's highest-scoring city.

### 5.5 Map technology decision
| | **Option A (recommended): custom 2D canvas** | Option B: MapLibre GL + OpenFreeMap 3D tiles |
|---|---|---|
| Look | Stylized night map, city lights, 2.5D tilt | Real streets and 3D buildings, true 3D camera fly-to |
| Payload | ~115 KB TopoJSON + ~10 KB code; within the 200 KiB route budget | ~230 KB gzip JS plus tiles; **needs a budget exception** |
| Export to MP4 | Deterministic (same renderer as playback) | Tiles stream from the network, so exports can show missing tiles |
| Offline | Works from SW cache | No (tiles) |
| Licensing | Census public domain; us-atlas ISC | OSM attribution required (**VERIFY** OpenFreeMap terms) |
| Risk | Low | Medium (mobile WebGL memory, two map instances for split-screen) |

Recommendation: build Option A now; keep Option B as a "Cinema mode" experiment toggle later if you want literal 3D city flyovers.

### 5.6 Acceptance tests
- For every slot, both balls' arrival frames are identical (assert |Δt| = 0 in exported frame indices).
- 60fps on a 4× throttled phone; the trail and particle bloom stay under 4ms per frame.
- City/player cards never overlap the split seam; the longest names in the league fit at 390px.
- Reduced motion: no camera moves; the beats render as a sequence of static split cards.

---

## 6. More cutting-edge ideas (ranked backlog)

Ranked by wow × feasibility on the current static + Worker architecture.

1. **Live Activity-style "Matchup Pill"** on every page during games: a floating pill showing your live score vs opponent and win probability; tap → Drive live race. (Feasible now.)
2. **Win probability for fantasy matchups:** a Monte Carlo of remaining players' points using positional variance (reusing the Season Sim worker); shown as an animated bar in the tower and the pill.
3. **Personal onboarding (60s):** "Which team is yours?" once, and the whole site personalizes (Drive/Wrapped/War Room default to you; greeting "Welcome back, Nick. 7–1.").
4. **Player comparison cards in 2 taps**, shareable, with season splits and Drive-style sparklines.
5. **Weekly "Film Room" email-style digest page** (no email backend needed: a shareable URL that renders the week's Pulse, your Drive and the standings in one scroll).
6. **Haptic score language:** a distinct vibration pattern for TD, lead change and loss of lead (Android; iOS Safari ignores vibrate, so there it is visual-only, stated honestly).
7. **Sound design pack (off by default):** stadium-crowd swell on TD, a broadcast "sting" for lead changes, a soft tick for points. 60 KB total, opt-in.
8. **Smart home-screen shortcuts** (manifest shortcuts are now in place) plus "Add to Home Screen" coaching for iOS, since there is no install prompt API on iOS.
9. **League "Moment of the Week" vote:** needs shared state, so it requires a small Worker KV backend (honest about it; easy to add with the existing Worker).
10. **Option B 3D Cinema mode** (MapLibre), if approved.

Explicitly **not** promised: broadcast video highlights (licensing), real push notifications (needs a push backend plus iOS PWA install), synced live chat (needs moderation and a backend).

---

## 7. Technical plan

### 7.1 New and changed files
| File | Purpose | Est. size |
|---|---|---|
| `js/data/replay.js` | Replay engine (section 2.1) | 9 KB |
| `js/data/season-stats.js` | Season engine and KPIs (section 3.2) | 12 KB |
| `js/ui/film-clock.js` | Master clock, scrubber, speed, export hook | 4 KB |
| `js/features/drive-race.js` | Race renderer, tower, tiles, mini-map | 12 KB |
| `js/features/drive-summary.js` | Strava summary (pace chart, splits, achievements) | 7 KB |
| `js/features/flyover.js` | Map renderer, ball physics, split-screen, title cards | 12 KB |
| `js/features/wrapped.js` + `css/wrapped.css` | Story player and slides | 14 KB + 6 KB |
| `data/us-places.json` | ~300 city-light points (lat, lng, pop) | 9 KB |
| `drive.html` | Mode switcher: Race / Flyover / Classic | edit |
| `share.js` | Export reads renderers through film-clock | edit |
| `sw.js` | Shell additions, version bump | edit |

Route payload estimates: Drive page about 178 KiB today → about 196 KiB with race + flyover if loaded eagerly. **Mitigation:** lazy-import the inactive mode's renderer (race loads first, flyover on tap), so about 175 KiB initial. Wrapped loads only when opened (0 KiB added to Home).

### 7.2 Storage
- `kt-livedata` IndexedDB: `replay:v1:*`, `season:v1:*` (computed caches, pruned by the existing 14-day policy for live weeks; completed-season caches pinned).
- `kt-wrapped:v1` (localStorage, small): last viewed slide and per-season "seen" flag for the one-time prompt.
- No new secrets. The only AI addition is a `wrapped` feature in the Worker with a strict JSON schema, Sonnet, 600 max tokens, a cache TTL for the season, and 3/min per league.

### 7.3 Performance guardrails
- All renderers use pre-allocated arrays; no per-frame object creation in hot loops.
- Canvas sized to devicePixelRatio capped at 2; particle count adapts to measured frame time (drops by 25% if the 1s average exceeds 18ms).
- Off-screen and hidden tabs pause the clock (`visibilitychange`).

### 7.4 Phased delivery
| Phase | Scope | Estimate | Ships something usable? |
|---|---|---|---|
| 1 | Replay engine + tests against 3 real weeks | 1 session | Powers a better "Watch your week" immediately |
| 2 | Drive Head-to-Head race + F1 mini-map + tiles + TD | 1-2 sessions | Yes, a new Drive mode |
| 3 | Strava Activity Summary + achievements | 1 session | Yes |
| 4 | Flyover (Option A) with sync, split-screen and title cards | 2 sessions | Yes, replaces the current map mode |
| 5 | Season engine + Wrapped 2.0 story + exports | 2 sessions | Yes |
| 6 | Live mode, Matchup Pill, fantasy win probability | 1-2 sessions | Yes |

Each phase ends with the persona review panel (designer, motion, accessibility, performance) and the existing test matrix (14 routes × 2 themes, third-party-down, offline, sacred math).

---

## 8. Risks and honest constraints
- **Name matching** in play text is heuristic; the anchor-to-official-total step guarantees final accuracy, but *timing* of a rare unmatched play can be approximate. This is labeled when it happens.
- **ESPN's API is unofficial** and could change shape; the replay engine is isolated behind one adapter with the fallback ladder.
- **iOS Safari** has no vibration API and limited MediaRecorder codecs; video export falls back to the Story Pack PNGs (already implemented).
- **Trademarks:** no NFL or team logos and no film footage; city typography plus team colors only. The *Draft Day* reference inspires the lockup style, not its assets.
- **AI copy** stays optional and guardrailed; every number on screen is computed, never generated.

## 9. Decisions needed from you
1. **Map tech:** Option A (recommended, on budget) or also Option B Cinema mode (needs a budget exception).
2. **Wrapped AI captions:** yes/no (adds about $0.02 per manager per season).
3. **Build order:** recommended Replay → Drive race → Strava summary → Flyover → Wrapped → Live mode.
4. **Film length default:** 45s (also 30s/60s available).
5. **Worker deploy:** the Yahoo, ESPN athlete and pricing fixes plus the future `wrapped` feature need one private `deploy.py` run from you.

## 10. Status of work already shipped (for the record)
- **Live in production (`151136b`):** performance overhaul (homepage 13 → 60 fps; pages appear about 3-4× sooner; returning visits under 0.1s), storage and service-worker fixes, about 30 bug fixes, and the Yahoo connector code (not live until the Worker deploy and a Yahoo app).
- **Round 1 polish (ready, awaiting your OK to commit):** AI now actually on for all visitors, no first-visit badge hijack, jargon removed, gauge/hero fixes, PNG share preview and app icons on every page, press feedback.
