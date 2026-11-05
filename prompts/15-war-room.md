# Prompt 15 — The War Room (AI Start/Sit, Waivers, Trade Counters)

> Read AGENTS.md, NOTES.md first. Depends on Prompt 09 (askAI layer), 06 (calculator), 07 (Sleeper). Haiku for rankings, Sonnet only for trade counters.

Build THE WAR ROOM — three AI-powered decision tools.

## 1. START/SIT ORACLE
- Pulls the user's roster + opponent's from Sleeper, attaches weather impact badges (if Prompt 10 done), Dynasty Dealer/FantasyCalc values, and matchup context → "Ask the Oracle" on any start/sit dilemma OR a full lineup confidence report.
- Contracted output format: per player — start/sit verdict, confidence (1–10), one-sentence reason, risk flag. Rendered as gorgeous verdict cards, never a text blob. Stream the response with a typewriter effect.

## 2. WAIVER WIRE WEDNESDAY
- Every Tuesday night (client-side check), pulls Sleeper transactions + free agents, cross-references value movers, generates a ranked waiver board: "3 adds that fit YOUR roster holes" with reasoning + one AI blurb each. Cached 24h (generate once per league per week via the Worker cache).

## 3. TRADE COUNTER-BUILDER (the money feature, Sonnet-powered)
- Paste/describe a trade offer (or load a real one from the Sleeper activity feed) → GM Brain returns: verdict (accept/decline/counter), reasoning in 3 bullets grounded in values + keeper costs + roster construction, and TWO concrete counter-offers built from both rosters, each with a fairness score from the existing calculator engine (reuse it — never duplicate the math).
- "Copy counter-offer message" button — writes the actual text to send the leaguemate, confident-but-friendly voice.

## UX
One War Room screen, three tabs. Verdict cards shareable as images (reuse Prompt 06's canvas card renderer). Every AI call shows freshness ("generated 2h ago") + a regenerate button (rate-limited).

## DELIVERABLES
Complete War Room + server-side prompt templates (in the Worker config) with data-grounding payloads. Update NOTES.md.
