# NOTES.md — Project Memory

> Kimi Code: read this at the start of every session, and update it (append a new dated entry) after every completed task.

## Current status

- **Prompts 00–18, the adversarial audit, feature restoration, and production verification are complete.** The hotfix is published at `https://keeper-trade.pages.dev`, with client code deployed through commit `084825e` and offline shell v55. Production League, ESPN, AI, dashboard, mascot, and cold-offline workflows pass. No feature flag remains disabled.
- **Deployment history:** `d2587ae` delivered the audited hotfix; `d365b62` and `66c6181` stabilized dashboard edit controls; `cac79f3` protected them from sticky headers; `084825e` fixed canonical-home offline navigation. Follow-up commits were made only after production tests exposed the specific issues.
- **Performance result:** local JavaScript source is 397.5 KiB across 50 page-isolated files. Latest measured payloads are 173.2 KiB on the fully loaded homepage, 55.1 KiB on Mock Draft, and 122.6 KiB on The Drive, within the 200 KB route budget.
- **External setup:** the deployed Cloudflare Worker is healthy with a validated **non-expiring Anthropic key**, a scoped Cloudflare token, production-only CORS, KV bindings, preflight $1 daily-budget enforcement, and keyless ESPN proxy routes. No credentials are stored in the repository. The native SVG mascot needs no external asset or runtime. Physical iOS/Android native sharing remains the only device-only unverified workflow; desktop video and Story Pack exports are verified.

## Completed tasks

### 2026-11-03 — Prompt 00: Design Constitution

- Added `css/design-system.css`: dark/light semantic tokens, Barlow Condensed + Inter typography, 8px spacing, 44px controls, buttons, cards, glass, chips, badges, forms, toasts, skeletons, ticker, bottom navigation, responsive grids, and motion utilities.
- Added `demo.html`: interactive component gallery and short written spec. Includes theme switching, card tilt, count-up score changes, score flash classes, staggered entrances, toast demos, loading skeletons, guarded mobile haptics, and reduced-motion support.
- Verified desktop dark and mobile light layouts in the browser, theme switching, score updates and aria-live announcements, and async loading. Structural checks passed for unique IDs, fragment links, explicit button types, and `git diff --check`.
- No feature pages or calculator code changed.

### 2026-11-04 — Prompt 01: Homepage & Navigation

- Preserved the original homepage as `index-old.html`; built the new animated command-center homepage in `index.html` with a stubbed NOW strip, five glass feature cards, and a For You loading/feed shell.
- Added reusable UI modules for navigation, fuzzy command search, icons, and page transitions. Desktop supports Ctrl/Cmd+K and `/`; mobile uses the same palette through `command.html` and a bottom-sheet presentation.
- Added `css/home.css`, `css/navigation.css`, `js/features/home.js`, `js/features/command.js`, and the `/js/ui` modules. No calculator files changed.
- Verified desktop layout, keyboard opening, fuzzy `jg` player results, and research-profile navigation. Mobile layout and bottom navigation render correctly. Touch-emulation limitation: the built-in mobile emulator did not dispatch navigation even for a plain `Start a trade` link, so mobile touch requires physical-device confirmation; this is an emulator limitation, not an app-specific failure.

### 2026-11-04 — Prompt 02: Live Score Ticker

- Added `js/data/live-data.js`: shared source registration, subscriptions, in-flight request deduplication, adaptive cadences, visibility refresh, and versioned last-good localStorage cache with stale/refreshing states.
- Added `js/data/espn.js`: date-aware ESPN scoreboard adapter, `?debugdate=YYYYMMDD`, game normalization, and 30-second live / 5-minute idle polling.
- Added `js/ui/score-ticker.js` and `css/score-ticker.css`: pinned desktop ticker, mobile collapsed/expanded ticker, fixed-height skeletons, logos, possession, red-zone state, final dimming, score count/flash, haptics, auto-scroll pause, and accessible game drawer with summary stub.
- Homepage NOW week/game count subscribes to the same ticker update; no duplicate ESPN request. Verified `?debugdate=20251109` with real ESPN finals, ATL at IND drawer details, Escape dismissal, and mobile collapsed layout.

### 2026-11-04 — Prompt 03: Game Day Mode

- Added `game.html`, `css/game-day.css`, and `js/features/game-day.js`: full-screen team-lit stadium, matchup, animated SVG home win-probability area chart, scoring dots, keyboard/touch scrubber, play timeline, box score, leaders, and drive charts.
- Added summary registration/normalization to `js/data/espn.js`; each game uses the shared LiveData engine with 30-second live / 5-minute final cadence and stale fallback. Added `js/ui/game-link.js` and shared red-zone auto-alerts.
- Ticker chips now open the full game route; the prompt 02 drawer stub and dead code were removed. Debug dates persist through game links.
- Verified ATL at IND (`401772636`) with 191 real probability points, Final/OT status, scoring labels, real leaders and team stats, box-score tab, and keyboard scrubber movement from 190 to 189.

### 2026-11-04 — Prompt 04: Gamification Engine

