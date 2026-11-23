// Tutorial 2's lessons: Day 2, the supply run (the map is
// world/tutorial2-gen.js; src/game/tutorial.js runs these the same way as
// Day 1's, and the coaching on screen is render/tutorial-render.js).
//
// What Day 1 left out, all of which is on by default on the Streets:
// supplies off the way (a crate, then chalk arrows to another), a room with
// its door nailed shut (break in, deal with what comes out and what the noise
// brings, take the better stash), and the Witch (go round her quietly). Still
// one gun, still no dying: a second wind at 0 HP, and a Witch who's been woken
// takes one swipe and runs off.
//
// Short on purpose: six lessons on three short streets. Everything the player
// reads is here, for editing.

const left = (list) => list.reduce((n, z) => n + (z.alive ? 1 : 0), 0);

/** A crate's spot for the arrow (null once it's open). */
function crateSpot(t, id, label, ring = false) {
  const s = t.crate(id);
  return s && !s.opened ? { x: s.x, y: s.y, label, ring, r: 32 } : null;
}

/** How far the boards are down, in shoves (three of them break the boards). */
function boardsDown(t) {
  const b = t.L.boards;
  if (b.broken) return 3;
  return Math.min(2, Math.floor(((b.maxHp - b.hp) / b.maxHp) * 3 + 1e-6));
}

export const DAY2_STEPS = [
  {
    id: 'supplies',
    dot: true,
    title: 'SUPPLIES',
    coach: 'move',
    text: { touch: 'A supply crate, right outside the door. Stand on it until it opens.' },
    target: (t) => crateSpot(t, t.L.crates.door, 'CRATE', true),
    update: (t) => t.crate(t.L.crates.door).opened,
  },
  {
    id: 'chalk',
    dot: true,
    title: 'CHALK ARROWS',
    text: { touch: 'Armor: it takes hits before your health does. Chalk arrows mark more supplies off the way. Follow them.' },
    target: (t) => crateSpot(t, t.L.crates.yard, 'CRATE'),
    update: (t) => t.crate(t.L.crates.yard).opened,
    done: (t) => t.openGate('g1'),
  },
  {
    id: 'gate1',
    title: "GATE'S OPEN",
    text: { touch: 'Hot rounds: they hit harder and go through (orange tracers). On through the gate.' },
    target: (t) => t.gateTarget('g1'),
    update: (t, g) => g.player.y < t.L.gates.g1.y - 40,
  },
  {
    id: 'boards',
    dot: true,
    title: 'BREAK IN',
    coach: 'tap',
    text: {
      touch: 'Nailed shut: something good inside. Shove the boards three times (tap the right side), or shoot them. Loud!',
      mouse: 'Nailed shut: something good inside. Shove the boards three times (Space), or shoot them. Loud!',
      pad: 'Nailed shut: something good inside. Shove the boards three times (RB), or shoot them. Loud!',
    },
    target: (t) => {
      const b = t.L.boards;
      return b.broken ? null : { x: b.x + b.w / 2, y: b.y + b.h + 30, ring: true, r: 30, label: 'BOARDS' };
    },
    count: (t) => `${boardsDown(t)}/3`,
    update: (t) => t.L.boards.broken,
  },
  {
    id: 'goodstuff',
    dot: true,
    title: 'THE GOOD STUFF',
    // The fire thumb while there's a fight on; then nothing (the ring shows the crate).
    coach: (t) => (left(t.group) > 0 ? 'fire' : null),
    text: { touch: 'What was shut in there is coming out, and the noise carried. Deal with them, then search the crate inside.' },
    enter: (t, g) => {
      // The three in the room (the boards coming down woke them), and three more down the street.
      t.group = t.sleepers.slice();
      t.need = t.group.length + 3;
      const from = t.unseen(t.L.companySpawns);
      t.spawn(from, 3, 1.2, t.group);
      g.audio.horde(from[0].x, from[0].y);
      g.announce('THE NOISE CARRIES', '#ffb347', 2, 'small');
    },
    count: (t) => `${Math.min(t.need, t.need - left(t.group) - t.pending(t.group))}/${t.need}`,
    target: (t) => (t.spawned(t.group) && t.cleared(t.group) ? crateSpot(t, t.L.crates.room, 'CRATE', true) : null),
    update: (t) => t.spawned(t.group) && t.cleared(t.group) && t.crate(t.L.crates.room).opened,
    done: (t) => t.openGate('g2'),
  },
  {
    id: 'gate2',
    title: "GATE'S OPEN",
    text: { touch: 'Through the gate. Then go quietly, and listen.' },
    target: (t) => t.gateTarget('g2'),
    update: (t, g) => g.player.y < t.L.gates.g2.y - 40,
  },
  {
    id: 'witch',
    dot: true,
    title: 'LEAVE HER BE',
    text: { touch: "Hear her? That's a Witch. Don't wake her: keep to the far side, keep your light off her, don't shoot near her." },
    enter: (t, g) => {
      t.witch = g.witches.find((w) => w.alive) || null;
    },
    target: (t) => ({ ...t.L.farSide, ring: true, label: 'THIS WAY' }),
    // She sits on the near side, at the top of the screen from the far one: the
    // camera leans her way as you come up to her (not once she's up: then it's you).
    focus: (t, g) => {
      const w = t.witch;
      if (!w || !w.alive || w.mode !== 'sit') return null;
      const d = Math.hypot(w.x - g.player.x, w.y - g.player.y);
      const k = 1 - Math.min(1, Math.max(0, (d - 380) / 260));
      return k > 0 ? { x: w.x, y: w.y, k: 0.45 * k } : null;
    },
    update: (t, g) => {
      const w = t.witch;
      if (!w || !w.alive || w.mode === 'flee') return true; // up and gone (or never there): on you go
      if (w.mode !== 'sit') return false; // she's up: get through it
      return g.player.x < w.seat.x - 260; // well past her, and she never looked up
    },
    done: (t, g) => {
      const w = t.witch;
      if (w && w.alive && w.mode === 'sit' && !w.spared) {
        w.spared = true;
        g.stats.witchSpared++;
        g.announce('LEFT HER IN PEACE', '#cdbfe6', 1.8, 'small');
      }
      t.openGate('g3');
    },
  },
  {
    id: 'saferoom',
    dot: true,
    title: 'SAFE ROOM',
    text: { touch: 'The last gate is open. Get to the safe room. Tomorrow nobody opens gates for you: the green arrow shows the way.' },
    target: (t, g) => {
      const er = g.world.map.endRoom.interior;
      return { x: er.x + er.w / 2, y: er.y + er.h / 2, label: 'SAFE' };
    },
    update: (t, g) => g.won,
  },
];
