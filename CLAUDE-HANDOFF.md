# Keeper Trade — complete Claude Code handoff

> **Update 2026-11-06 (Claude Code):** checklist steps 1–11 are done and verified locally. Step 12 (owner approval to commit/push and deploy the Worker) and step 13 (real Yahoo acceptance test) remain. See the latest `NOTES.md` entry for what changed and the test evidence, and `worker/DEPLOY.md` for Yahoo setup. The sections below are Kimi's original snapshot and are kept for history.

> Snapshot: 2026-11-06. This file is the transfer package for resuming in Claude Code without losing context. Read `AGENTS.md`, `NOTES.md`, and this file before editing. The current feature work is unfinished; do not mistake it for deployed or verified functionality.

## 1. Immediate resume instructions

1. Open the workspace at `C:\Users\NIckBrown\OneDrive - Fortbrand Services\Documents\GitHub\keeper-trade`.
2. Read `AGENTS.md` permanently binding project rules, `NOTES.md` for historical evidence, and this handoff for the active work.
3. Preserve the seven modified/new implementation files listed in section 9. They contain the unfinished multi-league/Yahoo work. Do not reset, restore, or discard them.
4. Resume with the ordered checklist in section 13. The first job is syntax/import validation, not deployment.
5. Do not commit, push, deploy, or claim readiness without the owner’s explicit approval and fresh verification. Production is currently the earlier verified build, not this new connector.
6. Never include real API keys, Cloudflare tokens, Yahoo client secrets, Yahoo access/refresh tokens, or session token values in the repository, this handoff, logs, screenshots, or chat.

Suggested first instruction to Claude Code:

> Continue the unfinished multi-league/Yahoo connector exactly from `CLAUDE-HANDOFF.md` and the current working tree. Start with syntax/import checks and the ordered checklist in section 13. Preserve all existing work. Do not deploy or claim completion until the mocked and real verification passes are complete and I approve publication.

## 2. Non-negotiable project rules

- Static HTML, CSS, and vanilla JavaScript ES2022+ modules. No frameworks, bundlers, npm installs, or build step. Hosting is static Pages/GitHub-compatible files.
- Third-party scripts only by justified CDN. GSAP is pre-approved. The mascot now uses local native SVG and needs no runtime.
- Never change keeper escalation or the 1,000-point auto-approval math. The sacred functions are `adjustedOf`, `sideTotals`, `impliedRound`, `valueOf`, and `sideEffective`. They were previously rechecked byte-for-byte against legacy and must remain unchanged.
- No secrets in any repository file. Secrets belong in Cloudflare Worker secret bindings or the owner’s private terminal, never in browser source.
- Dark-first premium feel: deep navy, electric volt, cool blue, condensed tabular numbers, spring motion, transform/opacity animation, 44px effective controls, mobile bottom navigation, WCAG AA, full reduced-motion behavior.
- All async content uses shimmer skeletons, never spinners. API failure must preserve cached/computed functionality where possible and never expose raw errors.
- One shared `LiveData` polling engine. Use localStorage for versioned preferences/state and IndexedDB for large player/history caches. Keep each route below 200 KiB JavaScript.
- Update `NOTES.md` after every task. Do not create unsolicited test scaffolding; inline Python Playwright checks have been the established verification method.
- Do not commit or push unless the owner explicitly says so. Prior approval for the completed hotfix does not automatically approve this new feature.

## 3. Repository and deployment state

| Item | Current value/status |
|---|---|
| Working directory | `C:\Users\NIckBrown\OneDrive - Fortbrand Services\Documents\GitHub\keeper-trade` |
| Git branch | `main` |
| Remote | `https://github.com/nbrown716/keeper-trade.git` |
| Production site | `https://keeper-trade.pages.dev` |
| Worker | `https://keeper-trade-ai.nicholas-brown00.workers.dev` |
| Production documentation commit | `c59de26 Document production hotfix verification` |
| Production client code commit | `084825e Fix offline navigation for canonical homepage links` |
| Production service worker | `keeper-trade-shell-v55`, 92 assets |
| Local preview convention | `http://127.0.0.1:4173` |
| Current local preview process | Previous process lost contact after application exit; do not assume it is running |
| Cloudflare account ID | `226fce693a369db4f256258b3e9d5160` (non-secret configuration supplied by owner) |
| Cloudflare token in environment | Not currently set; `cloudflare_token_available=False` |
| Cloudflare account in environment | Not currently set |
| Node.js | Previously unavailable in Bash (`node: command not found`) |
| Python | Python 3.12 available |
| Python Playwright | Installed and used successfully for real Chromium/CDP workflows |
| Current working-tree state | Five modified implementation files plus two new implementation files, all uncommitted |
| New Worker deployment | Not performed; production Worker has no Yahoo support |
| Real Yahoo API verification | Not performed; no approved Yahoo app/credentials have been supplied |

