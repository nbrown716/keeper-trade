// Trade market engine for Deals (real league trades, model reads, values in picks, team values, movers).
//
// Values follow the Keeper calculator exactly, so a number here is the number there:
// - Players: average of Dynasty Dealer and FantasyCalc (both live, each normalized 0-100 against its own top
//   player), matched by Sleeper ID then name; one source falls back cleanly. Display scale 0-10,000 (x100).
//   Redraft leagues use FantasyCalc redraft values (Dealer is dynasty-only).
// - Keeper-league picks use the calculator's own rule (this IS the pick structure, unchanged): a pick drafts the
//   best player left after league-wide keepers, so its value = the player at rank keepersGone + (round - 0.5) x
//   teams on the same live curve, with an 8% haircut per year out.
// - Dynasty-league picks: live market rookie-pick values (Dealer + FantasyCalc, mid slot), rounds 1-4.
// - Redraft-league picks: listed, never valued.
import { liveData } from './live-data.js';
import { dealerSource } from './dynasty-dealer.js';
import { getLeagueBundle, getLeagueLineage, leagueUsers, rosterOwner } from './sleeper.js';

const FC_URL = dynasty => `https://api.fantasycalc.com/values/current?isDynasty=${dynasty}&numQbs=1&numTeams=12&ppr=1`;
export const LEAGUE_TYPE = { 0: 'redraft', 1: 'keeper', 2: 'dynasty' };
const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

// Same name key as the Keeper calculator (keeper.html keyOf).
export function keyOf(name) {
  let k = String(name || '').toLowerCase().replace(/[.''’]/g, '').replace(/\s+/g, ' ').trim();
  k = k.replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();
  if (k.indexOf('cam ') === 0) k = `cameron ${k.slice(4)}`;
  return k;
}

function fcSource(dynasty) {
  const key = `fc-values:${dynasty ? 'dynasty' : 'redraft'}`;
  liveData.register(key, { url: FC_URL(dynasty), cadence: 900000 });
  return key;
}

// Pure: build the value curve from raw FantasyCalc + Dealer payloads.
export function buildMarket(fcRows, dealer, type = 'keeper') {
  const live = new Map();
  let fcMax = 0;
  const fcPicks = new Map();
  (fcRows || []).forEach(row => {
    const player = row.player || {};
    const position = String(player.position || '').toUpperCase();
    const value = Number(row.value || 0);
    if (position === 'PICK') { fcPicks.set(player.name, value); return; }
    if (!POSITIONS.includes(position) || !player.name) return;
    if (value > fcMax) fcMax = value;
    const key = keyOf(player.name);
    if (value > (live.get(key)?.fc || 0)) live.set(key, { key, name: player.name, pos: position, team: player.maybeTeam || 'FA', age: player.maybeAge ?? null, sleeperId: player.sleeperId ? String(player.sleeperId) : '', fc: value, trend: Number(row.trend30Day || 0) });
  });
  const useDealer = type !== 'redraft' && dealer?.players?.length;
  const dById = new Map();
  const dByName = new Map();
  const dPicks = new Map();
  let dMax = 0;
  if (useDealer) {
    dealer.players.forEach(row => { if (row.position !== 'PICK') dMax = Math.max(dMax, Number(row.current_value || 0)); });
    dealer.players.forEach(row => {
      const value = Number(row.current_value || 0);
      if (row.position === 'PICK') { dPicks.set(String(row.sleeper_id), value); return; }
      const norm = dMax ? value / dMax * 100 : 0;
      if (row.sleeper_id) dById.set(String(row.sleeper_id), { norm, row });
      dByName.set(keyOf(row.name), { norm, row });
    });
  }
  const players = [];
  live.forEach(rec => {
    const d = (rec.sleeperId && dById.get(rec.sleeperId)) || dByName.get(rec.key);
    const fcNorm = fcMax ? rec.fc / fcMax * 100 : 0;
    const dd = d ? Math.round(d.norm * 10) / 10 : null; // rounded first, exactly like the calculator
    const base = dd != null ? Math.round(((dd + fcNorm) / 2) * 10) / 10 : Math.round(fcNorm * 10) / 10;
    players.push({ ...rec, dd, fcNorm: Math.round(fcNorm * 10) / 10, base, value: Math.round(base * 100) });
  });
  // Like the calculator, the curve is the FantasyCalc player pool (Dealer refines values, it doesn't add players),
  // so pick values (rank-based) match the Keeper calculator.
  players.sort((a, b) => b.base - a.base);
  const byId = new Map(players.filter(player => player.sleeperId).map(player => [player.sleeperId, player]));
  const byName = new Map(players.map(player => [player.key, player]));
  return { type, players, byId, byName, fcMax, dMax, fcPicks, dPicks, sources: { fc: fcMax > 0, dealer: Boolean(useDealer) && dMax > 0 } };
}

export async function getMarket(type = 'keeper') {
  const dynasty = type !== 'redraft';
  const [fc, dealer] = await Promise.all([
    liveData.get(fcSource(dynasty)).catch(() => null),
    type !== 'redraft' ? liveData.get(dealerSource()).catch(() => null) : Promise.resolve(null)
  ]);
  if (!Array.isArray(fc) || !fc.length) throw new Error('Live values are reconnecting.');
  return buildMarket(fc, dealer, type);
}

