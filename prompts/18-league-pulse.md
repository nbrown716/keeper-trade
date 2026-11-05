# Prompt 18 — League Pulse (Storylines, Awards, Newsletter)

> Read AGENTS.md, NOTES.md first. Depends on Prompts 09 (askAI), 07 (Sleeper), 17 (sim for odds movement). All Haiku except the newsletter (Sonnet). Batching + caching per AI budget rules — this whole feature set should cost < $0.02/week.

Build LEAGUE PULSE — the social/narrative layer that makes the app the league's home.

## 1. STORYLINES FEED (replaces a boring activity feed)
Every Monday + after waivers, ONE batched Haiku call turns raw Sleeper transactions/standings/matchups into 5–7 ESPN-bottom-line-style headlines: "MIRACLE ON MONDAY NIGHT: Dave survives by 0.4 pts", "COLD STREAK: Team Derrick Henry's Knee drops 3rd straight", "BLOCKBUSTER: analyzing the Chase-for-two-firsts deal". Bold headline feed with team-color accents; tap a headline → the data behind it.

## 2. WEEKLY AWARDS (computed, then AI-narrated)
Auto-computed weekly: Highest Scorer, Heartbreak Award (highest losing score), Bench Blunder (most points left on bench — computed from Sleeper data), Lucky Duck (lowest winning score), Bust of the Week. Each gets a one-line AI citation. Trophy case page accumulates season-long counts.

## 3. THE COMMISSIONER (weekly newsletter, Sonnet, 1 call/week)
A full league newsletter: recaps, awards, playoff odds movement (from Season Sim), next week's headline matchup preview, power-rankings movement. Beautiful in-app article page + "copy as text" for the group chat.

## 4. ALL-TIME RECORD BOOK (local, accumulates)
Highest weekly score ever, biggest blowout, longest win streak, most trades — tracked across seasons in IndexedDB, celebrated when broken.

## DELIVERABLES
Complete League Pulse. Update NOTES.md.
