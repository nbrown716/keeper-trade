export function createDraft(teams, rounds) {
  const order = Array.from({ length: rounds }, (_, round) => round % 2 === 0 ? [...teams] : [...teams].reverse()).flat();
  return { teams, rounds, order, index: 0, rosters: Object.fromEntries(teams.map(team => [team.id, []])), history: [] };
}

export function currentTeam(draft) {
  return draft.order[draft.index];
}

export function availablePlayers(draft, pool) {
  return pool.filter(player => !draft.history.some(pick => pick.player.id === player.id));
}

export function makePick(draft, team, player) {
  if (!team || team.id !== currentTeam(draft)?.id) throw new Error('It is not that team’s pick.');
  if (draft.history.some(pick => pick.player.id === player.id)) throw new Error('That player is already drafted.');
  const pick = { team, player, overall: draft.index + 1, round: Math.floor(draft.index / draft.teams.length) + 1, pickInRound: draft.index % draft.teams.length + 1 };
  draft.rosters[team.id].push(player);
  draft.history.push(pick);
  draft.index += 1;
  return pick;
}

export function recommendations(draft, pool, count = 3) {
  return availablePlayers(draft, pool).slice().sort((a, b) => b.dealerValue - a.dealerValue).slice(0, count);
}

export function fallbackPick(draft, pool, team) {
  const round = Math.floor(draft.index / draft.teams.length) + 1;
  const personality = team.personality?.rules || {};
  let players = availablePlayers(draft, pool);
  if (personality.avoidPositions && round < (personality.avoidPositions.includes('RB') ? 5 : 1)) players = players.filter(player => !personality.avoidPositions.includes(player.position));
  if (personality.avoidInjured) players = players.filter(player => !player.injury);
  if (personality.favoriteTeam) players.sort((a, b) => Number(b.team === personality.favoriteTeam) - Number(a.team === personality.favoriteTeam) || b.dealerValue - a.dealerValue);
  else players.sort((a, b) => b.dealerValue - a.dealerValue);
  return players[0] || availablePlayers(draft, pool)[0];
}

export function rosterScore(roster) {
  return roster.reduce((sum, player) => sum + player.dealerValue, 0);
}

export function gradeRoster(roster) {
  const average = rosterScore(roster) / Math.max(1, roster.length);
  if (average >= 7500) return 'A+';
  if (average >= 6500) return 'A';
  if (average >= 5500) return 'A-';
  if (average >= 4750) return 'B+';
  if (average >= 4000) return 'B';
  if (average >= 3250) return 'B-';
  if (average >= 2500) return 'C+';
  if (average >= 1800) return 'C';
  if (average >= 1200) return 'C-';
  if (average >= 700) return 'D';
  return 'F';
}
