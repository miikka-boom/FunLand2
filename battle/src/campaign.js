// Campaign: each round is a preset red army and a gold budget for blue.
// Red positions are world x inside WORLD.zone.red (1100..1760); front = low x.

const line = (type, x0, n, gap = 34) => Array.from({ length: n }, (_, i) => ({ type, x: x0 + i * gap }));

export const ROUNDS = [
  {
    name: 'Bonk Basics',
    tip: 'Clubbers hit hard but walk into arrows.',
    budget: 220,
    red: [...line('clubber', 1160, 3, 46)],
  },
  {
    name: 'Shield Wall',
    tip: 'Shields stop arrows from the front. Clubs go over the top.',
    budget: 320,
    red: [...line('squire', 1150, 3, 40), { type: 'archer', x: 1480 }],
  },
  {
    name: 'Arrow Rain',
    tip: 'Archers are squishy. Get a shield in front of them.',
    budget: 420,
    red: [{ type: 'squire', x: 1150 }, ...line('archer', 1420, 5, 55)],
  },
  {
    name: 'The Mob',
    tip: 'A wall of clubs. Thin it out before it arrives.',
    budget: 560,
    red: [...line('clubber', 1140, 10, 30)],
  },
  {
    name: 'Mixed Company',
    tip: 'Front, middle, back. Who should your archers shoot first?',
    budget: 720,
    red: [...line('squire', 1130, 3, 36), ...line('clubber', 1260, 3, 34), ...line('archer', 1480, 4, 50)],
  },
  {
    name: 'Final Siege',
    tip: 'Everything they have. Good luck.',
    budget: 1050,
    red: [...line('squire', 1120, 5, 30), ...line('clubber', 1290, 6, 28), ...line('archer', 1500, 6, 40)],
  },
];
