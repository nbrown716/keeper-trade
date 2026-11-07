// Weekly weather: kickoff conditions for every game of an NFL week (Thursday through Monday).
//
// Source: Open-Meteo (keyless, CORS, already an approved source; attribution required on screen).
// - One BATCHED forecast request for every outdoor venue of the week (comma-separated coordinates),
//   with past_days=92 so completed games show recorded conditions and forecast_days=16 ahead.
// - Older than 92 days: the Open-Meteo archive API (ERA5) for that week's date range.
// - More than 16 days out: honestly "pending" with the date the forecast opens.
// - Venues not in data/stadiums.json (new international sites) are placed with Open-Meteo geocoding.

import { liveData } from './live-data.js';
import { normalizeGames } from './espn.js';
import { weatherImpacts, WEATHER_CONFIG } from './weather.js';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const WORKER = 'https://keeper-trade-ai.nicholas-brown00.workers.dev';
const DAY = 86400000;
const HOURLY = 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,snowfall,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code';

let stadiumsPromise;
const stadiums = () => (stadiumsPromise ||= fetch(new URL('../../data/stadiums.json', import.meta.url)).then(response => response.json()).catch(() => []));
const norm = value => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

// The full slate for one week, Thursday through Monday.
export async function getWeekSlate(season, week) {
  const key = `nfl-week:${season}:${week}`;
  liveData.register(key, { url: `${WORKER}/espn/scoreboard?dates=${season}&seasontype=2&week=${week}`, cadence: 600000 });
  const data = await liveData.get(key);
  return normalizeGames(data).sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function geocode(city, country) {
  if (!city) return null;
  const key = `geo:${norm(city)}:${norm(country)}`;
  liveData.register(key, { url: `${GEOCODE}?${new URLSearchParams({ name: city, count: '5', language: 'en', format: 'json' })}`, cadence: 30 * DAY });
  const data = await liveData.get(key);
  const results = data?.results || [];
  const match = results.find(item => !country || norm(item.country) === norm(country) || norm(item.country_code) === norm(country)) || results[0];
  return match ? { lat: match.latitude, lng: match.longitude, tz: match.timezone, city: match.name } : null;
}

// Venue → { venue, city, lat, lng, tz, roof }
export async function resolveVenue(game) {
  const list = await stadiums();
  const key = norm(game.venue);
  const known = list.find(stadium => [stadium.venue, ...(stadium.aliases || [])].some(name => norm(name) === key));
  if (known) return { ...known };
  const placed = await geocode(game.venueCity, game.venueCountry).catch(() => null);
  if (placed) return { venue: game.venue, city: placed.city || game.venueCity, lat: placed.lat, lng: placed.lng, tz: placed.tz, roof: game.venueIndoor ? 'dome' : 'open' };
  const home = list.find(stadium => stadium.team.split('/').includes(game.home?.abbreviation));
  return home ? { ...home } : null;
}

const utcHour = date => `${new Date(date).toISOString().slice(0, 13)}:00`;

async function fetchHourly(locations, kickoffs) {
  const now = Date.now();
  const oldest = Math.min(...kickoffs);
  const newest = Math.max(...kickoffs);
  const coords = { latitude: locations.map(item => item.lat.toFixed(4)).join(','), longitude: locations.map(item => item.lng.toFixed(4)).join(',') };
  // Only the week's own date window (plus a day each side for late kickoffs in UTC).
  const day = time => new Date(time).toISOString().slice(0, 10);
  const range = { start_date: day(oldest - DAY), end_date: day(Math.min(newest + DAY, now + 15 * DAY)) };
  const archive = oldest < now - 90 * DAY;
  const url = archive
    ? `${ARCHIVE}?${new URLSearchParams({ ...coords, ...range, hourly: HOURLY.replace('precipitation_probability,', ''), temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', timezone: 'GMT' })}`
    : `${FORECAST}?${new URLSearchParams({ ...coords, ...range, hourly: HOURLY, temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', timezone: 'GMT' })}`;
  const key = `wx-week:${archive ? 'archive' : 'forecast'}:${range.start_date}:${range.end_date}:${coords.latitude}:${coords.longitude}`;
  liveData.register(key, { url, cadence: WEATHER_CONFIG.cacheMs, maxAge: WEATHER_CONFIG.cacheMs });
  const data = await liveData.get(key);
  if (!data) throw new Error('Weather is unreachable right now.');
  return Array.isArray(data) ? data : [data];
}

function read(hourly, field, index) {
  const value = hourly?.[field]?.[index];
  return value === null || value === undefined ? null : Number(value);
}

// Conditions at kickoff plus a 4-hour game-window strip.
function conditionsFor(game, venue, hourly) {
  const index = hourly?.time?.indexOf(utcHour(game.date)) ?? -1;
  if (index < 0) return null;
  const recorded = new Date(game.date).getTime() + 3.5 * 3600000 < Date.now();
  const precipChance = read(hourly, 'precipitation_probability', index);
  const precipAmount = read(hourly, 'precipitation', index) || 0;
  const snow = read(hourly, 'snowfall', index) || 0;
  const temperature = read(hourly, 'temperature_2m', index);
  const wind = read(hourly, 'wind_speed_10m', index) || 0;
  // Recorded games have no "chance"; measurable precipitation in the window counts as a rain game.
  const windowPrecip = [0, 1, 2, 3].reduce((sum, offset) => sum + (read(hourly, 'precipitation', index + offset) || 0), 0);
  const effectiveChance = precipChance ?? (windowPrecip >= 1 ? 100 : windowPrecip > 0 ? 40 : 0); // recorded: >=1 mm (0.04 in) across the window = rain game
  const impacts = weatherImpacts(wind, effectiveChance, temperature ?? 60);
  if (snow > 0.1 || [71, 73, 75, 77, 85, 86].includes(read(hourly, 'weather_code', index))) impacts.unshift({ id: 'snow', label: 'SNOW GAME', severity: 3, tooltip: 'Snow at kickoff: footing, ball security, and kicking all suffer.' });
  return {
    dome: false,
    status: recorded ? 'recorded' : 'forecast',
    venue: venue.venue,
    city: venue.city,
    temperature,
    feelsLike: read(hourly, 'apparent_temperature', index),
    precipitation: effectiveChance,
    precipAmount,
    wind,
    gust: read(hourly, 'wind_gusts_10m', index) || 0,
    direction: read(hourly, 'wind_direction_10m', index),
    weatherCode: read(hourly, 'weather_code', index),
    impacts,
    severity: impacts.reduce((score, impact) => Math.max(score, impact.severity), 0),
    window: [0, 1, 2, 3].map(offset => ({
      hour: hourly.time[index + offset],
      temperature: read(hourly, 'temperature_2m', index + offset),
      wind: read(hourly, 'wind_speed_10m', index + offset),
      precipitation: read(hourly, 'precipitation_probability', index + offset) ?? Math.min(100, Math.round((read(hourly, 'precipitation', index + offset) || 0) * 100)),
      weatherCode: read(hourly, 'weather_code', index + offset)
    })).filter(slot => slot.hour)
  };
}

// Weather for every game of a slate. Returns Map(gameId -> conditions | { dome } | { status: 'pending', opensOn }).
export async function getWeekWeather(games) {
  const venues = new Map(await Promise.all(games.map(async game => [game.id, await resolveVenue(game)])));
  const result = new Map();
  const outdoor = [];
  games.forEach(game => {
    const venue = venues.get(game.id);
    if (!venue) { result.set(game.id, { status: 'unknown', venue: game.venue, city: game.venueCity }); return; }
    if (venue.roof === 'dome' || (venue.roof === 'retractable' && game.venueIndoor)) { result.set(game.id, { dome: true, status: 'dome', venue: venue.venue, city: venue.city, impacts: [], severity: 0 }); return; }
    const kickoff = new Date(game.date).getTime();
    if (kickoff > Date.now() + 15.5 * DAY) { result.set(game.id, { status: 'pending', venue: venue.venue, city: venue.city, opensOn: new Date(kickoff - 15 * DAY) }); return; }
    outdoor.push({ game, venue });
  });
  if (outdoor.length) {
    const unique = [];
    const slot = new Map();
    outdoor.forEach(({ venue }) => { const key = `${venue.lat},${venue.lng}`; if (!slot.has(key)) { slot.set(key, unique.length); unique.push(venue); } });
    const responses = await fetchHourly(unique, outdoor.map(({ game }) => new Date(game.date).getTime()));
    outdoor.forEach(({ game, venue }) => {
      const hourly = responses[slot.get(`${venue.lat},${venue.lng}`)]?.hourly;
      result.set(game.id, conditionsFor(game, venue, hourly) || { status: 'unknown', venue: venue.venue, city: venue.city });
    });
  }
  return result;
}

export const WEATHER_LABELS = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Freezing fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers',
  85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorms', 96: 'Thunderstorms, hail', 99: 'Severe storms'
};
