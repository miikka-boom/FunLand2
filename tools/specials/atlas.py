"""UVs and the texture: charts, packing, and painting in 3D.

Every polygon whose material isn't a palette colour gets a place on the texture: the polygons of a
piece are grouped into charts by which way they face (box projection: front, back, left, right, top,
bottom), each chart laid flat, and the charts packed into the atlas around the palette strip, which
sits exactly where the zombies' texture has it (eye white, tan, dark red, black), so the game's
palette rule (PALETTE: those UVs never move) holds for these models too.

The texture is then painted in 3D: every texel inside a chart knows the point of the model it shows
(its part, material, position and normal), and the paint functions (paint.py) colour it from that.
"""

import math

import numpy as np

SIZE = 2048
PALETTE_BOX = (0.0, 0.85, 0.07, 1.0)  # u0, v0, u1, v1: the zombies' palette strip
PAL_UV = {
    "eye_white": (0.0412, 0.962),
    "tan": (0.0400, 0.919),
    "red": (0.0400, 0.895),
    "black": (0.0390, 0.872),
    "outline": (0.0390, 0.872),
}
PAL_RGB = {"eye_white": (255, 255, 255), "tan": (149, 127, 89), "red": (133, 37, 0), "black": (0, 0, 0), "outline": (0, 0, 0)}
BACKGROUND = (78, 67, 73)  # the texture's empty space, as on the zombies'
PAD = 5  # texels between charts (the build pads into them)

AXES = [(0, 1), (0, -1), (1, 1), (1, -1), (2, 1), (2, -1)]  # (axis, sign): front, back, right, left, top, bottom


class Chart:
    def __init__(self, owner, piece, faces, axis, sign):
        self.owner = owner  # (figure, part)
        self.piece = piece
        self.faces = faces
        self.axis = axis
        self.sign = sign
        self.uv = {}  # (face, corner) -> (x, y) in model units, flat
        self.x0 = self.y0 = 0  # where it went on the atlas (texels)
        self.w = self.h = 0


def flat(p, axis, sign):
    """A point laid flat for a chart facing (axis, sign): (across, up) in model units, as seen from outside."""
    a, c, h = p
    if axis == 0:  # front / back: across is c (mirrored for the back), up is h
        return (c * sign, h)
    if axis == 1:  # right / left: across is -a on the right side, a on the left
        return (-a * sign, h)
    return (c, a * sign)  # top / bottom: across c, up a (forward is up on the top chart)