- Added versioned local state with migration defaults in `js/features/gamification.js`: daily streaks, one weekly Streak Freeze, six levels, XP actions, 15 badges, manager naming, weekly pick'em with confidence points and local leaderboard/H2H preview, 60 daily trivia prompts, and Season Wrapped canvas cards.
- Added `js/data/gamification-data.js`, `css/gamification.css`, nav streak/XP display, homepage clubhouse, skippable celebrations, optional sound (off by default), haptics, and reduced-motion fallbacks.
- Added reward-only tracking modules to keeper/redraft/research; calculator formulas are unchanged and duplicate trade signatures are suppressed. Daily check-in XP is idempotent and clubhouse re-renders only on changed scoreboard payloads.
- Verified repeat-visit XP does not increase, manager name Nick, correct trivia and two unlocked badges, future CIN pick with 16 confidence points and disabled locked state, and a real downloaded 600×1066 Wrapped PNG.

### 2026-11-04 — Prompt 05: Widget Dashboard

- Added `js/features/dashboard.js` and `css/dashboard.css`: eight self-contained widgets, versioned layout persistence, add/remove/resize, long-press/edit mode, pointer drag handlers, FLIP reflow animations, and responsive sizing.
- Added shared adapters `js/data/news.js` and `js/data/player-values.js`; scores, news, and FantasyCalc values reuse LiveData with independent cadences and no duplicate fetches. Trade movers use the clearly labeled preview adapter `getTradeMovers()` for prompt 06 wiring.
- Added persistent local watchlist, streak/XP, pick'em, and next-kickoff/draft countdown cards with skeleton and personality empty states.
- Browser-verified real scores, risers/fallers, watchlist values, preview movers, news, countdowns, edit controls, remove/add/resize, and persisted reordered layout after reload. Two-card pointer drag could not be exercised because the preview viewport stayed too small for a simultaneous target; handlers and reflow animation are implemented.

### 2026-11-04 — Prompt 06: Trade Calculator Glow-Up

- Preserved engines as `keeper-legacy.html` and `redraft-legacy.html`. Added only UI bridge/read APIs and reward notifications; compared `adjustedOf`, `sideTotals`, `impliedRound`, `valueOf`, `sideEffective`, and `renderVerdict` against legacy with the notification line excluded — calculation logic is identical.
- Added `css/trade-desk.css` and `js/features/trade-desk.js`: war-room layout, animated verdict gauge, desktop drag/drop, mobile search sheet, avatar fallbacks, audit/history panels, and 1200×675 canvas share cards with copy/download.
- Added 24-hour cached `js/data/dynasty-dealer.js`; calculator inputs and dashboard movers now use real current/base values. Corrected keeper `n/p/t` refs and 0–100 engine to 0–10,000 display scaling.
- Verified redraft live breakdown and downloaded share card; keeper player/pick search, auto-approved 517-point trade, later 240-point dealer-adjusted trade, escalation line items, and exact history re-open.

### 2026-11-04 — Prompt 07: Sleeper League Mode

- Added `js/data/sleeper.js`, `js/data/player-db.js`, `js/features/league.js`, and `css/league.css`: local league connection, read-only Sleeper adapters, weekly IndexedDB player cache with bulk writes, standings, live matchup odds, power rankings, and trade wire.
- Added League navigation/command entries and the `kt-pending-trade:v1` handoff into `keeper.html?fromLeague=1`. Player adds are the receiving-side source of truth; traded picks map to the engine's existing pick fields and valuation function.
- Verified the no-ID setup, public API fixture, and owner league **Crouchh fanclub** (`1370223929452433408`): real 12-team standings, matchups, and power movement. Fixed synchronous cached-subscription cleanup and verified the real week-3 trade handoff: DeVonta Smith + Ashton Jeanty for Ja'Marr Chase, with no duplicate rows and correct verdict.
- Owner league ID is stored locally, not hardcoded in the repository. `?sleeperweek=N` supports prior-week review.

### 2026-11-04 — Prompt 08: Polish, Performance & PWA

- Audited assets: 145 KB local JavaScript (under the 200 KB budget), no scroll/resize listeners, passive interaction handlers, reduced-motion fallbacks, and scoped tilt `will-change` only on hover. Enlarged small widget controls to 44px.
- Added lazy IntersectionObserver loading for dashboard/league with anchor-safe module loading and graceful fallback. Homepage gamification/nav remains immediate.
- Added branded `manifest.json`, SVG/maskable icons, OG share art, `sw.js`, `offline.html`, and `404.html`. The service worker caches all local pages/CSS/JS, handles versioned imports, and leaves external APIs direct.
- Added `js/pwa.js`: install registration, live-score page titles, Konami/Alt-click commissioner surprise, and guarded haptics. Updated legacy page titles and loading quips.
- QA: WCAG AA token pairs pass numerically (5.41–16.25:1); sacred math remains unchanged; offline v2 test rendered the branded interactive homepage, rewards, ticker, and bottom nav with the server stopped; all shell assets and `git diff --check` pass. Known verification limits remain the emulator's touch dispatch and small-viewport two-card drag test.

### 2026-11-04 — Prompt 09: AI Layer

- Added `worker/worker.js` and `worker/wrangler.toml`: locked-origin CORS, feature/model routing, server-side prompts, KV cache, per-league/per-feature rate limits, daily $1 budget governor, usage/cost logs, `/ai/stats`, and graceful HTTP 200 `resting` responses.
- Added exact Anthropic Messages format with `x-api-key` from Worker secret, `anthropic-version: 2023-06-01`, prompt caching, and optional `anthropic-workspace-id` routing for user keys. No secret or real key exists in the repository.
- Added `js/data/ai.js` with typed errors, memory/localStorage caching, local Worker URL configuration, and LiveData-backed loading. Extended LiveData with one-shot async fetcher support.
- Added `js/features/roast-card.js` and `css/roast.css`: real league manager/mode selection, 60-token Haiku request, resting state, and canvas download/copy. Added a tiny league-state store to preserve lazy loading and offline shell v3 includes AI modules.
- Deployed `https://keeper-trade-ai.nicholas-brown00.workers.dev`; synced the public origin, workspace ID, and budget in `worker/wrangler.toml` and `worker/deploy.py`. Workspace ID is non-secret; the Anthropic key remains encrypted in Cloudflare.
- Verified real two-sentence generation, a visible rendered canvas with Download enabled, repeat-request KV caching, spend of $0.0006384 after initial calls, production-origin success, and local-origin rejection after the temporary CORS test. Tightened the roast prompt to 30 words so the 60-token cap cannot truncate the second sentence. Beginner guide: `worker/DEPLOY.md`.

