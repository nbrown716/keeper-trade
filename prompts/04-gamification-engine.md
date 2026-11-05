# Prompt 04 — The Duolingo Engine (Gamification & Retention)

> Read AGENTS.md, NOTES.md, design system first. All state in localStorage with a versioned schema + migration path.

Build the GAMIFICATION LAYER that makes leaguemates open this daily.

## SYSTEMS
1. STREAKS: daily visit streak with a flame icon in the nav that fills/animates and is "claimed" by any meaningful action (opening counts day 1; grading a trade, checking scores, or reading research extends it). "Streak Freeze" (1 per week, auto-applied) so a missed day doesn't nuke a long streak. Milestone celebrations at 7/30/100 days — full-screen moment, confetti, shareable card.
2. XP & LEVELS: XP for every action (grade a trade +50, daily check-in +10, compare players +15, correct pick'em +25). Football-hierarchy levels (Water Boy → Practice Squad → Starter → Pro Bowler → All-Pro → Hall of Fame). XP bar always visible, animates on gain with flying "+50 XP" particles.
3. PICK'EM: weekly game picks (data from the ESPN scoreboard feed) with confidence points, a league leaderboard table, and head-to-head records between named leaguemates (users claim their manager name once; stored locally). Locks at kickoff with a countdown.
4. BADGES: trophy case with ~15 earnable badges (first trade graded, 7-day streak, called an upset, graded 10 trades, night owl…). Locked badges show silhouettes; earning one triggers a full celebration modal.
5. DAILY TRIVIA: one "guess the player" / NFL trivia question per day (start with a hardcoded rotating bank of 60+), streak-tracked.
6. SEASON WRAPPED: shareable "Your Season in Review" generator (Spotify Wrapped style): trades graded, pick'em accuracy, favorite page, boldest call — rendered as story-style cards downloadable as an image (canvas).

## FEEL
Every reward moment gets layered feedback: haptic + particle burst + optional sound + XP animation. Make the celebration choreography genuinely delightful — and everything must respect prefers-reduced-motion and be skippable.

## DELIVERABLES
Complete gamification module (/js/features), integrated into nav + homepage. Update NOTES.md.
