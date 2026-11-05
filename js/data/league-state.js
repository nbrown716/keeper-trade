let snapshot = null;

export function setLeagueSnapshot(value) {
  snapshot = value;
  window.dispatchEvent(new CustomEvent('kt:league-update', { detail: value }));
}

export function getLeagueSnapshot() {
  return snapshot ? structuredClone(snapshot) : null;
}
