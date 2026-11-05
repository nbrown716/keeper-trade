export const MASCOT_CONFIG = {
  asset: 'assets/mascot.riv',
  runtime: 'https://unpkg.com/@rive-app/canvas@2.30.0/rive.js',
  stateMachine: 'Keeper',
  states: {
    idle: { input: 'idle', type: 'boolean' },
    happy: { input: 'happy', type: 'boolean' },
    devastated: { input: 'devastated', type: 'boolean' },
    judging: { input: 'judging', type: 'boolean' },
    celebrating: { input: 'celebrating', type: 'trigger' },
    nervous: { input: 'nervous', type: 'boolean' },
    hype: { input: 'hype', type: 'boolean' },
    sleeping: { input: 'sleeping', type: 'boolean' },
    thinking: { input: 'thinking', type: 'boolean' }
  },
  copy: {
    idle: ['Your league. Your edge. I’m watching.', 'Big commissioner energy. Tiny clipboard.'],
    happy: ['That’s a W. Act like you’ve been here before.', 'Your starters understood the assignment.'],
    devastated: ['I need a minute. And a new defense.', 'We do not talk about that week. Ever.'],
    judging: ['Interesting trade. Bold definition of “fair.”', 'I’ve seen better offers in free agency.'],
    celebrating: ['Badge secured. Clipboard upgraded.', 'A streak worth framing. Or at least posting.'],
    nervous: ['One score. My nerves are in prevent defense.', 'This is not the time for a prevent offense.'],
    hype: ['Playoff mode activated. No more cute mistakes.', 'The group chat is not ready for this.'],
    sleeping: ['Offseason? I’m just resting my eyes.', 'No games. No opinions. For once.'],
    thinking: ['Consulting the league office…', 'Running the numbers. Judging silently.'],
    easter: ['I was the one who vetoed your first trade. Kidding. Mostly.', 'Tap the clipboard one more time. I dare you.']
  }
};