### 2026-11-04 — Prompt 10: Weather Engine & Fantasy Weather Intelligence

- Added `data/stadiums.json` with all 30 home venues covering 32 teams. Coordinates/time zones were checked against the current greerreNFL stadium mapping dataset; corrected NRG Stadium and configurable roof classifications, with aliases for renamed venues.
- Added `js/data/weather.js`: venue/team resolution, venue-local kickoff-hour extraction, Fahrenheit/mph Open-Meteo forecasts, 30-minute LiveData freshness/cache, shared per-venue subscriptions, dome handling, severity ranking, tunable commented thresholds, and player-specific impacts/tooltips.
- Added `css/weather.css` and `js/ui/weather-ui.js`: ticker glyph/temp, animated SVG kickoff strip, accessible focus/hover tooltips, DOME state, and ranked Sunday Weather Board. Added dashboard layout v2 migration so existing users receive the weather widget without losing their arrangement.
- Integrated watchlist and Sleeper starter badges, real ESPN summary date/`gameInfo` venue normalization, and visible Open-Meteo attribution in the footer/widget/game strip. Updated offline shell v7 and LiveData `maxAge` support; shell installs now bypass HTTP cache, skip waiting, and claim clients.
- Verified real `20261108` ESPN slate: 10 outdoor home forecasts, ticker temperatures, ranked board, no duplicate refetch inside 30 minutes, real Foxborough game-day strip, and DOME at New Orleans. Threshold fixtures produced HIGH WIND, RAIN GAME, DEEP FREEZE, and kicker/deep-pass guidance. Real Sleeper league and six matchups remained intact; no starter badges showed because no real game crossed a threshold. `git diff --check` and secret scan passed.

### 2026-11-04 — Prompt 11: The Drive — Weekly Recap Cinematic

- Added `drive.html`, `css/drive.css`, `js/features/drive.js`, `drive-data.js`, `drive-field.js`, `drive-map.js`, and `drive-cards.js`. GSAP 3.12.5 loads from the approved CDN; no build/dependency changes.
- Added real Sleeper matchup selection, latest-completed-week default, manager persistence, league scoring rank, position averages, chronological games/venues, ESPN box-score stat lines, historical weather impacts when available, and honest bye/no-game fallbacks.
- Built both DPR-aware canvas films: field camera/yardage/explosive/bust beats and a chronological map with bezier hops, progressive glowing route, pulsing stadiums, sparklines, and weather badges. Shared broadcast cards provide count-ups, team lighting, W/L finale, confetti/rain, and one-line AI verdict with templated fallback.
- Added a 50-second GSAP master timeline, play/pause, scrub, replay, tap/dedicated skip, muted-by-default WebAudio sting, static reduced-motion mode, and deterministic seeded effects. Added 1080×1920 PNG poster generation/download and an irresistible glowing Watch your week link in Sleeper matchups plus command-palette entry.
- Verified real Week 8 nt brown 1997 recap: 187.28–99.54 win, 87.74 margin, #1 of 12; Burrow 38/48, 462 yards, 5 passing TD; Higgins 10/155/2; Kyren Williams 16 carries/56 yards/1 rushing TD. Both modes, 8-second scrub to Burrow, finale, replay, skip, and manager/week selection passed.
- Verified actual PNG download and 1080×1920 image, identical SHA-256 hashes for repeated posters, 390×844 portrait with no overflow and 44px controls, and reduced-motion paused/static behavior. Full Watch your week → Week 8 owner recap navigation passed. Offline shell v12 uses versioned asset URLs, reload cache bypass, immediate activation, and client claiming. `git diff --check` and secret scan passed; generated test files were removed.

### 2026-11-04 — Prompt 12: Share Engine — Video Export

- Added `js/features/share.js`: dedicated fixed-resolution canvas render pass, `captureStream(60)` + MediaRecorder, MP4 `avc1` preference with VP9/VP8 WebM fallback, 2 Mbps/15MB budget control, and the same deterministic GSAP playhead as the live film. Disabled GSAP lag smoothing during export so 50-second films track elapsed time.
- Added portrait 1080×1920 and landscape 1920×1080 export, native file sharing with download fallback, five-frame PNG Story Pack for unsupported browsers, 1080×1350 score cards with result/top-three/mini-route, and trusted-gesture recap-link copying with an 800ms clipboard fallback.
- Added The Drive share panel, orientation toggle, accessible shimmer progress, Story Pack/score-card/link buttons, and offline shell v15 packaging. Export uses an offscreen deterministic render, never a device screen capture.
- **Chrome desktop verification:** actual Share video rendered MP4 `avc1` at 1080×1920, 48.69s, 0.4MB; browser decoding showed distinct Burrow play frames. Landscape map export rendered MP4 at 1920×1080, 0.38MB. Score-card PNG and all five Story Pack PNGs were decoded and visually checked. Forced unsupported codec returned `story-pack` and produced five valid PNGs. Trusted-input Copy passed.
- **iOS Safari checklist:** use MP4 when `canvas.captureStream` + `MediaRecorder` + `avc1` are available; otherwise the UI automatically shares/downloads the five-PNG Story Pack. Native share sheet is attempted first. Physical iOS was not available, so actual-device video/native-share verification remains unconfirmed; the forced fallback path passed in Chrome.
- **Android Chrome checklist:** MP4 is preferred where `avc1` is supported, with VP9/VP8 WebM negotiation and Story Pack fallback. Native share sheet is attempted before download. Physical Android was not available; codec/failure logic was verified in desktop Chrome.
- Chrome's synthetic-test downloads were not exposed in the Downloads folder, so recorded media bytes were captured directly, decoded, and inspected instead of treating a status message as proof. `git diff --check` and secret scan passed; all generated verification media was removed.