Recent history, newest first:

- `c59de26 Document production hotfix verification`
- `084825e Fix offline navigation for canonical homepage links`
- `cac79f3 Keep dashboard controls clear of sticky headers`
- `66c6181 Keep dashboard edit controls stable`
- `d365b62 Stabilize dashboard controls during interaction`
- `d2587ae Fix feature reliability and offline workflows`
- `7a90045 Build complete Keeper Trade league hub`
- `e0590e1 Add files via upload`

Useful commands:

```bash
python -m http.server 4173 --bind 127.0.0.1 >/dev/null 2>&1
```

```bash
git status --short
git diff --check
git log -8 --oneline
```

Repository credential scan (do not print any found secret values):

```text
Search for `sk-ant-` and `cfat_` with the file-search tool.
```

## 4. Secret handling inventory

No secret values are included here. This is intentional even though the owner requested a complete export.

| Credential/data | State and secure location |
|---|---|
| Anthropic API key | A **non-expiring** key was created, directly validated with Haiku, and uploaded as Cloudflare `secret_text` named `ANTHROPIC_API_KEY`. Value is not in the repository and must not be reproduced. An older exposed key was revoked; never recover it from conversation history. |
| Anthropic workspace ID | `wrkspc_01QEuQaJDhrq7Zy31Z6UsMdB`; non-secret configuration in `worker/wrangler.toml`. |
| Cloudflare deployment token | Scoped to Workers Scripts Write and Workers KV Storage Write. Not in the repository and not currently in this terminal environment. Owner must set it privately for a future deployment. |
| Yahoo client ID / client secret | Not supplied. New source expects Worker secrets `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET`; production does not have them yet. Yahoo API access may require application review/approval. |
| Yahoo access/refresh tokens | None yet. The unfinished implementation stores them only in Cloudflare KV under `yahoo:session:${session}` with an expiry timestamp. Never return these values to the browser. |
| Yahoo browser session ID | New implementation generates two UUIDs, stores the random ID under `kt-yahoo-session:v1`, and sends it as `X-Keeper-Session`. Treat real values as sensitive bearer-like session identifiers; do not export them. |
| Owner Sleeper league IDs | Non-secret public league identifiers supplied for development and listed below. |
| Cloudflare account/email | Account ID is sufficient for deployment. No account email or login credential is needed in this handoff. |

Existing KV bindings in `worker/wrangler.toml`:

- `AI_USAGE`: `f1942841723541c6a1876f201804a914`
- `AI_CACHE`: `3bb8fbf3a6ec45e38d6ae1979be3eb9d`

Worker configuration:

- `ALLOWED_ORIGIN = "https://keeper-trade.pages.dev"`
- `DAILY_SPEND_CAP = "1.00"`
- `ANTHROPIC_WORKSPACE_ID = "wrkspc_01QEuQaJDhrq7Zy31Z6UsMdB"`
- Compatibility date: `2026-11-04`

## 5. Owner-supplied league and verified reference data

- Current Sleeper league: **Crouchh fanclub**, ID `1370223929452433408`.
- Previous-season Sleeper league in the verified lineage: `1255694966676537344`.
- Verified lineage: `1370223929452433408` → `1255694966676537344`.
- These two IDs can be used to test multi-Sleeper add/switch/remove behavior. They are public read-only IDs; do not hardcode them into application source.
- Owner display name: `ntbrown1997`.
- Verified production standing at the last check: `7–1`, `1217.1` displayed points; exact fractional calculation previously `1217.14`.
- Verified H2H: `ntbrown1997` is `7–1 vs tanake`.
- Yahoo league IDs use the form `nfl.l.NUMBER`; Yahoo team keys use `nfl.l.NUMBER.t.NUMBER`. No real Yahoo league key has been supplied.

