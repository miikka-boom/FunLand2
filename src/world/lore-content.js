// World flavor: everything the walls, floors and roofs of Port Halvard say.
//
// The setting (original): Port Halvard, a harbor city. "The Drowse": people
// who stopped sleeping, then stopped being people ("drowsers"; the jumpy ones
// are "leapers", the huge ones "brutes"). Everybody blames SLUMBRA, the sleep
// aid by Lullan Labs ("Sleep like the dead."). Halvard Civil Response (HCR) put up curfew
// notices and promised boats at Pier 9, every hour. The safe rooms are on the
// way to the pier, and the survivors who got there first left their mark:
//   Odile (keeps a journal; found a dog called Biscuit), Teo & Mags (argue on
//   every wall in town), Big Lou (counts his kills, generously) and the
//   Tinkerer (builds hidden dens, signs with a gear and an eye, and leaves
//   cryptic advice that happens to be exactly how the game works).

/** Ground graffiti, streets. tag: hint / joke / dark / sign. */
export const CITY_GRAFFITI = [
  // The Teo & Mags saga, Lou, Odile.
  { text: 'TEO WAS HERE', tag: 'joke' },
  { text: 'MAGS WAS HERE FIRST', tag: 'joke' },
  { text: 'WHO TOOK THE LAST CAN OF PEACHES', tag: 'joke' },
  { text: 'NOT ME — TEO', tag: 'joke' },
  { text: 'IT WAS TEO', tag: 'joke' },
  { text: 'LOU: 47   DROWSERS: 0', tag: 'joke' },
  { text: 'LOU CAN\'T COUNT — MAGS', tag: 'joke' },
  { text: 'BISCUIT COME HOME', tag: 'joke' },
  { text: 'DAY 12. STILL CUTE.', tag: 'joke' },
  { text: 'CLOSED FOR THE END OF THE WORLD', tag: 'joke' },
  { text: 'SORRY WE MISSED YOU — THE LIVING', tag: 'joke' },
  { text: 'RENT IS NOT DUE', tag: 'joke' },
  { text: 'MOM I\'M OK (PROBABLY)', tag: 'joke' },
  { text: 'I MISS COFFEE', tag: 'joke' },
  { text: 'I MISS TRAFFIC', tag: 'joke' },
  { text: 'THE PIGEONS KNOW SOMETHING', tag: 'joke' },
  { text: 'SMILE. THEY CAN\'T.', tag: 'joke' },
  { text: 'NO SOLICITORS. NO DROWSERS.', tag: 'joke' },
  { text: 'BEST CITY IN THE WORLD (TIED)', tag: 'joke' },
  { text: 'YOU ARE HERE', tag: 'joke', art: 'dot' },
  { text: 'THIS WAY TO NOWHERE', tag: 'joke', art: 'arrow' },
  // Advice that happens to be how the game works.
  { text: 'RED LIGHT CARS = DINNER BELLS', tag: 'hint' },
  { text: 'SHOVE FIRST. ASK NEVER.', tag: 'hint' },
  { text: 'LEAPERS JUMP. KNOCK \'EM OUT OF THE AIR.', tag: 'hint' },
  { text: 'BRUTES THROW ROCKS. DON\'T STAND STILL.', tag: 'hint' },
  { text: 'CHALK ARROWS LEAD TO GOOD STUFF', tag: 'hint' },
  { text: 'SHINY IN THE DARK? LOOK CLOSER.', tag: 'hint' },
  { text: 'BOARDS = SOMEBODY LOCKED SOMETHING IN', tag: 'hint' },
  { text: 'LOUD = MORE OF THEM', tag: 'hint' },
  { text: 'RELOAD BEHIND A CORNER', tag: 'hint' },
  { text: 'NEVER FIGHT IN THE OPEN', tag: 'hint' },
  // Darker.
  { text: 'THEY DON\'T SLEEP. NEITHER DO I.', tag: 'dark' },
  { text: 'SLUMBRA DID THIS', tag: 'dark' },
  { text: 'ASK LULLAN LABS', tag: 'dark' },
  { text: 'THE RADIO REPEATS', tag: 'dark' },
  { text: 'COUNT YOUR FRIENDS. AGAIN.', tag: 'dark' },
  { text: 'WE WERE 6. NOW 4. LOU SAYS 5.', tag: 'dark' },
  { text: 'THE BOATS ARE REAL', tag: 'dark', pair: 'THE BOATS ARE NOT REAL' },
];

