// Tutorial 2's lessons: Day 2, the supply run (the map is
// world/tutorial2-gen.js; src/game/tutorial.js runs these the same way as
// Day 1's, and the coaching on screen is render/tutorial-render.js).
//
// What Day 1 left out, all of which is on by default on the Streets, in
// order of what it's worth: supplies off the way (a crate, then chalk arrows
// to another), a room with its door nailed shut (break in, deal with what
// comes out and what the noise brings, take the better stash), and the
// secret (a loose manhole, given away by its glint). Still one gun, still no
// dying (a second wind at 0 HP), and no Witch: she won't be on by default.
//
// Short on purpose: six lessons on three short streets, every one walked left
// to right, and as few words as Day 1 (one short line at the top, or none).
// Everything the player reads is here, for editing.

/**
 * For anyone standing about where there are no words, only the arrow (a gate;
 * Day 1's walk to the door): both days' lessons use it.
 */
export const LOST = { id: 'lost', when: (t) => t.watch.noProgress > 8, text: { touch: 'Follow the green arrow.' } };

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

/** Where to stand to shove the boards (just in front of them, on the street side). */
function atBoards(t) {
  const b = t.L.boards;
  return { x: b.x + b.w / 2, y: b.y + b.h + 30 };
}

/** The room's three and the three the noise brought are down. */
const fought = (t) => t.spawned(t.group) && t.cleared(t.group);

export const DAY2_STEPS = [
  {
    id: 'supplies',
    dot: true,
    title: 'SUPPLIES',
    coach: 'move',
    text: { touch: 'Stand on the crate.' },
    target: (t) => crateSpot(t, t.L.crates.door, 'CRATE', true),
    update: (t) => t.crate(t.L.crates.door).opened,
  },
  {
    id: 'chalk',
    dot: true,
    title: 'CHALK ARROWS',
    text: { touch: 'Follow the chalk arrows.' },
    nudges: [{ id: 'lost', when: (t) => t.t > 12, text: { touch: 'Look for white arrows.' } }],
    target: (t) => crateSpot(t, t.L.crates.yard, 'CRATE'),
    update: (t) => t.crate(t.L.crates.yard).opened,
    done: (t) => t.openGate('g1'),
  },
  {
    id: 'gate1',
    title: "GATE'S OPEN",
    text: null,
    nudges: [LOST],
    target: (t) => t.gateTarget('g1'),
    update: (t, g) => g.player.y < t.L.gates.g1.y - 40,
  },
  {
    // Up at the boards, SHOVE is lit (the world doesn't stop for this one:
    // nothing is coming yet) until they're down.
    id: 'boards',
    dot: true,
    title: 'BREAK IN',
    text: { touch: 'Shove the boards in.', mouse: 'Space: shove them in.', pad: 'RB: shove them in.' },
    nudges: [{ id: 'too-far', when: (t) => t.watch.missed >= 2, text: { touch: 'Get right up to them.' } }],
    target: (t) => (t.L.boards.broken ? null : { ...atBoards(t), ring: true, r: 30, label: 'BOARDS' }),
    count: (t) => `${boardsDown(t)}/3`,
    update: (t, g) => {
      const b = t.L.boards;
      const q = atBoards(t);
      const there = !b.broken && Math.hypot(g.player.x - q.x, g.player.y - q.y) < 70;
      if (there && !t.prompt) t.ask('shove', { stop: false });
      else if (!there && t.prompt) t.answer();
      return b.broken;
    },
  },
  {
    id: 'goodstuff',
    dot: true,
    title: 'THE GOOD STUFF',
    // The fire thumb while there's a fight on; then nothing (the ring shows the crate).
    coach: (t) => (left(t.group) > 0 ? 'fire' : null),
    text: (t) => (fought(t) ? { touch: 'Stand on the crate.' } : { touch: 'Clear them out.' }),
    enter: (t, g) => {
      // The three in the room (the boards coming down woke them), and three more down the street.
      t.group = t.sleepers.slice();
      t.need = t.group.length + 3;
      const from = t.unseen(t.L.companySpawns);
      t.spawn(from, 3, 1.2, t.group);
      g.audio.horde(from[0].x, from[0].y);
    },
    count: (t) => (fought(t) ? null : `${Math.min(t.need, t.need - left(t.group) - t.pending(t.group))}/${t.need}`),
    target: (t) => (fought(t) ? crateSpot(t, t.L.crates.room, 'CRATE', true) : null),
    update: (t) => fought(t) && t.crate(t.L.crates.room).opened,
    done: (t) => t.openGate('g2'),
  },
  {
    id: 'gate2',
    title: "GATE'S OPEN",
    text: null,
    nudges: [LOST],
    target: (t) => t.gateTarget('g2'),
    update: (t, g) => g.player.y < t.L.gates.g2.y - 40,
  },
  {
    id: 'secret',
    dot: true,
    title: 'THE SECRET',
    text: { touch: 'Stand on the glint.' },
    nudges: [{ id: 'lost', when: (t) => t.t > 10, text: { touch: 'Check the dead end.' } }],
    target: (t) => crateSpot(t, t.L.crates.secret, 'GLINT'),
    update: (t) => t.crate(t.L.crates.secret).opened,
    done: (t) => t.openGate('g3'),
  },
  {
    id: 'saferoom',
    dot: true,
    title: 'SAFE ROOM',
    text: { touch: 'Get to the safe room.' },
    target: (t, g) => {
      const er = g.world.map.endRoom.interior;
      return { x: er.x + er.w / 2, y: er.y + er.h / 2, label: 'SAFE' };
    },
    update: (t, g) => g.won,
  },
];