Independently verified record-book facts from raw 2025+2026 Sleeper data:

- Highest weekly score: **206.60**, Jacksonville Jaguars, 2025 Week 15.
- Biggest blowout: **96.94**, tanake, 2026 Week 2.
- Longest win streak: **7**, Jacksonville Jaguars, through 2025 Week 16.
- Most trades: **7**, Jacksonville Jaguars.

Verified raw-data corrections:

- Sleeper fractional points require `fpts_decimal / 100`.
- Week 8 Bench Blunder was `57.48`; IR/taxi are excluded, while legitimate dropped-player bench points remain.
- The Ladd McConkey/Justin Jefferson trade direction was independently corrected: Jacksonville acquired Ladd plus a 2027 third; stew30 acquired Jefferson.

## 6. Completed production behavior and evidence

The following was verified on production before the current multi-league edits:

- All 14 main routes passed mobile structural checks, dark-theme axe scans, light-theme axe scans, and third-party-outage checks.
- No uncaught exceptions, local asset failures, raw error text, duplicate IDs, small effective controls, visible stuck-busy states, or page overflow in the final matrix.
- Full Sleeper URL connection loaded 12 teams and persisted after reload.
- Native mobile scrolling reached 435px.
- Game Day rendered 10 scoring dots, 12 team-stat rows, and 25 drives. Sunday rendered 12 tiles with one hero and a working pin.
- All tested production AI responses returned HTTP 200/`ready`: Start/Sit (two-card dilemma and nine-card full lineup), waiver (three adds), Sonnet counter-builder (two counters), Haiku storylines (seven stories/five awards), Sonnet newsletter (four sections), four draft rounds, and draft grades.
- Real-league Mock Draft completed 48 picks/12 grades. Cold offline local-ECR draft completed 96 picks/12 grades with zero errors.
- Offline v55 loaded 92 assets and fixed direct `index.html#league` navigation by preferring the cached canonical `/` response.
- Dashboard passed three normal-motion drags and keyboard reorder persistence. Edit grips no longer move hit targets; scroll margins protect them from the sticky ticker.
- Native SVG mascot replaced the disabled Rive path. All nine states are animated and visually reviewed: idle, happy, devastated, judging, celebrating, nervous, hype, sleeping, thinking. Reduced motion shows exactly one static illustration.
- The Drive desktop export: MP4 `avc1`, 1080×1920, 49.963 seconds, 3,783,805 bytes; five Story Pack PNGs at 1080×1920.
- Route budgets last measured: fully loaded homepage 173.2 KiB, Mock Draft 55.1 KiB, The Drive 122.6 KiB. Source then totaled 397.5 KiB across 50 page-isolated files. New Yahoo modules require another budget measurement.
- Physical iOS/Android native sharing remains unverified on actual devices. Desktop video and Story Pack exports work.
- Pick’em selections remain local to each device; standings/H2H are real league data.
- AI factual guardrails are numeric/heuristic, not a semantic proof of truth.

## 7. Current user requirement being implemented

The owner asked for:

1. Multiple league capability.
2. Yahoo league connector.
3. The same reliability standard as the completed audit: no disabled feature pretending to be complete, no false ready claims, and testing for errors, weird state, stress, and offline behavior.

Implementation decisions already made:

- One **active league** at a time across existing tools, with any number of saved connections.
- Full add/switch/remove support for Sleeper first.
- Yahoo normalized into the existing Sleeper-shaped league bundle so existing standings, matchups, power rankings, trade wire, and downstream features can share the same data contract.
- Yahoo uses authorization-code OAuth through the Worker. Browser storage holds only a random session ID. Yahoo access/refresh tokens stay in Cloudflare KV.
- Yahoo’s keyless API is not assumed. OAuth and possible Yahoo application review are mandatory.
- Do not pretend Yahoo is connected until the owner has an approved Yahoo app and credentials.

Yahoo documentation reviewed:

