# Prompt 16 — Mock Draft vs AI GM Personalities

> Read AGENTS.md, NOTES.md first. Depends on Prompts 09 (askAI) and 06 (values). Batched-call architecture is MANDATORY (budget rules).

Build MOCK DRAFT ARENA — a mock draft simulator where the other 11 GMs are Claude personalities.

## ENGINE
- Standard snake draft using the league's settings (teams, rounds, keeper rules — from Sleeper league settings when connected; sensible defaults otherwise). Draft pool from the Dynasty Dealer values feed + rankings data.
- AI PICKS: batched per round — ONE Haiku call returns all AI picks for the round, given available players (top ~40 by value), each AI GM's roster so far, and their personality card. Hard cap 800 output tokens/round.

## THE 11 PERSONALITIES (the soul — define in ONE config)
"The Homer" (reaches for one team's players), "Zero-RB Truther", "The Panic Merchant" (fades any injured player 2 rounds), "Spreadsheet Steve" (pure value, no fun), "The Trader" (proposes mid-draft swaps), "The Ghost" (autopick, always), "The Troll" (drafts YOUR obvious target one pick early), etc. Each: name, avatar emoji/color, 2-line bio, drafting biases as structured rules the prompt injects.

## TRASH TALK
After key picks (reaches, steals, troll moments), a one-line Haiku-generated comment from that GM appears in a draft-room chat feed. Cache aggressively; cap ~15 lines/draft.

## UI
Draft board grid (all teams × rounds, live-filling), big on-the-clock stage with countdown timer, pick cards animating in, "your pick" mode with value-based recommendations, post-draft grades (A+ to F per team with one-line roasts — shareable card).

## DELIVERABLES
Complete mock draft arena. Update NOTES.md.
