// Campaign: each round is a preset red army and a gold budget for blue.
// Red positions are world x inside WORLD.zone.red (1100..1760); front = low x.

const line = (type, x0, n, gap = 34) => Array.from({ length: n }, (_, i) => ({ type, x: x0 + i * gap }));

export const ROUNDS = [
  {
    name: 'Bonk Basics',
    tip: 'Clubbers hit hard but walk into arrows.',
    budget: 240,
    red: [...line('clubber', 1160, 3, 46)],
  },
  {
    name: 'Shield Wall',
    tip: 'Shields stop arrows from the front. Clubs go over the top.',
    budget: 320,
    red: [...line('squire', 1150, 3, 40), { type: 'archer', x: 1480 }],
  },
  {
    name: 'Pointy Rush',
    tip: 'Spikers pounce on anything squishy. Shields bounce them right back.',
    budget: 340,
    red: [...line('spiker', 1140, 6, 36), { type: 'archer', x: 1500 }],
  },
  {
    name: 'Arrow Rain',
    tip: 'Archers are squishy. Get a shield in front of them, or something pointy.',
    budget: 420,
    red: [{ type: 'squire', x: 1150 }, ...line('archer', 1420, 5, 55)],
  },
  {
    name: 'Kaboom',
    tip: 'Bombs love a crowd. Catch them early with something quick and pointy.',
    budget: 460,
    red: [...line('squire', 1130, 3, 34), ...line('bomb', 1270, 7, 55)],
  },
  {
    name: 'The Mob',
    tip: 'A wall of clubs. Thin it out before it arrives.',
    budget: 560,
    red: [...line('clubber', 1140, 10, 30)],
  },
  {
    name: 'Big Trouble',
    tip: 'A giant Brick. Arrows and bombs bring it down; melee just gets flattened.',
    budget: 700,
    red: [{ type: 'brick', x: 1150 }, ...line('squire', 1230, 2, 36), ...line('archer', 1480, 2, 50)],
  },
  {
    name: 'Mixed Company',
    tip: 'Front, middle, back. Who should your archers shoot first?',
    budget: 790,
    red: [...line('squire', 1130, 3, 36), ...line('clubber', 1260, 3, 34), ...line('archer', 1480, 4, 50)],
  },
  {
    name: 'Final Siege',
    tip: 'Everything they have. Good luck.',
    budget: 1250,
    red: [{ type: 'brick', x: 1125 }, ...line('squire', 1190, 3, 30), ...line('clubber', 1290, 4, 28), ...line('bomb', 1420, 2, 60), ...line('archer', 1560, 5, 40)],
  },
];
