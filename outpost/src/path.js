// Grid pathfinding for walkers: A* over tiles (8 directions, no corner
// cutting past blocked tiles). Pure; the caller passes a blocked(i, j) test.

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Small binary heap keyed by f. */
class Heap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(n) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Shortest path from (si, sj) to (ti, tj) on a cols × rows grid. blocked(i, j)
 * says whether a tile can't be walked. The goal may be blocked (walk next to
 * it). Returns [[i, j], ...] tile centres from the start's neighbour to the
 * goal, [] if already there, or null if no path (within maxNodes). cost(i, j)
 * (optional, ≥ 1) is the price of stepping onto a tile (paths 1, grass 3).
 */
export function findPath(cols, rows, blocked, si, sj, ti, tj, maxNodes = 4000, cost = null) {
  si = Math.floor(si);
  sj = Math.floor(sj);
  ti = Math.floor(ti);
  tj = Math.floor(tj);
  if (si === ti && sj === tj) return [];
  const key = (i, j) => j * cols + i;
  const inside = (i, j) => i >= 0 && j >= 0 && i < cols && j < rows;
  const free = (i, j) => inside(i, j) && (!blocked(i, j) || (i === ti && j === tj) || (i === si && j === sj));
  const h = (i, j) => {
    const dx = Math.abs(i - ti);
    const dy = Math.abs(j - tj);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const g = new Map([[key(si, sj), 0]]);
  const from = new Map();
  const open = new Heap();
  open.push({ i: si, j: sj, f: h(si, sj) });
  let seen = 0;
  while (open.size && seen++ < maxNodes) {
    const n = open.pop();
    if (n.i === ti && n.j === tj) {
      const out = [];
      let k = key(n.i, n.j);
      while (from.has(k)) {
        out.push([k % cols, Math.floor(k / cols)]);
        k = from.get(k);
      }
      return out.reverse();
    }
    const gn = g.get(key(n.i, n.j));
    for (const [di, dj, c] of DIRS) {
      const i = n.i + di;
      const j = n.j + dj;
      if (!free(i, j)) continue;
      if (di && dj && (!free(n.i + di, n.j) || !free(n.i, n.j + dj))) continue; // no corner cutting
      const k = key(i, j);
      const ng = gn + c * (cost ? cost(i, j) : 1);
      if (ng < (g.get(k) ?? Infinity)) {
        g.set(k, ng);
        from.set(k, key(n.i, n.j));
        open.push({ i, j, f: ng + h(i, j) });
      }
    }
  }
  return null;
}
