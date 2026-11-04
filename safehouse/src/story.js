// Story content: the opening, the two rescues, a line from each survivor,
// and flavour for the simulated mission feed. Pure data.

export const INTRO = [
  { who: 'nadia', text: "Hey. Eyes on me. I'm Nadia. There's an old fire station two blocks over, and we're making it ours." },
  { who: 'nadia', text: 'You go out and scavenge, I keep you patched up. Everything you bring back makes the next trip easier.' },
];

export const RESCUES = {
  theo: {
    title: 'Lincoln High',
    lines: [
      { who: 'theo', text: 'If you\'re infected, please knock in a way that sounds infected.' },
      { who: 'theo', text: 'Theo Marsh, chemistry. You have a workshop? Oh, I can do things with a workshop.' },
    ],
  },
  grace: {
    title: 'Rooftop Helipad',
    lines: [
      { who: 'grace', text: 'You\'re late. The helicopter was supposed to be here eleven days ago.' },
      { who: 'grace', text: 'Grace Adeyemi, retired range officer. You\'ll do instead of the helicopter. Lead on.' },
    ],
  },
};

/** What each survivor says in the Barracks. */
export const LINES = {
  nadia: 'This bunk is lumpy. Still beats the ambulance.',
  theo: "I've labelled the Workshop drawers. Please respect the labels.",
  grace: 'Rifles cleaned. All of them. Twice.',
};

/** What each survivor shouts during a mission. */
export const BANTER = {
  nadia: ['Stay close. I\'ve got you.', 'Breathe. Then shoot.'],
  theo: ['Fire in the hole! That\'s the correct usage, right?', 'Hypothesis: run.'],
  grace: ['Contact left. Drop them.', 'Eyes up. Something big.'],
};

export const FEED = {
  streets: ['Out of the safe room and into the dark', 'Quiet streets. Too quiet', 'Picked a pharmacy clean'],
  horde: ['HERE THEY COME!', 'A horde pours out of the subway', 'They\'re coming over the fence!'],
  exit: ['Last stretch to the safe room', 'Doors jammed. Went round the back'],
  finale: ['The rescue is coming. Hold the roof!', 'The Tank is here!'],
  fail: ['Overwhelmed…', 'Too many of them…'],
};