export function playerValue(market, id, name) {
  return market.byId.get(String(id)) || market.byName.get(keyOf(name)) || null;
}

// Keeper calculator's playerValueByRank on the live curve (0-100 scale).
export function valueByRank(market, rank) {
  const curve = market.players;
  const r = Math.max(1, rank);
  const n = curve.length;
  const idx = r - 1;
  if (!n) return 0;
  if (idx <= n - 1) { const lo = Math.floor(idx); const hi = Math.ceil(idx); return curve[lo].base + (curve[hi].base - curve[lo].base) * (idx - lo); }
  return Math.max(0.5, curve[n - 1].base * Math.pow(0.955, idx - (n - 1)));
}

// ctx: { type, keepersGone, teams, nextDraft }. Returns a display-scale value (0-10,000) or null (not valued).
export function pickValue(market, pick, ctx) {
  const round = Number(pick.round);
  const yearsOut = Math.max(0, Number(pick.season) - Number(ctx.nextDraft));
  if (ctx.type === 'keeper') {
    return Math.round(valueByRank(market, ctx.keepersGone + (round - 0.5) * ctx.teams) * Math.pow(0.92, yearsOut) * 100);
  }
  if (ctx.type === 'dynasty') {
    if (round > 4) return 0;
    const years = [...market.dPicks.keys()].map(key => Number(key.split('_')[1])).filter(Boolean);
    const lastYear = years.length ? Math.max(...years) : Number(pick.season);
    const year = Math.min(Number(pick.season), lastYear);
    const extraYears = Math.max(0, Number(pick.season) - lastYear);
    const d = market.dPicks.get(`pick_${year}_${round}_mid`);
    const ordinal = ['1st', '2nd', '3rd', '4th'][round - 1];
    const f = market.fcPicks.get(`${year} ${ordinal} (Mid)`) ?? market.fcPicks.get(`${year} ${ordinal}`);
    const parts = [d != null && market.dMax ? d / market.dMax * 100 : null, f != null && market.fcMax ? f / market.fcMax * 100 : null].filter(value => value != null);
    if (!parts.length) return null;
    return Math.round(parts.reduce((sum, value) => sum + value, 0) / parts.length * Math.pow(0.92, extraYears) * 100);
  }
  return null;
}

// One "pick" unit = a mid 1st in the next draft, in this league's structure.
export function pickUnit(market, ctx) {
  return pickValue(market, { round: 1, season: ctx.nextDraft }, ctx) || null;
}

export function leagueContext(league) {
  const type = LEAGUE_TYPE[Number(league?.settings?.type ?? 0)] || 'redraft';
  const teams = Number(league?.total_rosters || league?.settings?.num_teams || 12);
  const keepers = Number(league?.settings?.max_keepers || 0);
  const status = league?.status;
  const season = Number(league?.season || new Date().getFullYear());
  return { type, teams, keepersGone: type === 'keeper' ? (keepers ? keepers * teams : 20) : 0, nextDraft: status === 'pre_draft' || status === 'drafting' ? season : season + 1, season, superflex: (league?.roster_positions || []).includes('SUPER_FLEX'), ppr: Number(league?.scoring_settings?.rec ?? 1) };
}

// Value of one asset on the display scale (null = listed, not valued).
export function assetValue(market, asset, ctx) {
  if (asset.kind === 'pick') return pickValue(market, asset, ctx);
  return playerValue(market, asset.id, asset.name)?.value ?? 0;
}

// Model read of a trade: what each side RECEIVED, valued now. Fair band: the league's 1,000-point house rule for
// keeper leagues (same as the calculator's auto-approval band); 5% of the bigger side otherwise.
export function modelRead(trade, market, ctx) {
  const sides = trade.sides.map(side => {
    const assets = side.gets.map(asset => ({ ...asset, value: assetValue(market, asset, ctx) }));
    return { ...side, assets, total: assets.reduce((sum, asset) => sum + (asset.value || 0), 0), unvalued: assets.filter(asset => asset.value == null).length };
  });
  const [a, b] = sides;
  const diff = (a?.total || 0) - (b?.total || 0);
  const band = ctx.type === 'keeper' ? 1000 : Math.max(250, 0.05 * Math.max(a?.total || 0, b?.total || 0));
  const unit = pickUnit(market, ctx);
  return { sides, diff, band, even: Math.abs(diff) <= band, winner: Math.abs(diff) <= band ? -1 : diff > 0 ? 0 : 1, unit, diffInPicks: unit ? Math.abs(diff) / unit : null };
}

