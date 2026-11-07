// Season engine: one pass over every completed regular-season week builds the KPIs behind
// Season Wrapped 2.0 (spec §2.2 / §3.2). computeSeason() is pure (raw Sleeper JSON in, numbers out) so it
// can be verified independently; loadSeason() fetches and caches.
//
// Definitions (kept deliberately literal so every number can be audited):
// - Weeks: completed regular-season weeks only (the week in progress and playoffs are excluded).
// - Result: from matchup points; a tie counts half a win in win% and luck.
// - Bench: every rostered player that week who was not a starter, minus taxi (taxi players cannot start).
// - Optimal lineup: the best legal lineup from that week's roster under the league's slot rules.
// - "For you": points a player scored while in YOUR starting lineup.

import { getLeagueBundle, getLeagueLineage, getNflState, leagueUsers, rosterOwner } from './sleeper.js';
import { getPlayerDatabase } from './player-db.js';
import { liveData } from './live-data.js';

const SLOT_ELIGIBILITY = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], K: ['K'], DEF: ['DEF'], DL: ['DL'], LB: ['LB'], DB: ['DB'],
  FLEX: ['RB', 'WR', 'TE'], WRRB_FLEX: ['RB', 'WR'], REC_FLEX: ['WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  IDP_FLEX: ['DL', 'LB', 'DB']
};
const NON_STARTING = new Set(['BN', 'IR', 'TAXI']);
const CLOSE_GAME = 10;
const BOOM = 20;
const round2 = value => Math.round(value * 100) / 100;
const sum = list => list.reduce((total, value) => total + value, 0);
const mean = list => (list.length ? sum(list) / list.length : 0);
const sd = list => { const m = mean(list); return list.length > 1 ? Math.sqrt(sum(list.map(value => (value - m) ** 2)) / list.length) : 0; };

// Best legal lineup. Fill the most restrictive slots first, each with the best unused eligible player.
// Optimal for nested eligibility sets (dedicated slots ⊂ FLEX ⊂ SUPER_FLEX), which covers Sleeper's slots.
export function optimalLineup(slots, pool) {
  const order = slots.map((slot, index) => ({ slot, index, eligible: SLOT_ELIGIBILITY[slot] || [slot] }))
    .sort((a, b) => a.eligible.length - b.eligible.length || a.index - b.index);
  const used = new Set();
  const lineup = [];
  order.forEach(({ slot, eligible }) => {
    const best = pool.filter(player => !used.has(player.id) && eligible.includes(player.position))
      .sort((a, b) => b.points - a.points || String(a.id).localeCompare(String(b.id)))[0];
    if (best) { used.add(best.id); lineup.push({ slot, ...best }); }
  });
  return { points: round2(sum(lineup.map(player => player.points))), lineup };
}

function rankOf(values, id, higherIsBetter = true) {
  const sorted = [...values.entries()].sort((a, b) => (higherIsBetter ? b[1] - a[1] : a[1] - b[1]));
  const value = values.get(id);
  return sorted.findIndex(([, other]) => (higherIsBetter ? other <= value : other >= value)) + 1; // shared rank on ties
}