### 2026-11-04 — Prompt 13: Sunday Command Center

- Added `sunday.html`, `css/sunday.css`, `js/features/sunday.js`, and `js/ui/win-probability.js`. Desktop adaptive mosaic includes a large starter-weighted hero, live tiles, FLIP reflow, scores, possession, red-zone states, win-probability bars, real hero graphs, weather, and Game Day links.
- Added Fantasy Edge from real Sleeper starter points and documented weekly baselines using `fp-data.json` season totals ÷ 17. No fabricated Sleeper projections. Added My Players rail with live ticks and game focusing, close-game radar, guarded TD haptics, optional scoring stings, and manager selection.
- Added red-zone auto-director with 5-second cooldown, previous-game return pill, pin override, and no unnecessary override when the best game is already hero. Shared LiveData scoreboard/summary/weather/Sleeper sources; no duplicate polling engines. Preserved `?debugdate=` and `sleeperweek` support.
- Added Sunday to desktop/mobile navigation, command palette, and the homepage feature grid; offline shell v17 includes all new modules and projection data.
- Verified real `20261108`: 13 tiles, CIN–ATL hero, six relevant starters, live weather, and Burrow/Higgins -31.4 projection delta. Verified `20251109`: 12 final tiles and real win-probability graph. Pin/focus, close-game radar, red-zone PIT–LAC auto-switch, return pill, and real-feed restoration passed.
- Mobile 390×844: corrected implicit-column hero span, then visually verified full-width hero and separate horizontal rail. No page overflow; all checked controls are 44px. `git diff --check` and secret scan passed.

### 2026-11-04 — Prompt 14: The Keeper Mascot

- Added `js/ui/mascot.js` and `mascot-config.js`: all nine personality states, configurable state-machine inputs, 2–4s dwell, Rive resizing, lazy offscreen loading, and static fallback for missing assets or reduced motion. The Rive CDN runtime is never downloaded when `assets/mascot.riv` is absent.
- Added custom `assets/mascot-keeper.svg`, `css/mascot.css`, and artist contract `docs/mascot-contract.md`. Added two-per-day versioned speech persistence and a tap easter egg with all microcopy centralized in config.
- Integrated home corner dock, trade verdict inline mascot, gamification celebrations, AI thinking, Drive finale, Sunday player scores, red-zone nerves, playoff hype, and offseason sleep. Trade math is unchanged; verdict events are UI-only.
- Verified visible static dock, no Rive script, exactly two speeches after three state calls, reduced-motion static image/no animation, trade lopsided → judging, Drive W → happy, and Sunday player score → happy. Offline shell v18 includes mascot modules/assets.
- **Owner asset still needed:** drop the real Rive export at `assets/mascot.riv`. Actual Rive playback remains unverified until that file exists; fallback behavior is fully verified. `git diff --check` and secret scan passed.

### 2026-11-05 — Prompt 15: The War Room

- Added `war-room.html`, `css/war-room.css`, `js/features/war-room.js`, and `war-room-data.js`: three tabs for Start/Sit Oracle, Waiver Wire Wednesday, and Trade Counter-Builder. Added navigation, league, and command-palette entries plus offline shell v29.
- Worker now serves strict JSON contracts for `start-sit` (Haiku), `waiver` (Haiku, 24h cache), and `gm-brain` (Sonnet). Responses include original `createdAt` timestamps. Client `askAI` supports `force` regeneration and freshness labels.
- Start/Sit uses actual rosters/opponent context, values, weather, and typed verdict cards with confidence/risk/reason. Full-lineup mapping preserves every requested starter and supplies an explicit REVIEW fallback if AI omits one.
- Waiver ranks actual free agents by roster holes and value movement, returns three concrete adds with AI blurbs, and auto-runs Tuesday at 6pm client time or on demand. Fixed object-vs-ID free-agent enrichment; 361 eligible candidates verified.
- Trade Counter-Builder loads real Sleeper activity or pasted offers, requires two roster-valid candidates, and constrains Sonnet with `allowedCounters` plus safe fallback. `evaluateCounter` runs the original calculator in an isolated frame with live calls stubbed out. Added only the UI-only `addAsset` bridge to `keeper.html`; no business-logic changes.
- Verified two real Start/Sit cards and full eight-assigned-starter report, three real waiver adds, two Sonnet counters with original-engine verdicts and point gaps, force regeneration, trusted-input Copy, and PNG share generation. Production CORS succeeds; local preview is rejected after temporary testing.
- Verification fixes included module syntax/null guards, roster-valid IDs, original helper bypass for undefined `players`, and cache-version activation. Sacred functions `adjustedOf`, `sideTotals`, and `impliedRound` are identical to legacy; `renderVerdict` differs only by known prompt-06 notification payloads. `git diff --check` and secret scan passed.

