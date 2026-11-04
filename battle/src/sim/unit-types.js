// The three units. Everything that makes them feel different lives here:
// stats, body shape, weapon and the poses of their attack animations.
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
      damage: 31,
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
    blurb: 'Sword and shield. Raises it against arrows.',
    cost: 95,
    hp: 180,
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
      damage: 24,
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
    blurb: 'Lobs arrows that stick. Squishy up close.',
    cost: 75,
    hp: 64,
    radius: 12,
    bodyLen: 24,
    speed: 60,
    weapon: 'bow',
    ranged: true,
    range: [430, 640], // each archer picks a preferred range in here
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
};

export const UNIT_ORDER = ['clubber', 'squire', 'archer'];

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
};