def charts_for(owner, piece, baked):
    """Group the piece's baked polygons into charts by facing (connected through shared edges)."""
    fn, _ = piece.face_normals()
    which = []
    for i in range(len(piece.F)):
        if not baked(piece.mats[i]):
            which.append(-1)
            continue
        n = fn[i]
        k = int(np.argmax(np.abs(n)))
        which.append(k * 2 + (0 if n[k] > 0 else 1))
    # Union-find over shared edges with the same facing.
    parent = list(range(len(piece.F)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    edge_face = {}
    for i, f in enumerate(piece.F):
        if which[i] < 0:
            continue
        for j in range(len(f)):
            e = (min(f[j], f[(j + 1) % len(f)]), max(f[j], f[(j + 1) % len(f)]))
            if e in edge_face:
                o = edge_face[e]
                if which[o] == which[i]:
                    ra, rb = find(o), find(i)
                    if ra != rb:
                        parent[ra] = rb
            else:
                edge_face[e] = i
    bins = {}
    for i in range(len(piece.F)):
        if which[i] >= 0:
            bins.setdefault(find(i), []).append(i)
    out = []
    for faces in bins.values():
        axis, sign = AXES[which[faces[0]]]
        ch = Chart(owner, piece, faces, axis, sign)
        for fi in faces:
            for j, v in enumerate(piece.F[fi]):
                ch.uv[(fi, j)] = flat(piece.V[v], axis, sign)
        out.append(ch)
    return out


def pack(charts, density, size=SIZE):
    """
    Place the charts on the atlas (density: texels per model unit), tallest first, on a skyline,
    keeping clear of the palette strip. Returns False if they don't fit.
    """
    sky = np.zeros(size, dtype=int)  # the lowest free row in each column (rows go down from the top)
    pw = int(math.ceil(PALETTE_BOX[2] * size)) + 2 * PAD
    sky[:pw] = int(math.ceil((1 - PALETTE_BOX[1]) * size)) + PAD
    for ch in charts:
        xs = [p[0] for p in ch.uv.values()]
        ys = [p[1] for p in ch.uv.values()]
        ch.ux0, ch.uy1 = min(xs), max(ys)
        ch.w = int(math.ceil((max(xs) - min(xs)) * density)) + 2 * PAD + 1
        ch.h = int(math.ceil((max(ys) - min(ys)) * density)) + 2 * PAD + 1
    order = sorted(charts, key=lambda c: (-c.h, -c.w))
    for ch in order:
        if ch.w > size:
            return False
        # The lowest spot: for each x, the chart would rest at max(sky[x:x+w]).
        best = None
        x = 0
        while x + ch.w <= size:
            y = int(sky[x:x + ch.w].max())
            if best is None or y < best[1]:
                best = (x, y)
            x += 4
        if best is None or best[1] + ch.h > size:
            return False
        ch.x0, ch.y0 = best
        sky[best[0]:best[0] + ch.w] = best[1] + ch.h
    return True


def pack_best(charts, size=SIZE):
    """The highest density at which everything fits."""
    area = 0.0
    for ch in charts:
        xs = [p[0] for p in ch.uv.values()]
        ys = [p[1] for p in ch.uv.values()]
        area += (max(xs) - min(xs) + 1) * (max(ys) - min(ys) + 1)
    lo, hi = 0.05, math.sqrt(size * size / area) * 1.2
    for _ in range(18):
        mid = (lo + hi) / 2
        if pack(charts, mid, size):
            lo = mid
        else:
            hi = mid
    assert pack(charts, lo, size)
    return lo


def corner_uv(ch, fi, j, density, size=SIZE):
    """A chart corner's UV (v up, as in the FBX)."""
    x, y = ch.uv[(fi, j)]
    px = ch.x0 + PAD + (x - ch.ux0) * density
    py = ch.y0 + PAD + (ch.uy1 - y) * density
    return (px / size, 1 - py / size)


def rasterize(charts, density, size=SIZE):
    """
    Every texel inside a chart, with what it shows. Returns arrays: x, y (texel), P (n x 3, the point
    in its part's frame), N (its smooth normal), and per texel the index of its chart.
    """
    xs, ys, Ps, Ns, cs = [], [], [], [], []
    for ci, ch in enumerate(charts):
        piece = ch.piece
        cn = piece.corner_normals()
        for fi in ch.faces:
            f = piece.F[fi]
            for j in range(1, len(f) - 1):
                corners = (0, j, j + 1)
                T = np.array([corner_uv(ch, fi, k, density, size) for k in corners])
                tx = T[:, 0] * size
                ty = (1 - T[:, 1]) * size
                P3 = piece.V[[f[k] for k in corners]]
                N3 = np.array([cn[fi][k] for k in corners])
                # Texel centres inside the triangle, plus a little (seams stay covered).
                x0 = int(math.floor(tx.min() - 1))
                x1 = int(math.ceil(tx.max() + 1))
                y0 = int(math.floor(ty.min() - 1))
                y1 = int(math.ceil(ty.max() + 1))
                gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
                gx = gx.ravel()
                gy = gy.ravel()
                d = (ty[1] - ty[2]) * (tx[0] - tx[2]) + (tx[2] - tx[1]) * (ty[0] - ty[2])
                if abs(d) < 1e-9:
                    continue
                w0 = ((ty[1] - ty[2]) * (gx - tx[2]) + (tx[2] - tx[1]) * (gy - ty[2])) / d
                w1 = ((ty[2] - ty[0]) * (gx - tx[2]) + (tx[0] - tx[2]) * (gy - ty[2])) / d
                w2 = 1 - w0 - w1
                # Conservative: within about a texel of the triangle.
                L = np.array([math.hypot(tx[1] - tx[2], ty[1] - ty[2]), math.hypot(tx[2] - tx[0], ty[2] - ty[0]), math.hypot(tx[0] - tx[1], ty[0] - ty[1])])
                area2 = abs(d)
                m = (w0 >= -1.0 * L[0] / area2) & (w1 >= -1.0 * L[1] / area2) & (w2 >= -1.0 * L[2] / area2)
                if not m.any():
                    continue
                W = np.stack([w0[m], w1[m], w2[m]], axis=1)
                W = np.clip(W, 0, None)
                W /= W.sum(axis=1, keepdims=True)
                xs.append(gx[m].astype(int))
                ys.append(gy[m].astype(int))
                Ps.append(W @ P3)
                N = W @ N3
                Ns.append(N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9))
                cs.append(np.full(m.sum(), ci))
    x = np.concatenate(xs)
    y = np.concatenate(ys)
    ok = (x >= 0) & (x < size) & (y >= 0) & (y < size)
    return x[ok], y[ok], np.concatenate(Ps)[ok], np.concatenate(Ns)[ok], np.concatenate(cs)[ok]


def dilate(img, filled, rings=24):
    """Grow the painted islands into the empty space around them (so mipmaps don't pull in the
    background), ring after ring, each empty texel taking the mean of its painted neighbours."""
    col = img.astype(np.float32)
    filled = filled.copy()
    for _ in range(rings):
        m = filled.astype(np.float32)
        cm = col * m[..., None]
        acc = np.zeros_like(col)
        cnt = np.zeros_like(m)
        acc[1:] += cm[:-1]
        cnt[1:] += m[:-1]
        acc[:-1] += cm[1:]
        cnt[:-1] += m[1:]
        acc[:, 1:] += cm[:, :-1]
        cnt[:, 1:] += m[:, :-1]
        acc[:, :-1] += cm[:, 1:]
        cnt[:, :-1] += m[:, 1:]
        grow = ~filled & (cnt > 0)
        if not grow.any():
            break
        col[grow] = acc[grow] / cnt[grow][:, None]
        filled = filled | grow
    out = np.where(filled[..., None], col, np.array(BACKGROUND, dtype=np.float32))
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)
