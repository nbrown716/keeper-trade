import { liveData } from './live-data.js';

export const VALUES_SOURCE = 'fantasy-player-values';

liveData.register(VALUES_SOURCE, {
  url: 'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&numTeams=12&ppr=1',
  cadence: 900000
});

export function normalizePlayers(data) {
  return (data || []).map(row => ({
    id: row.player?.sleeperId || row.player?.espnId || row.player?.name,
    name: row.player?.name || '',
    position: (row.player?.position || '').toUpperCase(),
    team: row.player?.maybeTeam || 'FA',
    value: Number(row.value || 0),
    trend: Number(row.trend30Day || 0),
    rank: Number(row.positionRank || 0),
    espnId: row.player?.espnId,
    sleeperId: row.player?.sleeperId
  })).filter(player => player.name && ['QB', 'RB', 'WR', 'TE'].includes(player.position));
}

export function playerPhoto(player) {
  return player.espnId
    ? `https://a.espncdn.com/i/headshots/nfl/players/full/${player.espnId}.png`
    : player.sleeperId ? `https://sleepercdn.com/content/nfl/players/${player.sleeperId}.jpg` : '';
}