// ---------------------------------------------------------------- real trades from Sleeper (all seasons)
const playersCache = { map: null };
export async function loadLeagueTrades(leagueId, players) {
  playersCache.map = players;
  const lineage = await getLeagueLineage(leagueId);
  const leagues = lineage.length ? lineage : [{ league_id: leagueId }];
  const all = [];
  for (const league of leagues) {
    const id = String(league.league_id);
    const bundles = await Promise.all(Array.from({ length: 18 }, (_, index) => getLeagueBundle(id, index + 1).catch(() => null)));
    const first = bundles.find(Boolean);
    if (!first) continue;
    const users = leagueUsers(first.users);
    const names = new Map(first.rosters.map(roster => [roster.roster_id, String(rosterOwner(roster, users)).trim()]));
    const owners = new Map(first.rosters.map(roster => [roster.roster_id, roster.owner_id]));
    const starterLog = [];
    bundles.forEach((bundle, index) => (bundle?.matchups || []).forEach(entry => (entry.starters || []).forEach(pid => {
      if (pid !== '0') starterLog.push({ week: index + 1, rosterId: entry.roster_id, id: String(pid), points: Number(entry.players_points?.[pid] || 0) });
    })));
    const seen = new Set();
    bundles.forEach((bundle, index) => (bundle?.transactions || []).filter(tx => tx.type === 'trade' && tx.status === 'complete').forEach(tx => {
      const txId = String(tx.transaction_id);
      if (seen.has(txId)) return;
      seen.add(txId);
      const leg = Number(tx.leg || index + 1);
      const sides = (tx.roster_ids || []).map(rosterId => {
        const gets = [
          ...Object.entries(tx.adds || {}).filter(([, to]) => to === rosterId).map(([pid]) => {
            const player = players.get(String(pid));
            return { kind: 'player', id: String(pid), name: player?.name || `Player ${pid}`, pos: player?.position || '', team: player?.team || '' };
          }),
          ...(tx.draft_picks || []).filter(pick => pick.owner_id === rosterId && pick.previous_owner_id !== rosterId).map(pick => ({ kind: 'pick', season: String(pick.season), round: Number(pick.round), from: names.get(pick.roster_id) || `Team ${pick.roster_id}`, name: `${pick.season} Round ${pick.round}` }))
        ];
        const production = gets.filter(asset => asset.kind === 'player').reduce((sum, asset) => sum + starterLog.filter(row => row.id === asset.id && row.rosterId === rosterId && row.week >= leg).reduce((s, row) => s + row.points, 0), 0);
        return { rosterId, ownerId: owners.get(rosterId), name: names.get(rosterId) || `Team ${rosterId}`, gets, production: Math.round(production * 10) / 10 };
      });
      if (sides.length !== 2) { all.multiTeam = (all.multiTeam || 0) + 1; return; } // Deals compares two sides; counted so the UI can say so
      all.push({ id: txId, leagueId: id, season: String(league.season || first.league?.season), week: leg, created: Number(tx.created || 0), sides, scoredWeeks: bundles.filter(item => item?.matchups?.some(entry => Number(entry.points) > 0)).length });
    }));
  }
  const sorted = all.sort((a, b) => b.created - a.created);
  sorted.multiTeam = all.multiTeam || 0;
  return sorted;
}

// Team values today: every rostered player (live market) + owned next-draft picks (keeper/dynasty).
export function teamValues(bundle, market, ctx, tradedPicks = [], players = new Map()) {
  const users = leagueUsers(bundle.users);
  const teams = bundle.rosters.map(roster => {
    const assets = (roster.players || []).map(pid => {
      const player = players.get(String(pid));
      const v = playerValue(market, pid, player?.name);
      return { id: String(pid), name: v?.name || player?.name || `Player ${pid}`, pos: v?.pos || player?.position || '', value: v?.value || 0, age: v?.age ?? null };
    }).sort((a, b) => b.value - a.value);
    // pick ownership for the next draft: own picks unless traded away, plus picks acquired
    const rounds = ctx.type === 'keeper' ? 15 : 4;
    const picks = [];
    for (let round = 1; round <= rounds; round += 1) {
      const trades = tradedPicks.filter(pick => String(pick.season) === String(ctx.nextDraft) && Number(pick.round) === round);
      const mineAway = trades.find(pick => pick.roster_id === roster.roster_id && pick.owner_id !== roster.roster_id);
      if (!mineAway) picks.push({ round, season: ctx.nextDraft, own: true });
      trades.filter(pick => pick.owner_id === roster.roster_id && pick.roster_id !== roster.roster_id).forEach(() => picks.push({ round, season: ctx.nextDraft, own: false }));
    }
    const pickTotal = ctx.type === 'redraft' ? 0 : picks.reduce((sum, pick) => sum + (pickValue(market, { kind: 'pick', ...pick }, ctx) || 0), 0);
    const playerTotal = assets.reduce((sum, asset) => sum + asset.value, 0);
    const weighted = assets.filter(asset => asset.age != null && asset.value > 0);
    const age = weighted.length ? weighted.reduce((sum, asset) => sum + asset.age * asset.value, 0) / weighted.reduce((sum, asset) => sum + asset.value, 0) : null;
    return { rosterId: roster.roster_id, name: String(rosterOwner(roster, users)).trim(), playerTotal, pickTotal, total: playerTotal + pickTotal, top: assets.slice(0, 3), age, picks: picks.length };
  }).sort((a, b) => b.total - a.total);
  return teams.map((team, index) => ({ ...team, rank: index + 1 }));
}
