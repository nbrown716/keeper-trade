import { liveData } from '../data/live-data.js';
import { SCOREBOARD_SOURCE, normalizeGames } from '../data/espn.js';
import { gameDayUrl } from './game-link.js';

let alertButton;

export function mountRedZoneAlert(currentGameId = '') {
  if (alertButton) return;
  document.body.insertAdjacentHTML('beforeend', '<button class="kt-red-zone-alert" type="button" hidden><span class="kt-live-dot" aria-hidden="true"></span><span></span><b>Jump to game</b></button>');
  alertButton = document.querySelector('.kt-red-zone-alert');
  liveData.subscribe(SCOREBOARD_SOURCE, ({ data }) => {
    const game = normalizeGames(data).find(item => item.state === 'in' && item.redZone && item.id !== currentGameId);
    alertButton.hidden = !game;
    if (!game) return;
    alertButton.querySelector('span:nth-child(2)').textContent = `${game.away.abbreviation} at ${game.home.abbreviation} · Red zone`;
    alertButton.onclick = () => { window.location.href = gameDayUrl(game.id); };
  });
}
