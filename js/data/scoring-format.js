// League scoring format: one engine shared by every calculator, Rankings, Deals and the Trade Value Chart.
//
// WHY: live value sources price a fixed format. FantasyCalc takes numQbs (1QB / Superflex) and ppr (0, 0.5, 1).
// Dynasty Dealer publishes ONE market and it is a Superflex PPR market: it echoes sf/tep flags but returns
// identical values, and its quarterbacks sit on FantasyCalc's Superflex values, not its 1QB values (top 16 QBs:
// RMSE 17.6 vs Superflex, 43.8 vs 1QB, measured 2026-11-12; Josh Allen: Dealer 98, FC Superflex 100, FC 1QB 50).
// Before this module a 1QB league averaged a Superflex Dealer QB with a 1QB FantasyCalc QB, so QBs ran ~40% high.
// Neither source models passing-TD points or TE premium.
//
// HOW (in order, all live, no exports):
// 1. FantasyCalc is requested in the league's own format (numQbs, ppr).
// 2. Dynasty Dealer gets FantasyCalc's format shift for that player: dealer x (FC in this format / FC Superflex
//    PPR, the Dealer's own format). A player missing from either FantasyCalc list gets his position's median shift.
// 3. Rules no source models (passing-TD points, TE/RB/WR reception bonuses, a non-standard reception value)
//    come from Sleeper's live season projections. Each player's points are scored twice: under the league's
//    rules and under the source's assumed rules, with everything else identical. The multiplier is the ratio of
//    value over a waiver-level replacement at his position, scaled to 60% (the strength real TE-premium
//    trade markets show). A position the rule does not touch gets exactly 1.0.
// 4. Each source is scaled against its own top value in the format (after step 2, before step 3), so a rule that
//    boosts one player never rescales everyone else.
import { liveData } from './live-data.js';
import { getSleeperLeagueId, getNflState } from './sleeper.js';
import { getActiveLeagueConnection } from './league-connections.js';

const STORE = 'kt-format:v1';
const PROJ_CADENCE = 6 * 3600000; // Sleeper projections: refreshed at least every 6 hours (live values rule)
export const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const DEFAULT_ROSTER = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX'];
// Standard scoring assumed for everything a format chip does not set.
const STANDARD = { pass_yd: 0.04, pass_td: 4, pass_int: -2, pass_2pt: 2, rush_yd: 0.1, rush_td: 6, rush_2pt: 2, rec: 1, rec_yd: 0.1, rec_td: 6, rec_2pt: 2, fum_lost: -2, bonus_rec_te: 0, bonus_rec_rb: 0, bonus_rec_wr: 0 };
const SCORED = Object.keys(STANDARD);
export const BASELINE_DEPTH = 2.5; // replacement level = 2.5x the league's starters at the position
export const STRENGTH = 0.6;       // share of the projected move that real trade markets actually pay
export const CAP_LOW = 0.8;
export const CAP_HIGH = 1.25;

export const PRESETS = {
  std: { rec: 0, tep: 0, label: 'Non-PPR' },
  half: { rec: 0.5, tep: 0, label: 'Half-PPR' },
  ppr: { rec: 1, tep: 0, label: 'PPR' },
  tep: { rec: 1, tep: 0.5, label: 'TEP' }
};

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
export const fcPpr = rec => [0, 0.5, 1].reduce((best, step) => (Math.abs(step - rec) < Math.abs(best - rec) ? step : best), 1);

export function recLabel(rec) {
  if (rec === 0) return 'Non-PPR';
  if (rec === 0.5) return 'Half-PPR';
  if (rec === 1) return 'PPR';
  return `${rec} PPR`;
}

export function formatLabel(format) {
  const parts = [recLabel(format.rec), `${format.passTd}pt pass TD`];
  if (format.tep) parts.push(`TE +${format.tep}/rec`);
  parts.push(format.sf ? 'Superflex' : '1QB');
  return parts.join(' · ');
}

export function formatKey(format) {
  return [format.rec, format.passTd, format.tep, format.sf ? 'sf' : '1qb', format.teams].join('|');
}

