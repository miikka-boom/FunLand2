// The units. Everything that makes them feel different lives here: stats,
// body shape and size, weapon or ability, and the poses of their attacks.
// `shape` is how the body is drawn (bean, brick, triangle, ball); the physics
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
    targets: 'towers', // arena: walks past beans and only ever attacks towers
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
};

export const UNIT_ORDER = ['clubber', 'squire', 'archer', 'spiker', 'bomb', 'brick', 'bruiser', 'megabomb'];

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
  none: { len: 0 },
};