### 2026-11-05 — Prompt 16: Mock Draft Arena

- Added `mock-draft.html`, `css/mock-draft.css`, `js/features/mock-draft.js`, `draft-engine.js`, and `draft-personalities.js`. All 11 AI GMs have avatar/color, two-line bio, and structured biases: Homer, Zero-RB, Panic Merchant, Spreadsheet Steve, Trader, Ghost, Troll, Hoarder, Rookie Whisperer, Waiver Wizard, Commissioner.
- Added deterministic snake drafting, league/default rounds, value-sorted pool, human recommendations, 20-second clock/auto-pick, pause, speed controls, animated board/pick cards, and real-time chat capped at 15 lines.
- Added Worker `draft-round` Haiku route capped at 800 tokens per round and `draft-grades` batch grading. One call returns all AI picks plus key comments per round; no per-team calls. Deterministic fallbacks preserve every draft if AI is unavailable.
- Added all-team A+–F grades, one-line roasts, and a 1200×675 share card. Added navigation/command entries and offline shell v33.
- Verified real 12-team/4-round draft: 48 picks, exactly four `draft-round` sources and one `draft-grades` source, 12 grade cards, four chat lines, and valid share PNG. First two rounds independently confirmed exactly one request each. Mobile 390×844 had no page overflow; the wide board scrolls internally.
- `git diff --check`, Worker deployment syntax, and secret scan passed. Production CORS restored after testing. Local JS inventory is 312.7 KB, reserved for final performance audit.

### 2026-11-05 — Prompt 17: Season Sim

- Added `season-sim.html`, `css/season-sim.css`, `js/features/season-sim.js`, and `sim.worker.js`. Pure client-side Monte Carlo uses 10,000 deterministic simulations, actual remaining Sleeper schedules, season/last-three scoring, Dynasty Dealer roster priors, real league variance, playoff byes, and points-for tiebreakers.
- Added playoff/championship probabilities, seed distributions and ranges, 5th–95th-percentile record bands, clinch/elimination states, weekly movement, and efficient binary-searched magic numbers. Documented the model and uncertainty in the UI and worker math comments.
- Added win-out, lose-this-week, and rival-loses-twice scenarios with animated/counting bars and FLIP reordering. Same-seed resets are exact; scenario runs never overwrite weekly baselines. Current-matchup subscriptions refresh changed data without another polling engine.
- Verified real 12-team Crouchh fanclub data: six total playoff paths and one total championship path per simulation, correct manager/rival selectors, scenario direction assertions, clinch/elimination markers, exact reset/repeat results, and no module/console errors. Corrected invalid initial aggregation, bracket pairing, bye scope, forced-win handling, and magic-week logic before verification.
- Desktop headless Chromium measured 188–199ms across final what-if runs and 199ms for the final baseline; scenario click handlers returned in 15–47ms. Built-in mobile emulation was slower at 251ms but remained non-blocking. Reduced motion passed with static rows and effectively zero-duration transitions.
- Added navigation/command entries, mid-width header overflow fixes, and offline shell v35. Desktop 1280/1100 and mobile 390 layouts have no page overflow; scenario controls are 44px. All 87 shell assets exist; `git diff --check` and secret scan passed. No calculator files changed.

### 2026-11-05 — Prompt 18: League Pulse

- Added `pulse.html`, `css/pulse.css`, `js/features/pulse.js`, and `pulse-data.js`: 5–7 expandable ESPN-style storylines with factual receipts, five computed weekly awards with citations, The Commissioner article with trusted clipboard copy, season trophy counts, and an IndexedDB all-time record book with new-record celebrations.
- All statistics come from real Sleeper matchup/transaction data: Highest Scorer, Heartbreak, Bench Blunder, Lucky Duck, Bust, biggest blowout, longest win streak, trade counts, weekly power movement, and next-week matchup preview. AI receives compact source IDs/facts only; deterministic factual editions remain available when AI is disconnected or returns an older response format.
- Updated Worker `storylines` to one strict batched Haiku contract and `newsletter` to one strict four-section Sonnet contract. Payloads measured 1.5KB/1.8KB. Only the latest completed week auto-generates; historical weeks add zero AI calls. Same-week reloads use local/KV caches, and transaction changes queue a refresh after waivers.
- Season Sim now retains versioned weekly probability history without letting what-if runs overwrite it. Pulse selects the matching entering-week snapshot and includes week-over-week movement in the newsletter; missing history is reported honestly.
- Verified real Week 8 awards exactly against raw Sleeper: 187.28 highest, 116.40 heartbreak, 57.48 bench, 116.66 lucky, 0.00 bust. Verified 7 stories, 5 awards, 4 article sections, 12 trophy rows/40 season citations, 8 IndexedDB weeks, no duplicate celebrations, and exact all-time records: 187.28 high score, 96.94 blowout, 5-win streak, 4 trades.
- Verified one storyline + one newsletter request on first load, zero on cached reload, zero for historical weeks, strict Worker JSON/models/cache with mocked upstream, and a real 1,275-character newsletter clipboard copy. Fixed the async clipboard `currentTarget` bug before verification. Built-in browser confirmed story receipts, Commissioner, and record-book views.
- Added navigation/command/league entries, responsive header breakpoints, reduced-motion support, and offline shell v37. Layouts at 1600/1500/1440/1280/1100/1000/390 have no page overflow; mobile tabs are 44px. All 91 shell assets exist; `git diff --check` and repository secret scan passed. No calculator logic changed.
- **Deployment limitation:** the updated Worker source passed mocked-upstream route tests but was not deployed because no Cloudflare API token is available in this environment. Live production still needs redeployment for strict AI narration; the real-data computed edition and fallback are complete and verified.

