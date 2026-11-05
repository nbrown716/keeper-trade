# Prompt 09 — The Claude AI Layer ⚠️ PLUMBING DAY

> Read AGENTS.md (especially Sacred Rule #2), NOTES.md first. This build has a human plumbing step: WALK THE OWNER through creating the Anthropic API key and Cloudflare Worker ONE SCREEN AT A TIME, waiting for them at each step. The owner types `wrangler login` and `wrangler secret put` THEMSELVES — the key never passes through you or any file.

Build the AI INTEGRATION LAYER. Everything AI depends on this, so get the architecture right.

## PART A — CLOUDFLARE WORKER PROXY (worker.js + wrangler.toml + step-by-step deploy guide for a beginner)
- POST /ai/:feature endpoint. The Worker holds ANTHROPIC_API_KEY as an env secret (wrangler secret put — typed by the OWNER).
- BUDGET GOVERNOR: hard daily spend cap ($1.00 default, configurable), enforced by estimating cost per request from (model, usage tokens) in the API response, accumulated in Workers KV with a daily key. When exceeded: serve cached response if one exists, else HTTP 200 with { "status": "resting" } so the client shows a graceful "AI is resting" state — never an error screen.
- RATE LIMITING: per-feature max calls/minute keyed by client-supplied league ID (roasts: 10/min, gm-brain: 5/min).
- CACHE: a cacheKey field per feature; cached responses in KV (recaps/storylines: 7 days) return without calling Anthropic.
- MODEL ROUTING in one config object: feature → {model, maxTokens, systemPrompt}. Haiku (claude-haiku-4-5) for creative/cached features; Sonnet only for 'gm-brain' and 'newsletter'. All system prompts live server-side.
- CORS locked to the owner's GitHub Pages origin. Request logging (feature, tokens, est. cost) to KV + a GET /ai/stats endpoint returning today's spend.

## PART B — CLIENT SDK (js/data/ai.js)
One function: askAI(feature, payload) — handles fetch, the "resting" state, in-memory + localStorage caching, skeleton/loading integration with the LiveData engine, typed errors. All future AI features call ONLY this.

## PART C — FIRST FEATURE (proves the pipe): ROAST / HYPE CARD
User picks a leaguemate (or themselves) + mode (roast | hype) → Haiku writes a 2-sentence league-insider-toned roast/hype using their real standings/streak data → rendered onto a shareable canvas card (team colors, avatar, score bug) with Download/Copy. Cap output at 60 tokens.

## DELIVERABLES
worker.js, wrangler.toml, ai.js, the roast-card feature, and a beginner-proof deploy checklist including exact Anthropic Messages API request format with prompt-caching headers on the system prompt. Update NOTES.md.
