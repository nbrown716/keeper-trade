export const PERSONALITIES = [
  { id: 'homer', name: 'The Homer', avatar: '🧢', color: '#59a8ff', bio: 'Loyal to a fault. Believes team chemistry beats spreadsheets.', rules: { favoriteTeam: 'DAL', reachRounds: 2, valueWeight: 0.55 } },
  { id: 'zero-rb', name: 'Zero-RB Truther', avatar: '🪽', color: '#c6ff4a', bio: 'Running backs are a myth invented by old school commissioners.', rules: { avoidPositions: ['RB'], untilRound: 5, valueWeight: 0.9 } },
  { id: 'panic', name: 'The Panic Merchant', avatar: '😰', color: '#ff5268', bio: 'One doubtful tag and he is out. Two rounds early, every time.', rules: { avoidInjured: true, fadeRounds: 2, valueWeight: 0.7 } },
  { id: 'spreadsheet', name: 'Spreadsheet Steve', avatar: '📊', color: '#8fd3ff', bio: 'No jokes. No reaches. Only adjusted value and cold efficiency.', rules: { valueWeight: 1, ignoreNarrative: true } },
  { id: 'trader', name: 'The Trader', avatar: '🤝', color: '#ffb612', bio: 'Every pick is a starting point for the next deal.', rules: { proposeSwapAfterPicks: [3, 6], valueWeight: 0.8 } },
  { id: 'ghost', name: 'The Ghost', avatar: '👻', color: '#8190a8', bio: 'Autopick is a lifestyle. Draft day is not a personality trait.', rules: { autopick: true, valueWeight: 0.95 } },
  { id: 'troll', name: 'The Troll', avatar: '😈', color: '#d50a0a', bio: 'Reads your board. Steals your guy. Leaves no note.', rules: { stealHumanTarget: true, valueWeight: 0.75 } },
  { id: 'hoarder', name: 'The Dynasty Hoarder', avatar: '🏦', color: '#4f2683', bio: 'Future picks are pretty. Rookie contracts are prettier.', rules: { preferYoung: true, valueWeight: 0.65 } },
  { id: 'rookie', name: 'The Rookie Whisperer', avatar: '🐣', color: '#69be28', bio: 'Sees a future WR1 in every second-year breakout.', rules: { preferYoung: true, rookieBoost: 1.2, valueWeight: 0.6 } },
  { id: 'waiver', name: 'The Waiver Wizard', avatar: '🪄', color: '#008e97', bio: 'Starters are temporary. Depth is where leagues are won.', rules: { prioritizeDepth: true, valueWeight: 0.8 } },
  { id: 'commissioner', name: 'The Commissioner', avatar: '⚖️', color: '#a5acaf', bio: 'Fair value, firm rulings, absolutely no fun allowed.', rules: { balanced: true, valueWeight: 0.9 } }
];