/** Marker on floors, building. */
export const BUILDING_GRAFFITI = [
  { text: 'HR IS ONE OF THEM', tag: 'joke' },
  { text: 'REPLY ALL: RUN', tag: 'joke' },
  { text: 'OUT OF OFFICE (FOREVER)', tag: 'joke' },
  { text: 'THIS MEETING COULD HAVE BEEN AN EVACUATION', tag: 'joke' },
  { text: 'MANAGEMENT HAS LEFT THE BUILDING', tag: 'joke' },
  { text: 'PRINTER STILL JAMMED', tag: 'joke' },
  { text: 'RUN FASTER THAN GARY', tag: 'joke' },
  { text: 'GARY WAS SLOWER', tag: 'dark' },
  { text: 'THE BREAK ROOM IS OURS NOW', tag: 'joke' },
  { text: 'PLEASE WASH YOUR HANDS. AND YOUR CROWBAR.', tag: 'joke' },
  { text: 'VISITING HOURS: NEVER', tag: 'joke' },
  { text: 'DON\'T TAKE THE STAIRS', tag: 'hint' },
  { text: 'ELEVATOR = COFFIN', tag: 'hint' },
  { text: 'SHOVE IN THE DOORWAYS', tag: 'hint' },
  { text: 'FIRE ALARM = EVERYONE COMES', tag: 'hint' },
  { text: 'GLASS WALLS: THEY SEE YOU TOO', tag: 'hint' },
  { text: 'DARK ROOMS HIDE GOOD STUFF', tag: 'hint' },
  { text: 'GROUP B NEVER SLEPT', tag: 'dark' },
  { text: 'THEY STILL CLOCK IN', tag: 'dark' },
  { text: 'DAY 9 ON THIS FLOOR', tag: 'dark' },
  { text: 'TEO + MAGS WERE HERE (AGAIN)', tag: 'joke' },
  { text: 'LOU: 61 (LOU WROTE THIS)', tag: 'joke' },
];

/** Big letters on roofs, for anything flying over. */
export const ROOF_MESSAGES = ['SOS', 'HELP', '4 ALIVE', 'NOT INFECTED', 'WE HAVE DOGS', 'NO ROOM', 'HI MOM', 'SEND COFFEE', 'LOU WAS HERE'];

/** First things you read in the start safe room, and the welcome at the end. */
export const SAFE_ROOM = {
  start: [
    { text: 'DAY 1 HERE. DAY 2 LEAVING.', size: 12 },
    { text: 'GOOD LUCK, WHOEVER.', size: 12 },
    { text: 'SHOVE FIRST. ASK NEVER.', size: 11 },
    { text: 'TEO ♥ MAGS', size: 13, art: 'heart' },
    { text: '', art: 'tally' },
  ],
  end: [
    { text: 'YOU MADE IT', size: 15 },
    { text: 'WIPE YOUR FEET', size: 11 },
    { text: 'LOU WAS HERE FIRST', size: 11 },
    { text: 'PIER 9 IS NEXT. PROBABLY.', size: 11 },
    { text: '', art: 'smiley' },
  ],
};

/**
 * Posters (pasted on facades / room walls). icon picks the little picture;
 * scrawl is what somebody wrote over it since.
 */
