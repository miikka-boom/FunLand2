// World flavor: everything the walls, floors and roofs say.
//
// The setting: roughly Philadelphia, 2020. On top of everything else that
// year came "the Drowse": people who stopped sleeping, then stopped being
// people ("drowsers"; the jumpy ones are "leapers", the huge ones "brutes").
// Everybody blames SLUMBRA, the sleep aid by Lullan Labs ("Sleep like the
// dead."; both made up). The city put up stay-home and curfew notices and
// promised boats across the Delaware from Pier 9, every hour. The safe rooms
// are on the way to the pier, from the Delco lawns through the cemetery and
// the salvage yards to Center City, and the survivors who got there first
// left their mark:
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
  // Philadelphia, 2020.
  { text: 'YO.', tag: 'joke' },
  { text: 'GO BIRDS', tag: 'joke', pair: '(THE PIGEONS?)' },
  { text: 'NO ONE LIKES US. WE DON\'T CARE.', tag: 'joke', pair: 'THEY REALLY DON\'T' },
  { text: 'THIS JAWN IS CLOSED', tag: 'joke' },
  { text: 'PPA STILL TICKETING', tag: 'joke' },
  { text: 'THEY GREASED THE POLES. DIDN\'T HELP.', tag: 'joke' },
  { text: 'NO SAVESIES. EVEN NOW.', tag: 'joke' },
  { text: 'SCHUYLKILL: STILL BACKED UP', tag: 'joke' },
  { text: 'TRASH DAY IS CANCELLED FOREVER', tag: 'joke' },
  { text: '2020. OF COURSE.', tag: 'joke' },
  { text: 'WORST. YEAR. EVER.', tag: 'joke', pair: 'IT\'S ONLY MAY' },
  { text: 'YOU\'RE ON MUTE', tag: 'joke' },
  { text: 'WASH YOUR HANDS. THEN RUN.', tag: 'joke' },
  { text: 'EARLY TO BED, EARLY TO RISE — B. FRANKLIN', tag: 'dark', pair: '(DON\'T.)' },
  { text: 'THE EL STILL RUNS. NOBODY DRIVES IT.', tag: 'dark' },
  { text: 'PIER 9 IS EAST. KEEP THE RIVER AHEAD.', tag: 'hint' },
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

/** Lawns, driveways and back alleys of the subdivision. */
export const SUBURBIA_GRAFFITI = [
  { text: 'DELCO NEVER SLEEPS', tag: 'dark' },
  { text: 'HOA SAYS NO DROWSERS ON THE LAWN', tag: 'joke' },
  { text: 'MOW YOUR LAWN, FRANK', tag: 'joke', pair: 'FRANK IS ONE OF THEM' },
  { text: 'TRASH DAY: NEVER. RECYCLING: STILL TUESDAY.', tag: 'joke' },
  { text: 'POOL\'S OPEN (DON\'T)', tag: 'joke' },
  { text: 'BLOCK PARTY CANCELLED', tag: 'joke' },
  { text: 'DRIVE-BY GRADUATION. KEEP DRIVING.', tag: 'joke' },
  { text: 'CLASS OF 2020: WE MADE IT (SOME)', tag: 'dark' },
  { text: 'WE CLAPPED AT 7. THEY CAME AT 8.', tag: 'dark' },
  { text: 'SOURDOUGH STARTER: STILL ALIVE', tag: 'joke' },
  { text: 'THE CALL ENDED FOR EVERYONE', tag: 'dark' },
  { text: 'NEIGHBORHOOD WATCH: WATCHING', tag: 'dark' },
  { text: 'PORCH LIGHT ON. NOBODY HOME.', tag: 'dark' },
  { text: 'TEO MOWED THIS. NOBODY ASKED.', tag: 'joke', pair: 'I ASKED — MAGS' },
  { text: 'LOU: 73 (LAWN GNOMES COUNT)', tag: 'joke' },
  { text: 'FENCES HAVE GATES. USE THEM.', tag: 'hint' },
  { text: 'CUT THROUGH THE YARDS', tag: 'hint' },
  { text: 'THE ICE CREAM TRUCK STILL PLAYS. DON\'T SHOOT IT.', tag: 'hint' },
  { text: 'ALLEYS: FASTER. DARKER.', tag: 'hint' },
];

