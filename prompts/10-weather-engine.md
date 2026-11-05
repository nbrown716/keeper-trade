# Prompt 10 — Weather Engine & Fantasy Weather Intelligence

> Read AGENTS.md, NOTES.md first. Verify stadium coordinates against known locations before finalizing.

Build the WEATHER ENGINE.

## DATA
Open-Meteo (https://api.open-meteo.com/v1/forecast) — free, no key, CORS enabled. Use latitude/longitude + hourly temperature_2m, precipitation_probability, wind_speed_10m, wind_gusts_10m, weather_code. Credit "Weather data by Open-Meteo.com" visibly (footer). Cache responses 30 min.

## PART A — data/stadiums.json (create complete, all 30 NFL venues)
{ team, venue, city, lat, lng, roof: "dome"|"retractable"|"open", tz }. This file also powers the map recap later (Prompt 11), so coordinates must be right.

## PART B — WEATHER SERVICE (js/data/weather.js)
- Given a game (from the ESPN scoreboard feed), resolve venue → fetch hourly forecast → extract kickoff-hour conditions.
- Dome logic: roof === "dome" → return { dome: true }; show a clean "DOME" chip, no weather story.
- IMPACT ENGINE (thresholds in a tunable WEATHER_CONFIG constant, commented):
  • Wind ≥ 15 mph → "WIND ADVISORY" — passing/K down-weight badge
  • Wind ≥ 20 mph → "HIGH WIND" — flag all kickers + deep passers
  • Precip probability ≥ 60% → "RAIN GAME"
  • Temp ≤ 25°F → "DEEP FREEZE"
  Each impacted player on the user's roster/watchlist gets a small weather badge + one-sentence tooltip.

## PART C — UI INTEGRATION
- Ticker chips: tiny condition glyph + temp for outdoor games; nothing for domes.
- Game-day mode: weather strip under the score bug with kickoff conditions + animated condition icon (CSS/SVG animated).
- Sleeper matchup cards (if Prompt 07 done): starters in impacted games get badges.
- "Sunday Weather Board" widget: all outdoor games ranked by severity.

## DELIVERABLES
stadiums.json, weather.js, UI integration, the widget. Update NOTES.md.