- `https://developer.yahoo.com/fantasysports/guide/` — OAuth 2.0, application submission/review, and attribution requirements.
- `https://developer.yahoo.com/oauth2/guide/flows_authcode/` — authorization-code flow, one-hour access tokens, refresh-token rotation, and Basic client authentication.

Yahoo attribution implemented in `js/features/league.js`:

- Text: `Fantasy data provided by Yahoo Fantasy`.
- Link: `https://sports.yahoo.com/fantasy/`.
- Official Yahoo image URL checked with HTTP 200: `https://s.yimg.com/rz/p/yahoo_frontpage_en-US_s_f_p_205x58_frontpage.png`.

## 8. New storage schemas and compatibility

New multi-league storage in `js/data/league-connections.js`:

```js
// localStorage key: kt-league-connections:v1
[
  {
    provider: 'sleeper' | 'yahoo',
    id: 'numeric Sleeper ID or nfl.l.NUMBER',
    name: 'display label',
    connectedAt: 1790000000000
  }
]
```

```text
kt-active-league:v1 = "sleeper:ID" or "yahoo:nfl.l.NUMBER"
```

- Sleeper IDs validate as 15–20 digits.
- Yahoo league keys validate as `/^nfl\.l\.\d+$/`.
- Duplicate provider/ID pairs are removed during normalization.
- Legacy `kt-sleeper-league:v1` is migrated when no new connection list exists.
- Adding or activating Sleeper keeps the legacy key synchronized for backward compatibility.
- Removing the active connection activates the first remaining connection or returns `null`.
- `kt:league-connection-change` is dispatched after changes.

Existing storage to preserve:

- `kt-sleeper-league:v1` — legacy single-league setting.
- `kt-ai-endpoint:v1` — Worker base URL.
- `kt-yahoo-session:v1` — new random Yahoo session ID, not a Yahoo token.
- `kt-drive-manager:v1` — selected roster/manager.
- `kt-power-history:v1` — previous power-rank snapshot.
- `kt-pending-trade:v1` — League → calculator trade handoff.
- `kt-gamification:v1` — versioned XP/streak/picks/preferences.
- `kt-dashboard:v2` and `kt-dashboard:v1` — current and migration layouts.
- `kt-watchlist:v1` — player watchlist.
- `kt-season-sim:v1:${leagueId}` — baseline and historical probabilities.
- `kt-ai-cache:v1:*` — local AI response cache.
- `kt-livedata:v1:*` — last-good data cache.
- `kt-mascot-speech:v1` — two-per-day speech cap.
- `kt-trade-history:v1:keeper` and `kt-trade-history:v1:redraft`.
- `gi-theme` — dark/light preference.

IndexedDB:

- `kt-keeper-store`: object stores `players` and `meta` for the Sleeper player database.
- `kt-league-pulse`: object store `weeks` for record/history snapshots.

## 9. Exact uncommitted implementation files

At capture time, `git status --short` showed:

```text
 M css/league.css
 M js/data/sleeper.js
 M js/features/league.js
 M worker/deploy.py
 M worker/worker.js
?? js/data/league-connections.js
?? js/data/yahoo.js
```

The handoff file itself and the required `NOTES.md` update will be additional uncommitted documentation changes. No generated test artifacts should be committed.

### `js/data/league-connections.js` — new

Complete connection store with:

- `getLeagueConnections()` at line 61.
- `getActiveLeagueConnection()` at line 65.
- `addLeagueConnection(provider, id, name)` at line 71.
- `setActiveLeagueConnection(provider, id)` at line 83.
- `removeLeagueConnection(provider, id)` at line 91.
- `renameLeagueConnection(provider, id, name)` at line 100.
- Storage validation, migration, deduplication, legacy synchronization, and change events.

Status: implemented, not yet tested in the browser.

### `js/data/yahoo.js` — new, 296 lines

Browser-side Worker client and Yahoo normalizer:

- Default Worker: `https://keeper-trade-ai.nicholas-brown00.workers.dev`; uses `kt-ai-endpoint:v1` when set.
- `getYahooConnectUrl()` at line 41.
- `disconnectYahoo()` at line 47.
- `normalizeYahooLeagues(data)` at line 175.
- `listYahooLeagues()` at line 184.
- `normalizeBundle(...)` at line 208.
- `getYahooLeagueBundle(leagueId, week)` at line 265.
- Recursive helpers handle Yahoo’s deeply nested object/array shapes.
- Teams normalize to `{ key, id, name, manager, wins, losses, ties, points }`.
- Rosters normalize to Sleeper-style `roster_id`, `owner_id`, `players`, `starters`, `reserve`, `taxi`, and fractional settings.
- Player names are normalized and mapped to Sleeper IDs where possible; unmatched IDs become `yahoo:YAHOO_PLAYER_ID`.
- Starter slots distinguish `BN`, `TAXI`, `IR`, `DL`, `OUT`, and `NA`.
- Transactions normalize to `transaction_id`, `type`, `creator`, `roster_ids`, `adds`, `drops`, `draft_picks`, `status`, and `created`.
- Four league requests plus one roster request per team use `LiveData` caching.

Status: three syntax mistakes were fixed during authoring, but no successful import or normalization test has run. Treat every parser assumption as unverified until realistic Yahoo fixtures pass. `rosterByKey` in `normalizeBundle` is currently unused and can be removed.

### `js/data/sleeper.js` — modified

- `getSleeperLeagueId()` now returns the active connection’s external ID for compatibility with all existing call sites.
- `setSleeperLeagueId()` adds a Sleeper connection through the new store.
- `getLeagueBundle(id, week)` routes the active Yahoo connection (or an `nfl.l.*` ID) to `getYahooLeagueBundle`; otherwise it retains the original Sleeper requests.
- `getLeagueLineage(id)` returns a single current Yahoo league object for Yahoo, while preserving Sleeper `previous_league_id` traversal.
- `rosterPoints()` remains unchanged.

Status: implemented, not yet regression-tested. The static `yahoo.js` import increases the homepage payload and must be measured; dynamically import it if needed to remain below budget.

### `js/features/league.js` — modified

- Provider tabs for Sleeper/Yahoo.
- Saved-league list and active-league selector.
- Add/remove flows with confirmation on removal.
- Full-URL Sleeper connection retained.
- Yahoo sign-in starts by redirecting to the Worker’s OAuth URL.
- `?yahoo=connected#league` loads Yahoo league choices; `?yahoo=error#league` produces a recovery message.
- Yahoo leagues can be selected and added to the same active-league view.
- Existing standings, matchups, power rankings, trade wire, calculator handoff, and weather rendering are retained.
- `setLeagueSnapshot` now includes provider and league ID.
- Yahoo attribution is rendered in the connection panel and Yahoo league view.

Useful locations:

- `connectMarkup()` line 36.
- `leagueSwitcherMarkup(active)` line 107.
- `renderLeague()` line 112.
- `loadLeague(id)` line 173.
- `showYahooLeagues()` line 192.
- `mountConnect()` line 210.
- `mountLeague()` line 259.

Known cleanup: `powerMarkup()` assigns `powerHistory.current` twice at lines 68 and 70. Remove the first nonsensical assignment (`roster.id` → `roster.id`) and keep the rank map. This is cleanup, not a verified behavioral test result.

### `css/league.css` — modified

Added styles for:

- `.kt-saved-leagues` and `.kt-saved-league`.
- `.kt-provider-tabs`.
- `#yahoo-connect-panel` and `.kt-yahoo-league-list`.
- `.kt-yahoo-attribution`.
- `.kt-league-switcher`.

Status: implemented, no mobile/axe/visual scan yet.

### `worker/worker.js` — modified, +135 lines

Added:

- `YAHOO_API = https://fantasysports.yahooapis.com/fantasy/v2`.
- `YAHOO_OAUTH = https://api.login.yahoo.com/oauth2`.
- Per-session validation with `X-Keeper-Session`.
- OAuth token exchange with Basic client authentication.
- `yahooAccessToken()` with refresh-token rotation and one-hour access-token expiry.
- `yahooApi()` allowlisted upstream calls.
- `handleYahoo()` routes.
- CORS now allows `Content-Type, X-Keeper-Session`.

Worker routes:

- `GET /yahoo/connect` — creates OAuth state in KV with a 600-second TTL and returns Yahoo’s sign-in URL.
- `GET /yahoo/callback` — validates state/code, exchanges the code, stores tokens in KV, then redirects to `https://keeper-trade.pages.dev/?yahoo=connected#league`; failure redirects to `?yahoo=error#league`.
- `GET /yahoo/leagues` — upstream `/users;use_login=1/games;game_keys=nfl/leagues?format=json`.
- `GET /yahoo/proxy` — allowlisted `standings`, `scoreboard`, `settings`, `transactions`, and team `roster` resources.
- `POST /yahoo/disconnect` — deletes the session’s token record.
- Missing client credentials return HTTP 503 with `reason: yahoo-config`.
- Authorization failures return 401-style typed errors; upstream failures return 502-style responses.
- The callback is allowed before normal origin checks because Yahoo redirects without the site Origin. Other Yahoo routes require the production origin.

Status: implemented, not imported/tested and not deployed. No Yahoo-specific rate limit has been added yet; add one before production because a league bundle fans out to 4 + N team requests.

### `worker/deploy.py` — modified

- Still requires the Cloudflare token/account and Anthropic key.
- Adds hidden optional prompts for Yahoo client ID and client secret.
- Requires both Yahoo values or both empty.
- Uploads `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET` as `secret_text` when supplied.
- Clears local Python variables afterward and prints no secret values.

Status: implemented, not executed. The owner must run it privately for any real deployment.

## 10. OAuth and data flow to preserve

1. Browser generates/uses a random `kt-yahoo-session:v1` and sends `X-Keeper-Session`.
2. Browser calls `GET /yahoo/connect` on the Worker.
3. Worker stores `yahoo:state:${state}` in KV for ten minutes and returns Yahoo’s `request_auth` URL with the exact callback.
4. Browser redirects the user to Yahoo.
5. Yahoo redirects to `https://keeper-trade-ai.nicholas-brown00.workers.dev/yahoo/callback`.
6. Worker validates state and exchanges the code at `https://api.login.yahoo.com/oauth2/get_token` using Basic `client_id:client_secret` authentication.
7. Worker stores access token, refresh token, expiry, and GUID only in `AI_CACHE` under `yahoo:session:${session}`.
8. Worker redirects to `https://keeper-trade.pages.dev/?yahoo=connected#league`.
9. Browser calls `/yahoo/leagues`, displays choices, and adds the selected Yahoo key to the connection store.
10. Bundle loading calls `standings`, `scoreboard`, `settings`, and `transactions`, then one `roster` request per team. Refresh happens server-side when the access token has less than 60 seconds remaining. A newly issued refresh token replaces the old one.

Required callback for the future Yahoo app:

```text
https://keeper-trade-ai.nicholas-brown00.workers.dev/yahoo/callback
```

## 11. Files not yet updated

- `sw.js`: still shell v55 and does not include `js/data/league-connections.js` or `js/data/yahoo.js`. Add both and bump the cache only after validation, then repeat offline tests.
- `worker/DEPLOY.md`: no Yahoo application/credential instructions yet.
- `AGENTS.md`: its approved-data-source section predates Yahoo. Add Yahoo as an OAuth-through-Worker source when documenting the completed implementation; never add keys.
- `NOTES.md`: contains only the completed production hotfix, not the current connector work.
- No Yahoo fixtures or mocked Worker tests exist yet.
- No real Yahoo application, credentials, token, league, or production deployment exists.

## 12. External data sources already in use

- ESPN scoreboard/summary/news/standings/rosters through the existing Worker proxy.
- Sleeper public API directly from the browser.
- Dynasty Dealer and FantasyCalc values.
- Open-Meteo weather with visible attribution.
- Anthropic Haiku/Sonnet through the Worker with KV caching, per-league rate limits, and a preflight $1 daily budget guard.
- New Yahoo API only through the unfinished OAuth Worker adapter. Do not silently replace it with scraping or an unofficial keyless endpoint.

## 13. Ordered resume checklist