/** Paths and lawns of Wissahickon Hill Cemetery. */
export const GRAVEYARD_GRAFFITI = [
  { text: 'REST IN PEACE (NOBODY ELSE CAN)', tag: 'joke' },
  { text: 'THEY GOT UP. ALL OF THEM.', tag: 'dark' },
  { text: 'DON\'T READ THE NAMES', tag: 'dark' },
  { text: 'VISITING HOURS: DAWN TO NEVER', tag: 'joke' },
  { text: 'FLOWERS FOR EVERYONE. EVERYONE.', tag: 'dark' },
  { text: 'WHISTLING DOESN\'T HELP — TEO', tag: 'joke', pair: 'IT HELPS A LITTLE — MAGS' },
  { text: 'LOU: 112 (HE COUNTED THE STONES)', tag: 'joke' },
  { text: 'BISCUIT WON\'T COME IN HERE', tag: 'dark' },
  { text: 'PENNIES ON THE STONE FOR LUCK', tag: 'joke' },
  { text: 'SOME ARE STILL DIGGING', tag: 'dark' },
  { text: 'THE CARETAKER KEPT COUNT', tag: 'dark' },
  { text: 'SLEEP WHEN YOU\'RE... NEVER MIND', tag: 'joke' },
  { text: 'STONES STOP YOU. NOT BULLETS.', tag: 'hint' },
  { text: 'RUN THE ROWS', tag: 'hint' },
  { text: 'NO LAMPS OFF THE AVENUES', tag: 'hint' },
  { text: 'THE CHAPEL IS HALFWAY', tag: 'hint' },
  { text: 'PIER 9 IS DOWNHILL FROM HERE', tag: 'hint' },
];

/** The lanes of Cracked Bell Auto Salvage. */
export const JUNKYARD_GRAFFITI = [
  { text: 'RUST NEVER SLEEPS. NEITHER DO THEY.', tag: 'dark' },
  { text: 'EVERYTHING HERE ALREADY DIED ONCE', tag: 'dark' },
  { text: 'CASH FOR JUNK CARS (CASH IS WORTHLESS)', tag: 'joke' },
  { text: 'U-PULL-IT. THEY-PULL-YOU.', tag: 'joke' },
  { text: 'PARTS FOR A \'98 ANYTHING', tag: 'joke' },
  { text: 'DOG\'S NAME IS BRUNO. HE\'S FINE.', tag: 'joke' },
  { text: 'CRUSHER WORKS. ASK GARY.', tag: 'dark' },
  { text: 'THE CRANE STILL HOLDS ONE', tag: 'dark' },
  { text: 'THE REFINERY BLEW LAST YEAR. THIS IS WORSE.', tag: 'dark' },
  { text: 'SOUTHWEST BEST', tag: 'joke' },
  { text: 'LOU: 90 (HE COUNTED TIRES)', tag: 'joke' },
  { text: 'TEO SAYS HE CAN HOTWIRE IT', tag: 'joke', pair: 'HE CAN\'T — MAGS' },
  { text: 'STACKS STOP BULLETS. USE THEM.', tag: 'hint' },
  { text: 'DON\'T SHOOT THE BLINKING ONES', tag: 'hint' },
  { text: 'ROWS HAVE LETTERS. READ THEM.', tag: 'hint' },
  { text: 'FLOODLIGHTS = THE CRUSHER = HALFWAY', tag: 'hint' },
  { text: 'RIVER ROAD GATE IS THE WAY OUT', tag: 'hint' },
];