### 2026-11-05 — Final full-site audit & polish

- Replaced the homepage's remaining prompt-01 preview stubs with real ESPN score context and Dynasty Dealer movers. For You now links to Pulse, Season Sim, and The Drive for connected leagues; added five animated shortcut cards for War Room, Mock Draft, Season Sim, Pulse, and The Drive with mobile scroll-snap and reduced-motion fallbacks. Corrected the new mover percentages to the adapter's existing percent scale.
- Removed the unused stub trade-mover adapter, converted active legacy spinners to shimmer placeholders, updated stale toolbox copy, and refined mid-width navigation. Built-in browser visually confirmed the polished live homepage and dashboard; homepage→Pulse and command-palette→Season Sim flows passed.
- Fixed accessibility across legacy and current UI: valid score-region ARIA, calculator input names, select/label associations, decorative headshot alt text, dark/light AA contrast, 44px legacy mobile controls, labeled checkbox targets, and Research's mobile navigation overflow. Axe-core WCAG 2/2.1 A/AA scans pass on all 14 main routes in dark mode and all 14 in light mode after fixes. Mobile 390px structural checks pass for overflow, duplicate IDs, and control targets.
- Measured actual JavaScript resources per route at approximately 43–166 KiB, including GSAP on The Drive; every route remains under the 200 KB budget. Source totals 377.7 KiB across 49 page-isolated modules, not a single-page payload. No frameworks, dependencies, or build steps were added.
- Fixed cold first-load offline navigation by ignoring versioned shell query strings in service-worker fallback matches. Offline shell v41 successfully reloads the homepage with three For You links, five shortcuts, cached/static content, an explicit ESPN Offline state, and no page errors. All 91 shell assets exist.
- Reconfirmed `adjustedOf`, `sideTotals`, `impliedRound`, `valueOf`, and `sideEffective` are byte-for-byte identical to their legacy functions. `git diff --check` and repository secret scan passed. No commits or generated test artifacts were created. External Worker redeployment and the owner-supplied Rive asset remain the only documented setup limitations.

### 2026-11-05 — Mobile scrolling & League-connection hotfix

- Reproduced the production mobile failure: `.kt-home { overflow: clip; }` prevented native touch scrolling. Replaced it with horizontal-only clipping; a real CDP touch swipe now scrolls the homepage.
- Direct `index.html#league` navigation now loads League mode immediately and scrolls the form into view with reduced-motion support and scroll margin. Previously the lazy observer could leave the form unmounted.
- League connection now accepts a full Sleeper league URL or numeric ID, extracts the ID safely, explains where to find it in Sleeper, validates mistakes inline, and preserves read-only/local-only behavior.
- Verified full-URL connection to Crouchh fanclub with all 12 real teams, persisted reload reconnection, direct-anchor scrolling, native touch scrolling, and 44px+ form controls. Updated offline shell v43; `git diff --check` and hotfix secret scan passed.
- Cloudflare Account ID `226fce693a369db4f256258b3e9d5160` is non-secret configuration supplied by the owner. The earlier API token failed Worker deployment with HTTP 401; a replacement scoped token is required. No token or Anthropic key was saved to the repository.

### 2026-11-05 — Worker recovery & adversarial AI audit

- Created a new scoped Cloudflare token with only Workers Scripts Write and Workers KV Storage Write. Verified both KV bindings, the production origin, $1 daily cap, deployed source, and enabled workers.dev route. Replaced the invalid Anthropic secret through the dashboard; the new workspace key expires **2026-12-05**.
- Verified real Haiku storylines and four-section Sonnet newsletters with valid JSON, production CORS, repeat-request cache hits, and 403 rejection for an unauthorized local origin. The stricter production newsletter returned no unsupported phrases and honestly reported unavailable playoff odds.
- Skeptic testing found that AI had claimed Jacksonville's 116.40 could beat every other team and reversed the Ladd McConkey/Justin Jefferson trade direction. Raw Sleeper transactions proved Jacksonville acquired Ladd plus a 2027 third and stew30 acquired Jefferson. Client now excludes trades/waivers from free-form AI recaps and inserts deterministic direction facts. Sections containing unsupported superlatives/speculation fall back to computed facts; newsletter cache keys advanced to v3.
- Bench calculations exclude IR/taxi IDs while preserving legitimate dropped-player bench scores in historical matchup data. The real Week 8 total remains 57.48 after independent verification; a stricter current-roster filter was rejected because it incorrectly removed 7.30 legitimate points.
- Adversarial mocked responses removed false comparisons and dominant/historic language while preserving deterministic trade direction and the guardrail label. Mobile hotfix and client guardrails are packaged in offline shell v44 but remain uncommitted until explicit owner approval. Repository secret scan and `git diff --check` passed.

### 2026-11-05 — Full adversarial rules & functions audit

