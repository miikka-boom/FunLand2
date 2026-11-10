// The units. Everything that makes them feel different lives here: stats,
// body shape and size, weapon or ability, and the poses of their attacks.
// `shape` is how the body is drawn (bean, brick, triangle, ball, bird, jelly); the physics
// skeleton is the same wobbly ragdoll for all of them, scaled by `body`.
//
// Pose coordinates are in the unit's body frame, relative to the chest
// (where the arms attach): fx = forward (towards the enemy), uy = up.
// Weapon angles are in degrees from "pointing forward": -90 = straight up,
// +90 = straight down. Lean is radians, positive = towards the enemy.
// `crouch` lowers the hips (px) for anticipation.

export const UNIT_TYPES = {
  clubber: {
    id: 'clubber',
    name: 'Clubber',
    shape: 'bean',
    blurb: 'Big wooden club. Sends beans flying.',
    cost: 65,
    hp: 110,
    radius: 14.5,
    bodyLen: 25,
    speed: 64,
    weapon: 'club',
    engage: 50, // walks in to this distance (hip to hip)...
    reach: 60, // ...and swings at anything this close
    charge: true, // breaks into a yelling charge when close
    attack: {
      windup: 0.42,
      hold: 0.1, // trembling pause at the top of the windup
      strike: 0.13,
      recover: 0.4,
      cooldown: 0.25,
      damage: 28,
      knock: 370,
      launch: [240, 500], // px/s (away, up) given to the whole bean at a full-speed hit
      stun: 1.0, // consciousness knocked out (>= ~0.9 knocks the target down)
      shieldPierce: 0.45, // share of damage that still goes through a shield
      cleave: true, // can bonk several beans with one swing
    },
    poses: {
      // Club held up and back, clear of the googly eyes
      rest: { main: [-4, -6], off: 'shaft', ang: -112, lean: 0.04, crouch: 0, wk: 1 },
      // Raised high overhead: reads above the crowd
      windup: { main: [-2, 21], off: 'shaft', ang: -118, lean: -0.3, crouch: 7, wk: 1.6 },
      strike: { main: [17, -2], off: 'shaft', ang: 55, lean: 0.45, crouch: -3, wk: 4, hk: 2.2 },
      // Pull the club back to the body after the blow (no sweeping back up through the foe)
      recover: { main: [0, 4], off: 'shaft', ang: -60, lean: 0.12, crouch: 2, wk: 1.4 },
      cheer: { main: [3, 17], off: 'shaft', ang: -80, lean: -0.05, crouch: 0, wk: 1 },
    },
  },

  squire: {
    id: 'squire',
    name: 'Squire',
    shape: 'bean',
    blurb: 'Sword and shield. Raises it against arrows.',
    cost: 95,
    hp: 220,
    radius: 13.5,
    bodyLen: 24,
    speed: 54,
    weapon: 'sword',
    shield: true,
    engage: 40,
    reach: 48,
    attack: {
      windup: 0.22,
      strike: 0.1,
      recover: 0.3,
      cooldown: 0.2,
      damage: 33,
      knock: 150,
      stun: 0.35,
      shieldPierce: 0.45, // squire mirrors need some damage through shields to ever end
      cleave: false,
    },
    poise: 0.7, // armour: takes 70% of the stun (harder to knock down)
    heft: 0.7, // slides 70% as far when hit...
    heftUp: 0.8, // ...and flies 80% as high
    poses: {
      rest: { main: [7, -7], off: [13, 1], ang: -38, lean: 0.03, crouch: 1, wk: 1, shieldTilt: 0.12 },
      // Variant 0: stab
      windup: { main: [-6, -4], off: [13, 2], ang: -8, lean: -0.2, crouch: 3, wk: 1.4, shieldTilt: 0.05 },
      strike: { main: [22, -3], off: [12, 2], ang: 2, lean: 0.24, crouch: -1, wk: 2.6, hk: 2.2, shieldTilt: 0.15 },
      // Variant 1: overhead slash
      windup2: { main: [1, 12], off: [13, 0], ang: -118, lean: -0.18, crouch: 3, wk: 1.4, shieldTilt: 0.05 },
      strike2: { main: [16, -6], off: [12, 2], ang: 58, lean: 0.3, crouch: -1, wk: 3, hk: 2.2, shieldTilt: 0.2 },
      cheer: { main: [4, 17], off: [9, 6], ang: -85, lean: -0.05, crouch: 0, wk: 1, shieldTilt: 0 },
    },
  },

  archer: {
    id: 'archer',
    name: 'Archer',
    shape: 'bean',
    blurb: 'Lobs arrows that stick. Squishy up close.',
    cost: 75,
    hp: 64,
    radius: 12,
    bodyLen: 24,
    speed: 60,
    weapon: 'bow',
    ranged: true,
    hitsAir: true, // arrows reach fliers high in the air
    range: [230, 300], // each archer picks a preferred range in here (sees enemies 60 px further)
    attack: {
      draw: 0.85,
      recover: 0.42,
      cooldown: 0.12,
      damage: 24,
      knock: 150,
      stun: 0.16,
      maxSpeed: 980, // arrow launch speed cap
      spread: 0.075, // aim noise (radians): misses that stick in the dirt are part of the fun
    },
    poses: {
      rest: { main: [2, -12], off: [5, -4], ang: -90, lean: 0.03, crouch: 0, wk: 1 }, // bow held low, face clear
      cheer: { main: [5, 17], off: [-2, 4], ang: -90, lean: -0.05, crouch: 0, wk: 1 },
    },
  },

  // --- shapes ------------------------------------------------------------------

  spiker: {
    id: 'spiker',
    name: 'Spiker',
    shape: 'triangle',
    blurb: 'Small, fast and pointy. Pounces point-first and rams beans into the sky.',
    cost: 45,
    hp: 62,
    radius: 11,
    bodyLen: 20,
    speed: 90,
    mass: 0.6,
    weapon: 'none',
    body: { thigh: 11, shin: 11, upperArm: 6, foreArm: 6, chestFrac: 0.45 },
    face: { up: -0.55, fw: -0.05 },
    engage: 30,
    reach: 170, // starts a pounce from this far
    dash: {
      windup: 0.32, // rears back...
      speed: 470, // ...then leaps point-first
      up: 210,
      time: 0.55,
      recover: 0.5,
      cooldown: 1.0,
      damage: 20,
      launch: [230, 420],
      stun: 0.95,
    },
    poses: {
      rest: { main: [5, -3], off: [1, -3], ang: 0, lean: 0.06, crouch: 0, wk: 1 },
      windup: { main: [-6, 2], off: [-8, 0], ang: 0, lean: -0.4, crouch: 5, wk: 1 },
      dash: { main: [-8, -1], off: [-9, -3], ang: 0, lean: 1.15, crouch: 0, wk: 1 },
      cheer: { main: [3, 10], off: [-1, 10], ang: 0, lean: -0.05, crouch: 0, wk: 1 },
    },
  },

  bomb: {
    id: 'bomb',
    name: 'Bomb',
    shape: 'ball',
    blurb: 'Waddles up, lights its fuse and goes BOOM. Hurts friends too.',
    cost: 55,
    hp: 80,
    radius: 14,
    bodyLen: 6,
    speed: 88,
    spread: 115, // waits until the bomb ahead is out of blast range
    heft: 0.6, // round and heavy: harder to bat away
    mass: 0.8,
    weapon: 'none',
    body: { thigh: 12, shin: 12, upperArm: 6, foreArm: 6, standFrac: 0.92, chestFrac: 0.5 },
    face: { up: 0.05, fw: 0.02 },
    engage: 20,
    reach: 75, // lights the fuse this close to an enemy, then charges in
    blast: {
      fuse: 0.45,
      radius: 115,
      damage: 130,
      launch: 560, // px/s at the centre, less further out
      friendly: 0.2, // share of the damage teammates take
      chain: 0.4, // a bomb caught in another's blast goes off this long after (mid-flight, often)
      vsGiant: 1.6, // giants can't dodge: extra damage to heavy units
    },
    poses: {
      rest: { main: [9, 0], off: [-7, 0], ang: 0, lean: 0.05, crouch: 0, wk: 1 },
      fuse: { main: [-6, 9], off: [-9, 7], ang: 0, lean: 0.3, crouch: 0, wk: 1 }, // arms flung back, charging
      cheer: { main: [6, 10], off: [-6, 10], ang: 0, lean: -0.05, crouch: 0, wk: 1 },
    },
  },

  brick: {
    id: 'brick',
    name: 'Brick',
    shape: 'brick',
    blurb: 'A giant block with a hammer. Slow, tough, and the slam shakes the ground.',
    cost: 240,
    hp: 950,
    radius: 27,
    bodyLen: 46,
    speed: 44,
    mass: 4,
    weapon: 'hammer',
    body: { thigh: 25, shin: 25, upperArm: 18, foreArm: 18, chestFrac: 0.5 },
    face: { up: -0.1, fw: 0 },
    engage: 62,
    reach: 84,
    targets: 'structures', // arena: walks past beans and only ever attacks towers and buildings
    poise: 0.25, // clubs barely stagger it
    heft: 0.3,
    heftUp: 0.35,
    attack: {
      windup: 0.7,
      hold: 0.12,
      strike: 0.16,
      recover: 0.55,
      cooldown: 0.55,
      damage: 52,
      knock: 300,
      launch: [210, 400],
      stun: 0.9,
      shieldPierce: 0.7,
      cleave: true,
      // The hammer hitting the ground sends a shockwave along it
      quake: { radius: 125, damage: 22, launch: [190, 430], stun: 0.75 },
    },
    poses: {
      rest: { main: [-6, -8], off: 'shaft', ang: -110, lean: 0.04, crouch: 0, wk: 1 },
      windup: { main: [-4, 34], off: 'shaft', ang: -120, lean: -0.25, crouch: 10, wk: 1.6 },
      strike: { main: [28, -8], off: 'shaft', ang: 70, lean: 0.4, crouch: -4, wk: 4.5, hk: 2.4 },
      recover: { main: [6, 2], off: 'shaft', ang: -40, lean: 0.1, crouch: 3, wk: 1.4 },
      cheer: { main: [4, 32], off: 'shaft', ang: -85, lean: -0.05, crouch: 0, wk: 1 },
    },
  },

  // --- extra large ---------------------------------------------------------------
  // Same skeletons as the Clubber and the Bomb at 1.4x / 1.6x, so the poses are
  // the originals scaled up too.

  bruiser: {
    id: 'bruiser',
    name: 'Bruiser',
    shape: 'bean',
    blurb: 'An extra-large bean with an extra-large club. Slow, but it hurts.',
    cost: 170,
    hp: 250,
    radius: 20.3,
    bodyLen: 35,
    speed: 46,
    mass: 2.2,
    weapon: 'club',
    weaponScale: 1.38, // the club grows with the bean (length, head and weight)
    body: { thigh: 22.4, shin: 22.4, upperArm: 14.7, foreArm: 14.7 },
    engage: 64,
    reach: 80,
    charge: true,
    poise: 0.5,
    heft: 0.55,
    heftUp: 0.6,
    attack: {
      windup: 0.55,
      hold: 0.14,
      strike: 0.15,
      recover: 0.5,
      cooldown: 0.35,
      damage: 46,
      knock: 470,
      launch: [330, 640],
      stun: 1.0,
      shieldPierce: 0.55,
      cleave: true,
    },
    poses: {
      rest: { main: [-5.6, -8.4], off: 'shaft', ang: -112, lean: 0.04, crouch: 0, wk: 1 },
      windup: { main: [-2.8, 29.4], off: 'shaft', ang: -118, lean: -0.3, crouch: 9.8, wk: 1.6 },
      strike: { main: [23.8, -2.8], off: 'shaft', ang: 55, lean: 0.45, crouch: -4.2, wk: 4, hk: 2.2 },
      recover: { main: [0, 5.6], off: 'shaft', ang: -60, lean: 0.12, crouch: 2.8, wk: 1.4 },
      cheer: { main: [4.2, 23.8], off: 'shaft', ang: -80, lean: -0.05, crouch: 0, wk: 1 },
    },
  },

  megabomb: {
    id: 'megabomb',
    name: 'Mega Bomb',
    shape: 'ball',
    blurb: 'A huge, slow bomb with a huge, loud blast. Hurts towers too.',
    cost: 160,
    hp: 220,
    radius: 22.4,
    bodyLen: 9.6,
    speed: 68,
    spread: 175, // keeps its distance from other bombs: its blast would set them all off
    heft: 0.45,
    mass: 1.8,
    weapon: 'none',
    body: { thigh: 19.2, shin: 19.2, upperArm: 9.6, foreArm: 9.6, standFrac: 0.92, chestFrac: 0.5 },
    face: { up: 0.05, fw: 0.02 },
    engage: 30,
    reach: 96,
    blast: {
      fuse: 0.55,
      radius: 170,
      damage: 250,
      launch: 780,
      friendly: 0.15, // (a Mega Bomb kept taking its own push with it)
      chain: 0.4,
      vsGiant: 1.3,
      vsTower: 1, // a mega blast hurts stone just as much
    },
    poses: {
      rest: { main: [14.4, 0], off: [-11.2, 0], ang: 0, lean: 0.05, crouch: 0, wk: 1 },
      fuse: { main: [-9.6, 14.4], off: [-14.4, 11.2], ang: 0, lean: 0.3, crouch: 0, wk: 1 },
      cheer: { main: [9.6, 16], off: [-9.6, 16], ang: 0, lean: -0.05, crouch: 0, wk: 1 },
    },
  },

  // --- the newer ten (docs/WOBBLE-WAR-CARDS.md section 4) -------------------------
  // Special mechanics read their own fields: flying (the air layer), hop (Pogo),
  // attack.bite / attack.toss / attack.air, dash.kind 'dive', float (Brolly),
  // follow + beat (Drummer), scoop (Pelican), engulf + bump (Big Jelly).

  sprout: {
    id: 'sprout',
    name: 'Sprout',
    shape: 'bean',
    blurb: 'Tiny, fast and brave. Wears a leaf.',
    cost: 25,
    hp: 36,
    radius: 9,
    bodyLen: 15,
    speed: 96,
    mass: 0.45,
    heft: 1.5,
    heftUp: 1.35,
    weapon: 'sword',
    weaponScale: 0.5, // a toothpick (len 15)
    body: { thigh: 9.5, shin: 9.5, upperArm: 6.5, foreArm: 6.5 },
    noHat: true, // the leaves are its hat
    engage: 24,
    reach: 32,
    attack: { windup: 0.16, strike: 0.08, recover: 0.18, cooldown: 0.22, damage: 11, knock: 90, stun: 0.15, shieldPierce: 0.35, cleave: false },
    poses: {
      // the Squire's stab, x0.6
      rest: { main: [4, -4], off: [6, 0], ang: -38, lean: 0.05, crouch: 0, wk: 1 },
      windup: { main: [-4, -2], off: [6, 1], ang: -8, lean: -0.2, crouch: 2, wk: 1.4 },
      strike: { main: [13, -2], off: [6, 1], ang: 2, lean: 0.3, crouch: -1, wk: 2.6, hk: 2.2 },
      cheer: { main: [2, 10], off: [5, 4], ang: -85, lean: -0.05, crouch: 0, wk: 1 },
    },
  },

  copter: {
    id: 'copter',
    name: 'Propeller Pal',
    shape: 'bean',
    blurb: 'The propeller cap works. Dive-bonks heads.',
    cost: 40,
    hp: 50, // (one Arrow Rain still takes all three)
    radius: 10.5,
    bodyLen: 18,
    speed: 78,
    mass: 0.55,
    heft: 1.4, // light: a club bat is a home run
    heftUp: 1.3,
    weapon: 'none',
    noHat: true, // the propeller cap
    body: { thigh: 10, shin: 10, upperArm: 7, foreArm: 7 },
    flying: { alt: 100, bob: 8 },
    engage: 40, // hovers ~40 px short of its target (along x)...
    reach: 95, // ...and dives from up to 95 px
    dash: { kind: 'dive', windup: 0.35, climb: 26, speed: 380, time: 0.5, recover: 0.6, cooldown: 0.7, damage: 20, launch: [150, 120], stun: 0.35 },
    poses: {
      rest: { main: [6, -6], off: [-4, -6], ang: 0, lean: 0.1, crouch: 0, wk: 1 },
      windup: { main: [-6, 6], off: [-8, 6], ang: 0, lean: -0.3, crouch: 0, wk: 1 }, // rears up
      dash: { main: [-9, -2], off: [-9, -4], ang: 0, lean: 1.3, crouch: 0, wk: 1 }, // head-first, arms back
      cheer: { main: [3, 10], off: [-1, 10], ang: 0, lean: -0.05, crouch: 0, wk: 1 },
    },
  },

  pogo: {
    id: 'pogo',
    name: 'Pogo Bean',
    shape: 'bean',
    blurb: 'Hops over everything. Bonks towers.',
    cost: 110,
    hp: 260,
    radius: 13.5,
    bodyLen: 24,
    speed: 110, // average, for the bot and UI
    mass: 1,
    poise: 0.8,
    weapon: 'pogo',
    targets: 'structures',
    body: { thigh: 13, shin: 13, upperArm: 10.5, foreArm: 10.5 },
    hop: { vx: 130, vy: 420, rest: 0.08, wallVy: 330, stickBelow: 26, overAlt: 20, remount: 0.4, stomp: { damage: 20, stun: 0.4, bounce: 1.3 }, bonk: { damage: 20, reach: 26 } },
    engage: 14,
    reach: 26,
    poses: {
      // both hands on the handlebar, the stick straight down (its tip just touching the dirt)
      rest: { main: [5, -17], off: [3, -17], ang: 90, lean: 0.05, crouch: 0, wk: 1.2 },
      cheer: { main: [4, -17], off: [2, 14], ang: 90, lean: -0.05, crouch: 0, wk: 1.2 },
    },
  },

  netter: {
    id: 'netter',
    name: 'Butterfly Netter',
    shape: 'bean',
    blurb: 'Nets fliers out of the sky.',
    cost: 90,
    hp: 250,
    radius: 13.5,
    bodyLen: 24,
    speed: 62,
    weapon: 'net',
    hitsAir: true,
    airReach: 130, // only fliers whose hips are at most this high
    prefersAir: 280, // picks any targetable flier within 280 px first
    engage: 42,
    reach: 54,
    engageAir: 16,
    reachAir: 48,
    attack: {
      windup: 0.3,
      hold: 0.05,
      strike: 0.14,
      recover: 0.4,
      cooldown: 0.35,
      damage: 42, // (it has to hold its own on the ground: most fights have no fliers in them)
      knock: 160,
      stun: 0.3,
      shieldPierce: 0.45,
      cleave: false,
      air: { damage: 45, liftOff: 1.8, yank: 300, stun: 0.9, immune: 3 }, // a flier caught in the net
    },
    poses: {
      rest: { main: [4, -6], off: 'shaft', ang: -100, lean: 0.03, crouch: 0, wk: 1 },
      windup: { main: [-3, 18], off: 'shaft', ang: -125, lean: -0.25, crouch: 5, wk: 1.5 }, // ground swat: overhead...
      strike: { main: [16, -2], off: 'shaft', ang: 50, lean: 0.4, crouch: -2, wk: 3.5, hk: 2 }, // ...down onto the bean
      windup2: { main: [-6, -8], off: 'shaft', ang: 40, lean: -0.15, crouch: 6, wk: 1.5 }, // air scoop: low...
      strike2: { main: [10, 20], off: 'shaft', ang: -80, lean: -0.2, crouch: -4, wk: 3.5, hk: 2 }, // ...sweeping up overhead
      recover: { main: [2, 4], off: 'shaft', ang: -70, lean: 0.1, crouch: 2, wk: 1.3 },
      cheer: { main: [4, 18], off: 'shaft', ang: -85, lean: -0.05, crouch: 0, wk: 1 },
    },
  },

  juggler: {
    id: 'juggler',
    name: 'Bomb Juggler',
    shape: 'bean',
    blurb: 'Lobs bombs at crowds and fliers. Fumbles.',
    cost: 150,
    hp: 230,
    radius: 13.5,
    bodyLen: 24,
    speed: 55,
    mass: 1.0,
    weapon: 'none',
    ranged: true,
    hitsAir: true,
    range: [200, 240], // Archers (230-300) outrange it
    // (a slow lob: every bomb that lands on a bean floors it, so the rate of fire is what makes it strong)
    attack: { toss: true, draw: 0.55, recover: 0.45, cooldown: 2.0, maxSpeed: 700, spread: 0.06 }, // (fast enough to lob up at a Pelican at cruise height)
    bomb: { r: 6, bounce: 0.4, fuse: 0.6, maxAge: 2.5, radius: 65, damage: 40, launch: 380, friendly: 0.2, chain: 0.4, vsGiant: 1.3, vsTower: 0.5 },
    fumble: { onDown: 1, onDeath: 3, every: 4, delay: 0.5, spread: 35 },
    poses: {
      rest: { main: [6, 10], off: [-4, 10], ang: 0, lean: 0, crouch: 0, wk: 1 }, // hands up, juggling
      toss: { main: [-8, 14], off: [6, 8], ang: 0, lean: -0.2, crouch: 2, wk: 1 }, // throwing arm back
      cheer: { main: [6, 16], off: [-6, 16], ang: 0, lean: -0.05, crouch: 0, wk: 1 },
    },
  },

  nutcracker: {
    id: 'nutcracker',
    name: 'Nutcracker',
    shape: 'bean',
    blurb: 'One bite at a time. Big beans hate it.',
    cost: 140,
    hp: 380,
    radius: 15.5,
    bodyLen: 30,
    speed: 52,
    mass: 1.3,
    poise: 0.6,
    heft: 0.8,
    heftUp: 0.85,
    weapon: 'none',
    noHat: true, // its tall shako is part of it
    engage: 34,
    reach: 44,
    attack: {
      bite: true,
      windup: 0.45,
      hold: 0.12,
      strike: 0.12,
      recover: 0.5,
      cooldown: 0.6,
      damage: 120,
      vsHeavy: 1.6,
      heavyMass: 2,
      vsTower: 0.5,
      shieldPierce: 1,
      knock: 120,
      stun: 0.6,
      biteR: 30,
      cleave: false,
    },
    poses: {
      rest: { main: [8, -8], off: [-2, -8], ang: 0, lean: 0.02, crouch: 0, wk: 1 },
      windup: { main: [2, -4], off: [-6, -4], ang: 0, lean: -0.2, crouch: 4, wk: 1 }, // jaw drops open (render reads act)
      strike: { main: [12, -6], off: [0, -6], ang: 0, lean: 0.45, crouch: -2, wk: 1 }, // SNAP: lunges head-first
      cheer: { main: [6, 14], off: [-6, 14], ang: 0, lean: -0.05, crouch: 0, wk: 1 },
    },
  },

  brolly: {
    id: 'brolly',
    name: 'Brolly',
    shape: 'bean',
    blurb: 'Floats in under an umbrella. Pokes with it.',
    cost: 70,
    hp: 140,
    radius: 14,
    bodyLen: 25,
    speed: 60,
    weapon: 'brolly',
    float: { height: 380, vMax: 122, sway: 18, landStun: 0.6 }, // (the canopy's cap settles the fall at ~vMax + 20 px/s)
    engage: 40,
    reach: 50,
    attack: { windup: 0.24, strike: 0.1, recover: 0.32, cooldown: 0.3, damage: 26, knock: 140, stun: 0.3, shieldPierce: 0.45, cleave: false },
    poses: {
      rest: { main: [7, -7], off: [10, 0], ang: -38, lean: 0.03, crouch: 1, wk: 1 },
      float: { main: [2, 26], off: [4, 20], ang: -90, lean: 0, crouch: 0, wk: 1.2 }, // umbrella held straight up overhead
      windup: { main: [-6, -4], off: [10, 0], ang: -8, lean: -0.2, crouch: 3, wk: 1.4 },
      strike: { main: [22, -3], off: [10, 0], ang: 2, lean: 0.24, crouch: -1, wk: 2.6, hk: 2.2 },
      cheer: { main: [4, 17], off: [9, 6], ang: -85, lean: -0.05, crouch: 0, wk: 1 },
    },
  },

  drummer: {
    id: 'drummer',
    name: 'Tummy Drummer',
    shape: 'bean',
    blurb: 'Keeps the beat. Everyone nearby speeds up.',
    cost: 100,
    hp: 280,
    radius: 15,
    bodyLen: 26,
    speed: 58,
    mass: 1.0,
    weapon: 'none',
    follow: { behind: 70, home: 80 }, // walks this far behind the push's lead (alone: this far behind its own Guard Tower)
    beat: { every: 0.5, radius: 150, time: 0.6 }, // the effect (+50%) is BEAT below
    poses: {
      rest: { main: [10, 0], off: [8, 2], ang: 0, lean: 0, crouch: 0, wk: 1 },
      beatA: { main: [12, 8], off: [8, -2], ang: 0, lean: 0.05, crouch: 1, wk: 1 }, // left mallet up
      beatB: { main: [10, -2], off: [10, 8], ang: 0, lean: 0.05, crouch: 1, wk: 1 }, // right mallet up
      cheer: { main: [6, 18], off: [-6, 18], ang: 0, lean: -0.05, crouch: 0, wk: 1 },
    },
  },

  pelican: {
    id: 'pelican',
    name: 'Pelican',
    shape: 'bird',
    blurb: 'Scoops beans out of pushes. Mind the beak.',
    cost: 160,
    hp: 320,
    radius: 16,
    bodyLen: 22,
    speed: 85,
    mass: 1.6,
    heft: 0.8,
    heftUp: 0.9,
    weapon: 'none',
    noHat: true,
    body: { thigh: 8, shin: 8, upperArm: 12, foreArm: 12, chestFrac: 0.5 }, // arms are the wings
    flying: { alt: 200, bob: 6 }, // (high enough to clear a Guard Tower in every lane, bob and all)
    engage: 30,
    reach: 120,
    scoop: { sight: 320, maxMass: 1.0, swoop: 0.9, swoopAlt: 25, beak: 24, pinch: 20, carryAlt: 220, carryBack: 140, carryMax: 2.0, dropDamage: 40, dropStun: 0.4, cooldown: 3.5, letGoDamage: 60, letGoStun: 0.5 },
    dash: { kind: 'dive', windup: 0.4, climb: 20, speed: 420, time: 0.6, recover: 0.7, cooldown: 2.0, damage: 30, launch: [160, 140], stun: 0.4, vsTower: 0.5 }, // the peck
    poses: {
      rest: { main: [-6, 4], off: [-6, 4], ang: 0, lean: 1.1, crouch: 0, wk: 1 }, // nearly horizontal, wings back
      flap: { main: [-2, 16], off: [-2, 16], ang: 0, lean: 1.1, crouch: 0, wk: 1 }, // wings up (alternate at 3 Hz)
      windup: { main: [-8, 10], off: [-8, 10], ang: 0, lean: 0.6, crouch: 0, wk: 1 },
      dash: { main: [-10, -2], off: [-10, -2], ang: 0, lean: 1.5, crouch: 0, wk: 1 },
      cheer: { main: [0, 18], off: [0, 18], ang: 0, lean: 0.4, crouch: 0, wk: 1 },
    },
  },

  jelly: {
    id: 'jelly',
    name: 'Big Jelly',
    shape: 'jelly',
    blurb: 'Swallows beans, spits them out. Wobbles.',
    cost: 260,
    hp: 680,
    radius: 28,
    bodyLen: 34,
    speed: 36,
    mass: 3.2,
    poise: 0.3,
    heft: 0.35,
    heftUp: 0.4,
    weapon: 'none',
    spine: 0.15, // hip-head rod stiffness (default 0.22): a huge wobble
    body: { thigh: 14, shin: 14, upperArm: 9, foreArm: 9, standFrac: 0.9, chestFrac: 0.5 },
    engage: 24,
    reach: 30,
    engulf: { gap: 20, maxMass: 1.0, hold: 1.6, dps: 30, tick: 0.25, spit: [320, 380], spitStun: 1.0, cooldown: 1.5 },
    bump: { gap: 22, every: 1.6, damage: 30, knock: 300, stun: 0.5, vsStructure: 40 }, // (every 1.2 s knocked a Nutcracker out of every bite)
    poses: {
      rest: { main: [12, -10], off: [-12, -10], ang: 0, lean: 0, crouch: 0, wk: 1 },
      bump: { main: [16, -12], off: [-8, -12], ang: 0, lean: 0.35, crouch: -3, wk: 1 },
      cheer: { main: [12, 8], off: [-12, 8], ang: 0, lean: -0.05, crouch: 0, wk: 1 },
    },
  },
};

