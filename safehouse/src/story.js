// Story content: who the named survivors are, the scenes where you meet them,
// what they say in the Barracks after a mission, banter inside missions, and
// flavour for the simulated mission feed. Pure data, no logic.

export const BIOS = {
  nadia:
    'Twelve years on an ambulance out of Station 14. She was on shift the night the city fell, and she has not really stopped working since.',
  theo:
    'Teaches chemistry at Lincoln High. Held the science lab for nine days on canned peaches, a fire extinguisher and a great deal of spite.',
  grace:
    'Retired army range officer. Held the St. Agnes helipad alone with a rifle, waiting for an evacuation that never came.',
  lukas: 'Long-haul trucker who knows every back road in the state. Was calling on channel 19 from a weigh station with a full tank and nowhere to go.',
  mei: 'Bike courier. Mapped every rooftop between the depot and the river, and signalled the Safehouse with a mirror every evening at six.',
};

/** Scenes: short, skippable cards with a speaker per line ('you' = the player). */
export const SCENES = {
  intro: {
    kicker: 'Night one',
    title: 'The fire station',
    lines: [
      { who: 'nadia', text: 'Hey. Hey! Eyes on me. You hit your head when the ambulance rolled. I\'m Nadia.' },
      { who: 'nadia', text: 'There\'s an old fire station two blocks over. Steel doors, a generator in the back. We make it ours.' },
      { who: 'nadia', text: 'You scavenge, I patch you up. Deal? Good. Grab what you can carry.' },
    ],
  },
  rescue_theo: {
    kicker: 'Chapter 1 finale',
    title: 'Lincoln High',
    lines: [
      { who: 'theo', text: 'If you\'re infected, please knock in a way that sounds infected.' },
      { who: 'nadia', text: 'We\'re not infected. We\'re leaving. You coming?' },
      { who: 'theo', text: 'Theo Marsh, chemistry. You have a workshop? Oh, I can do things with a workshop.' },
    ],
    after: 'Theo needs a bunk: upgrade the Barracks to Lv 2 and he moves in.',
  },
  rescue_grace: {
    kicker: 'Chapter 3 finale',
    title: 'Rooftop Helipad',
    lines: [
      { who: 'grace', text: 'You\'re late. The helicopter was supposed to be here eleven days ago.' },
      { who: 'grace', text: 'Grace Adeyemi. I ran the range at Fort Hale for twenty years. You hold a rifle like a broom.' },
      { who: 'grace', text: 'You\'ll do instead of the helicopter. Lead on.' },
    ],
    after: 'Grace needs a bunk: upgrade the Barracks to Lv 3 and she moves in.',
  },
  rescue_lukas: {
    kicker: 'Rescue call',
    title: 'Channel 19',
    lines: [
      { who: 'lukas', text: 'Anybody copy? Weigh station off Route 9. Full tank, nowhere to go.' },
      { who: 'lukas', text: 'Lukas Brandt. Thanks for the lift. I can siphon a tank in under a minute.' },
      { who: 'lukas', text: 'Stick with me and that generator of yours never runs dry.' },
    ],
  },
  rescue_mei: {
    kicker: 'Rescue call',
    title: 'Mirror Flashes',
    lines: [
      { who: 'mei', text: 'Three short, three long, three short. You actually read it! Nobody reads it.' },
      { who: 'mei', text: 'Mei Tanaka. I deliver things. Delivered things. Whatever.' },
      { who: 'mei', text: 'I know a shortcut to anywhere. Where are we going?' },
    ],
  },
  stage: {
    kicker: 'New stage',
    title: '',
    lines: [],
  },
};

/** Barracks rescue: shown when a waiting survivor finally gets a bunk. */
export const MOVE_IN = {
  theo: 'Theo labels his bunk, his locker and, briefly, Grace\'s locker.',
  grace: 'Grace makes her bunk with hospital corners. Then everyone else\'s.',
  lukas: 'Lukas hangs a road map over his bunk and circles every fuel station.',
  mei: 'Mei sleeps on the top bunk with her shoes on, ready to go.',
};

