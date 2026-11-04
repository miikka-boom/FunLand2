// Every Safehouse number lives here. Times are in seconds.
//
// The simple version: four stations, each answering one question a squad
// asks before a mission (the design doc's rule 2), three levels each (the
// doc's MVP), one resource, one build at a time. Costs and build times are
// the first three steps of the doc's base ladder.

export const MIN = 60;
export const HOUR = 3600;

export const START_SCRAP = 0;

export const STATIONS = {
  workshop: {
    name: 'Workshop',
    question: 'What do we carry?',
    does: 'Makes throwables. The squad throws one when the horde comes.',
    levels: [
      { cost: 100, time: 0, item: 'pipe_bomb' },
      { cost: 250, time: 10 * MIN, item: 'molotov' },
      { cost: 600, time: 1 * HOUR, item: 'lure_flare' },
    ],
  },
  infirmary: {
    name: 'Infirmary',
    question: 'How do we heal?',
    does: 'Makes heals. The squad uses one only when a stretch goes wrong.',
    levels: [
      { cost: 100, time: 0, item: 'pain_pills' },
      { cost: 250, time: 10 * MIN, item: 'first_aid_kit' },
      { cost: 600, time: 1 * HOUR, item: 'defibrillator' },
    ],
  },
  barracks: {
    name: 'Barracks',
    question: 'Who comes with us?',
    does: 'Bunks for the survivors you rescue. Everyone with a bunk joins the squad.',
    start: 1,
    levels: [
      { cost: 0, time: 0, bunks: 1 },
      { cost: 250, time: 10 * MIN, bunks: 2 },
      { cost: 600, time: 1 * HOUR, bunks: 3 },
    ],
  },
  radio: {
    name: 'Radio Room',
    question: 'Where do we go next?',
    does: 'Picks up new places to go. Each level opens the next chapter.',
    levels: [
      { cost: 100, time: 0, chapters: 2 },
      { cost: 250, time: 10 * MIN, chapters: 3 },
      { cost: 600, time: 1 * HOUR, chapters: 4 },
    ],
  },
};

export const STATION_ORDER = ['workshop', 'infirmary', 'barracks', 'radio'];

/** Chapters open before the Radio Room is built. */
export const BASE_CHAPTERS = 1;

/** Each station level adds this much squad strength: every upgrade is felt in the next mission. */
export const STRENGTH_PER_LEVEL = 4;

/** Squad strength of each member. Survivors sit just below you; bots fill empty slots. */
export const MEMBERS = { you: 40, survivor: 30, bot: 20 };
export const SQUAD_SIZE = 4;

// kind 'throw': used on the hardest stretch, cuts its danger by `effect`.
// kind 'heal': used only when a stretch goes wrong, saves it with chance `effect`.
export const ITEMS = {
  pipe_bomb: { name: 'Pipe bomb', kind: 'throw', cost: 20, time: 2 * MIN, effect: 0.15, text: 'Cuts the horde by 15%' },
  molotov: { name: 'Molotov', kind: 'throw', cost: 30, time: 3 * MIN, effect: 0.22, text: 'Cuts the horde by 22%' },
  lure_flare: { name: 'Lure flare', kind: 'throw', cost: 40, time: 5 * MIN, effect: 0.3, text: 'Cuts the horde by 30%' },
  pain_pills: { name: 'Pain pills', kind: 'heal', cost: 15, time: 2 * MIN, effect: 0.35, text: 'Saves a bad stretch 35% of the time' },
  first_aid_kit: { name: 'First-aid kit', kind: 'heal', cost: 25, time: 3 * MIN, effect: 0.65, text: 'Saves a bad stretch 65% of the time' },
  defibrillator: { name: 'Defibrillator', kind: 'heal', cost: 45, time: 5 * MIN, effect: 1, text: 'Always saves a bad stretch' },
};

/** Items of each kind the crate holds. */
export const CRATE_MAX = 3;

/** Named survivors: one perk each, met in the story. */
export const SURVIVORS = {
  nadia: { name: 'Nadia', role: 'Paramedic', perk: 'Heals save 20% more often', medic: 0.2 },
  theo: { name: 'Theo', role: 'Chemistry teacher', perk: 'Throwables work 50% better', chemist: 0.5 },
  grace: { name: 'Grace', role: 'Range officer', perk: '+10% squad strength', sharp: 0.1 },
};
export const SURVIVOR_ORDER = ['nadia', 'theo', 'grace'];

// --- Missions ------------------------------------------------------------------------------
// Played in order. Each is three stretches split by safe rooms; the Scrap
// found in a stretch is banked at its safe room, so a wipe keeps what was
// banked before it. A finale ends on a harder stretch.

export const CHAPTERS = [
  { n: 1, name: 'Moving In' },
  { n: 2, name: 'Ward Seven' },
  { n: 3, name: 'Low Water' },
  { n: 4, name: 'Last Light' },
];

export const MISSIONS = [
  { name: 'Fire Escape', chapter: 1, danger: 95, scrap: 180 },
  { name: 'Corner Store', chapter: 1, danger: 102, scrap: 200 },
  { name: 'Lincoln High', chapter: 1, danger: 110, scrap: 240, finale: true, rescue: 'theo' },
  { name: 'Parking Garage', chapter: 2, danger: 118, scrap: 230 },
  { name: 'Emergency Room', chapter: 2, danger: 126, scrap: 250 },
  { name: 'Rooftop Helipad', chapter: 2, danger: 135, scrap: 300, finale: true, rescue: 'grace' },
  { name: 'Canal Walk', chapter: 3, danger: 145, scrap: 280 },
  { name: 'Pump Station', chapter: 3, danger: 152, scrap: 300 },
  { name: 'Floodgates', chapter: 3, danger: 162, scrap: 350, finale: true },
  { name: 'Hangars', chapter: 4, danger: 170, scrap: 330 },
  { name: 'Airfield Road', chapter: 4, danger: 178, scrap: 350 },
  { name: 'Control Tower', chapter: 4, danger: 190, scrap: 420, finale: true },
].map((m, i) => ({ ...m, id: `m${i + 1}`, index: i }));

/** The three stretches: danger multiplier and share of the Scrap. */
export const STRETCHES = {
  normal: [
    { kind: 'streets', name: 'Streets', danger: 1, share: 0.3 },
    { kind: 'horde', name: 'Horde', danger: 1.1, share: 0.3 },
    { kind: 'exit', name: 'Way out', danger: 1, share: 0.4 },
  ],
  finale: [
    { kind: 'streets', name: 'Streets', danger: 1, share: 0.3 },
    { kind: 'horde', name: 'Horde', danger: 1.1, share: 0.3 },
    { kind: 'finale', name: 'Finale', danger: 1.2, share: 0.4 },
  ],
};

/** Chance to clear a stretch: even + (strength / danger - 1), clamped. */
export const CHANCE = { even: 0.8, min: 0.05, max: 0.97 };

/** Heals (and Nadia) never save more often than this; the defibrillator always does. */
export const SAVE_MAX = 0.95;
