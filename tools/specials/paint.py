"""The paint: what colour each texel of a special's texture is, from the point of the model it shows.

The zombies' texture is hand-inked: flat colours, dark ink lines with rough edges, a few scribbled
hatch marks, skin showing through torn cloth with a dark outline round the tear. This paints the
same kind of thing, but in 3D: every texel knows its part, material, position and normal (in the
part's own frame, as modeled), and the functions here colour it from that, so a crack can run over
a shoulder and down an arm without caring how the charts were cut.

Tools: value noise (rough edges, tone patches), strokes along 3D polylines (cracks, seams), strokes
along 2D curves seen from one side (muscle lines, pockets), and torn patches (an irregular blob, its
edge inked, skin inside).
"""

import math

import numpy as np

INK = np.array((34, 24, 30), dtype=float)

# --- Noise -------------------------------------------------------------------------------------


def _hash(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    h = (h ^ (h >> 13)) * 1274126177
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF).astype(np.float64) / float(0xFFFFFF)


def noise(P, scale, seed=0):
    """Smooth value noise in [0, 1] at points P (n x 3), features about `scale` model units across."""
    Q = P / scale
    i = np.floor(Q).astype(np.int64)
    f = Q - i
    u = f * f * (3 - 2 * f)
    out = np.zeros(len(P))
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (u[:, 0] if dx else 1 - u[:, 0]) * (u[:, 1] if dy else 1 - u[:, 1]) * (u[:, 2] if dz else 1 - u[:, 2])
                out += w * _hash(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return out


def fbm(P, scale, seed=0, octaves=3):
    tot = 0.0
    amp = 1.0
    out = np.zeros(len(P))
    for o in range(octaves):
        out += amp * noise(P, scale / (2 ** o), seed + o * 17)
        tot += amp
        amp *= 0.5
    return out / tot


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def mix(col, other, m):
    """col (n x 3) toward other (3,) or (n x 3) by m (n,)."""
    other = np.broadcast_to(np.asarray(other, dtype=float), col.shape)
    return col + (other - col) * np.asarray(m, dtype=float)[:, None]


# --- Strokes -------------------------------------------------------------------------------------


def seg_dist(P, N, A, B, flat=0.3):
    """
    Distance from points P to the segment A-B, measured mostly along the surface: the part of the
    offset along the texel's normal N counts for only `flat` of itself (a stroke drawn on a surface
    survives the low-poly mesh being a little off the smooth surface it was traced on). Also returns
    how far along the segment (0..1) the nearest point is.
    """
    AB = B - A
    L2 = max(float(AB @ AB), 1e-9)
    t = np.clip(((P - A) @ AB) / L2, 0, 1)
    D = P - (A + t[:, None] * AB)
    dn = np.einsum("ij,ij->i", D, N)
    dt = D - dn[:, None] * N
    return np.sqrt(np.einsum("ij,ij->i", dt, dt) + (flat * dn) ** 2), t


def stroke(P, N, pts, w0, w1=None, rough=0.0, seed=0, flat=0.3):
    """
    How much ink (0..1) a polyline (k x 3) lays at points P: width tapering from w0 at its start to w1
    at its end, edges roughened by noise (rough: as a fraction of the width).
    """
    pts = np.asarray(pts, dtype=float)
    w1 = w0 if w1 is None else w1
    # Only points near the polyline's box are worth measuring.
    pad = max(w0, w1) * 2 + 8
    lo = pts.min(axis=0) - pad
    hi = pts.max(axis=0) + pad
    near = np.all((P >= lo) & (P <= hi), axis=1)
    out = np.zeros(len(P))
    if not near.any():
        return out
    Pn = P[near]
    Nn = N[near]
    seglen = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    total = max(seglen.sum(), 1e-9)
    acc = np.concatenate([[0], np.cumsum(seglen)]) / total
    best = np.full(len(Pn), np.inf)
    where = np.zeros(len(Pn))
    for k in range(len(pts) - 1):
        d, t = seg_dist(Pn, Nn, pts[k], pts[k + 1], flat)
        m = d < best
        best[m] = d[m]
        where[m] = acc[k] + (acc[k + 1] - acc[k]) * t[m]
    w = w0 + (w1 - w0) * where
    if rough:
        w = w * (1 + rough * (fbm(Pn, max(w0, 2) * 2.2, seed) - 0.5) * 2)
    out[near] = 1 - smooth(w * 0.78, w * 1.0 + 0.6, best)
    return out


def curve2(U, V, front, pts, w, rough=0.0, Pn=None, seed=0):
    """
    Ink (0..1) of a 2D polyline in a view's plane: U, V the texels' coordinates in that view, front
    a 0..1 weight for facing the view (texels facing away get none).
    """
    pts = np.asarray(pts, dtype=float)
    best = np.full(len(U), np.inf)
    for k in range(len(pts) - 1):
        ax, ay = pts[k]
        bx, by = pts[k + 1]
        dx, dy = bx - ax, by - ay
        L2 = max(dx * dx + dy * dy, 1e-9)
        t = np.clip(((U - ax) * dx + (V - ay) * dy) / L2, 0, 1)
        d = np.hypot(U - (ax + t * dx), V - (ay + t * dy))
        best = np.minimum(best, d)
    ww = np.full(len(U), float(w))
    if rough and Pn is not None:
        ww = ww * (1 + rough * (fbm(Pn, w * 2.4, seed) - 0.5) * 2)
    return (1 - smooth(ww * 0.78, ww + 0.6, best)) * front


def tear(P, N, centre, radii, seed, rough=0.5):
    """
    A torn patch: (inside 0..1, its inked edge 0..1). An ellipsoid region (centre, radii in model
    units) with a ragged edge; the edge line is drawn just inside it.
    """
    c = np.asarray(centre, dtype=float)
    r = np.asarray(radii, dtype=float)
    q = np.linalg.norm((P - c) / r, axis=1)
    jag = (fbm(P, float(r.min()) * 0.55, seed) - 0.5) * 2 * rough + (noise(P, float(r.min()) * 0.12, seed + 5) - 0.5) * 0.5
    q = q + jag
    inside = 1 - smooth(0.96, 1.0, q)
    edge = inside * smooth(0.74, 0.86, q)
    return inside, edge


def hatch(P, N, centre, along, across, n, length, gap, w, seed=0):
    """A few short parallel scribbled strokes ('//'), as on the zombies' trousers."""
    c = np.asarray(centre, dtype=float)
    along = np.asarray(along, dtype=float)
    along = along / np.linalg.norm(along)
    across = np.asarray(across, dtype=float)
    across = across / np.linalg.norm(across)
    out = np.zeros(len(P))
    rng = np.random.default_rng(seed)
    for i in range(n):
        o = c + across * (i - (n - 1) / 2) * gap
        jitter = rng.uniform(-0.15, 0.15) * length
        a = o - along * length / 2 + along * jitter
        b = o + along * length / 2 + across * rng.uniform(-0.2, 0.2) * gap
        out = np.maximum(out, stroke(P, N, [a, b], w, w * 0.55, flat=0.3))
    return out


# --- Cracks: walks over the surface ---------------------------------------------------------------


def closest_on_mesh(p, tri_pts):
    """The nearest point to p on a triangle soup (t x 3 x 3), and that triangle's normal."""
    a, b, c = tri_pts[:, 0], tri_pts[:, 1], tri_pts[:, 2]
    n = np.cross(b - a, c - a)
    n = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
    d = np.einsum("ij,ij->i", p - a, n)
    q = p - d[:, None] * n
    v0, v1, v2 = b - a, c - a, q - a
    d00 = np.einsum("ij,ij->i", v0, v0)
    d01 = np.einsum("ij,ij->i", v0, v1)
    d11 = np.einsum("ij,ij->i", v1, v1)
    d20 = np.einsum("ij,ij->i", v2, v0)
    d21 = np.einsum("ij,ij->i", v2, v1)
    den = np.maximum(d00 * d11 - d01 * d01, 1e-9)
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    u = 1 - v - w
    bary = np.clip(np.stack([u, v, w], axis=1), 0, None)
    bary /= np.maximum(bary.sum(axis=1, keepdims=True), 1e-9)
    q = bary[:, :1] * a + bary[:, 1:2] * b + bary[:, 2:] * c
    dist = np.linalg.norm(q - p, axis=1)
    k = int(np.argmin(dist))
    return q[k], n[k]


def crack_walks(piece, starts, rng, steps=(9, 16), step=11.0, branch=0.28, turn=0.22, zig=0.42, width=7.4):
    """
    Cracks as polylines walking over a piece's surface from each start (point, heading): every step
    turns a little at random and zigzags (a jagged line, like a fissure), and now and then forks off a
    thinner branch. Returns [(points, width at the start, width at the end)].
    """
    tri, _ = piece.tris()
    T = piece.V[tri]
    out = []
    todo = [(np.asarray(s, dtype=float), np.asarray(d, dtype=float), 1.0, rng.integers(*steps)) for s, d in starts]
    while todo:
        p, d, scale, n = todo.pop()
        p, nrm = closest_on_mesh(p, T)
        pts = [p]
        for i in range(int(n)):
            # Keep the heading in the surface's plane, turned a little.
            d = d - nrm * float(d @ nrm)
            d /= max(np.linalg.norm(d), 1e-9)
            side = np.cross(nrm, d)
            ang = rng.normal(0, turn) + zig * (1 if i % 2 else -1) * rng.uniform(0.4, 1.0)
            d = d * math.cos(ang) + side * math.sin(ang)
            q, nrm = closest_on_mesh(p + d * step * scale * rng.uniform(0.8, 1.25), T)
            if np.linalg.norm(q - p) < step * 0.2:
                break
            d = (q - p) / np.linalg.norm(q - p)
            p = q
            pts.append(p)
            if scale > 0.45 and i > 1 and rng.random() < branch:
                bd = d * 0.6 + side * (1 if rng.random() < 0.5 else -1) * 0.8
                todo.append((p, bd, scale * 0.6, max(3, int(n - i) // 2 + 1)))
        if len(pts) >= 3:
            out.append((np.array(pts), width * scale, 1.8 * scale))
    return out


# --- The Tank ------------------------------------------------------------------------------------

TANK_SKIN = np.array((196, 184, 162), dtype=float)
TANK_SHADE = np.array((168, 154, 132), dtype=float)  # a darker tone of it, for patches and anatomy
TANK_CRACK = np.array((156, 50, 40), dtype=float)
TANK_CRACK_DARK = np.array((104, 26, 22), dtype=float)
TANK_SHORTS = np.array((84, 70, 92), dtype=float)
TANK_SHORTS_DARK = np.array((52, 42, 58), dtype=float)


def skin_base(P, base, shade, seed, patch=0.22):
    """Flat skin, with now and then a big, faint, darker patch (the hand-painted tone)."""
    col = np.tile(base, (len(P), 1))
    n = fbm(P, 150, seed, octaves=2)
    return mix(col, shade, smooth(0.62, 0.66, n) * patch)


def crack_paint(col, P, N, cracks):
    """Lay the cracks on: a red line with a darker core."""
    if not cracks:
        return col
    ink = np.zeros(len(P))
    core = np.zeros(len(P))
    for pts, w0, w1 in cracks:
        ink = np.maximum(ink, stroke(P, N, pts, w0, w1, rough=0.25, seed=len(pts)))
        core = np.maximum(core, stroke(P, N, pts, w0 * 0.42, w1 * 0.3))
    col = mix(col, TANK_CRACK, ink)
    return mix(col, TANK_CRACK_DARK, core * 0.9)


class TankPaint:
    """The Tank's paint: stone-pale skin with red cracks, muscle lines, torn dark shorts."""

    def __init__(self, fig):
        rng = np.random.default_rng(7)
        parts = fig.parts
        self.cracks = {}
        torso = parts["torso"].pieces[0]
        self.cracks["torso"] = crack_walks(torso, [
            ((40, 220, 520), (0.6, 0.2, -1)),  # down the front of the right shoulder
            ((20, -236, 506), (-0.5, -0.3, -1)),  # over the left shoulder, toward the back
            ((-120, -130, 486), (0, 1, -0.5)),  # an X across the upper back
            ((-120, 130, 486), (0, -1, -0.5)),
            ((-60, 30, 548), (-1, 0.2, -0.3)),  # the hump
            ((120, -120, 372), (0.2, 0.3, -1)),  # the left pec
            ((96, 128, 276), (0, 0.4, -1)),  # the side of the belly
        ], rng, steps=(12, 20))
        self.cracks["arm_r"] = crack_walks(parts["arm_r"].pieces[0], [
            ((50, 10, 104), (1, 0.5, -0.4)),  # an X over the biceps
            ((150, 10, 104), (-1, 0.5, -0.4)),
            ((190, 30, 84), (1, 0.1, -0.2)),  # down the forearm
            ((226, 96, 10), (1, 0, -0.3)),  # its outside
            ((100, 86, -40), (1, 0.1, 0.5)),
        ], rng, steps=(12, 20))
        # The left arm gets cracks of its own (its mesh is the right's mirror image).
        self.cracks["arm_l"] = crack_walks(parts["arm_l"].pieces[0], [
            ((40, -30, 100), (1, -0.4, -0.3)),
            ((196, -10, 90), (1, -0.4, -0.3)),  # an X on the forearm
            ((296, -10, 90), (-1, -0.4, -0.3)),
            ((150, -96, 0), (1, 0, 0.3)),
            ((276, -60, -80), (1, 0.2, 0.4)),
        ], rng, steps=(12, 20))
        self.cracks["head"] = crack_walks(parts["head"].pieces[0], [((60, 60, 190), (0.3, 0.4, -1))], rng, steps=(5, 8))
        self.cracks["leg_r"] = crack_walks(parts["leg_r"].pieces[0], [((40, 40, 170), (0.2, 0.3, -1))], rng, steps=(6, 9))
        self.cracks["leg_l"] = crack_walks(parts["leg_l"].pieces[0], [((40, -50, 160), (0.1, -0.4, -1))], rng, steps=(6, 9))

    def __call__(self, mat, P, N, part):
        if mat == "tank_shorts":
            return self.shorts(P, N)
        seed = {"torso": 1, "head": 2, "arm_l": 3, "arm_r": 4, "leg_l": 5, "leg_r": 6}[part]
        col = skin_base(P, TANK_SKIN, TANK_SHADE, seed)
        if part == "torso":
            col = self.anatomy(col, P, N)
        elif part in ("arm_l", "arm_r"):
            col = self.fist(col, P, N, -1 if part == "arm_l" else 1)
        elif part in ("leg_l", "leg_r"):
            col = self.toes(col, P, N, -1 if part == "leg_l" else 1)
        return crack_paint(col, P, N, self.cracks.get(part))

    def anatomy(self, col, P, N):
        """Muscle lines, in the skin's darker tone: under the pecs, the abs, the line of the back."""
        front = smooth(0.15, 0.45, N[:, 0])
        c = P[:, 1]
        h = P[:, 2]
        ink = np.zeros(len(P))
        for s in (1, -1):
            # The lower edge of each pec, curving up and out to the armpit.
            pec = [(s * 6, 330), (s * 40, 320), (s * 80, 318), (s * 118, 330), (s * 146, 352)]
            ink = np.maximum(ink, curve2(c, h, front, pec, 3.6, 0.4, P, 11))
            # The abs: two columns of three blocks.
            for k, hh in enumerate((292, 262, 234)):
                ink = np.maximum(ink, curve2(c, h, front, [(s * 8, hh), (s * 34, hh - 3 + k), (s * 56, hh + 4)], 2.8, 0.4, P, 12 + k))
            ink = np.maximum(ink, curve2(c, h, front, [(s * 66, 306), (s * 70, 268), (s * 62, 226)], 2.8, 0.4, P, 15))
        ink = np.maximum(ink, curve2(c, h, front, [(0, 318), (0, 286), (0, 252), (0, 222)], 2.8, 0.4, P, 16))
        ink = np.maximum(ink, curve2(c, h, front, [(-5, 212), (0, 206), (5, 212)], 2.6))  # the navel
        # Down the middle of the back, and the shoulder blades.
        back = smooth(0.15, 0.45, -N[:, 0])
        ink = np.maximum(ink, curve2(c, h, back, [(0, 468), (0, 420), (0, 370), (0, 320)], 3.2, 0.4, P, 17))
        for s in (1, -1):
            ink = np.maximum(ink, curve2(c, h, back, [(s * 30, 440), (s * 90, 418), (s * 120, 372)], 3.0, 0.4, P, 18))
        return mix(col, TANK_SHADE * 0.82, ink * 0.95)

    def fist(self, col, P, N, side):
        """Lines between the fingers over the front of the fist, and the thumb's crease."""
        ink = np.zeros(len(P))
        for cc in (-32, 2, 36):
            cc = cc * side
            ink = np.maximum(ink, stroke(P, N, [(422, cc, -100), (500, cc, -60), (512, cc, -38), (500, cc, -2), (452, cc, 30)], 2.8, 2.2, rough=0.3, seed=21))
        ink = np.maximum(ink, stroke(P, N, [(372, -70 * side, 30), (422, -88 * side, 40), (464, -96 * side, 16)], 2.6, 2.0, rough=0.3, seed=22))
        return mix(col, TANK_SHADE * 0.78, ink)

    def toes(self, col, P, N, side):
        ink = np.zeros(len(P))
        for cc in (-14, 20):
            cc = cc * side
            ink = np.maximum(ink, stroke(P, N, [(150, cc, 10), (128, cc, 40), (100, cc, 52)], 2.6, 1.8, rough=0.3, seed=23))
        return mix(col, TANK_SHADE * 0.78, ink)

    def shorts(self, P, N):
        """Dark shorts, torn: a ragged hem with skin above it, seams, holes, scribbles."""
        h = P[:, 2]
        col = np.tile(TANK_SHORTS, (len(P), 1))
        col = mix(col, TANK_SHORTS_DARK, smooth(0.58, 0.62, fbm(P, 70, 31)) * 0.55)
        ink = np.zeros(len(P))
        # The hem round each thigh, ragged: below it the cloth is gone and the thigh shows.
        hem = 92 + (noise(P, 16, 32) - 0.5) * 34 + (noise(P, 5, 33) - 0.5) * 10
        col = mix(col, TANK_SKIN, 1 - smooth(-1.0, 1.0, h - hem))
        ink = np.maximum(ink, 1 - smooth(1.4, 4.2, np.abs(h - hem)))
        # The waistband (under the belly) and the seams: down the front and back, and the sides.
        ink = np.maximum(ink, 1 - smooth(2.4, 4.4, np.abs(h - 252 + (noise(P, 40, 34) - 0.5) * 6)))
        ink = np.maximum(ink, stroke(P, N, [(130, 0, 246), (126, 0, 200), (110, 0, 168), (60, 0, 132)], 3.0, 2.4, rough=0.3, seed=35))
        ink = np.maximum(ink, stroke(P, N, [(-110, 0, 250), (-108, 0, 200), (-80, 0, 150)], 3.0, 2.4, rough=0.3, seed=36))
        for s in (1, -1):
            ink = np.maximum(ink, stroke(P, N, [(10, s * 152, 240), (8, s * 156, 200), (12, s * 164, 150), (16, s * 160, 110)], 2.6, 2.0, rough=0.3, seed=37))
        # Torn holes on the seat and on the right thigh's front.
        for cen, rad, sd in (((-96, -80, 196), (30, 26, 22), 40), ((86, 110, 124), (26, 22, 18), 41)):
            ins, edge = tear(P, N, cen, rad, sd)
            col = mix(col, TANK_SKIN, ins)
            ink = np.maximum(ink, edge)
        ink = np.maximum(ink, hatch(P, N, (118, -70, 190), (0.3, 0.55, 1), (0, 1, -0.4), 2, 22, 9, 2.4, 42))
        ink = np.maximum(ink, hatch(P, N, (-100, 70, 218), (0, 0.6, 1), (0, 1, -0.5), 2, 20, 9, 2.4, 43))
        return mix(col, INK, ink)


# --- The Hunter ----------------------------------------------------------------------------------

HOODIE = np.array((90, 76, 110), dtype=float)
HOODIE_DARK = np.array((62, 52, 80), dtype=float)
HOOD_INSIDE = np.array((34, 26, 44), dtype=float)
H_SKIN = np.array((164, 172, 140), dtype=float)
H_SKIN_DARK = np.array((128, 138, 110), dtype=float)
FACE = np.array((150, 160, 128), dtype=float)
PANTS = np.array((64, 62, 74), dtype=float)
PANTS_DARK = np.array((44, 42, 52), dtype=float)
SHOE = np.array((58, 48, 46), dtype=float)
SOLE = np.array((128, 116, 102), dtype=float)
CLAW = np.array((70, 56, 54), dtype=float)


class HunterPaint:
    """The Hunter's paint: a purple hoodie torn at the elbows and shoulders, a shadowed hood, grey-green
    skin, dark claws, worn trousers torn at the knee."""

    def __init__(self, fig):
        self.fig = fig

    def __call__(self, mat, P, N, part):
        side = -1 if part.endswith("_l") else 1
        if mat == "hunter_hoodie":
            return self.hoodie(P, N, part, side)
        if mat == "hunter_hood":
            return self.hood(P, N)
        if mat == "hunter_face":
            return self.face(P, N)
        if mat in ("hunter_skin", "hunter_claw"):
            return self.hand(P, N, mat)
        if mat == "hunter_pants":
            return self.pants(P, N, part, side)
        if mat == "hunter_shoe":
            return self.shoe(P, N)
        raise KeyError(mat)

    def cloth(self, P, base, dark, seed):
        col = np.tile(base, (len(P), 1))
        return mix(col, dark, smooth(0.62, 0.66, fbm(P, 120, seed, octaves=2)) * 0.28)

    def hoodie(self, P, N, part, side):
        a, c, h = P[:, 0], P[:, 1], P[:, 2]
        col = self.cloth(P, HOODIE, HOODIE_DARK, 50 + (part == "torso"))
        ink = np.zeros(len(P))
        if part == "torso":
            # The kangaroo pocket on the belly, and tears over the shoulder blades and a shoulder.
            front = smooth(0.1, 0.4, N[:, 0]) * (a > 30)
            ink = np.maximum(ink, curve2(c, h, front, [(-46, 140), (-40, 176), (40, 176), (46, 140)], 3.0, 0.4, P, 51))
            for cen, rad, sd in (((-44, 50, 230), (40, 32, 26), 52), ((62, -100, 210), (30, 24, 24), 54)):
                ins, edge = tear(P, N, cen, rad, sd)
                col = mix(col, H_SKIN, ins)
                ink = np.maximum(ink, edge)
            # The hem at the hips: a darker band with a line over it.
            col = mix(col, HOODIE_DARK, smooth(-6, 0, -(h - 112 - (a + 40) * 0.1)))
            ink = np.maximum(ink, stroke(P, N, [(-90, 60, 126), (-96, 0, 120), (-90, -60, 126)], 2.6, 2.6, rough=0.3, seed=55))
            for s in (1, -1):
                ink = np.maximum(ink, stroke(P, N, [(-30, s * 40, 246), (20, s * 76, 250), (60, s * 104, 236)], 2.4, 2.0, rough=0.3, seed=56))
        else:
            # A sleeve: a seam along its top, a ragged cuff, torn at the elbow and the upper arm.
            ink = np.maximum(ink, stroke(P, N, [(0, 0, 40), (100, 0, 36), (160, 0, 6), (196, 0, -12)], 2.4, 2.0, rough=0.3, seed=57))
            cuff = 186 + (noise(P, 8, 58) - 0.5) * 18
            ink = np.maximum(ink, 1 - smooth(1.2, 3.6, np.abs(a - cuff)))
            col = mix(col, HOODIE_DARK, smooth(-2, 2, a - cuff) * 0.7)
            tears = [((108, 30, -20), (36, 26, 28), 60)]  # the right elbow
            if side < 0:
                tears = [((40, -36, 4), (34, 24, 28), 62), ((150, -10, 30), (20, 18, 16), 63)]  # the left upper arm
            for cen, rad, sd in tears:
                ins, edge = tear(P, N, cen, rad, sd)
                col = mix(col, H_SKIN, ins)
                ink = np.maximum(ink, edge)
            ink = np.maximum(ink, hatch(P, N, (150, -30 * side, 20), (1, 0, 0.2), (0, 1, 0), 2, 16, 8, 2.2, 64 + (side < 0)))
        return mix(col, INK, ink)

    def hood(self, P, N):
        a = P[:, 0]
        col = self.cloth(P, HOODIE, HOODIE_DARK, 70)
        # Inside the opening it's dark; round the rim, a hem line.
        rim = np.linalg.norm((P - np.array((122, 0, 86))) / np.array((66, 80, 86)), axis=1)
        col = mix(col, HOOD_INSIDE, 1 - smooth(1.04, 1.12, rim))
        ink = (1 - smooth(1.6, 3.4, np.abs(rim - 1.17) * 70)) * (a > 30)
        # A seam over the top, front to back.
        ink = np.maximum(ink, stroke(P, N, [(70, 0, 196), (0, 0, 198), (-60, 0, 188), (-96, 0, 150), (-104, 0, 100)], 2.6, 2.2, rough=0.3, seed=71))
        ins, edge = tear(P, N, (-30, 92, 120), (20, 16, 20), 72)
        col = mix(col, H_SKIN_DARK, ins)
        ink = np.maximum(ink, edge)
        return mix(col, INK, ink)

    def face(self, P, N):
        c, h = P[:, 1], P[:, 2]
        col = np.tile(FACE, (len(P), 1))
        # Shadowed under the hood: darker toward the top and the sides.
        shade = smooth(110, 160, h) + smooth(48, 70, np.abs(c)) * 0.8
        col = mix(col, H_SKIN_DARK * 0.72, np.clip(shade, 0, 1) * 0.75)
        # Bags under the eyes, a scratch on a cheek.
        ink = np.zeros(len(P))
        for s in (1, -1):
            ink = np.maximum(ink, stroke(P, N, [(110, s * 22, 54), (114, s * 38, 50), (110, s * 54, 56)], 2.2, 1.6, flat=0.4))
        ink = np.maximum(ink, stroke(P, N, [(104, 52, 68), (108, 40, 44), (104, 30, 30)], 2.0, 1.2, flat=0.4) * 0.8)
        return mix(col, H_SKIN_DARK * 0.6, ink)

    def hand(self, P, N, mat):
        a = P[:, 0]
        col = np.tile(H_SKIN, (len(P), 1))
        if mat == "hunter_claw":
            # The last third of a finger is a dark claw.
            col = mix(col, CLAW, smooth(286, 300, a + (noise(P, 6, 80) - 0.5) * 6))
            col = mix(col, INK, (1 - smooth(1.0, 2.4, np.abs(a - 293))) * 0.8)
        else:
            ink = stroke(P, N, [(232, -26, 12), (238, 0, 14), (232, 26, 12)], 2.0, 2.0)
            col = mix(col, H_SKIN_DARK * 0.7, ink)
        return col

    def pants(self, P, N, part, side):
        h = P[:, 2]
        col = self.cloth(P, PANTS, PANTS_DARK, 90 + (part == "torso"))
        ink = np.zeros(len(P))
        if part == "torso":
            ink = np.maximum(ink, hatch(P, N, (20, 60, 150), (1, 0, -0.3), (0, 1, 0), 2, 18, 8, 2.2, 91))
            ink = np.maximum(ink, hatch(P, N, (20, -64, 140), (1, 0, -0.3), (0, 1, 0), 2, 18, 8, 2.2, 92))
        else:
            # Torn at the knee, skin showing; frayed at the ankle.
            ins, edge = tear(P, N, (20, 8 * side, 104), (26, 24, 22), 93 + (side < 0))
            col = mix(col, H_SKIN, ins)
            ink = np.maximum(ink, edge)
            cuff = 44 + (noise(P, 6, 95) - 0.5) * 12
            ink = np.maximum(ink, 1 - smooth(1.2, 3.2, np.abs(h - cuff)))
        return mix(col, INK, ink)

    def shoe(self, P, N):
        h = P[:, 2]
        col = np.tile(SHOE, (len(P), 1))
        col = mix(col, SOLE, 1 - smooth(9, 11, h))
        ink = 1 - smooth(1.0, 2.6, np.abs(h - 11))
        for k in range(3):
            aa = 10 + k * 14
            ink = np.maximum(ink, stroke(P, N, [(aa, -12, 44), (aa + 6, 0, 46), (aa, 12, 44)], 2.0, 2.0, flat=0.5))
        return mix(col, INK, ink)


def painter(fig):
    return {"tank": TankPaint, "hunter": HunterPaint}[fig.name](fig)
