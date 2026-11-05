// The 30 campaign levels (3 worlds x 10). Generated and checked by a headless
// simulation: for each level, many blue armies built from the units you have
// by then were simulated; the budget was raised until several of them win, and
// the star thresholds come from the cheapest winning army found.
// stars: [win at all (= budget), 2 stars at or under, 3 stars at or under] gold spent.
// Level 1 is hand-tuned instead: a lone red Archer far back, so the coached first army
// (2-3 Clubbers) wins every time in simulation; one Clubber (the 3-star army) wins ~80%.

const L = (world, name, tip, stars, red, redHat = null) => ({
  world,
  name,
  tip,
  budget: stars[0],
  stars,
  red: red.map(([type, x]) => ({ type, x })),
  redHat,
  boss: !!redHat,
});

export const LEVELS = [
  L(0, "First Bonk", "Pick a Clubber, tap your side, press FIGHT!", [200, 140, 75], [['archer', 1460]]),
  L(0, "Two by Two", "Shields stop swords. Clubs come down over the top.", [340, 295, 245], [['squire', 1125], ['clubber', 1153], ['clubber', 1181]]),
  L(0, "Arrow Practice", "Archers are squishy up close.", [340, 275, 210], [['archer', 1460], ['archer', 1494], ['archer', 1528]]),
  L(0, "Shield Wall", "Shields stop arrows from the front. Clubs go over the top.", [530, 390, 245], [['squire', 1125], ['squire', 1153], ['squire', 1181], ['archer', 1460]]),
  L(0, "Bonk Brigade", "Clubbers hit hard but walk into arrows.", [470, 360, 245], [['clubber', 1125], ['clubber', 1153], ['clubber', 1181], ['clubber', 1209], ['clubber', 1237]]),
  L(0, "Pincushions", "Get a shield in front of your archers.", [700, 560, 415], [['squire', 1125], ['squire', 1153], ['archer', 1460], ['archer', 1494], ['archer', 1528], ['archer', 1562]]),
  L(0, "Mixed Bag", "Front, middle, back. Mix it up too.", [670, 545, 420], [['squire', 1125], ['squire', 1153], ['clubber', 1181], ['clubber', 1209], ['archer', 1460], ['archer', 1494]]),
  L(0, "The Mob", "A wall of clubs. Thin it out before it arrives.", [820, 635, 445], [['clubber', 1125], ['clubber', 1153], ['clubber', 1181], ['clubber', 1209], ['clubber', 1237], ['clubber', 1265], ['clubber', 1293], ['clubber', 1321], ['clubber', 1349]]),
  L(0, "Turtle Up", "A lot of shields. Bring something heavy.", [870, 645, 420], [['squire', 1125], ['squire', 1153], ['squire', 1181], ['squire', 1209], ['squire', 1237], ['archer', 1460], ['archer', 1494]]),
  L(0, "Hill King", "The Green Hills boss. Everything you have learned.", [1160, 965, 765], [['squire', 1125], ['squire', 1153], ['squire', 1181], ['clubber', 1209], ['clubber', 1237], ['clubber', 1265], ['clubber', 1293], ['archer', 1460], ['archer', 1494], ['archer', 1528], ['archer', 1562]], "viking"),
  L(1, "Pointy Hello", "Spikers pounce on anything squishy. Shields bounce them back.", [310, 245, 175], [['spiker', 1125], ['spiker', 1153], ['spiker', 1181], ['spiker', 1209], ['spiker', 1237]]),
  L(1, "Spike & Shield", "Shields up front, spikes behind.", [500, 410, 315], [['squire', 1125], ['squire', 1153], ['spiker', 1181], ['spiker', 1209], ['spiker', 1237], ['spiker', 1265]]),
  L(1, "Kaboom", "Bombs love a crowd. Catch them early.", [620, 460, 295], [['squire', 1125], ['squire', 1153], ['bomb', 1181], ['bomb', 1221], ['bomb', 1261], ['bomb', 1301], ['bomb', 1341]]),
  L(1, "Pincer", "Spikers up front, archers behind.", [540, 480, 415], [['spiker', 1125], ['spiker', 1153], ['spiker', 1181], ['spiker', 1209], ['archer', 1460], ['archer', 1494], ['archer', 1528]]),
  L(1, "Bomb Parade", "So many bombs. Do not stand together.", [580, 440, 295], [['bomb', 1125], ['bomb', 1165], ['bomb', 1205], ['bomb', 1245], ['bomb', 1285], ['bomb', 1325], ['bomb', 1365], ['bomb', 1405]]),
  L(1, "Rush Hour", "Fast and furious.", [790, 690, 590], [['clubber', 1125], ['clubber', 1153], ['clubber', 1181], ['clubber', 1209], ['clubber', 1237], ['clubber', 1265], ['spiker', 1293], ['spiker', 1321], ['spiker', 1349], ['spiker', 1377], ['spiker', 1405]]),
  L(1, "Sapper Squad", "Shields, bombs and bows.", [840, 745, 650], [['squire', 1125], ['squire', 1153], ['squire', 1181], ['bomb', 1209], ['bomb', 1249], ['bomb', 1289], ['bomb', 1329], ['archer', 1460], ['archer', 1494]]),
  L(1, "Needle Rain", "A sky full of arrows.", [1050, 875, 695], [['squire', 1125], ['squire', 1153], ['squire', 1181], ['squire', 1209], ['archer', 1460], ['archer', 1494], ['archer', 1528], ['archer', 1562], ['archer', 1596], ['archer', 1630]]),
  L(1, "Chaos Theory", "A bit of everything.", [850, 695, 535], [['squire', 1125], ['squire', 1153], ['clubber', 1181], ['clubber', 1209], ['clubber', 1237], ['spiker', 1265], ['spiker', 1293], ['spiker', 1321], ['bomb', 1349], ['bomb', 1389], ['bomb', 1429]]),
  L(1, "Pass Keeper", "The Pointy Pass boss.", [1580, 1395, 1205], [['squire', 1125], ['squire', 1153], ['squire', 1181], ['squire', 1209], ['clubber', 1237], ['clubber', 1265], ['clubber', 1293], ['clubber', 1321], ['spiker', 1349], ['spiker', 1377], ['spiker', 1405], ['spiker', 1433], ['bomb', 1440], ['bomb', 1440], ['bomb', 1440], ['archer', 1460], ['archer', 1494], ['archer', 1528], ['archer', 1562]], "pirate"),
  L(2, "Big Hello", "A giant Brick. Arrows and bombs bring it down.", [300, 225, 150], [['brick', 1125]]),
  L(2, "Brick & Bows", "A giant with archers behind it.", [650, 560, 470], [['brick', 1125], ['archer', 1460], ['archer', 1494], ['archer', 1528], ['archer', 1562]]),
  L(2, "Two Bricks", "Double trouble.", [570, 460, 345], [['brick', 1125], ['brick', 1171]]),
  L(2, "Wall of Bricks", "Giants and shields.", [900, 810, 715], [['brick', 1125], ['brick', 1171], ['squire', 1217], ['squire', 1245], ['squire', 1273]]),
  L(2, "Demolition", "A Brick escorted by bombs.", [660, 520, 375], [['brick', 1125], ['bomb', 1171], ['bomb', 1211], ['bomb', 1251], ['bomb', 1291], ['bomb', 1331], ['bomb', 1371]]),
  L(2, "Spiky Giants", "Giants and pointy friends.", [860, 755, 650], [['brick', 1125], ['brick', 1171], ['spiker', 1217], ['spiker', 1245], ['spiker', 1273], ['spiker', 1301], ['spiker', 1329], ['spiker', 1357]]),
  L(2, "The Long Line", "Shields, clubs and bows, as far as the eye can see.", [1590, 1220, 845], [['squire', 1125], ['squire', 1153], ['squire', 1181], ['squire', 1209], ['squire', 1237], ['squire', 1265], ['clubber', 1293], ['clubber', 1321], ['clubber', 1349], ['clubber', 1377], ['clubber', 1405], ['clubber', 1433], ['archer', 1460], ['archer', 1494], ['archer', 1528], ['archer', 1562], ['archer', 1596], ['archer', 1630]]),
  L(2, "Siege Engine", "Three giants and their archers.", [1140, 1025, 910], [['brick', 1125], ['brick', 1171], ['brick', 1217], ['archer', 1460], ['archer', 1494], ['archer', 1528], ['archer', 1562]]),
  L(2, "Everything Everywhere", "All of it at once.", [1600, 1335, 1065], [['brick', 1125], ['squire', 1171], ['squire', 1199], ['squire', 1227], ['clubber', 1255], ['clubber', 1283], ['clubber', 1311], ['clubber', 1339], ['spiker', 1367], ['spiker', 1395], ['spiker', 1423], ['bomb', 1440], ['bomb', 1440], ['bomb', 1440], ['archer', 1460], ['archer', 1494], ['archer', 1528], ['archer', 1562], ['archer', 1596]]),
  L(2, "Brick Fortress", "The final battle. Good luck.", [2200, 2110, 2020], [['brick', 1125], ['brick', 1171], ['brick', 1217], ['squire', 1263], ['squire', 1291], ['squire', 1319], ['squire', 1347], ['clubber', 1375], ['clubber', 1403], ['clubber', 1431], ['clubber', 1440], ['bomb', 1440], ['bomb', 1440], ['bomb', 1440], ['bomb', 1440], ['archer', 1460], ['archer', 1494], ['archer', 1528], ['archer', 1562], ['archer', 1596], ['archer', 1630]], "crown"),
];
