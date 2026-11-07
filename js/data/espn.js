import { liveData } from './live-data.js';

// Date-scoped key: a fresh cached scoreboard from another day (midnight rollover, ?debugdate) must never be reused.
export const SCOREBOARD_SOURCE = `nfl-scoreboard:${scoreboardDate()}`;
const scoreboardBase = 'https://keeper-trade-ai.nicholas-brown00.workers.dev/espn/scoreboard';

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function scoreboardDate() {
  const debug = new URLSearchParams(window.location.search).get('debugdate');
  return debug && /^\d{8}$/.test(debug) ? debug : localDateString();
}

liveData.register(SCOREBOARD_SOURCE, {
  url: () => `${scoreboardBase}?dates=${scoreboardDate()}`,
  cadence: data => normalizeGames(data).some(game => game.state === 'in') ? 30000 : 300000
});

// ESPN team codes → the Sleeper codes every player record uses (players on WAS never matched ESPN's WSH).
const SLEEPER_TEAM = { WSH: 'WAS' };

export function normalizeGames(data) {
  return (data?.events || []).map(event => {
    const competition = event.competitions?.[0] || {};
    const status = event.status?.type || competition.status?.type || {};
    const situation = competition.situation || {};
    const competitors = [...(competition.competitors || [])];
    const away = competitors.find(team => team.homeAway === 'away') || competitors[0] || {};
    const home = competitors.find(team => team.homeAway === 'home') || competitors[1] || {};
    const possessionId = situation.possession || competitors.find(team => team.possession)?.id;
    const normalizeTeam = team => ({
      id: team.id,
      name: team.team?.displayName || team.team?.name || '',
      abbreviation: SLEEPER_TEAM[team.team?.abbreviation] || team.team?.abbreviation || 'TBD',
      logo: team.team?.logo || team.team?.logos?.[0]?.href || '',
      score: Number(team.score || 0),
      winner: Boolean(team.winner),
      possession: Boolean(possessionId && String(team.id) === String(possessionId))
    });
    return {
      id: event.id,
      name: event.name,
      date: event.date || competition.date,
      state: status.state || 'pre',
      detail: status.shortDetail || status.detail || '',
      period: event.status?.period || competition.status?.period || 0,
      clock: event.status?.displayClock || competition.status?.displayClock || '',
      away: normalizeTeam(away),
      home: normalizeTeam(home),
      redZone: Boolean(situation.isRedZone),
      lastPlay: situation.lastPlay?.text || '',
      venue: competition.venue?.fullName || '',
      venueCity: competition.venue?.address?.city || '',
      venueCountry: competition.venue?.address?.country || competition.venue?.address?.state || '',
      venueIndoor: competition.venue?.indoor === true,
      broadcast: competition.broadcasts?.map(item => item.names?.join(', ')).filter(Boolean).join(', ') || '',
      week: data.week?.number || 0
    };
  });
}

export function isDebugDate() {
  return /^\d{8}$/.test(new URLSearchParams(window.location.search).get('debugdate') || '');
}

export function summarySource(gameId) {
  const key = `nfl-summary:${gameId}`;
  liveData.register(key, {
    url: `https://keeper-trade-ai.nicholas-brown00.workers.dev/espn/summary?event=${gameId}`,
    cadence: data => {
      const state = data?.header?.competitions?.[0]?.status?.type?.state;
      return state === 'in' ? 30000 : 300000;
    }
  });
  return key;
}

export function normalizeSummary(data) {
  const header = data?.header || {};
  const game = normalizeGames({ events: [header], week: header.week })[0];
  if (!game) return null;
  game.venue = game.venue || data.gameInfo?.venue?.fullName || '';
  const colors = new Map((data.boxscore?.teams || []).map(entry => [entry.team?.id, entry.team?.color]));
  game.away.color = colors.get(game.away.id) || '5f6b7a';
  game.home.color = colors.get(game.home.id) || '2f5f8f';
  const scoringPlays = data.scoringPlays || [];
  const scoringIds = new Set(scoringPlays.map(play => play.id));
  const drivePlays = (data.drives?.previous || []).flatMap(drive => drive.plays || []);
  const plays = (data.plays?.length ? data.plays : drivePlays.length ? drivePlays : scoringPlays).map(play => ({
    id: play.id,
    text: play.text || play.shortText || '',
    teamId: play.end?.team?.id || play.start?.team?.id || play.team?.id || play.teamParticipants?.find(participant => participant.type === 'offense')?.team?.id,
    yardLine: play.end?.possessionText || play.end?.downDistanceText || play.start?.text || '',
    period: play.period?.number || 0,
    clock: play.clock?.displayValue || (play.clock?.value ? `${Math.floor(play.clock.value / 60)}:${String(play.clock.value % 60).padStart(2, '0')}` : ''),
    scoring: Boolean(play.scoringPlay || scoringIds.has(play.id)),
    awayScore: Number(play.awayScore || 0),
    homeScore: Number(play.homeScore || 0),
    sequence: Number(play.sequenceNumber || 0),
    type: play.type?.abbreviation || play.scoringType?.abbreviation || ''
  })).sort((a, b) => a.sequence - b.sequence);
  return {
    game,
    plays,
    scoringPlays,
    probability: (data.winprobability || []).map((point, index) => ({ id: point.playId, home: Number(point.homeWinPercentage ?? 0.5), index })),
    drives: (data.drives?.previous || []).map(drive => ({ id: drive.id, description: drive.description, teamId: drive.team?.id, result: drive.displayResult || drive.result, yards: drive.yards, isScore: drive.isScore, start: drive.start, end: drive.end })),
    teams: data.boxscore?.teams || [],
    leaders: data.leaders || []
  };
}