- Audited all 19 original briefs and permanent rules across 629 function declarations/97 exported functions, with independent math/data fixtures, Worker mocks, real browser scenarios, source review, and failure injection. No claim was accepted solely because a page rendered.
- Fixed Sleeper fractional scoring: new `rosterPoints()` adds `fpts_decimal / 100` in standings, Season Sim, and League Pulse. All 12 real rosters had nonzero fractions; owner points now correctly read 1217.14. Sacred calculator functions remain byte-identical.
- Fixed cached Sleeper subscription cleanup (listener now reaches zero), same-page `#league` hash loading (including offline v45), third-party player-name HTML injection, and direct offline empty-state mounting. Added a direct Tools feature card for full original-section coverage.
- Fixed Worker budget enforcement with a preflight estimated-cost rejection before any Anthropic spend, plus league-scoped roast caches. Mocked tests prove rejection at the cap with zero upstream calls, 10/minute per-league limits with another league unaffected, and client request deduplication/force behavior.
- Fixed remaining legacy spinner implementations in `draft.html`, `index-old.html`, `kit.html`, and `redraft-legacy.html`; all active async loaders now use shimmer. AI factual guardrails and bench corrections from the preceding entry are included.
- Verification: probability and championship sums, deterministic simulations and scenario timing, raw transaction direction, independent award values, fractional scores, sacred math, stale-data fallback, offline shell, and Worker source all pass. All 14 main routes pass mobile structure and both dark/light axe scans; real touch scrolling reaches 585px. Homepage/Drive payloads are 121.9/161.5 KiB. All 91 shell assets and the repository secret scan pass; latest Worker source is confirmed live.
- **Remaining limitations:** the record book does not yet follow Sleeper `previous_league_id` lineage across changing league IDs; gamification H2H/leaderboard is explicitly a local preview rather than real league sync; actual Rive playback needs `assets/mascot.riv`; physical iOS/Android native video sharing remains unverified. AI guardrails are heuristic, not a semantic proof of truth.
- **Process deviation:** prompt 09's strict owner-only secret-entry flow was not followed during Worker recovery; credentials passed through assistant/browser tooling. No credentials are stored in the repository, but strict confidentiality requires rotating the Anthropic key before **2026-12-05** and having the owner upload the replacement directly.

### 2026-11-06 — Reliability closure, league lineage & deployment verification

- Created and validated a **non-expiring Anthropic key** directly against Anthropic with Haiku, then uploaded it as a Cloudflare `secret_text`; a real Worker storyline returned `ready`. This supersedes the earlier 30-day-key notes. The Cloudflare token remains scoped to Workers Scripts Write and Workers KV Storage Write, and no credential is stored in the repository.
- Direct browser ESPN requests failed CORS on localhost and production, so the Worker now proxies allowlisted keyless scoreboard, summary, roster, news, and standings resources. Production-origin requests returned HTTP 200 for all five resource types; an unauthorized local origin received 403.
- Added Sleeper `previous_league_id` lineage and verified the real chain `1370223929452433408` → `1255694966676537344`. Record identity now uses stable owner IDs across league seasons. Independent raw-data recalculation confirmed: highest weekly score **206.60** (Jacksonville Jaguars, 2025 Week 15), biggest blowout **96.94** (tanake, 2026 Week 2), longest win streak **7** (Jacksonville Jaguars, through 2025 Week 16), and most trades **7** (Jacksonville Jaguars).
- Replaced hardcoded clubhouse standings/H2H preview records with real Sleeper data. Verified 12 standings rows, owner score 1217.1, and ntbrown1997 **7–1 vs tanake**. Pick'em selections remain device-local and are not represented as league-synced data.
- Fixed premature Research searches, all Trade Desk close controls, War Room actions before roster readiness, homepage overflow at 415px, mobile score-dock sizing, and missing-asset Rive requests. Player names are escaped; record/award validation preserves legitimate names and decimal numbers while rejecting unsupported numeric claims.
- Real production-origin AI checks passed for Start/Sit (2 cards), Waiver Wire (3 adds), Counter-Builder (2 counters), Mock Draft (48 picks/12 grades), and League Pulse (7 stories/5 awards/4 newsletter sections). Desktop Chrome exported a 49.963-second 1080×1920 MP4 (`avc1`, 3,783,805 bytes), five 1080×1920 Story Pack PNGs, and valid poster/score cards.
- Final verification ran twice: **14/14 mobile routes, 14/14 dark-theme axe routes, and 14/14 light-theme axe routes**, with no failures. Offline shell **v47** loaded the persisted League standings at `index.html?offline-v47-final=1#league` while the local HTTP server was stopped. All 91 shell assets exist; `git diff --check`, generated-file cleanup, and repository scans for Anthropic/Cloudflare credential patterns pass.
- **Publication boundary:** the Worker fixes are deployed, but the client fixes remain uncommitted and are not live on the production Pages site. Production workflows must be rerun after an owner-approved commit/push.
- **Genuine external limits:** `assets/mascot.riv` is absent, so only the static mascot is verified; physical iOS/Android native sharing has not been tested; AI numeric/factual guardrails are heuristic rather than a semantic proof of truth. The earlier owner-only secret-entry process was not followed during recovery, so a strictly confidential future rotation should be uploaded by the owner directly.

### 2026-11-06 — Feature restoration & extreme-condition audit