1. **Validate syntax immediately.** Import `league-connections.js`, `yahoo.js`, `sleeper.js`, and `league.js` in Chromium. Import `worker/worker.js` in a browser-based module test as well. Fix all import errors before writing more features.
2. **Clean known issues.** Remove the duplicate `powerHistory.current` assignment in `js/features/league.js` and the unused `rosterByKey` in `normalizeBundle`.
3. **Test connection storage.** Add both Sleeper IDs, switch between them, reload, remove one, verify fallback activation, migrate legacy storage, deduplicate records, and inject malformed JSON/valid wrong shapes. Ensure other calculators still read the active ID correctly.
4. **Build realistic Yahoo fixtures.** Cover league discovery, standings, scoreboard, settings, team rosters, players, starter/bench/IR/taxi slots, fractional points, trades, missing fields, empty matchups, duplicate teams, and unmatched players. Validate the normalized bundle rather than trusting the UI.
5. **Mock Worker OAuth end to end.** Use a KV test double and mocked Yahoo upstreams. Verify connect/state creation, callback exchange, redirect, access-token use, refresh-token rotation, disconnect, missing configuration (503), unauthorized origins (403), malformed league/team paths, and that no token value appears in any client response.
6. **Add Yahoo request throttling.** A single bundle currently creates 4 + N roster calls. Add per-session rate limiting and request deduplication checks without blocking legitimate history loading.
7. **Test the UI with mocked Worker routes.** Verify provider tabs, Sleeper add/switch/remove, Yahoo `?yahoo=connected`, league selection, standings/matchups, empty states, authorization failure, missing Worker configuration, and recovery after a failed roster request.
8. **Measure route payloads.** New static Yahoo imports may push the homepage near the 200 KiB limit. Dynamically import Yahoo only for Yahoo use if needed; do not cut features to meet the budget.
9. **Update offline packaging.** Add both new data modules to `sw.js`, increment the version beyond v55, and verify multi-Sleeper switching and a clear Yahoo-unavailable state offline. Do not require Yahoo to work offline without cached data.
10. **Document setup.** Update `worker/DEPLOY.md`, `AGENTS.md`, and `NOTES.md` with OAuth, callback, approved-access, attribution, and secure deployment instructions.
11. **Run regressions.** Repeat mobile structure, both-theme axe, third-party failure, malformed storage, rapid switching, multi-request stress, offline behavior, and sacred-math comparisons. Remove generated artifacts and run `git diff --check` plus secret scans.
12. **Only then ask about deployment.** The owner must explicitly approve commit/push and Worker deployment. A real Cloudflare token and approved Yahoo credentials are currently unavailable to the agent.
13. **Real Yahoo acceptance test.** After the owner supplies an approved app through the private deployment flow, connect a real Yahoo league, verify team/record/points/roster data, refresh after expiry, disconnect, and repeat production Sleeper regression checks. Do not call the connector live before this passes.

## 14. Deployment instructions for the owner when ready

Do not perform these steps with values in chat. The owner uses a private terminal:

1. Create/obtain approval for a Yahoo Developer application with fantasy read access.
2. Configure the callback exactly as `https://keeper-trade-ai.nicholas-brown00.workers.dev/yahoo/callback`.
3. Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` privately in the terminal.
4. From `worker/`, run:

```bash
python deploy.py --origin "https://keeper-trade.pages.dev"
```

5. Enter the Anthropic key and both Yahoo credentials at the hidden prompts. Leave Yahoo prompts empty only if intentionally deploying without Yahoo.
6. Verify AI remains healthy and Yahoo `/yahoo/connect` returns a sign-in URL instead of `yahoo-config`.
7. Publish the static client only with the owner’s explicit commit/push approval, then run the real acceptance test above.

## 15. Boundaries and honesty requirements

- The production hotfix is verified and live, but the multi-league/Yahoo source is currently local, uncommitted, untested, and undeployed.
- No real Yahoo connection has been established. Do not write “Yahoo works” based on source inspection or mocked tests alone.
- Do not sacrifice the animated mascot, offline draft, dashboard interactions, calculator math, or existing Sleeper behavior to simplify the connector.
- Keep the non-expiring Anthropic key in Cloudflare. Do not replace it with an expiring key or expose it in the handoff.
- Actual iOS/Android native sharing still needs physical-device confirmation.
- Stop and ask the owner before any action that would change calculator business logic or require embedding a secret in source.
