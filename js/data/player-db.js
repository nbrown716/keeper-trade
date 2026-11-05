const DB_NAME = 'kt-keeper-store';
const STORE = 'players';
const META = 'meta';
const WEEK = 604800000;
let database;

function openDatabase() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.result.createObjectStore(META, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

function transaction(store, mode, action) {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

export async function getPlayerDatabase() {
  const fresh = await transaction(META, 'readonly', store => store.get('players-updated'));
  if (fresh?.value && Date.now() - fresh.value < WEEK) {
    const players = await transaction(STORE, 'readonly', store => store.getAll());
    if (players.length) return new Map(players.map(player => [player.id, player]));
  }
  const response = await fetch('https://api.sleeper.app/v1/players/nfl');
  if (!response.ok) throw new Error('Player database unavailable');
  const data = await response.json();
  const players = Object.entries(data).map(([id, player]) => ({
    id,
    name: player.full_name || `${player.first_name || ''} ${player.last_name || ''}`.trim(),
    team: player.team || 'FA',
    position: player.position || '',
    injury: player.injury_status || '',
    active: player.active !== false
  }));
  await openDatabase().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.clear();
    players.forEach(player => store.put(player));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  }));
  await transaction(META, 'readwrite', store => store.put({ key: 'players-updated', value: Date.now() }));
  return new Map(players.map(player => [player.id, player]));
}