export const POSTERS = {
  slumbra: { head: 'SLUMBRA', sub: 'Sleep like the dead.', bg: '#3a2f6b', fg: '#efe6ff', icon: 'moon', scrawl: 'NO!!', city: true, building: true },
  nonap: { head: 'NO-NAP ENERGY', sub: 'Sleep is optional.', bg: '#1b1b1b', fg: '#ffd400', icon: 'bolt', city: true, building: true },
  burger: { head: 'BIG HARBOR BURGER', sub: 'Eat like a sailor.', bg: '#b3261e', fg: '#ffd36a', icon: 'crown', city: true },
  indoors: { head: 'STAY INDOORS', sub: 'Halvard Civil Response · curfew 18:00', bg: '#e9e6dc', fg: '#a3221b', icon: 'stamp', city: true, building: true },
  bites: { head: 'REPORT ALL BITES', sub: 'HCR helpline: 555-0199', bg: '#e9e6dc', fg: '#1d4f91', icon: 'stamp', city: true, building: true },
  pier: { head: 'EVACUATION · PIER 9', sub: 'Boats every hour.', bg: '#e8782c', fg: '#1b1b1b', icon: 'boat', scrawl: '(LIE?)', city: true, building: true },
  dunmore: { head: 'RE-ELECT DUNMORE', sub: 'Halvard never sleeps.', bg: '#1f3f7a', fg: '#ffffff', icon: 'face', scrawl: 'TRUE NOW', city: true },
  biscuit: { head: 'MISSING: BISCUIT', sub: 'Good boy. Snores. Answers to "Biscuit".', bg: '#f1efe6', fg: '#222', icon: 'dog', city: true },
  nightshift: { head: 'THE NIGHT SHIFT', sub: 'Live at Harbor Days · CANCELLED', bg: '#121212', fg: '#ff5fa8', icon: 'star', city: true },
  radio: { head: 'HARBOR RADIO 98.4', sub: 'Stay calm. Stay tuned.', bg: '#1f6b6b', fg: '#e8fffb', icon: 'radio', city: true, building: true },
  pizza: { head: 'PIZZA PIER', sub: '30 minutes or free! (now: 3 weeks or free)', bg: '#2e7d32', fg: '#fff3c4', icon: 'pizza', city: true },
  shoe: { head: 'FOUND: ONE SHOE (LEFT)', sub: 'Owner please collect. Quickly.', bg: '#f1efe6', fg: '#222', icon: 'shoe', city: true },
  hang: { head: 'HANG IN THERE', sub: '', bg: '#7fb3d5', fg: '#ffffff', icon: 'cat', scrawl: 'TRYING', building: true },
  teamwork: { head: 'TEAMWORK', sub: 'Makes the dream work.', bg: '#5b6b7a', fg: '#ffffff', icon: 'runner', scrawl: 'RUN FASTER THAN GARY', building: true },
  wash: { head: 'WASH YOUR HANDS', sub: 'Infection control saves lives.', bg: '#e9f2f7', fg: '#1d5f91', icon: 'drop', scrawl: 'TOO LATE', building: true },
  trial: { head: 'PAID SLEEP STUDY', sub: 'Lullan Labs · Slumbra trial, group B', bg: '#f1efe6', fg: '#5a2d82', icon: 'flask', building: true },
  gary: { head: 'EMPLOYEE OF THE MONTH', sub: 'Gary. Again.', bg: '#c9a227', fg: '#1b1b1b', icon: 'face', building: true },
};