// raw: { league, rosters, users, weeks: [{ week, matchups, transactions }], players: Map, picks: [], history: [] }
export function computeSeason(raw) {
  const { league, rosters, users: userList, weeks, players, picks = [], history = [] } = raw;
  const users = leagueUsers(userList);
  const slots = (league.roster_positions || []).filter(slot => !NON_STARTING.has(slot));
  const teamIds = rosters.map(roster => roster.roster_id);
  const name = new Map(rosters.map(roster => [roster.roster_id, String(rosterOwner(roster, users)).trim()]));
  const owner = new Map(rosters.map(roster => [roster.roster_id, roster.owner_id]));
  const taxi = new Map(rosters.map(roster => [roster.roster_id, new Set((roster.taxi || []).map(String))]));
  const info = id => {
    const player = players.get(String(id));
    const position = player?.position || (/^[A-Z]{2,3}$/.test(String(id)) ? 'DEF' : '');
    return { id: String(id), name: player?.name || (position === 'DEF' ? `${id} D/ST` : `Player ${id}`), position, team: player?.team || (position === 'DEF' ? String(id) : '') };
  };

  const team = new Map(teamIds.map(id => [id, {
    rosterId: id, ownerId: owner.get(id), name: name.get(id),
    wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, allPlayWins: 0, allPlayLosses: 0, allPlayTies: 0,
    close: { wins: 0, losses: 0, ties: 0 }, weeks: [], actual: 0, optimal: 0, bench: 0, perfectWeeks: 0,
    starts: new Map(), benchByPlayer: new Map(), regretByPlayer: new Map(), worstDecision: null, aboveAverage: 0
  }]));
  const starterLog = []; // every player-week as a starter: { week, rosterId, id, points, position }

  weeks.forEach(({ week, matchups }) => {
    const scored = matchups.filter(entry => entry.matchup_id !== null && entry.matchup_id !== undefined);
    const weekScores = new Map(scored.map(entry => [entry.roster_id, Number(entry.points || 0)]));
    const weekMean = mean([...weekScores.values()]);
    const sortedScores = [...weekScores.values()].sort((a, b) => b - a);
    const groups = new Map();
    scored.forEach(entry => { if (!groups.has(entry.matchup_id)) groups.set(entry.matchup_id, []); groups.get(entry.matchup_id).push(entry); });
    groups.forEach(pair => {
      if (pair.length !== 2) return;
      const [a, b] = pair;
      [[a, b], [b, a]].forEach(([self, other]) => {
        const stats = team.get(self.roster_id);
        if (!stats) return;
        const own = Number(self.points || 0);
        const opp = Number(other.points || 0);
        const result = own > opp ? 'W' : own < opp ? 'L' : 'T';
        stats.pf += own; stats.pa += opp;
        if (result === 'W') stats.wins += 1; else if (result === 'L') stats.losses += 1; else stats.ties += 1;
        if (Math.abs(own - opp) < CLOSE_GAME) stats.close[result === 'W' ? 'wins' : result === 'L' ? 'losses' : 'ties'] += 1;
        weekScores.forEach((score, id) => {
          if (id === self.roster_id) return;
          if (own > score) stats.allPlayWins += 1; else if (own < score) stats.allPlayLosses += 1; else stats.allPlayTies += 1;
        });
        stats.aboveAverage += own - weekMean;
        stats.weeks.push({ week, points: own, opponent: other.roster_id, opponentPoints: opp, result, rank: sortedScores.indexOf(own) + 1, leagueMean: weekMean });

        // Lineup decisions
        const starters = (self.starters || []).map(String);
        const starterSet = new Set(starters);
        const pool = (self.players || []).map(String).filter(id => !taxi.get(self.roster_id)?.has(id) || starterSet.has(id))
          .map(id => ({ ...info(id), points: Number(self.players_points?.[id] || 0) }));
        const best = optimalLineup(slots, pool);
        stats.actual += own;
        stats.optimal += Math.max(best.points, own);
        if (best.points - own < 0.005) stats.perfectWeeks += 1;
        starters.forEach((id, index) => {
          if (id === '0') return;
          const points = Number(self.players_points?.[id] ?? self.starters_points?.[index] ?? 0);
          const player = info(id);
          starterLog.push({ week, rosterId: self.roster_id, id, points, position: player.position });
          if (!stats.starts.has(id)) stats.starts.set(id, []);
          stats.starts.get(id).push({ week, points });
        });
        pool.filter(player => !starterSet.has(player.id)).forEach(player => {
          stats.bench += player.points;
          stats.benchByPlayer.set(player.id, (stats.benchByPlayer.get(player.id) || 0) + player.points);
        });
        // Worst single call: a benched player who was in the optimal lineup vs the starter he should have replaced.
        const optimalIds = new Set(best.lineup.map(player => player.id));
        // Regret only counts bench points that would have made your best legal lineup that week.
        pool.filter(player => !starterSet.has(player.id) && optimalIds.has(player.id) && player.points > 0).forEach(player => {
          stats.regretByPlayer.set(player.id, (stats.regretByPlayer.get(player.id) || 0) + player.points);
        });
        pool.filter(player => !starterSet.has(player.id) && optimalIds.has(player.id)).forEach(benched => {
          starters.forEach((id, index) => {
            const slot = slots[index];
            if (!slot || id === '0' || optimalIds.has(id) || !(SLOT_ELIGIBILITY[slot] || [slot]).includes(benched.position)) return;
            const startedPoints = Number(self.players_points?.[id] || 0);
            const swing = benched.points - startedPoints;
            if (swing > (stats.worstDecision?.swing || 0)) stats.worstDecision = { week, benched: { ...benched }, started: { ...info(id), points: startedPoints }, swing: round2(swing) };
          });
        });
      });
    });
  });

  // ---- transactions ----
  const startedFor = (rosterId, id, fromWeek, excludeRoster = false) => round2(sum(starterLog
    .filter(row => row.id === String(id) && row.week >= fromWeek && (excludeRoster ? row.rosterId !== rosterId : row.rosterId === rosterId))
    .map(row => row.points)));
  const moves = new Map(teamIds.map(id => [id, { adds: 0, drops: 0, trades: 0, pickups: [], drops_: [], trades_: [] }]));
  weeks.forEach(({ week, transactions = [] }) => transactions.filter(tx => tx.status === 'complete').forEach(tx => {
    const leg = Number(tx.leg || week);
    if (tx.type === 'trade') {
      (tx.roster_ids || []).forEach(rosterId => {
        const record = moves.get(rosterId);
        if (!record) return;
        record.trades += 1;
        const received = Object.entries(tx.adds || {}).filter(([, to]) => to === rosterId).map(([id]) => ({ ...info(id), points: startedFor(rosterId, id, leg) }));
        const sent = Object.entries(tx.drops || {}).filter(([, from]) => from === rosterId).map(([id]) => {
          const to = tx.adds?.[id];
          return { ...info(id), to, points: to ? startedFor(to, id, leg) : 0 };
        });
        const picksIn = (tx.draft_picks || []).filter(pick => pick.owner_id === rosterId && pick.previous_owner_id !== rosterId).map(pick => `${pick.season} R${pick.round}`);
        const picksOut = (tx.draft_picks || []).filter(pick => pick.previous_owner_id === rosterId && pick.owner_id !== rosterId).map(pick => `${pick.season} R${pick.round}`);
        const partners = (tx.roster_ids || []).filter(id => id !== rosterId);
        const gained = round2(sum(received.map(player => player.points)));
        const given = round2(sum(sent.map(player => player.points)));
        record.trades_.push({ id: String(tx.transaction_id), week: leg, partners, received, sent, picksIn, picksOut, gained, given, net: round2(gained - given), early: gained === 0 && given === 0 });
      });
      return;
    }
    if (!['waiver', 'free_agent'].includes(tx.type)) return; // commissioner moves are not manager decisions
    Object.entries(tx.adds || {}).forEach(([id, rosterId]) => {
      const record = moves.get(rosterId);
      if (!record) return;
      record.adds += 1;
      record.pickups.push({ ...info(id), week: leg, type: tx.type, bid: tx.settings?.waiver_bid ?? null, points: startedFor(rosterId, id, leg) });
    });
    Object.entries(tx.drops || {}).forEach(([id, rosterId]) => {
      const record = moves.get(rosterId);
      if (!record) return;
      record.drops += 1;
      record.drops_.push({ ...info(id), week: leg, points: startedFor(rosterId, id, leg, true) });
    });
  }));

  // ---- draft ROI ----
  const draftRows = picks.filter(pick => pick.player_id && pick.roster_id).map(pick => ({
    ...info(pick.player_id), rosterId: pick.roster_id, round: pick.round, pickNo: pick.pick_no, keeper: Boolean(pick.is_keeper),
    points: startedFor(pick.roster_id, pick.player_id, 1)
  }));
  const roundMean = new Map();
  [...new Set(draftRows.map(row => row.round))].forEach(roundNo => roundMean.set(roundNo, mean(draftRows.filter(row => row.round === roundNo).map(row => row.points))));

  // ---- league-wide positional baselines (points per start at each position, all teams) ----
  const positionPpg = new Map();
  [...new Set(starterLog.map(row => row.position))].forEach(position => positionPpg.set(position, mean(starterLog.filter(row => row.position === position).map(row => row.points))));
  const rooms = new Map(teamIds.map(id => [id, {}]));
  starterLog.forEach(row => { const room = rooms.get(row.rosterId); if (room) room[row.position] = (room[row.position] || 0) + row.points; });

  // ---- history (lineage) for rivalries ----
  const meetings = new Map(); // `${ownerA}|${ownerB}` -> { w, l, t }
  const record = (a, b, own, opp) => {
    if (!a || !b) return;
    const key = `${a}|${b}`;
    const entry = meetings.get(key) || { wins: 0, losses: 0, ties: 0 };
    if (own > opp) entry.wins += 1; else if (own < opp) entry.losses += 1; else entry.ties += 1;
    meetings.set(key, entry);
  };
  history.forEach(snapshot => {
    const owners = new Map(snapshot.teams.map(item => [item.id, item.ownerId]));
    snapshot.matchups.forEach(matchup => {
      record(owners.get(matchup.aId), owners.get(matchup.bId), matchup.aScore, matchup.bScore);
      record(owners.get(matchup.bId), owners.get(matchup.aId), matchup.bScore, matchup.aScore);
    });
  });
  team.forEach(stats => stats.weeks.forEach(game => record(stats.ownerId, owner.get(game.opponent), game.points, game.opponentPoints)));
  const ownerName = new Map(rosters.map(roster => [roster.owner_id, name.get(roster.roster_id)]));

  // ---- finalize per team ----
  const weeksPlayed = weeks.length;
  const output = new Map();
  team.forEach(stats => {
    const games = stats.wins + stats.losses + stats.ties;
    const allPlayGames = stats.allPlayWins + stats.allPlayLosses + stats.allPlayTies;
    const allPlayPct = allPlayGames ? (stats.allPlayWins + stats.allPlayTies / 2) / allPlayGames : 0;
    const expectedWins = allPlayPct * games;
    let run = 0; let runType = ''; let longestWin = 0; let longestLoss = 0;
    stats.weeks.forEach(game => {
      if (game.result === runType) run += 1; else { run = 1; runType = game.result; }
      if (runType === 'W') longestWin = Math.max(longestWin, run);
      if (runType === 'L') longestLoss = Math.max(longestLoss, run);
    });
    const best = stats.weeks.slice().sort((a, b) => b.points - a.points)[0] || null;
    const worst = stats.weeks.slice().sort((a, b) => a.points - b.points)[0] || null;
    const playerRows = [...stats.starts.entries()].map(([id, list]) => {
      const pts = list.map(item => item.points);
      const player = info(id);
      const ppg = mean(pts);
      return { ...player, starts: list.length, total: round2(sum(pts)), ppg: round2(ppg), cv: ppg > 0 ? sd(pts) / ppg : Infinity, booms: pts.filter(value => value >= BOOM).length, best: list.slice().sort((a, b) => b.points - a.points)[0], vsPosition: positionPpg.get(player.position) ? ppg / positionPpg.get(player.position) : null };
    });
    const minReliable = Math.min(6, Math.max(3, Math.ceil(weeksPlayed * 0.6)));
    const minBust = Math.min(4, Math.max(2, Math.ceil(weeksPlayed * 0.4)));
    const reliable = playerRows.filter(row => row.starts >= minReliable && row.ppg >= 8).sort((a, b) => a.cv - b.cv)[0] || null;
    const boom = playerRows.filter(row => row.booms > 0).sort((a, b) => b.booms - a.booms || b.total - a.total)[0] || null;
    const bust = playerRows.filter(row => row.starts >= minBust && row.vsPosition !== null).sort((a, b) => a.vsPosition - b.vsPosition)[0] || null;
    const bestGame = playerRows.map(row => ({ ...row, points: row.best.points, week: row.best.week })).sort((a, b) => b.points - a.points)[0] || null;
    const benchTop = [...stats.regretByPlayer.entries()].sort((a, b) => b[1] - a[1])[0];
    const record_ = moves.get(stats.rosterId);
    const h2h = [...meetings.entries()].filter(([key]) => key.startsWith(`${stats.ownerId}|`)).map(([key, value]) => {
      const opponentOwner = key.split('|')[1];
      const total = value.wins + value.losses + value.ties;
      return { ownerId: opponentOwner, name: ownerName.get(opponentOwner) || 'A former manager', ...value, games: total, pct: total ? (value.wins + value.ties / 2) / total : 0 };
    }).filter(item => item.games >= 2 && ownerName.has(item.ownerId));
    const draft = draftRows.filter(row => row.rosterId === stats.rosterId).map(row => ({ ...row, expected: round2(roundMean.get(row.round) || 0), ratio: roundMean.get(row.round) ? row.points / roundMean.get(row.round) : 0 }));
    output.set(stats.rosterId, {
      rosterId: stats.rosterId, ownerId: stats.ownerId, name: stats.name,
      wins: stats.wins, losses: stats.losses, ties: stats.ties, games,
      pf: round2(stats.pf), pa: round2(stats.pa), ppg: round2(games ? stats.pf / games : 0),
      allPlay: { wins: stats.allPlayWins, losses: stats.allPlayLosses, ties: stats.allPlayTies, pct: allPlayPct },
      expectedWins: round2(expectedWins), luck: round2(stats.wins + stats.ties / 2 - expectedWins),
      close: stats.close, longestWin, longestLoss,
      bestWeek: best, worstWeek: worst, aboveAverage: round2(stats.aboveAverage),
      weekly: stats.weeks, weeklySd: round2(sd(stats.weeks.map(game => game.points))),
      lineupIQ: stats.optimal ? stats.actual / stats.optimal : 0, optimal: round2(stats.optimal), leftOnBench: round2(stats.optimal - stats.actual),
      benchPoints: round2(stats.bench), perfectWeeks: stats.perfectWeeks, worstDecision: stats.worstDecision,
      mvp: playerRows.slice().sort((a, b) => b.total - a.total)[0] || null,
      reliable, boom, bust, bestGame, minReliable, minBust,
      benchRegret: benchTop ? { ...info(benchTop[0]), points: round2(benchTop[1]) } : null,
      rooms: rooms.get(stats.rosterId),
      players: playerRows.sort((a, b) => b.total - a.total),
      moves: { adds: record_.adds, drops: record_.drops, trades: record_.trades, total: record_.adds + record_.drops + record_.trades },
      bestPickup: record_.pickups.slice().sort((a, b) => b.points - a.points)[0] || null,
      gotAway: record_.drops_.slice().sort((a, b) => b.points - a.points)[0] || null,
      trades: record_.trades_, tradeNet: round2(sum(record_.trades_.map(trade => trade.net))),
      draft, bestValue: draft.filter(row => row.expected > 0 && row.round > 1).sort((a, b) => b.ratio - a.ratio)[0] || null,
      nemesis: h2h.slice().sort((a, b) => a.pct - b.pct || b.losses - a.losses)[0] || null,
      victim: h2h.slice().sort((a, b) => b.pct - a.pct || b.wins - a.wins)[0] || null,
      h2h
    });
  });

  // ---- league ranks, archetypes, badges ----
  const metric = fn => new Map([...output.values()].map(item => [item.rosterId, fn(item)]));
  const metrics = {
    pf: metric(item => item.pf), pa: metric(item => item.pa), iq: metric(item => item.lineupIQ), luck: metric(item => item.luck),
    allPlay: metric(item => item.allPlay.pct), moves: metric(item => item.moves.total), bench: metric(item => item.benchPoints),
    variance: metric(item => item.weeklySd), trade: metric(item => item.tradeNet),
    closePct: metric(item => { const c = item.close; const n = c.wins + c.losses + c.ties; return n >= 2 ? (c.wins + c.ties / 2) / n : -1; })
  };
  const z = (map, id) => { const values = [...map.values()]; const s = sd(values) || 1; return (map.get(id) - mean(values)) / s; };
  const roomRanks = position => metric(item => item.rooms[position] || 0);
  output.forEach(item => {
    const id = item.rosterId;
    item.ranks = Object.fromEntries(Object.entries(metrics).map(([key, map]) => [key, rankOf(map, id, key !== 'pa')]));
    item.ranks.paHigh = rankOf(metrics.pa, id, true); // most points against = unluckiest schedule
    item.roomRanks = Object.fromEntries(Object.keys(item.rooms).filter(position => position).map(position => [position, rankOf(roomRanks(position), id)]));
    const start = item.weekly.slice(0, 4).map(game => game.result);
    const slowStart = (start.slice(0, 2).every(result => result === 'L') && start.length >= 2) || (start.length >= 4 && start.filter(result => result === 'W').length <= 1);
    const after = item.weekly.slice(slowStart && start.slice(0, 2).every(r => r === 'L') ? 2 : 4);
    const afterPct = after.length ? after.filter(game => game.result === 'W').length / after.length : 0;
    const candidates = [
      { id: 'tinkerer', title: 'The Tinkerer', line: 'Never met a waiver wire you didn’t like.', qualifies: item.ranks.moves <= 3 && item.moves.total > 0, z: z(metrics.moves, id) },
      { id: 'oracle', title: 'The Oracle', line: 'You start the right guys. Every week.', qualifies: item.lineupIQ >= 0.92, z: z(metrics.iq, id) },
      { id: 'gambler', title: 'The Gambler', line: 'Feast or famine, never boring.', qualifies: item.ranks.variance === 1, z: z(metrics.variance, id) },
      { id: 'coldbench', title: 'The Cold Bench', line: 'Your bench could win a game on its own.', qualifies: item.ranks.bench === 1, z: z(metrics.bench, id) },
      { id: 'closer', title: 'The Closer', line: 'Ice in the veins when it’s tight.', qualifies: item.ranks.closePct === 1 && metrics.closePct.get(id) > 0.5, z: z(metrics.closePct, id) },
      { id: 'baron', title: 'The Robber Baron', line: 'Every trade call goes your way.', qualifies: item.ranks.trade === 1 && item.tradeNet > 0, z: z(metrics.trade, id) },
      // +2 wins over a full regular season; scaled down for a season in progress (min +1)
      { id: 'lucky', title: 'The Lucky Charm', line: 'The schedule gods love you.', qualifies: item.luck >= Math.max(1, 2 * weeksPlayed / 14), z: z(metrics.luck, id) },
      { id: 'juggernaut', title: 'The Juggernaut', line: 'Nobody put up more points. Nobody.', qualifies: item.ranks.pf === 1, z: z(metrics.pf, id) },
      { id: 'snakebitten', title: 'The Snakebitten', line: 'You did your part. The schedule didn’t.', qualifies: item.luck <= -Math.max(0.75, weeksPlayed / 14) || (item.ranks.paHigh === 1 && item.luck < 0), z: -z(metrics.luck, id) },
      { id: 'phoenix', title: 'The Phoenix', line: 'Written off early. Not anymore.', qualifies: slowStart && after.length >= 2 && afterPct >= 0.6, z: afterPct * 2 }
    ].filter(candidate => candidate.qualifies).sort((a, b) => b.z - a.z);
    // Fallback reads the record so a 1–7 team is never called "steady"
    const winPct = item.games ? (item.wins + item.ties / 2) / item.games : 0;
    const fallback = winPct < 0.35 ? { id: 'rebuild', title: 'The Rebuild', line: 'Every dynasty starts somewhere. This is the somewhere.', z: 0 }
      : winPct > 0.6 ? { id: 'contender', title: 'The Contender', line: 'Winning quietly. Nobody wants to see you in December.', z: 0 }
      : { id: 'steady', title: 'The Steady Hand', line: 'No chaos, no panic, just football.', z: 0 };
    item.archetype = candidates[0] || fallback;
    item.archetypes = candidates.map(candidate => candidate.id);
    const labels = { pf: 'points scored', iq: 'Lineup IQ', allPlay: 'all-play record', luck: 'luck', moves: 'roster moves', trade: 'trade ledger', bench: 'bench points' };
    item.badges = Object.entries(labels).filter(([key]) => item.ranks[key] <= 3 && (key !== 'trade' || item.tradeNet > 0)).map(([key, label]) => ({ key, label, rank: item.ranks[key] }));
  });

  // all-time records (lineage history + this season)
  const allTimeHigh = Math.max(0, ...history.flatMap(snapshot => snapshot.matchups.flatMap(matchup => [matchup.aScore, matchup.bScore])), ...[...output.values()].flatMap(item => item.weekly.map(game => game.points)));
  output.forEach(item => { item.records = item.bestWeek && item.bestWeek.points >= allTimeHigh - 0.001 ? ['highest'] : []; });

  return {
    league: { id: String(league.league_id), name: league.name, season: String(league.season), teams: teamIds.length, slots, playoffStart: Number(league.settings?.playoff_week_start || 15), seasons: new Set(history.map(snapshot => snapshot.season)).size + 1 },
    weeks: weeks.map(item => item.week), throughWeek: weeks.at(-1)?.week || 0,
    complete: (weeks.at(-1)?.week || 0) >= Number(league.settings?.playoff_week_start || 15) - 1,
    positionPpg: Object.fromEntries([...positionPpg.entries()].map(([key, value]) => [key, round2(value)])),
    teams: output,
    managers: [...output.values()].map(item => ({ id: item.rosterId, name: item.name }))
  };
}

