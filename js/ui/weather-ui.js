function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function weatherGlyph(weather) {
  if (!weather || weather.dome) return '';
  const code = weather.weatherCode;
  if ([71, 73, 75, 77, 85, 86].includes(code) || weather.impacts.some(impact => impact.id === 'freeze')) return '❄';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95 || weather.impacts.some(impact => impact.id === 'rain')) return '☂';
  if (weather.impacts.some(impact => impact.id.includes('wind'))) return '≋';
  if ([2, 3, 45, 48].includes(code)) return '☁';
  return '☀';
}

export function weatherBadge(impact) {
  if (!impact) return '';
  return `<span class="kt-weather-badge kt-weather-${escapeHtml(impact.id)}" tabindex="0" data-tooltip="${escapeHtml(impact.tooltip)}" aria-label="${escapeHtml(`${impact.label}. ${impact.tooltip}`)}">${escapeHtml(impact.label)}</span>`;
}

export function weatherIcon(weather) {
  if (!weather || weather.dome) return '';
  const glyph = weatherGlyph(weather);
  const rain = glyph === '☂';
  const snow = glyph === '❄';
  const wind = glyph === '≋';
  return `<svg class="kt-weather-icon${rain ? ' is-rain' : ''}${snow ? ' is-snow' : ''}${wind ? ' is-wind' : ''}" viewBox="0 0 64 64" aria-hidden="true"><circle class="kt-weather-sun" cx="25" cy="23" r="10"/><path class="kt-weather-cloud" d="M17 43h29a10 10 0 0 0 1-20 15 15 0 0 0-28-4 12 12 0 0 0-2 24Z"/>${rain ? '<path class="kt-weather-rain" d="m22 48-3 8m14-8-3 8m14-8-3 8"/>' : ''}${snow ? '<path class="kt-weather-snow" d="M20 50h8m-4-4v8m12-4h8m-4-4v8"/>' : ''}${wind ? '<path class="kt-weather-wind" d="M7 47h36c9 0 9-12 1-12-5 0-7 3-7 5M12 55h26"/>' : ''}</svg>`;
}

export function weatherStrip(weather, state = 'loading') {
  if (weather?.dome) return '<div class="kt-weather-strip is-dome"><span class="kt-weather-dome-chip">DOME</span><span>Controlled conditions at kickoff.</span></div>';
  if (!weather) return `<div class="kt-weather-strip is-loading" aria-busy="${state === 'loading'}"><span class="kt-skeleton kt-skeleton-text" aria-hidden="true"></span><span>${state === 'loading' ? 'Checking kickoff conditions…' : 'Kickoff forecast unavailable for this venue or date.'}</span></div>`;
  const impacts = weather.impacts.map(weatherBadge).join('');
  return `<div class="kt-weather-strip${weather.severity ? ' has-impact' : ''}">${weatherIcon(weather)}<div class="kt-weather-strip-main"><span class="kt-eyebrow">Kickoff conditions · ${escapeHtml(weather.city)}</span><div><strong class="kt-num">${Math.round(weather.temperature)}°F</strong><span>${Math.round(weather.precipitation)}% precip</span><span>Wind ${Math.round(weather.wind)} mph${weather.gust ? ` · Gusts ${Math.round(weather.gust)}` : ''}</span></div>${impacts ? `<div class="kt-weather-impacts">${impacts}</div>` : ''}</div><a class="kt-weather-credit" href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a></div>`;
}
