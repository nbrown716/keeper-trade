const CONNECTIONS_KEY = 'kt-league-connections:v1';
const ACTIVE_KEY = 'kt-active-league:v1';
const LEGACY_SLEEPER_KEY = 'kt-sleeper-league:v1';
const PROVIDERS = new Set(['sleeper', 'yahoo']);

function storageGet(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {}
}

function storageRemove(key) {
  try { localStorage.removeItem(key); } catch (_) {}
}

function validConnection(provider, id) {
  return provider === 'sleeper' ? /^\d{15,20}$/.test(id) : provider === 'yahoo' ? /^(?:nfl|\d{2,4})\.l\.\d+$/.test(id) : false;
}

function cleanConnection(value) {
  if (!value || typeof value !== 'object' || !PROVIDERS.has(value.provider)) return null;
  const id = String(value.id || '').trim();
  if (!validConnection(value.provider, id)) return null;
  return {
    provider: value.provider,
    id,
    name: String(value.name || `${value.provider === 'sleeper' ? 'Sleeper' : 'Yahoo'} league`).trim().slice(0, 80),
    connectedAt: Number(value.connectedAt) || Date.now()
  };
}

function readConnections() {
  let saved;
  try { saved = JSON.parse(storageGet(CONNECTIONS_KEY) || '[]'); } catch (_) { saved = []; }
  const seen = new Set();
  const connections = Array.isArray(saved) ? saved.map(cleanConnection).filter(Boolean).filter(connection => {
    const key = `${connection.provider}:${connection.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }) : [];
  if (connections.length) return connections;
  try {
    const legacy = JSON.parse(storageGet(LEGACY_SLEEPER_KEY) || 'null');
    const connection = cleanConnection({ provider: 'sleeper', id: legacy?.id, name: legacy?.name || 'Sleeper league', connectedAt: legacy?.savedAt });
    return connection ? [connection] : [];
  } catch (_) { return []; }
}

function saveConnections(connections, active) {
  storageSet(CONNECTIONS_KEY, JSON.stringify(connections));
  if (active) storageSet(ACTIVE_KEY, `${active.provider}:${active.id}`);
  else storageRemove(ACTIVE_KEY);
  if (active?.provider === 'sleeper') storageSet(LEGACY_SLEEPER_KEY, JSON.stringify({ id: active.id, name: active.name, savedAt: active.connectedAt }));
  else storageRemove(LEGACY_SLEEPER_KEY);
  window.dispatchEvent(new CustomEvent('kt:league-connection-change', { detail: active ? { ...active } : null }));
}

export function getLeagueConnections() {
  return readConnections().map(connection => ({ ...connection }));
}

export function getActiveLeagueConnection() {
  const connections = readConnections();
  const activeKey = storageGet(ACTIVE_KEY);
  return connections.find(connection => `${connection.provider}:${connection.id}` === activeKey) || connections[0] || null;
}

export function addLeagueConnection(provider, id, name = '') {
  const connection = cleanConnection({ provider, id, name, connectedAt: Date.now() });
  if (!connection) throw new Error('Enter a valid league connection.');
  const connections = readConnections();
  const existing = connections.findIndex(item => item.provider === provider && item.id === id);
  if (existing >= 0) connections[existing] = { ...connections[existing], name: connection.name || connections[existing].name, connectedAt: Date.now() };
  else connections.push(connection);
  const active = existing >= 0 ? connections[existing] : connection;
  saveConnections(connections, active);
  return { ...active };
}

export function setActiveLeagueConnection(provider, id) {
  const connections = readConnections();
  const active = connections.find(connection => connection.provider === provider && connection.id === id);
  if (!active) throw new Error('That league is not connected.');
  saveConnections(connections, active);
  return { ...active };
}

export function removeLeagueConnection(provider, id) {
  const connections = readConnections();
  const remaining = connections.filter(connection => connection.provider !== provider || connection.id !== id);
  const previousActive = getActiveLeagueConnection();
  const nextActive = previousActive?.provider === provider && previousActive.id === id ? remaining[0] || null : previousActive;
  saveConnections(remaining, nextActive);
  return nextActive ? { ...nextActive } : null;
}

export function renameLeagueConnection(provider, id, name) {
  const connections = readConnections();
  const connection = connections.find(item => item.provider === provider && item.id === id);
  if (!connection || !name) return;
  connection.name = String(name).trim().slice(0, 80);
  const active = getActiveLeagueConnection();
  saveConnections(connections, active);
}