/** Bond chapters (Barracks 4, bond 3): one short mission about each survivor. */
export const BOND_CHAPTERS = {
  nadia: {
    name: 'Station 14',
    intro: 'Nadia wants to go back to Station 14, where she last saw her partner, Dev.',
    outro: 'The station is empty. On the whiteboard, in Dev\'s handwriting: "Gone north. Keep the lights on, Reyes." Nadia folds the note into her jacket and doesn\'t say anything for a long time.',
  },
  theo: {
    name: 'Science Fair',
    intro: 'Theo\'s students left their final projects in the Lincoln High gym. He wants to grade them.',
    outro: 'Theo grades all twenty-three projects by flashlight. Everyone gets an A. "Extenuating circumstances," he says.',
  },
  grace: {
    name: 'Range Day',
    intro: 'Grace\'s service rifle is still in her locker at the Fort Hale range, across the river.',
    outro: 'Her name is still on the locker. Back at the Safehouse she strips and cleans the rifle, then teaches anyone who asks how to hold one properly.',
  },
  lukas: {
    name: 'Last Delivery',
    intro: 'Lukas\'s truck is still at the depot, loaded with whatever he was hauling when it all went wrong.',
    outro: 'It was insulin. Forty cases. Lukas carries every one of them into the Infirmary himself.',
  },
  mei: {
    name: 'Return to Sender',
    intro: 'Mei still has one package she never delivered. The address is across the river.',
    outro: 'The house is empty. Mei leaves the package on the porch anyway. "Delivered," she says, and means it.',
  },
};

/** Radio rescue call briefings. */
export const CALL_TEXT = {
  lukas: 'A trucker has been calling on channel 19 for three days from a weigh station off Route 9.',
  mei: 'Every evening at six, a mirror flashes from the courier depot roof: three short, three long, three short.',
};

/** Chapter blurbs for the mission list. */
export const CHAPTER_TEXT = {
  1: 'The first nights. Find what the neighbourhood left behind, and whoever is still knocking at Lincoln High.',
  2: 'A radio station went quiet in the middle of a broadcast. Somebody might still be listening.',
  3: 'St. Agnes Hospital. Someone with a rifle is holding the helipad.',
  4: 'The canals are rising and the pumps have stopped. Get the floodgates shut.',
  5: 'The night market burned, but the stalls underneath did not.',
  6: 'A freight line full of fuel tankers, stuck on the bridge.',
  7: 'Cold storage keeps food fresh. It also keeps the infected slow. Mostly.',
  8: 'Turn the power back on for one district, just for one night.',
  9: 'Somebody is ringing the bell in the old town every hour. Find out who.',
  10: 'The quarantine zone the army walled off. Whatever they left behind is still there.',
  11: 'Every bridge out of the city is down but one.',
  12: 'An airfield with a working radio tower. A way out, maybe.',
};

/**
 * What survivors say in the Barracks about the squad's latest mission.
 * Keys: first (the very first mission), win, wipe, close (won after a heal),
 * throw (a throwable was used), idle (nothing recent), waiting (no bunk yet).
 */