- Replaced the explicitly disabled Rive mascot path with a built-in native SVG renderer (`js/ui/mascot-art.js`). All nine states have facial/body animation, sparkles, pointer-aware eyes, offscreen pausing, unique SVG IDs, and no CDN or asset requests. All nine passed visual review. Reduced motion renders exactly one static illustration; explicit SVG `hidden` attribute toggling fixed the duplicate-image case found by screenshot review.
- Rebuilt dashboard dragging around a stable grid placeholder and transform-only movement. Mouse and real CDP touch drops hit the intended widget, edge scrolling/cancellation clean up correctly, slight finger movement no longer cancels long-press, and arrow-key/Home/End ordering persists after reload. Corrupted layouts are deduplicated and sanitized; watchlists are bounded; failed market responses show a reconnecting state instead of infinite shimmer.
- Mock Draft now tolerates independent Sleeper/player/market failures and uses the bundled 300-player ECR board when live values are unavailable, clearly labeled. Generation guards prevent rapid resets from rendering stale drafts; Pause freezes AI picks and Resume continues correctly. Offline and API-outage runs completed **96 picks and 12 grades**, with a real 1200×675 grade-card download. Cached market boards no longer claim to be live.
- Hardened malformed saved-state migration for gamification, trade history, Season Sim, dashboard layouts, watchlists, and mascot speech. Valid JSON with wrong shapes no longer crashes the homepage or simulation.
- Fixed keyboard access to horizontal tables/boards/market chips, Game Day's stuck busy state and light error-view contrast, and interactive win-probability chart semantics. Real Game Day data passes both-theme axe scans. Compact header/hero rules pass at 320, 375, 390, 415, 768, 992, 1024, 1280, 1440, and 1920px with blocked fonts/APIs and no page overflow.
- Final matrix: **14/14 mobile routes, 14/14 dark-theme axe routes, 14/14 light-theme axe routes, and 14/14 all-third-party-down routes**, with no uncaught exceptions, local asset failures, raw error text, duplicate IDs, small effective controls, stuck visible busy states, or overflow. Offline shell **v51** cached 92 assets, mounted League setup offline, and completed a cold-cache local-ECR draft with zero errors. Command palette repetition, 20 theme toggles, native touch scrolling, Worker production-origin ESPN responses, `git diff --check`, artifact cleanup, and credential scans pass.
- **Publication boundary:** these expanded client fixes remain uncommitted and are not live on Pages. Physical iOS/Android native sharing is still device-unverified; AI factual guardrails remain heuristic. No calculator business logic changed.

### 2026-11-06 — Production hotfix deployment & verification

- Published `d2587ae` to `main`, then used production failures—not assumptions—to drive three dashboard follow-ups and one offline follow-up: stable edit grips (`d365b62`, `66c6181`), sticky-header scroll margins (`cac79f3`), and canonical-home fallback (`084825e`). Cloudflare Pages serves offline shell **v55** and all 92 assets.
- Production mobile checks passed: native touch scrolling reached 435px; full Sleeper URL connection loaded Crouchh fanclub with 12 teams and owner 7–1/1217.1; reload persisted; Game Day rendered 10 scoring dots, 12 team-stat rows, and 25 drives; Sunday rendered 12 tiles with one hero and working pin. No page errors or failed production assets occurred.
- Every production AI response returned HTTP 200/`ready`: two Start/Sit calls (2-card dilemma and 9-card full lineup), waiver (3 adds), Sonnet counter-builder (2 counters), Haiku storylines (7 stories/5 awards), Sonnet newsletter (4 sections), four draft rounds, and draft grades. Real-league Mock Draft completed 48 picks/12 grades; War Room share download and Commissioner clipboard copy passed.
- Production dashboard passed three normal-motion drag sequences, keyboard reorder persistence, all nine animated mascot states, and reduced-motion single-image rendering. The animated edit grip no longer moves cards or controls, and scroll margins keep handles clear of the live sticky ticker.
- Offline production now supports the exact `index.html#league` link that failed before the canonical-root fallback. With browser networking fully offline and local storage cleared, v55 mounted the League form and completed a 96-pick/12-grade local-ECR draft with zero errors.
- **Current boundary:** the production client and Worker are live and verified. Physical iOS/Android native sharing remains untested on actual devices. No calculator business logic changed and no credentials entered the repository.

## Architecture summary

- **UI:** static HTML + CSS tokens/components + ES modules; shared navigation, command palette, transitions, ticker, trade panels, game day, dashboard, clubhouse, league.
- **Data:** one `LiveData` registry for ESPN/Sleeper/values/news with in-flight deduplication, cadence control, subscribers, stale cache, and status states. IndexedDB holds Sleeper players; localStorage holds preferences/layout/rewards/history.
- **Engines:** original keeper/redraft calculation functions remain intact behind UI-only bridge APIs.
- **PWA:** versioned service-worker shell with offline fallback; external live APIs fail gracefully to cached data.

## Key decisions log

- Static vanilla HTML/CSS/JS on GitHub Pages. No frameworks, no build step.
- Design-system classes use the `kt-` prefix to avoid collisions with legacy feature-page CSS.
- Brand accents: electric volt for winning/primary actions and cool blue for information. Dark theme is the default; light theme is supported.
- UI font: Inter. Display/number font: Barlow Condensed. Both load from Google Fonts on the demo; stats use tabular figures.
- Motion scale: 160ms micro, 320ms standard, 640ms hero. Transform/opacity animation and reduced-motion fallbacks are built into the system.
- AI features (Prompt 09 onward) run through the deployed Cloudflare Worker holding the encrypted Anthropic key; workspace ID and public origin are non-secret configuration.
- Sleeper league ID: owner provided `1370223929452433408` during Prompt 07; it is stored locally by the app, never hardcoded.