/** Ground graffiti, the docks (Pier 9). The ferry is real; it's just the last one. */
export const DOCKS_GRAFFITI = [
  { text: 'LAST FERRY. BE ON IT.', tag: 'hint' },
  { text: 'FIRE THE FLARE. THEN HOLD.', tag: 'hint' },
  { text: '→ PIER 9 → FERRY → HOME', tag: 'hint' },
  { text: 'NO FLARE, NO FERRY', tag: 'hint' },
  { text: 'FLARE. HOLD. RUN.', tag: 'hint' },
  { text: 'DROWSERS CAN\'T SWIM. PROBABLY.', tag: 'joke' },
  { text: 'SEAGULLS DON\'T GET SLEEPY', tag: 'joke' },
  { text: 'IF YOU CAN READ THIS, STEP BACK', tag: 'joke' },
  { text: 'TIDE TABLE: LATE · LATER · NEVER', tag: 'joke' },
  { text: 'CUSTOMS: NOTHING TO DECLARE', tag: 'joke' },
  { text: 'GARY STILL OWES ME A BOAT', tag: 'joke' },
  { text: 'NO FISHING (NO FISH EITHER)', tag: 'joke' },
  { text: 'MAGS ♥ TEO · PIER 8 FOREVER', tag: 'joke', art: 'heart' },
  { text: 'LOU SAYS HE CAN SWIM IT. LOU.', tag: 'joke' },
  { text: 'BOX 4417: DON\'T OPEN', tag: 'dark' },
  { text: 'WATER IS SAFE WATER IS SAFE', tag: 'dark' },
  { text: 'THEY STOPPED AT THE EDGE', tag: 'dark' },
  { text: 'NO SLEEP TILL THE FERRY', tag: 'joke' },
  { text: 'NEXT STOP: JERSEY. YES, JERSEY.', tag: 'joke' },
  { text: 'NEVER THOUGHT I\'D MISS CAMDEN', tag: 'joke' },
];

/** Big letters on roofs, for anything flying over. */
export const ROOF_MESSAGES = ['SOS', 'HELP', '4 ALIVE', 'NOT INFECTED', 'WE HAVE DOGS', 'NO ROOM', 'HI MOM', 'SEND COFFEE', 'LOU WAS HERE', 'YO', 'GO BIRDS', 'SEND HOAGIES'];

