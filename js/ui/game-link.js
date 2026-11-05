export function gameDayUrl(gameId) {
  const params = new URLSearchParams({ id: gameId });
  const debugDate = new URLSearchParams(window.location.search).get('debugdate');
  if (debugDate && /^\d{8}$/.test(debugDate)) params.set('debugdate', debugDate);
  return `game.html?${params}`;
}