export const LINES = {
  nadia: {
    first: 'Two blocks and we nearly didn\'t make it. Let\'s make this place worth coming back to.',
    win: ['Everyone in one piece. That\'s a good shift.', 'Clean run. I\'ll restock the kits.', 'No stitches tonight. I could get used to that.'],
    wipe: ['We came back with something. That counts.', 'Rest first. We go back out when we\'re ready.'],
    close: ['You held still for the bandage, for once. Thank you.', 'That was close. Too close. Let\'s craft a proper kit.'],
    throw: ['That pipe bomb bought us a whole minute.', 'Whatever goes into those bombs, keep it coming.'],
    idle: ['This bunk is lumpy. Still beats the ambulance.', 'I counted the kits twice. We need more Supplies.'],
    waiting: 'I\'ll take the floor tonight.',
  },
  theo: {
    first: 'Is it always this loud out there?',
    win: ['Exothermic reactions: one. Infected: zero.', 'Textbook. I\'d give that run a B-plus.', 'Nobody lost a finger. Excellent lab safety.'],
    wipe: ['Failure is data. Very loud, very bitey data.', 'Next time I\'m bringing more tape.'],
    close: ['My heart rate is still, scientifically speaking, alarming.'],
    throw: ['Did you see the arc on that throw? Beautiful.', 'Molotovs are just chemistry with a bad attitude.'],
    idle: ['I\'ve labelled the Workshop drawers. Please respect the labels.', 'Somebody keeps putting the pliers back wrong.'],
    waiting: 'I\'ll sleep in the hallway. It\'s fine. It\'s very educational.',
  },
  grace: {
    first: 'Good spacing out there. Keep it that way.',
    win: ['Good spacing. Good shooting. Again tomorrow.', 'Nobody wandered off. I\'m impressed.', 'Clean. Like a range day.'],
    wipe: ['We fall back, we regroup. That\'s not losing.', 'Check your corners next time. I\'ll check them twice.'],
    close: ['You got sloppy in the last stretch. We\'ll drill it.'],
    throw: ['Fire on the horde, not on me. Well done.'],
    idle: ['Rifles cleaned. All of them. Twice.', 'Lights out at ten. I mean it.'],
    waiting: 'I\'ve slept in worse places than a corridor.',
  },
  lukas: {
    first: 'Smooth ride. Like a downhill with the wind behind you.',
    win: ['Smooth run. Like a downhill with the wind behind you.', 'Brought back a bit of diesel. You\'re welcome.'],
    wipe: ['Rough road. We\'ll take a different route.', 'Even the best rigs jackknife sometimes.'],
    close: ['Took that last corner on two wheels, didn\'t we?'],
    throw: ['Boom. That\'s how you clear a lane.'],
    idle: ['Generator\'s purring. I tuned it.', 'I miss my truck. Big blue rig, flames on the hood.'],
    waiting: 'I can sleep sitting up. Twenty years of truck stops.',
  },
  mei: {
    first: 'Fastest route home, as promised.',
    win: ['Found a box of Supplies behind a vending machine. Just saying.', 'Fastest route home, as promised.'],
    wipe: ['Okay, that was a dead end. Literally.', 'I\'ll scout it first next time.'],
    close: ['We made it! Barely! Again!'],
    throw: ['Can I throw the next one? Please?'],
    idle: ['I mapped every rooftop between here and the river.', 'My bike is in the Workshop. Theo says it\'s "a hazard".'],
    waiting: 'Rooftops are comfy. Mostly.',
  },
};

/** In-mission banter, more of it at higher bond levels. */
export const BANTER = {
  nadia: ['Stay close. I\'ve got you.', 'Bandage, now, before you argue.', 'Breathe. Then shoot.'],
  theo: ['Fire in the hole! That\'s the correct usage, right?', 'That smell is not a good sign.', 'Hypothesis: run.'],
  grace: ['Contact left. Drop them.', 'Reload behind me.', 'Eyes up. Something big.'],
  lukas: ['Smells like diesel. Grabbing it.', 'Left here. Trust me.', 'Hold the door, I\'ll get the truck. Kidding.'],
  mei: ['Shortcut through here, trust me.', 'Up the fire escape, go go go!', 'Found something shiny.'],
};

/** Flavour for the simulated mission feed. */
export const FEED = {
  start: ['Left the safe room', 'Doors open. Moving out', 'Out into the dark'],
  run: [
    'Cleared the stairwell',
    'Shoved a crowd off the fire escape',
    'Picked a pharmacy clean',
    'Quiet street. Too quiet',
    'A Hunter pounced. Shoved it off',
    'Doors jammed. Went round the back',
    'Car alarm! Moved on fast',
    'Found a crate of parts in a van',
    'Wanderers in the alley. Handled',
  ],
  horde: ['HERE THEY COME!', 'A horde pours out of the subway', 'They\'re coming over the fence!', 'Held the corridor against the horde'],
  finale: ['Radioed the rescue: "Hold out ten minutes"', 'The Tank is here!', 'The rescue is in sight. RUN!', 'Held the roof for the final wave'],
  fail: ['Overwhelmed…', 'Pinned and pulled down…', 'Too many of them…'],
  saved: ['Back on their feet', 'Patched up, still moving', 'Pulled out of the pile'],
};