// Completed regular-season weeks for a league: the in-progress week and playoffs are excluded.
export function completedWeeks(league, nfl) {
  const lastRegular = Number(league.settings?.playoff_week_start || 15) - 1;
  if (String(league.season) !== String(nfl.season)) return league.status === 'pre_draft' ? 0 : lastRegular;
  if (nfl.season_type === 'pre') return 0;
  if (nfl.season_type === 'post' || nfl.season_type === 'off') return lastRegular;
  return Math.max(0, Math.min(lastRegular, Number(nfl.week || nfl.display_week || 1) - 1));
}

async function draftPicks(league) {
  const key = `sleeper-drafts:${league.league_id}`;
  liveData.register(key, { url: `https://api.sleeper.app/v1/league/${league.league_id}/drafts`, cadence: 86400000 });
  const drafts = await liveData.get(key).catch(() => null);
  const draft = (drafts || []).find(item => String(item.season) === String(league.season) && item.status === 'complete');
  if (!draft) return [];
  const picksKey = `sleeper-draft-picks:${draft.draft_id}`;
  liveData.register(picksKey, { url: `https://api.sleeper.app/v1/draft/${draft.draft_id}/picks`, cadence: 86400000 * 7 });
  return (await liveData.get(picksKey).catch(() => null)) || [];
}

