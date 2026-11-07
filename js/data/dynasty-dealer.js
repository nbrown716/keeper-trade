import { liveData } from './live-data.js';

export const DEALER_SOURCE = 'dynasty-dealer-values';
const REFRESH = 1800000; // 30 min: values move with votes and news; trades must never price off day-old data

export function dealerSource(settings = {}) {
  const key = settings.format || settings.scoring || settings.superflex
    ? `${DEALER_SOURCE}:${settings.format || 'dynasty'}:${settings.scoring || 'ppr'}:${settings.superflex ? 'sf' : '1qb'}`
    : DEALER_SOURCE;
  const params = new URLSearchParams();
  if (settings.format) params.set('format', settings.format);
  if (settings.scoring) params.set('scoring', settings.scoring);
  if (settings.superflex) params.set('sf', 'true');
  liveData.register(key, {
    url: `https://www.dynastydealer.com/api/player-values${params.size ? `?${params}` : ''}`,
    cadence: REFRESH
  });
  return key;
}

export function normalizeDealerPlayers(data) {
  return (data?.players || []).map(player => ({
    id: player.sleeper_id,
    name: player.name,
    position: player.position,
    team: player.team,
    value: Number(player.current_value || 0),
    baseValue: Number(player.base_value || 0),
    votes: Number(player.votes || 0),
    updatedAt: player.updated_at
  })).filter(player => player.name && player.value > 0);
}

export function dealerMovers(data, limit = 6) {
  return normalizeDealerPlayers(data).map(player => ({
    ...player,
    change: player.baseValue ? (player.value - player.baseValue) / player.baseValue * 100 : 0
  })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, limit);
}
