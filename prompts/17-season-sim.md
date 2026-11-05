# Prompt 17 — Season Sim (Monte Carlo Playoff Odds)

> Read AGENTS.md, NOTES.md first. Depends on Prompt 07. Pure client-side math — zero API cost.

Build SEASON SIM — a Monte Carlo playoff-probability engine running entirely client-side. No AI, no API cost, just math that makes the app feel like FiveThirtyEight.

## ENGINE (Web Worker, non-blocking)
- Inputs from Sleeper: standings, remaining schedule, each team's points-for history, roster values (Dynasty Dealer) as a strength prior.
- Model: team strength = weighted blend of (season PPG, last-3 PPG, roster value rank); weekly score ~ Normal(strength ± variance tuned to real fantasy variance). Simulate the remaining season 10,000× in a Worker (<200ms target).
- Outputs per team: playoff %, seed distribution, projected final record band, championship %, "magic number" (wins to clinch).

## UI
- Playoff-odds board: bars per team animating to their %, seed-range ribbons, clinch/elimination markers (green check / grey X with "eliminated" drama).
- WHAT-IF MACHINE: "If I win out / If I lose this week / If [rival] loses twice" → re-sims live and morphs all the bars. The addictive part.
- Weekly auto-refresh after matchup data lands; movement arrows week-over-week ("▲12%").
- Uncertainty honesty: show sample size and a "variance is real" footnote; confidence intervals on the bands.

## DELIVERABLES
sim.worker.js, season-sim.js, odds board UI, what-if controls. All math documented in comments. Update NOTES.md.
