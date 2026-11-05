const DEFAULT_SIMULATIONS = 10000;

function randomGenerator(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

// Box–Muller transform: weekly scores follow a Normal distribution around blended team strength.
function normal(random, mean, deviation) {
  const first = Math.max(random(), 1e-9);
  const second = random();
  return mean + Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second) * deviation;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function prepare(data) {
  const indices = new Map(data.teams.map((team, index) => [team.id, index]));
  const games = data.schedule.map(game => ({ ...game, home: indices.get(game.homeId), away: indices.get(game.awayId) }))
    .filter(game => game.home !== undefined && game.away !== undefined);
  const forcedWinners = new Int8Array(games.length).fill(-1);

  games.forEach((game, index) => {
    if (data.winOutId === game.homeId) forcedWinners[index] = 0;
    else if (data.winOutId === game.awayId) forcedWinners[index] = 1;
    else if (data.lossId === game.homeId && game.week === data.lossWeek) forcedWinners[index] = 1;
    else if (data.lossId === game.awayId && game.week === data.lossWeek) forcedWinners[index] = 0;
    else if (data.rivalLossesId === game.homeId && game.week <= data.rivalLossesThroughWeek) forcedWinners[index] = 1;
    else if (data.rivalLossesId === game.awayId && game.week <= data.rivalLossesThroughWeek) forcedWinners[index] = 0;
  });

  // Magic-number scenarios force the team's next N games, rather than comparing win totals to week numbers.
  if (data.magicTeamId !== undefined && data.magicTeamId !== null) {
    const remaining = games.map((game, index) => ({ game, index }))
      .filter(entry => entry.game.homeId === data.magicTeamId || entry.game.awayId === data.magicTeamId)
      .sort((a, b) => a.game.week - b.game.week || a.index - b.index);
    remaining.slice(0, data.magicWins || 0).forEach(({ game, index }) => {
      if (forcedWinners[index] === -1) forcedWinners[index] = game.homeId === data.magicTeamId ? 0 : 1;
    });
  }
  return { games, forcedWinners };
}

function simulate(data, simulations = data.simulations || DEFAULT_SIMULATIONS) {
  const random = randomGenerator(data.seed || 2026);
  const teams = data.teams;
  const teamCount = teams.length;
  const playoffCount = Math.min(teamCount, data.playoffTeams || 6);
  const byes = Math.min(playoffCount - 1, data.playoffByes ?? 2);
  const variance = data.variance || 22;
  const { games, forcedWinners } = prepare(data);
  const finalWins = teams.map(() => new Float32Array(simulations));
  const finalLosses = teams.map(() => new Float32Array(simulations));
  const finalTies = teams.map(() => new Uint16Array(simulations));
  const playoff = new Uint32Array(teamCount);
  const seeds = new Uint32Array(teamCount * teamCount);
  const championships = new Uint32Array(teamCount);
  const wins = new Float64Array(teamCount);
  const losses = new Float64Array(teamCount);
  const ties = new Uint16Array(teamCount);
  const points = new Float64Array(teamCount);
  const table = teams.map((_, index) => ({ index, wins: 0, points: 0 }));
  const seedRank = new Uint8Array(teamCount);

  for (let simulation = 0; simulation < simulations; simulation += 1) {
    teams.forEach((team, index) => {
      wins[index] = team.wins;
      losses[index] = team.losses;
      ties[index] = team.ties || 0;
      points[index] = team.pointsFor;
    });

    games.forEach((game, gameIndex) => {
      const homeScore = clamp(normal(random, teams[game.home].strength, variance), 40, 250);
      const awayScore = clamp(normal(random, teams[game.away].strength, variance), 40, 250);
      const forced = forcedWinners[gameIndex];
      const homeWins = forced === 0 || (forced === -1 && homeScore > awayScore);
      const awayWins = forced === 1 || (forced === -1 && awayScore > homeScore);
      if (homeWins) {
        wins[game.home] += 1;
        losses[game.away] += 1;
      } else if (awayWins) {
        wins[game.away] += 1;
        losses[game.home] += 1;
      } else {
        ties[game.home] += 1;
        ties[game.away] += 1;
      }
      points[game.home] += homeScore;
      points[game.away] += awayScore;
    });

    // Sleeper standings use wins (ties count as half a win), then total points for as the tiebreaker.
    table.forEach(entry => {
      entry.wins = wins[entry.index] + ties[entry.index] * 0.5;
      entry.points = points[entry.index];
    });
    table.sort((a, b) => b.wins - a.wins || b.points - a.points);
    table.forEach((entry, seed) => {
      seedRank[entry.index] = seed;
      seeds[entry.index * teamCount + seed] += 1;
      if (seed < playoffCount) playoff[entry.index] += 1;
    });

    // Each playoff round pairs highest and lowest remaining seeds; byes apply only to round one.
    let bracket = table.slice(0, playoffCount).map(entry => entry.index);
    let firstRound = true;
    while (bracket.length > 1) {
      const advancingByes = firstRound ? bracket.slice(0, byes) : [];
      const contenders = firstRound ? bracket.slice(byes) : bracket;
      const next = [];
      for (let high = 0, low = contenders.length - 1; high < low; high += 1, low -= 1) {
        const first = contenders[high];
        const second = contenders[low];
        const firstScore = normal(random, teams[first].strength, variance);
        const secondScore = normal(random, teams[second].strength, variance);
        if (firstScore === secondScore) next.push(random() < 0.5 ? first : second);
        else next.push(firstScore > secondScore ? first : second);
      }
      bracket = [...advancingByes, ...next].sort((a, b) => seedRank[a] - seedRank[b]);
      firstRound = false;
    }
    if (bracket.length) championships[bracket[0]] += 1;
    teams.forEach((team, index) => {
      finalWins[index][simulation] = wins[index];
      finalLosses[index][simulation] = losses[index];
      finalTies[index][simulation] = ties[index];
    });
  }
  return { finalWins, finalLosses, finalTies, playoff, seeds, championships, simulations };
}

function percentile(sorted, ratio) {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function formatResult(data, outcome) {
  return data.teams.map((team, index) => {
    const wins = Array.from(outcome.finalWins[index]).sort((a, b) => a - b);
    const losses = Array.from(outcome.finalLosses[index]).sort((a, b) => a - b);
    const seedDistribution = Array.from(outcome.seeds.slice(index * data.teams.length, (index + 1) * data.teams.length),
      (count, seed) => ({ seed: seed + 1, probability: count / outcome.simulations }));
    const relevantSeeds = seedDistribution.filter(entry => entry.seed <= (data.playoffTeams || 6) && entry.probability >= 0.01);
    return {
      id: team.id,
      name: team.name,
      playoff: outcome.playoff[index] / outcome.simulations,
      championship: outcome.championships[index] / outcome.simulations,
      seedDistribution,
      seedRange: relevantSeeds.length ? `${relevantSeeds[0].seed}–${relevantSeeds.at(-1).seed}` : '—',
      recordBand: `${percentile(wins, 0.05)}–${percentile(wins, 0.95)}`,
      lossBand: `${percentile(losses, 0.05)}–${percentile(losses, 0.95)}`,
      magicNumber: null
    };
  });
}

self.onmessage = event => {
  const started = performance.now();
  const data = event.data;
  const outcome = simulate(data);
  const results = formatResult(data, outcome);
  const magicSimulations = data.magicSimulations || 1000;

  results.forEach((result, teamIndex) => {
    const remaining = data.schedule.filter(game => game.homeId === result.id || game.awayId === result.id).length;
    let low = 0;
    let high = remaining;
    const checked = new Map();
    // Playoff odds are monotonic in forced wins, so binary search avoids simulating every possible total.
    while (low < high) {
      const extraWins = Math.floor((low + high) / 2);
      const scenario = { ...data, winOutId: null, magicTeamId: result.id, magicWins: extraWins };
      const scenarioOutcome = simulate(scenario, magicSimulations);
      const probability = scenarioOutcome.playoff[teamIndex] / magicSimulations;
      checked.set(extraWins, probability);
      if (probability >= 0.9) high = extraWins;
      else low = extraWins + 1;
    }
    let probability = checked.get(low);
    if (probability === undefined) {
      const finalScenario = { ...data, winOutId: null, magicTeamId: result.id, magicWins: low };
      probability = simulate(finalScenario, magicSimulations).playoff[teamIndex] / magicSimulations;
    }
    result.magicNumber = probability >= 0.9 ? low : null;
  });
  self.postMessage({ results, simulations: outcome.simulations, elapsed: Math.round(performance.now() - started), seed: data.seed || 2026 });
};