/** First things you read in the start safe room, and the welcome at the end. */
export const SAFE_ROOM = {
  start: [
    { text: 'DAY 1 HERE. DAY 2 LEAVING.', size: 12 },
    { text: 'GOOD LUCK, WHOEVER.', size: 12 },
    { text: 'SHOVE FIRST. ASK NEVER.', size: 11 },
    { text: 'TEO ♥ MAGS', size: 13, art: 'heart' },
    { text: '', art: 'tally' },
  ],
  // Pier 9 (no safe room at the end: painted on the planks along the pier).
  docks: [
    { text: 'FERRY STOPS HERE', size: 16 },
    { text: 'NO RUNNING ON THE GANGWAY', size: 12 },
    { text: '(RUN.)', size: 12 },
    { text: 'ALL ABOARD WHO\'S GOING ABOARD', size: 12 },
    { text: 'BISCUIT GOT ON. SO CAN YOU. — O.', size: 12 },
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
  burger: { head: 'BROAD ST STEAKS', sub: 'Wit or witout.', bg: '#b3261e', fg: '#ffd36a', icon: 'crown', city: true },
  indoors: { head: 'STAY HOME', sub: 'City of Philadelphia · curfew 6 PM', bg: '#e9e6dc', fg: '#a3221b', icon: 'stamp', city: true, building: true },
  bites: { head: 'REPORT ALL BITES', sub: 'Call 311. Leave a message.', bg: '#e9e6dc', fg: '#1d4f91', icon: 'stamp', city: true, building: true },
  pier: { head: 'EVACUATION · PIER 9', sub: 'Delaware Ave · boats every hour.', bg: '#e8782c', fg: '#1b1b1b', icon: 'boat', scrawl: '(LIE?)', city: true, building: true },
  dunmore: { head: 'RE-ELECT DUNMORE', sub: 'Philadelphia never sleeps.', bg: '#1f3f7a', fg: '#ffffff', icon: 'face', scrawl: 'TRUE NOW', city: true },
  biscuit: { head: 'MISSING: BISCUIT', sub: 'Good boy. Snores. Answers to "Biscuit".', bg: '#f1efe6', fg: '#222', icon: 'dog', city: true },
  nightshift: { head: 'THE NIGHT SHIFT', sub: 'Live at Penn\'s Landing · CANCELLED', bg: '#121212', fg: '#ff5fa8', icon: 'star', city: true },
  radio: { head: 'NEWSRADIO 98.4', sub: 'Traffic and drowsers on the 2s.', bg: '#1f6b6b', fg: '#e8fffb', icon: 'radio', city: true, building: true },
  // That year's notices.
  mask: { head: 'MASK UP, PHILLY', sub: 'It will not help with this one.', bg: '#e9f2f7', fg: '#1d5f91', icon: 'face', scrawl: 'WORTH A TRY', city: true, building: true },
  sixfeet: { head: 'STAY 6 FT APART', sub: 'Farther, if they are drowsing.', bg: '#f2c94c', fg: '#1b1b1b', icon: 'runner', city: true, building: true },
  broadrun: { head: 'BROAD ST RUN', sub: 'POSTPONED. (Run anyway.)', bg: '#2e7d32', fg: '#ffffff', icon: 'runner', city: true },
  lifeline: { head: 'LIFELINE SERVICE', sub: 'Essential trips only. Hold on.', bg: '#1f3f7a', fg: '#ffd400', icon: 'stamp', city: true },
  wooder: { head: 'WOODER ICE', sub: 'Closed for the season. All of them.', bg: '#7fb3d5', fg: '#ffffff', icon: 'drop', city: true },
  pizza: { head: 'PIZZA PIER', sub: '30 minutes or free! (now: 3 weeks or free)', bg: '#2e7d32', fg: '#fff3c4', icon: 'pizza', city: true },
  shoe: { head: 'FOUND: ONE SHOE (LEFT)', sub: 'Owner please collect. Quickly.', bg: '#f1efe6', fg: '#222', icon: 'shoe', city: true },
  hang: { head: 'HANG IN THERE', sub: '', bg: '#7fb3d5', fg: '#ffffff', icon: 'cat', scrawl: 'TRYING', building: true },
  teamwork: { head: 'TEAMWORK', sub: 'Makes the dream work.', bg: '#5b6b7a', fg: '#ffffff', icon: 'runner', scrawl: 'RUN FASTER THAN GARY', building: true },
  wash: { head: 'WASH YOUR HANDS', sub: 'Infection control saves lives.', bg: '#e9f2f7', fg: '#1d5f91', icon: 'drop', scrawl: 'TOO LATE', building: true },
  trial: { head: 'PAID SLEEP STUDY', sub: 'Lullan Labs · Slumbra trial, group B', bg: '#f1efe6', fg: '#5a2d82', icon: 'flask', building: true },
  gary: { head: 'EMPLOYEE OF THE MONTH', sub: 'Gary. Again.', bg: '#c9a227', fg: '#1b1b1b', icon: 'face', building: true },
};

/** Lines from the journal pages left in dens, written out on the floor beside them: Odile's diary, office notes, the harbour log, the Tinkerer. */
export const NOTES = {
  // Short enough to write out on the floor of a den, legible from above.
  city: [
    'DAY 3. RADIO SAYS STAY IN. — O.',
    'DAY 6. NOBODY KNOCKS NOW. — O.',
    'DAY 9. FOUND A DOG. HE SNORES. — O.',
    'DAY 12. NOBODY IS TIRED BUT ME. — O.',
    'DAY 15. TEO & MAGS ARGUE. NICE. — O.',
    'DAY 18. LOU HAS ONE BULLET. — O.',
    'DAY 21. WHO DRAWS THE GEARS? — O.',
    'DAY 27. BISCUIT HOWLS AT THE RADIO — O.',
    'DAY 30. PIER 9 TOMORROW. — O.',
  ],
  building: [
    'GROUP B: 72H NO SLEEP. TOO CALM.',
    'DO NOT FEED THE 4TH FLOOR',
    'GARY: PRINTER JAMMED. ALSO, RUN.',
    'VISITING HOURS SUSPENDED',
    'SLUMBRA BATCH 7: DO NOT TAKE',
  ],
  docks: [
    'NIGHT 5: ONLY THE LIBERTY BELLE COMES',
    'FLARE GUN: END OF PIER 9',
    'FIRE IT, THEN HOLD. SHE NEEDS A MINUTE.',
    'KEEP THE STACKER ACROSS LANE C',
  ],
  suburbia: [
    'DAY 2. THE KOWALSKIS STOPPED WAVING.',
    'DAY 5. HOA EMAIL. SUBJECT: LAWNS.',
    'DAY 8. ICE CREAM TRUCK. 3 AM.',
    'DAY 11. NOBODY TOOK THE TRASH OUT.',
    'DAY 14. TOOK THE DOG. LEFT THE MINIVAN.',
  ],
  graveyard: [
    'PLOT 14 IS EMPTY AGAIN. — CARETAKER',
    'LOCKED THE GATE. THEY\'RE INSIDE.',
    'DAY 4. STOPPED FILLING THEM BACK IN.',
    'THE CHAPEL BELL BRINGS THEM. DON\'T.',
    'DAY 8. COUNTED 212 UP. 0 DOWN.',
  ],
  junkyard: [
    'YARD LOG: DOG WON\'T GO PAST ROW F.',
    'CRUSHER JAMMED. NOT GOING TO LOOK.',
    'COUNTED THE CARS TWICE. ONE MORE EACH TIME.',
    'SOLD THE LAST BATTERY FOR A HOAGIE.',
  ],
  tinkerer: [
    'TAKE WHAT YOU NEED. LEAVE A JOKE. — T.',
    'THEY HEAR GUNS, NOT BOOTS. — T.',
    'BIG ONES GET BORED. — T.',
    'YOU LOOK AROUND. GOOD. — T.',
    'RED LIGHT CARS ARE BELLS. — T.',
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
  docks: [
    { id: 'busstop', text: 'FERRY QUEUE STARTS HERE. BE POLITE.' },
    { id: 'laststand', text: 'HELD THE PIER 2 NIGHTS. FERRY CAME. — LOU (I\'M ON THE NEXT ONE)' },
    { id: 'lemonade', text: 'FRESH FISH · CASH ONLY · NO REFUNDS' },
  ],
  suburbia: [
    { id: 'lemonade', text: 'LEMONADE 50¢ · HUGS FREE' },
    { id: 'busstop', text: 'SCHOOL BUS STOP. SCHOOL\'S OUT. FOREVER.' },
    { id: 'laststand', text: 'HELD THE CORNER LOT. HOA FINED ME. — LOU' },
    { id: 'honk', text: 'HONK IF ALIVE (DON\'T)' },
    { id: 'wedding', text: 'JUST MARRIED' },
  ],
  graveyard: [
    { id: 'busstop', text: 'TOUR MEETS HERE. TOUR CANCELLED.' },
    { id: 'laststand', text: 'HELD THE CHAPEL STEPS. LOVELY SERVICE. — LOU' },
    { id: 'lemonade', text: 'FLOWERS $5 · TODAY: FREE' },
  ],
  junkyard: [
    { id: 'lemonade', text: 'HUBCAPS $1 · TIRES FREE' },
    { id: 'laststand', text: 'HELD ROW C TILL THE STACK FELL. — LOU' },
    { id: 'busstop', text: 'SHUTTLE TO THE OFFICE: WALK.' },
    { id: 'honk', text: 'HONK IF ALIVE (DON\'T)' },
  ],
  building: [
    { id: 'fridge', text: 'MY YOGURT. I KNOW. — DEB' },
    { id: 'whiteboard', text: 'Q4: SYNERGY. SURVIVE.' },
    { id: 'reception', text: 'NOW SERVING: NOBODY' },
    { id: 'rollcall', text: 'ODILE ✓ TEO ✓ MAGS ✓ LOU ?' },
  ],
};

/** Spray colours. */
export const SPRAY = ['#e5484d', '#ece9df', '#f2c94c', '#4fc3d9', '#ef6fb0', '#7fd65a', '#f2994a'];
/** Marker colours (indoors). */
export const MARKER = ['#1d1d1d', '#2a4fa0', '#b3261e', '#2e7d32'];

/** A whiteboard is as long as its words need (10 px marker); placement and drawing share this. */
export const whiteboardLen = (text) => (text ? text.length * 10 * 0.6 + 14 : 70);