export const UNIT_ORDER = ['clubber', 'squire', 'archer', 'spiker', 'bomb', 'brick', 'bruiser', 'megabomb', 'sprout', 'copter', 'pogo', 'netter', 'juggler', 'nutcracker', 'brolly', 'drummer', 'pelican', 'jelly'];

/** A bean whose hips are this high above where they stand is "in the air" (only air hitters reach it). */
export const AIR_MIN = 60;

/** The Tummy Drummer's beat: attack tempo and walking speed while beatT > 0 (never stacks). */
export const BEAT = { tempo: 1.5, move: 1.5 };

/**
 * Shoves (Big Sneeze, Boing Box, Wrecking Crane, Jelly spit): one that lands
 * within `time` s of the last keeps only `knock` of its push and `stun` of its
 * stun, so nothing can keep one bean bouncing out of play.
 */
export const SHOVE = { time: 1.6, knock: 0.25, stun: 0.3 };

/** A Bomb Juggler throws again only while fewer than this many of its bombs are in the air. */
export const MAX_JBOMBS = 3;

// Body proportions shared by every unit (world px).
export const BODY = {
  thigh: 16,
  shin: 16,
  upperArm: 10.5,
  foreArm: 10.5,
  standFrac: 0.93, // hip height as a share of full leg length
  chestFrac: 0.55, // chest (shoulders) position along hip->head
};

export const WEAPONS = {
  club: { len: 44, tipMass: 1.15, tipR: 6, grip: 9, react: 0.55 },
  sword: { len: 30, tipMass: 0.3, tipR: 3, grip: 0, react: 0.4 },
  bow: { len: 0, half: 19 },
  hammer: { len: 58, tipMass: 3.2, tipR: 12, grip: 14, react: 0.5 },
  pogo: { len: 34, tipMass: 0.5, tipR: 3, grip: 8, react: 0.2 }, // the stick: its tip is the Pogo's foot
  net: { len: 50, tipMass: 0.45, tipR: 13, grip: 10, react: 0.4 }, // a big mesh hoop on a pole
  brolly: { len: 34, tipMass: 0.35, tipR: 4, grip: 0, react: 0.4 }, // a closed umbrella, poked like a sword
  none: { len: 0 },
};