function complete(format) {
  const scoring = { ...STANDARD, ...(format.scoring || {}) };
  scoring.rec = format.rec;
  scoring.pass_td = format.passTd;
  scoring.bonus_rec_te = format.tep;
  const roster = format.roster?.length ? format.roster : [...DEFAULT_ROSTER, ...(format.sf ? ['SUPER_FLEX'] : [])];
  return { ...format, scoring, roster, teams: Math.min(16, Math.max(8, num(format.teams, 12))) };
}

export function formatFromLeague(league) {
  const s = league?.scoring_settings || {};
  const roster = Array.isArray(league?.roster_positions) ? league.roster_positions : [];
  const qbSlots = roster.filter(slot => slot === 'QB').length;
  const scoring = {};
  SCORED.forEach(key => { if (s[key] != null) scoring[key] = Number(s[key]); });
  return complete({
    rec: num(s.rec, 1), passTd: num(s.pass_td, 4), tep: num(s.bonus_rec_te, 0),
    sf: roster.includes('SUPER_FLEX') || qbSlots >= 2, teams: num(league?.total_rosters, 12),
    roster, scoring, source: 'league', leagueName: league?.name || 'Your league', leagueId: league?.league_id || ''
  });
}

export function manualFormat({ preset = 'ppr', passTd = 4, sf = false } = {}) {
  const p = PRESETS[preset] || PRESETS.ppr;
  return complete({ rec: p.rec, passTd: Number(passTd) === 6 ? 6 : 4, tep: p.tep, sf: Boolean(sf), teams: 12, source: 'manual', preset });
}

export const DEFAULT_FORMAT = complete({ rec: 1, passTd: 4, tep: 0, sf: false, teams: 12, source: 'default', preset: 'ppr' });

export function readChoice() {
  try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (_) { return null; }
}
export function saveChoice(choice) {
  try { if (choice) localStorage.setItem(STORE, JSON.stringify(choice)); else localStorage.removeItem(STORE); } catch (_) {}
  window.dispatchEvent(new CustomEvent('kt:format-change'));
}

// The connected Sleeper league, if any (Yahoo leagues carry no Sleeper scoring_settings).
export async function connectedLeague() {
  const active = getActiveLeagueConnection();
  const id = getSleeperLeagueId();
  if (!id || active?.provider === 'yahoo') return null;
  const key = `sleeper-league:${id}`;
  liveData.register(key, { url: `https://api.sleeper.app/v1/league/${id}`, cadence: 300000 });
  try { const league = await liveData.get(key); return league?.scoring_settings ? league : null; } catch (_) { return null; }
}

// Active format: a manual choice wins (a chip the user clicked); otherwise the connected league; otherwise PPR 1QB.
export async function getActiveFormat() {
  const choice = readChoice();
  const league = await connectedLeague();
  const leagueFormat = league ? formatFromLeague(league) : null;
  if (choice && choice.preset && choice.preset !== 'league') return { ...manualFormat(choice), leagueFormat };
  if (leagueFormat) return { ...leagueFormat, leagueFormat };
  return { ...DEFAULT_FORMAT, leagueFormat: null };
}

export function fcUrl(format, dynasty) {
  return `https://api.fantasycalc.com/values/current?isDynasty=${dynasty}&numQbs=${format.sf ? 2 : 1}&numTeams=${format.teams}&ppr=${fcPpr(format.rec)}`;
}
// What the live sources assume: FantasyCalc's own ppr bucket, 4-point passing TDs, no position reception bonus.
export function sourceScoring(format) {
  return { ...format.scoring, rec: fcPpr(format.rec), pass_td: 4, bonus_rec_te: 0, bonus_rec_rb: 0, bonus_rec_wr: 0 };
}
export function needsProjection(format) {
  const s = format.scoring;
  return format.passTd !== 4 || format.tep !== 0 || Number(s.bonus_rec_rb || 0) !== 0 || Number(s.bonus_rec_wr || 0) !== 0 || fcPpr(format.rec) !== format.rec;
}

