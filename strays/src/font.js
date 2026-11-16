// Strays: the little screen's lettering, five pixels tall. No DOM in here.
// Capitals, digits and a few marks; three inline pictures (a can, a heart,
// a star) that keep their own colours inside a line of text.

const ROWS = 5;

/** '#' is a lit pixel. Most glyphs are 3 wide; M, W and N need more. */
export const GLYPHS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '.#.', '..#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  ' ': ['..', '..', '..', '..', '..'],
  '.': ['.', '.', '.', '.', '#'],
  ',': ['.', '.', '.', '#', '#'],
  '!': ['#', '#', '#', '.', '#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  ':': ['.', '#', '.', '#', '.'],
  "'": ['#', '#', '.', '.', '.'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '(': ['.#', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '#.'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'],
  '<': ['..#', '.#.', '#..', '.#.', '..#'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  x: ['...', '#.#', '.#.', '#.#', '...'],
};

/** Inline pictures: rows of sprite letters (see sprites.js INK) in their own colours. */
export const PICTURES = {
  '¢': ['GGGG', 'rwwr', 'rrrr', 'rrrr', 'GGGG'],
  '♥': ['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..'],
  '★': ['..y..', '.yyy.', 'yyyyy', '.yyy.', '.y.y.'],
  '☆': ['..G..', '.GGG.', 'GGGGG', '.GGG.', '.G.G.'],
};

export const FONT_HEIGHT = ROWS;

/** The rows of a character (unknown ones become '?'). */
export function glyph(ch) {
  return GLYPHS[ch] || PICTURES[ch] || GLYPHS['?'];
}

export const isPicture = (ch) => Object.prototype.hasOwnProperty.call(PICTURES, ch);

/** Can the screen write this text? (The tests run every message through it.) */
export function writable(text) {
  for (const ch of String(text)) if (!GLYPHS[ch] && !PICTURES[ch]) return false;
  return true;
}

/** Width of a line in LCD pixels: glyphs, plus one pixel between them. */
export function textWidth(text, scale = 1) {
  let w = 0;
  let n = 0;
  for (const ch of String(text)) {
    w += glyph(ch)[0].length;
    n++;
  }
  return (w + Math.max(0, n - 1)) * scale;
}

/**
 * Walk a line: calls put(x, y, w, h, picLetter) for every run of lit pixels
 * (picLetter is null for plain lettering, else the sprite letter to colour by).
 */
export function layout(text, x, y, scale, put) {
  let cx = x;
  for (const ch of String(text)) {
    const rows = glyph(ch);
    const pic = isPicture(ch);
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      let c = 0;
      while (c < row.length) {
        const letter = row[c];
        if (letter === '.') {
          c++;
          continue;
        }
        let end = c + 1;
        while (end < row.length && row[end] === letter) end++;
        put(cx + c * scale, y + r * scale, (end - c) * scale, scale, pic ? letter : null);
        c = end;
      }
    }
    cx += (rows[0].length + 1) * scale;
  }
  return cx - scale - x;
}