async function lineageHistory(leagueId) {
  const { lineageSnapshots } = await import('../features/pulse-data.js');
  const players = await getPlayerDatabase();
  const lineage = await getLeagueLineage(leagueId);
  return lineageSnapshots(lineage, players);
}

// Full season for a Sleeper league (Yahoo leagues lack per-player weekly points: spec §3.4).
export async function loadSeason(leagueId) {
  const [nfl, players, first] = await Promise.all([getNflState(), getPlayerDatabase(), getLeagueBundle(leagueId, 1)]);
  const through = completedWeeks(first.league, nfl);
  const bundles = through > 1 ? await Promise.all(Array.from({ length: through - 1 }, (_, index) => getLeagueBundle(leagueId, index + 2))) : [];
  const all = through ? [first, ...bundles] : [];
  const weeks = all.map((bundle, index) => ({ week: index + 1, matchups: bundle.matchups || [], transactions: bundle.transactions || [] }))
    .filter(item => item.matchups.some(entry => Number(entry.points || 0) > 0));
  const [picks, history] = await Promise.all([
    draftPicks(first.league).catch(() => []),
    Promise.race([lineageHistory(leagueId).catch(() => []), new Promise(resolve => setTimeout(() => resolve([]), 12000))])
  ]);
  return computeSeason({ league: first.league, rosters: first.rosters, users: first.users, weeks, players, picks, history });
}
