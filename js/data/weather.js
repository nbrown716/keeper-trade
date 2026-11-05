import { liveData } from './live-data.js';

export const WEATHER_CONFIG = {
  cacheMs: 1800000, // Forecast responses remain fresh for 30 minutes.
  windAdvisoryMph: 15, // Passing and kicking down-weight begins here.
  highWindMph: 20, // Flag every kicker and deep-passing player here.
  rainProbability: 60, // Precipitation probability at the kickoff hour.
  deepFreezeF: 25 // Air temperature at the kickoff hour.
};

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const stadiumsPromise = fetch(new URL('../../data/stadiums.json', import.meta.url))
  .then(response => {
    if (!response.ok) throw new Error('Stadium data is unavailable.');
    return response.json();
  });

function normalizedVenue(value) {
  return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}

function localKickoffHour(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(date));
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:00`;
}

export async function resolveStadium(game) {
  const stadiums = await stadiumsPromise;
  const venueKey = normalizedVenue(game?.venue);
  const venueMatch = stadiums.find(stadium => [stadium.venue, ...(stadium.aliases || [])].some(name => normalizedVenue(name) === venueKey));
  if (venueMatch) return venueMatch;
  if (!game?.venue) return stadiums.find(stadium => stadium.team.split('/').includes(game?.home?.abbreviation)) || null;
  return null;
}

export function weatherImpacts(wind, precipitation, temperature) {
  const impacts = [];
  if (wind >= WEATHER_CONFIG.highWindMph) impacts.push({ id: 'high-wind', label: 'HIGH WIND', severity: 4, tooltip: 'High wind flags all kickers and deep passers in this game.' });
  else if (wind >= WEATHER_CONFIG.windAdvisoryMph) impacts.push({ id: 'wind', label: 'WIND ADVISORY', severity: 3, tooltip: 'Wind may reduce passing and kicking efficiency in this game.' });
  if (precipitation >= WEATHER_CONFIG.rainProbability) impacts.push({ id: 'rain', label: 'RAIN GAME', severity: 2, tooltip: 'Rain is likely at kickoff and may make ball security harder.' });
  if (temperature <= WEATHER_CONFIG.deepFreezeF) impacts.push({ id: 'freeze', label: 'DEEP FREEZE', severity: 2, tooltip: 'Freezing temperatures are expected at kickoff.' });
  return impacts;
}

export function kickoffConditions(game, stadium, forecast) {
  if (!stadium) return null;
  if (stadium.roof === 'dome') return { dome: true, venue: stadium.venue, city: stadium.city, impacts: [], severity: 0 };
  const hourly = forecast?.hourly;
  if (!hourly?.time?.length) return null;
  const kickoff = localKickoffHour(game.date, stadium.tz);
  const index = hourly.time.indexOf(kickoff);
  if (index < 0) return null;
  const temperature = Number(hourly.temperature_2m[index]);
  const precipitation = Number(hourly.precipitation_probability[index] || 0);
  const wind = Number(hourly.wind_speed_10m[index]);
  const gust = Number(hourly.wind_gusts_10m[index] || 0);
  const impacts = weatherImpacts(wind, precipitation, temperature);
  return {
    dome: false,
    venue: stadium.venue,
    city: stadium.city,
    time: hourly.time[index],
    temperature,
    precipitation,
    wind,
    gust,
    weatherCode: Number(hourly.weather_code[index]),
    impacts,
    severity: impacts.reduce((score, impact) => Math.max(score, impact.severity), 0)
  };
}

function sourceFor(game, stadium) {
  const key = `weather:${normalizedVenue(stadium.venue)}`;
  const params = new URLSearchParams({
    latitude: String(stadium.lat),
    longitude: String(stadium.lng),
    hourly: 'temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: stadium.tz,
    forecast_days: '16'
  });
  liveData.register(key, { url: `${WEATHER_URL}?${params}`, cadence: WEATHER_CONFIG.cacheMs, maxAge: WEATHER_CONFIG.cacheMs });
  return key;
}

export function subscribeGameWeather(games, listener) {
  let cleanup = () => {};
  let active = true;
  stadiumsPromise.then(stadiums => {
    if (!active) return;
    const unsubscribers = [];
    const forecasts = new Map();
    const states = new Map();
    const resolved = new Map(games.map(game => [game.id, resolveFromList(game, stadiums)]).filter(([, stadium]) => stadium));
    const venues = new Map();
    resolved.forEach((stadium, gameId) => {
      if (stadium.roof === 'dome') return;
      if (!venues.has(stadium.venue)) venues.set(stadium.venue, { stadium, gameIds: [] });
      venues.get(stadium.venue).gameIds.push(gameId);
    });
    const emit = () => {
      const conditions = {};
      resolved.forEach((stadium, gameId) => {
        const game = games.find(item => item.id === gameId);
        const result = kickoffConditions(game, stadium, forecasts.get(stadium.venue));
        if (result) conditions[gameId] = result;
      });
      listener(conditions, Object.fromEntries(states));
    };
    resolved.forEach((stadium, gameId) => {
      if (stadium.roof === 'dome') states.set(gameId, 'live');
    });
    venues.forEach(({ stadium }, venue) => {
      const key = sourceFor(games.find(game => resolved.get(game.id) === stadium), stadium);
      states.forEach((_, gameId) => {
        if (resolved.get(gameId)?.venue === venue) states.set(gameId, 'loading');
      });
      unsubscribers.push(liveData.subscribe(key, snapshot => {
        if (snapshot.data) forecasts.set(venue, snapshot.data);
        games.forEach(game => {
          if (resolved.get(game.id)?.venue === venue) states.set(game.id, snapshot.status);
        });
        emit();
      }));
    });
    emit();
    cleanup = () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }).catch(() => listener({}, {}));
  return () => { active = false; cleanup(); };
}

function resolveFromList(game, stadiums) {
  const venueKey = normalizedVenue(game?.venue);
  return stadiums.find(stadium => [stadium.venue, ...(stadium.aliases || [])].some(name => normalizedVenue(name) === venueKey))
    || (!game?.venue ? stadiums.find(stadium => stadium.team.split('/').includes(game?.home?.abbreviation)) : null);
}

export function getGameWeather(game) {
  return new Promise(resolve => {
    const unsubscribe = subscribeGameWeather([game], (conditions, states) => {
      if (conditions[game.id] || states[game.id] === 'error' || states[game.id] === 'stale') {
        unsubscribe();
        resolve(conditions[game.id] || null);
      }
    });
  });
}

export function playerWeatherImpact(player, games, conditions) {
  const team = String(player?.team || '').toUpperCase();
  const game = games.find(item => item.home.abbreviation === team || item.away.abbreviation === team);
  const weather = conditions[game?.id];
  const impact = weather?.impacts?.[0];
  if (!impact) return null;
  const position = String(player?.position || player?.pos || '').toUpperCase();
  let tooltip = impact.tooltip;
  if (impact.id === 'high-wind' && position === 'K') tooltip = 'High wind flags every kicker in this game.';
  else if (impact.id === 'high-wind' && ['QB', 'WR', 'TE'].includes(position)) tooltip = 'High wind can disrupt deep passes for this player.';
  else if (impact.id === 'wind' && ['QB', 'WR', 'TE', 'K'].includes(position)) tooltip = 'Wind advisory: passing and kicking efficiency may be down-weighted.';
  return { ...impact, tooltip, gameId: game.id };
}