export function points(stats, scoring, position) {
  if (!stats) return 0;
  let total = 0;
  for (const key of SCORED) {
    if (key.startsWith('bonus_rec_')) continue;
    total += Number(stats[key] || 0) * Number(scoring[key] || 0);
  }
  const bonus = { TE: scoring.bonus_rec_te, RB: scoring.bonus_rec_rb, WR: scoring.bonus_rec_wr }[position];
  if (bonus) total += Number(stats.rec || 0) * Number(bonus);
  return total;
}

// Starters per position (12 teams x slots, flex shared RB 45% / WR 45% / TE 10%, superflex QB 90%).
export function replacementRank(position, format) {
  const r = format.roster;
  const count = slot => r.filter(s => s === slot).length;
  const flex = count('FLEX') + count('WRRB_FLEX') * 0.9 + count('REC_FLEX') * 0.6;
  const sflex = count('SUPER_FLEX');
  const per = { QB: count('QB') + sflex * 0.9, RB: count('RB') + flex * 0.45, WR: count('WR') + flex * 0.45 + count('REC_FLEX') * 0.3, TE: count('TE') + flex * 0.1 }[position] || 1;
  return Math.max(1, Math.round(per * format.teams));
}

function projectionKey(season) { return `sleeper-proj-season:${season}`; }
export async function seasonProjections() {
  const state = await getNflState();
  const season = String(state?.season || new Date().getFullYear());
  const key = projectionKey(season);
  liveData.register(key, { url: `https://api.sleeper.app/projections/nfl/${season}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&order_by=pts_ppr`, cadence: PROJ_CADENCE });
  const rows = await liveData.get(key);
  return Array.isArray(rows) ? rows : [];
}

// Pure: sleeperId -> { m, league, source, pos }. m === 1 exactly wherever league and source rules agree.
export function scoringMultipliers(rows, format) {
  const out = new Map();
  if (!needsProjection(format)) return out;
  const league = format.scoring;
  const source = sourceScoring(format);
  const byPos = new Map(POSITIONS.map(pos => [pos, []]));
  (rows || []).forEach(row => {
    const pos = String(row?.player?.position || row?.position || '').toUpperCase();
    if (!byPos.has(pos) || !row.player_id || !row.stats) return;
    byPos.get(pos).push({ id: String(row.player_id), pos, l: points(row.stats, league, pos), s: points(row.stats, source, pos) });
  });
  byPos.forEach((list, pos) => {
    if (!list.length) return;
    // Calibrated 2026-11-12 (tests/calibration/format_calibration.py):
    // - Baseline = 2.5x starters (waiver level). At 1x-1.5x the QB curve is so flat that the ratio swung from
    //   0.4 to 3.1 between neighbours; at 2.5x every top QB lands in a stable 1.08-1.25 band.
    // - Strength 0.6. Against real-trade TE-premium markets (1QB+TEP vs 1QB values for the top 12 TEs) the raw
    //   ratio overshot by about 9 points; scaling the move by 0.6 fits best. Safety caps -20% / +25%.
    const rank = Math.round(replacementRank(pos, format) * BASELINE_DEPTH);
    const replL = [...list].sort((a, b) => b.l - a.l)[Math.min(rank, list.length) - 1].l;
    const replS = [...list].sort((a, b) => b.s - a.s)[Math.min(rank, list.length) - 1].s;
    const topS = Math.max(...list.map(item => item.s - replS));
    list.forEach(item => {
      let m = 1;
      if (Math.abs(item.l - item.s) > 1e-9) {
        const vorS = item.s - replS;
        const vorL = item.l - replL;
        const raw = vorS > 0.1 * topS ? vorL / vorS : (item.l + 10) / (item.s + 10);
        m = Math.min(CAP_HIGH, Math.max(CAP_LOW, 1 + STRENGTH * (raw - 1)));
      }
      out.set(item.id, { m, league: item.l, source: item.s, pos });
    });
  });
  return out;
}

