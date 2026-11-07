# Keeper Trade — Permanent Project Rules

> This file is read by Kimi Code at the start of every session. These rules are permanent. Never violate them. If a task seems to require breaking one, STOP and ask the owner first.

## What this project is

"Keeper Trade" — a fantasy football keeper/dynasty league hub: trade calculators, rankings, research hub, tools, live scores. Built for a real league of friends.

**Target feel:** ESPN × theScore × DraftKings/FanDuel × Duolingo × Apple. Dark-mode-first, premium, alive, addictive-in-a-good-way.

## Tech stack (non-negotiable)

- Plain static website: **HTML + CSS + vanilla JavaScript (ES2022+, ES modules)**.
- **NO frameworks, NO bundlers, NO build steps, NO npm install for the site itself.**
- Third-party libraries only via CDN `<script>`/`<link>` tags, and only when justified (GSAP is pre-approved for animation).
- Hosting: GitHub Pages. Everything must work as static files.
- Folder structure:
  - `/css` — styles (`design-system.css` is the first file)
  - `/js/data` — API adapters and data fetching
  - `/js/ui` — reusable components
  - `/js/features` — screens/big features
  - `/data` — static JSON files

## Sacred rule #1: the calculator math

**NEVER modify the trade calculator's business logic.** Keeper cost escalation and the 1,000-point auto-approval rule are sacred. You may rebuild the interface AROUND them, but the math stays bit-for-bit identical. If a task seems to require changing the logic, STOP and ask.

## Sacred rule #2: no secrets in code

**No API keys in any file in this repo. Ever.** Anything requiring a key goes through the Cloudflare Worker (which lives outside this repo). If asked to hardcode a key, refuse and explain why.

## Design constitution

- **Dark mode first:** deep navy base (~#0B0F1A family), elevated surfaces via lighter layers, not just opacity.
- **Accents:** one electric green/volt ("winning") + one cool blue. Team colors used as accents only — max ~20% of any screen.
- **Numbers:** condensed display font, always `font-variant-numeric: tabular-nums` so digits never jitter.
- **Motion:** springs over linear easing. Durations: 100–200ms micro, 250–400ms standard, 500–800ms hero moments. Lists stagger in at 30–50ms offsets. Numbers count up when they change.
- **Glassmorphism sparingly** — elevated cards only.
- **Loading:** shimmering skeleton placeholders for ALL async content. Spinners are banned.
- **Failure:** a broken API degrades to cached/stale data with a subtle indicator — it never breaks the page or shows a raw error.
- **Touch:** min 44px tap targets, mobile-first, one-handed layouts, bottom navigation on mobile.
- **Haptics:** subtle `navigator.vibrate()` on meaningful actions (guarded, mobile only).
- **Accessibility is code:** semantic HTML, visible focus states, aria-live for live scores, `prefers-reduced-motion` fully honored, WCAG AA contrast.

## Performance

- 60fps or don't ship: transform/opacity-only animations, passive event listeners, no layout thrash.
- Total JS stays lean (~200KB budget). Long lists get windowed/virtualized.
- Poll APIs on sensible cadences; share one polling engine; never duplicate fetches.

## State & storage

- `localStorage` for preferences and gamification state (versioned schema with migrations).
- `IndexedDB` for large caches (e.g., the Sleeper player database).

## Approved data sources (all keyless, CORS-safe — call directly from the browser)

- ESPN scoreboard: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` (supports `?dates=YYYYMMDD`)
- ESPN game summary: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={eventId}`
- Sleeper: `https://api.sleeper.app/v1/...` (league, rosters, users, matchups/{week}, transactions/{week}, state/nfl; players DB at `/players/nfl` — large, cache in IndexedDB)
- Dynasty Dealer values: `https://www.dynastydealer.com/api/player-values`
- FantasyCalc values: `https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&numTeams=12&ppr=1`
- Weather: `https://api.open-meteo.com/v1/forecast` (always attribute "Weather data by Open-Meteo.com" somewhere visible)
- Yahoo Fantasy (OAuth, NOT keyless): only through the Cloudflare Worker `/yahoo/*` routes. The browser holds a random session ID only; tokens stay in Worker KV. Always show "Fantasy data provided by Yahoo Fantasy" attribution. See `worker/DEPLOY.md`.
- ESPN is reached through the Worker `/espn/*` proxy (direct browser calls fail CORS).

## Workflow rules

1. Read `NOTES.md` before starting work — it's the project memory.
2. One task brief at a time (they live in `/prompts`). Don't build ahead.
3. After every task: summarize what changed, list the files touched, tell the owner exactly how to see it working, and update `NOTES.md`.
4. Never commit or push unless the owner explicitly says to.
   - **Release gate:** before asking to commit, run `python -I -X utf8 tests/run_all.py` (Playwright + Chromium). It must end in `RELEASE GATE: ALL PASS`. `--quick` is fine while iterating; a push needs a full run.
   - A new feature or fix ships **with** its test: add it to an existing suite or as a new suite in `tests/run_all.py`. A bug that reached the owner gets a regression check that would have caught it.
   - Never hardcode values that change every release in a test (for example the service-worker version): read them from the source.
   - Canvas features must pass the off-canvas text detector in `tests/wr_audit.py` (or an equivalent). Data features must be checked against an independent recomputation from the raw API data, not against themselves.
5. If something is ambiguous, ask ONE clear question rather than guessing.