/** Journal pages left in dens (each map reads a few). Odile's diary, office notes, the Tinkerer. */
export const NOTES = {
  city: [
    'Day 3. The radio says stay inside. It says it every hour. I\'ve started answering back. — Odile',
    'Day 6. The neighbors stopped knocking. I still check the peephole. — Odile',
    'Day 9. Found a dog. Or he found me. Tag says BISCUIT. He snores. Lucky him. — Odile',
    'Day 12. They walk all night. Nobody is tired anymore. Except me. — Odile',
    'Day 15. Met Teo and Mags. They argue like it\'s a job. It\'s nice, actually. — Odile',
    'Day 18. Lou says he\'s killed fifty. Lou has one bullet. I believe half of what Lou says. — Odile',
    'Day 21. Somebody leaves drawings in the alleys. A gear with an eye. Arrows. Advice. Who ARE you? — Odile',
    'Day 24. Followed the gear-and-eye marks. A bed, a stove, a note: TAKE WHAT YOU NEED. LEAVE A JOKE. I left one. — Odile',
    'Day 27. Harbor Radio switched to music. Same song, all day. Biscuit howls along. — Odile',
    'Day 30. We go for Pier 9 tomorrow. If the boats are real, see you there. If not, see you there anyway. — Odile',
  ],
  building: [
    'Trial log, day 4: group B has not slept in 72 hours. They seem calm. Too calm.',
    'Memo: due to "events", the 4th floor is closed. Please do not feed the 4th floor.',
    'Sticky note: Gary, if you\'re reading this, the printer is still jammed. Also, run.',
    'Ward C night shift: visiting hours suspended. Patients have started visiting each other.',
    'Whoever keeps writing on the whiteboards: thank you, honestly. — Facilities',
    'Slumbra batch 7 recall notice: do not take. Do not sell. Do not sleep near anyone who took it.',
  ],
  tinkerer: [
    'TAKE WHAT YOU NEED. LEAVE A JOKE. — T.',
    'THEY HEAR THE GUN, NOT THE BOOT. SHOVE MORE. — T.',
    'THE BIG ONES GET BORED. THE SMALL ONES DON\'T. — T.',
    'IF YOU FOUND THIS, YOU LOOK AROUND. GOOD. KEEP LOOKING. — T.',
    'CARS WITH THE RED LIGHT ARE BELLS. DON\'T RING THE BELL. — T.',
  ],
};

/** Scribbled all around a den (floor and walls). */
export const DEN_SCRIBBLES = [
  'T. WAS HERE', 'AND HERE', 'AND HERE TOO', 'LOUD = BAD', 'CANS = DINNER', 'DON\'T WAKE THE BIG ONE',
  '3 KNOCKS = FRIEND', 'THE DARK IS FINE. THE QUIET IS NOT.', 'LEAVE A JOKE', 'PIER 9 ??', 'SHOVE', 'THEY COUNT IN THREES',
];

/** What visitors left on the Tinkerer's joke wall. */
export const DEN_JOKES = [
  'HOW DO YOU KNOW A DROWSER IS TIRED? YOU DON\'T.',
  'WHERE DO DROWSERS STAY? THE SHAMBLE INN.',
  'KNOCK KNOCK. (DON\'T ANSWER.)',
  'WHY DON\'T DROWSERS EAT CLOWNS? THEY TASTE FUNNY.',
  'I TOLD MAGS A DROWSER JOKE. NO REACTION. TOUGH CROWD. — TEO',
  'WHAT\'S A DROWSER\'S FAVORITE BAND? THE NIGHT SHIFT.',
];

/** Little scenes. text is the sign; the props are drawn by type. */
export const VIGNETTES = {
  city: [
    { id: 'busstop', text: 'BUS NOT COMING. WE CHECKED. TWICE.' },
    { id: 'honk', text: 'HONK IF ALIVE (DON\'T)' },
    { id: 'lemonade', text: 'LEMONADE 50¢ · HUGS FREE' },
    { id: 'laststand', text: 'HELD THEM HERE 2 DAYS. GOT BORED. — LOU' },
    { id: 'wedding', text: 'JUST MARRIED' },
  ],
  building: [
    { id: 'fridge', text: 'WHOEVER ATE MY YOGURT: I KNOW. — DEB' },
    { id: 'whiteboard', text: 'Q4 GOALS: 1. SYNERGY  2. SURVIVE' },
    { id: 'reception', text: 'PLEASE TAKE A NUMBER · NOW SERVING: NOBODY' },
    { id: 'whiteboard', text: 'ROLL CALL: ODILE ✓ TEO ✓ MAGS ✓ LOU (LATE)' },
  ],
};

/** Spray colours. */
export const SPRAY = ['#e5484d', '#ece9df', '#f2c94c', '#4fc3d9', '#ef6fb0', '#7fd65a', '#f2994a'];
/** Marker colours (indoors). */
export const MARKER = ['#1d1d1d', '#2a4fa0', '#b3261e', '#2e7d32'];