// Pure: re-price raw source payloads into the format. Pick rows are never touched.
// fcFormat: FantasyCalc rows in the format; fcBase: FantasyCalc Superflex PPR rows (the Dealer's own format, null when equal).
export function applyFormat({ fcFormat, fcBase = null, dealer = null, mult = new Map() }) {
  const mOf = id => mult.get(String(id))?.m ?? 1;
  let fcMax = 0;
  (fcFormat || []).forEach(row => { if (POSITIONS.includes(String(row?.player?.position || '').toUpperCase()) && row?.player?.name) fcMax = Math.max(fcMax, Number(row.value || 0)); });
  const fc = (fcFormat || []).map(row => {
    const pos = String(row?.player?.position || '').toUpperCase();
    if (pos === 'PICK') return row;
    const m = mOf(row?.player?.sleeperId);
    return m === 1 ? row : { ...row, value: Number(row.value || 0) * m, formatM: m };
  });
  let shift = null;
  if (fcBase) {
    const base = new Map();
    fcBase.forEach(row => { const id = row?.player?.sleeperId; if (id) base.set(String(id), Number(row.value || 0)); });
    shift = new Map();
    const byPos = new Map(POSITIONS.map(pos => [pos, []]));
    (fcFormat || []).forEach(row => {
      const id = String(row?.player?.sleeperId || ''); const b = base.get(id);
      if (!id || !(b > 0)) return;
      const k = Number(row.value || 0) / b;
      shift.set(id, k);
      byPos.get(String(row?.player?.position || '').toUpperCase())?.push(k);
    });
    byPos.forEach((list, pos) => { list.sort((x, y) => x - y); shift.set(`median:${pos}`, list.length ? list[Math.floor(list.length / 2)] : 1); });
  }
  const shiftOf = row => (shift ? shift.get(String(row.sleeper_id || '')) ?? shift.get(`median:${row.position}`) ?? 1 : 1);
  let dMax = 0;
  let dealerOut = dealer;
  if (dealer?.players?.length) {
    dealer.players.forEach(row => { if (row.position !== 'PICK') dMax = Math.max(dMax, Number(row.current_value || 0) * shiftOf(row)); });
    dealerOut = { ...dealer, players: dealer.players.map(row => {
      if (row.position === 'PICK') return row;
      const id = String(row.sleeper_id || '');
      const k = shiftOf(row) * mOf(id);
      return k === 1 ? row : { ...row, current_value: Number(row.current_value || 0) * k, formatK: k };
    }) };
  }
  return { fc, dealer: dealerOut, fcMax, dMax };
}

// Everything a value consumer needs for a format, live. dynasty=false: FantasyCalc redraft only.
// force: an open page's timed refresh. Invalidates the value sources first so the refresh really refetches
// (a cache younger than its cadence would otherwise be reused seconds before it expires).
export async function formatSources(format, { dynasty = true, dealer = true, force = false } = {}) {
  const fetchJson = key => { if (force) liveData.invalidate?.(key); return liveData.get(key).catch(() => null); };
  const fcKey = `fc-values:${dynasty ? 'dynasty' : 'redraft'}:${format.sf ? 2 : 1}:${fcPpr(format.rec)}:${format.teams}`;
  liveData.register(fcKey, { url: fcUrl(format, dynasty), cadence: 900000 });
  const isBase = format.sf && fcPpr(format.rec) === 1; // the Dealer's own format: Superflex PPR
  const baseKey = `fc-values:${dynasty ? 'dynasty' : 'redraft'}:2:1:${format.teams}`;
  if (!isBase) liveData.register(baseKey, { url: fcUrl({ ...format, sf: true, rec: 1 }, dynasty), cadence: 900000 });
  const { dealerSource } = await import('./dynasty-dealer.js');
  const [fcFormat, fcBase, dealerRows, proj] = await Promise.all([
    fetchJson(fcKey),
    !isBase && dealer ? fetchJson(baseKey) : Promise.resolve(null),
    dealer ? fetchJson(dealerSource()) : Promise.resolve(null),
    needsProjection(format) ? seasonProjections().catch(() => []) : Promise.resolve([])
  ]);
  const mult = scoringMultipliers(proj, format);
  const projected = needsProjection(format) ? proj.length > 0 : true;
  return { ...applyFormat({ fcFormat, fcBase, dealer: dealerRows, mult }), mult, projected, format };
}

export function isLeagueSynced(format) { return format?.source === 'league'; }
