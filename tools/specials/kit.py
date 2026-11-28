"""A small modeling kit for the special infected, in the style of the artist's zombies.

The zombies (tools/zombies/source/zombies.fbx) are chunky low-poly solids: chamfered boxes, a rounded
skull, octagonal googly eyes, each piece wrapped in a black outline shell (an inverted hull). This kit
builds the same kind of pieces from code, so the Tank and the Hunter come out in the same family.

Axes and units are the zombies': a forward (where the figure faces), c to its right, h up, in model
units (the FBX's centimetres); the ground is h = 0. Note that (a, c, h) is a left-handed frame: the
exporters mirror into right-handed files.

A Piece is one closed solid: positions V (n x 3), polygons F (vertex indices, wound so that the
cross product (b - a) x (c - a), computed in (a, c, h), points out of the solid), a material per
polygon, and how thick its outline shell is (0: none, as for pupils and mouths).
"""

import math

import numpy as np

# --- Pieces ------------------------------------------------------------------------------------


class Piece:
    def __init__(self, V, F, mats, name="", shell=8.0, crease=50.0, sdf=None):
        self.V = np.asarray(V, dtype=float).reshape(-1, 3)
        self.F = [tuple(int(i) for i in f) for f in F]
        self.mats = [mats] * len(self.F) if isinstance(mats, str) else list(mats)
        assert len(self.mats) == len(self.F)
        self.name = name
        self.shell = shell  # outline thickness, model units (0: no outline)
        self.crease = crease  # degrees: corners whose faces meet at more than this get a hard edge
        self.sdf = sdf  # the field it was sculpted from, if any (for projecting paint onto it)

    def copy(self, name=None):
        p = Piece(self.V.copy(), list(self.F), list(self.mats), name or self.name, self.shell, self.crease, self.sdf)
        return p

    # Transforms (in place, returning self so they chain).
    def move(self, d):
        self.V = self.V + np.asarray(d, dtype=float)
        if self.sdf is not None:
            self.sdf = translated(self.sdf, d)
        return self

    def scale(self, s, about=(0, 0, 0)):
        about = np.asarray(about, dtype=float)
        s = np.broadcast_to(np.asarray(s, dtype=float), (3,))
        self.V = (self.V - about) * s + about
        if np.prod(s) < 0:
            self.F = [tuple(reversed(f)) for f in self.F]
        self.sdf = None
        return self

    def rotate(self, R, about=(0, 0, 0)):
        about = np.asarray(about, dtype=float)
        self.V = (self.V - about) @ np.asarray(R).T + about
        if self.sdf is not None:
            self.sdf = rotated(self.sdf, R, about)
        return self

    def deform(self, fn):
        """V -> fn(V) (n x 3); the field no longer matches."""
        self.V = np.asarray(fn(self.V.copy()), dtype=float)
        self.sdf = None
        return self

    def mirror(self, name=None):
        """The same piece on the other side (c -> -c)."""
        p = self.copy(name)
        p.V[:, 1] *= -1
        p.F = [tuple(reversed(f)) for f in p.F]
        if self.sdf is not None:
            p.sdf = mirrored(self.sdf)
        return p

    def set_mat(self, fn):
        """Material per polygon from fn(centre, normal, old material) (None keeps it)."""
        cen, nrm = self.face_frames()
        for i in range(len(self.F)):
            m = fn(cen[i], nrm[i], self.mats[i])
            if m is not None:
                self.mats[i] = m
        return self

    # Geometry.
    def face_normals(self):
        out = np.zeros((len(self.F), 3))
        for i, f in enumerate(self.F):
            P = self.V[list(f)]
            n = np.zeros(3)
            for j in range(1, len(f) - 1):
                n += np.cross(P[j] - P[0], P[j + 1] - P[0])
            out[i] = n
        ln = np.linalg.norm(out, axis=1, keepdims=True)
        return out / np.maximum(ln, 1e-12), ln[:, 0] / 2

    def face_frames(self):
        nrm, _ = self.face_normals()
        cen = np.array([self.V[list(f)].mean(axis=0) for f in self.F])
        return cen, nrm

    def tris(self):
        """Triangles (fans), with the polygon each came from."""
        out = []
        src = []
        for i, f in enumerate(self.F):
            for j in range(1, len(f) - 1):
                out.append((f[0], f[j], f[j + 1]))
                src.append(i)
        return np.array(out, dtype=int), np.array(src, dtype=int)

    def vertex_normals(self):
        """Angle-weighted normals per vertex (positions are welded, so this is smooth everywhere)."""
        fn, _ = self.face_normals()
        vn = np.zeros_like(self.V)
        for i, f in enumerate(self.F):
            k = len(f)
            for j in range(k):
                a = self.V[f[j - 1]] - self.V[f[j]]
                b = self.V[f[(j + 1) % k]] - self.V[f[j]]
                ang = math.acos(max(-1.0, min(1.0, float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12)))))
                vn[f[j]] += fn[i] * ang
        return vn / np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)

    def corner_normals(self):
        """A normal per polygon corner: smooth, except across edges sharper than the crease angle."""
        fn, area = self.face_normals()
        around = [[] for _ in range(len(self.V))]
        for i, f in enumerate(self.F):
            for v in f:
                around[v].append(i)
        cos_c = math.cos(math.radians(self.crease))
        out = []
        for i, f in enumerate(self.F):
            cn = []
            for v in f:
                acc = np.zeros(3)
                for j in around[v]:
                    if np.dot(fn[j], fn[i]) >= cos_c:
                        acc += fn[j] * (area[j] + 1e-9)
                ln = np.linalg.norm(acc)
                cn.append(acc / ln if ln > 0 else fn[i])
            out.append(cn)
        return out

    def outline(self):
        """The black shell: every vertex pushed out along its normal (evened out on sharp corners),
        the polygons turned inside out."""
        if not self.shell:
            return None
        fn, _ = self.face_normals()
        vn = self.vertex_normals()
        # Even thickness: a corner whose faces lean away from its normal goes out further.
        low = np.ones(len(self.V))
        for i, f in enumerate(self.F):
            for v in f:
                low[v] = min(low[v], float(np.dot(vn[v], fn[i])))
        k = 1.0 / np.clip(low, 0.62, 1.0)
        V = self.V + vn * (self.shell * k)[:, None]
        return Piece(V, [tuple(reversed(f)) for f in self.F], "outline", self.name + "_line", 0, 180)

    def check_closed(self):
        """Every edge used twice, once each way (a closed, consistently wound solid)."""
        edges = {}
        for f in self.F:
            for j in range(len(f)):
                e = (f[j], f[(j + 1) % len(f)])
                edges[e] = edges.get(e, 0) + 1
        bad = [e for e, n in edges.items() if n != 1 or edges.get((e[1], e[0]), 0) != 1]
        return bad


def weld(V, F, eps=1e-6):
    """Merge vertices at the same spot; drop polygons that collapse."""
    V = np.asarray(V, dtype=float)
    keys = np.round(V / eps).astype(np.int64)
    index = {}
    remap = np.zeros(len(V), dtype=int)
    out = []
    for i, k in enumerate(map(tuple, keys)):
        if k not in index:
            index[k] = len(out)
            out.append(V[i])
        remap[i] = index[k]
    F2 = []
    keep = []
    for fi, f in enumerate(F):
        g = []
        for v in f:
            r = remap[v]
            if not g or g[-1] != r:
                g.append(r)
        if len(g) > 1 and g[0] == g[-1]:
            g.pop()
        if len(g) >= 3:
            F2.append(tuple(g))
            keep.append(fi)
    return np.array(out), F2, keep


def merge(pieces, name, shell=None):
    """Several pieces as one (they stay separate solids, each closed)."""
    V = []
    F = []
    M = []
    off = 0
    for p in pieces:
        V.append(p.V)
        F += [tuple(i + off for i in f) for f in p.F]
        M += p.mats
        off += len(p.V)
    s = pieces[0].shell if shell is None else shell
    return Piece(np.vstack(V), F, M, name, s, pieces[0].crease)


# --- Rotations ---------------------------------------------------------------------------------

def rot_a(t):
    """About the forward axis (a): positive rolls the top toward the right (c)."""
    c, s = math.cos(t), math.sin(t)
    return np.array([[1, 0, 0], [0, c, s], [0, -s, c]])


def rot_c(t):
    """About the side axis (c): positive tips the front up (a toward h), as the game's arm pitch."""
    c, s = math.cos(t), math.sin(t)
    return np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]])


def rot_h(t):
    """About the upright (h): positive swings the front toward the right (a toward c), as the game's yaw."""
    c, s = math.cos(t), math.sin(t)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


# --- The cube grid everything is built on ------------------------------------------------------

def cube_grid(coords):
    """
    The surface of the box [-1, 1]^3 cut on the grid lines `coords` (a sorted list from -1 to 1, the
    same on every axis): welded vertices, quads wound outward.
    """
    coords = np.asarray(coords, dtype=float)
    n = len(coords)
    V = []
    F = []
    for k in range(3):
        for s in (1, -1):
            i, j = (k + 1) % 3, (k + 2) % 3
            if s < 0:
                i, j = j, i
            base = len(V)
            for vi in range(n):
                for ui in range(n):
                    p = [0.0, 0.0, 0.0]
                    p[k] = float(s)
                    p[i] = coords[ui]
                    p[j] = coords[vi]
                    V.append(p)
            for vi in range(n - 1):
                for ui in range(n - 1):
                    a = base + vi * n + ui
                    F.append((a, a + 1, a + n + 1, a + n))
    V, F, _ = weld(V, F)
    return V, F


def spaced(n, ends=0.0):
    """n segments from -1 to 1, a little closer together toward the ends (ends 0: even)."""
    t = np.linspace(-1, 1, n + 1)
    return np.sign(t) * np.abs(t) ** (1 + ends)


def box_coords(n_inner, r):
    """Grid lines for a chamfered or rounded box: the ends, r in from the ends, and n_inner even
    segments between (in the unit box: r is the fraction of the half-size)."""
    inner = np.linspace(-(1 - r), 1 - r, n_inner + 1)
    return np.concatenate([[-1.0], inner, [1.0]])


def chamfer_box(half, bevel, mats="skin", name="", n=(1, 1, 1), round_=False, **kw):
    """
    A box (half-sizes along a, c, h) with its edges and corners cut off at `bevel` (45-degree chamfers,
    as the zombies' arms, feet and torsos are), or rounded (round_). n: segments along each axis
    between the bevels.
    """
    half = np.asarray(half, dtype=float)
    m = max(n)
    # A unit grid whose inner lines span [-0.5, 0.5], m segments; each axis is then mapped onto
    # the box: the ends to the faces, the inner lines' ends to where the bevels start.
    V, F = cube_grid(box_coords(m, 0.5))
    # Grid coordinate -> position per axis: -1 -> -half, +-0.5 (the inner lines' ends) -> +-(half - bevel).
    P = np.zeros_like(V)
    for ax in range(3):
        g = V[:, ax]
        inner = half[ax] - bevel
        out = np.where(np.abs(g) > 0.5 + 1e-9, np.sign(g) * half[ax], g / 0.5 * inner)
        P[:, ax] = out
    lim = half - bevel
    inner = np.clip(P, -lim, lim)
    d = P - inner
    if round_:
        ln = np.linalg.norm(d, axis=1, keepdims=True)
        P = np.where(ln > 1e-9, inner + d / np.maximum(ln, 1e-12) * bevel, P)
    else:
        t = np.abs(d).sum(axis=1, keepdims=True) / bevel
        P = np.where(t > 1 + 1e-9, inner + d / np.maximum(t, 1e-12), P)
    # Inner segments per axis: the grid has max(n) of them everywhere; collapse extras by welding.
    for ax in range(3):
        if n[ax] < m:
            lines = np.linspace(-lim[ax], lim[ax], n[ax] + 1)
            x = P[:, ax]
            inside = np.abs(x) < lim[ax] - 1e-9
            nearest = lines[np.argmin(np.abs(x[:, None] - lines[None, :]), axis=1)]
            P[:, ax] = np.where(inside, nearest, x)
    P, F, _ = weld(P, F)
    return Piece(P, F, mats, name, **kw)


def superquadric(radii, power=2.0, n=4, mats="skin", name="", centre=(0, 0, 0), **kw):
    """A rounded blob: power 2 is an ellipsoid, higher is boxier. n: segments per cube face side."""
    t = np.tan(np.linspace(-1, 1, n + 1) * math.pi / 4)  # even angles, as a sphere would have them
    V, F = cube_grid(t)
    d = np.sum(np.abs(V) ** power, axis=1) ** (1 / power)
    P = V / d[:, None] * np.asarray(radii, dtype=float) + np.asarray(centre, dtype=float)
    return Piece(P, F, mats, name, **kw)


# --- Signed distance fields (to sculpt organic pieces) ------------------------------------------
# A field is a function of points (m x 3) -> distances (m,), negative inside.


def sd_ellipsoid(c, r):
    c = np.asarray(c, dtype=float)
    r = np.asarray(r, dtype=float)

    def f(p):
        q = p - c
        k0 = np.linalg.norm(q / r, axis=1)
        k1 = np.linalg.norm(q / (r * r), axis=1)
        return np.where(k1 > 1e-9, k0 * (k0 - 1.0) / np.maximum(k1, 1e-9), -r.min())

    return f


def sd_capsule(a, b, ra, rb):
    """A round cone from a (radius ra) to b (radius rb)."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    ba = b - a
    L2 = float(ba @ ba)

    def f(p):
        t = np.clip(((p - a) @ ba) / L2, 0, 1)
        q = p - (a + t[:, None] * ba)
        return np.linalg.norm(q, axis=1) - (ra + (rb - ra) * t)

    return f


def sd_box(c, half, r=0.0):
    c = np.asarray(c, dtype=float)
    half = np.asarray(half, dtype=float) - r

    def f(p):
        q = np.abs(p - c) - half
        return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(q.max(axis=1), 0) - r

    return f


def smin(k, *fs):
    """Smooth union (k: how far the blend reaches)."""

    def f(p):
        d = fs[0](p)
        for g in fs[1:]:
            e = g(p)
            h = np.clip(0.5 + 0.5 * (e - d) / k, 0, 1)
            d = e * (1 - h) + d * h - k * h * (1 - h)
        return d

    return f


def ssub(k, a, b):
    """a with b carved out of it, smoothly."""

    def f(p):
        d1 = a(p)
        d2 = -b(p)
        h = np.clip(0.5 + 0.5 * (d1 - d2) / k, 0, 1)  # a smooth max(d1, d2)
        return d1 * h + d2 * (1 - h) + k * h * (1 - h)

    return f


def warp(field, fn):
    """The field seen through a deformation of space (fn maps points to where to look)."""
    return lambda p: field(fn(p))


def translated(field, d):
    d = np.asarray(d, dtype=float)
    return lambda p: field(p - d)


def rotated(field, R, about=(0, 0, 0)):
    R = np.asarray(R, dtype=float)
    about = np.asarray(about, dtype=float)
    return lambda p: field((p - about) @ R + about)


def mirrored(field):
    def f(p):
        q = p.copy()
        q[:, 1] *= -1
        return field(q)

    return f


def sculpt(field, centre, radii, n=6, mats="skin", name="", **kw):
    """
    A closed low-poly piece on the surface of a field: a cube-sphere (n segments a face side) whose
    vertices are slid along rays from `centre` (spread as an ellipsoid of `radii` would spread them)
    until they meet the surface. The field must be star-shaped about the centre.
    """
    t = np.tan(np.linspace(-1, 1, n + 1) * math.pi / 4)
    V, F = cube_grid(t)
    radii = np.asarray(radii, dtype=float)
    centre = np.asarray(centre, dtype=float)
    d = V / np.linalg.norm(V, axis=1, keepdims=True) * radii
    d = d / np.linalg.norm(d, axis=1, keepdims=True)
    lo = np.zeros(len(d))
    hi = np.full(len(d), float(radii.max()) * 1.2)
    for _ in range(8):  # make sure hi is outside
        out = field(centre + d * hi[:, None]) > 0
        if out.all():
            break
        hi = np.where(out, hi, hi * 1.6)
    assert (field(centre[None, :]) < 0).all(), f"{name}: centre must be inside"
    for _ in range(40):
        mid = (lo + hi) / 2
        inside = field(centre + d * mid[:, None]) < 0
        lo = np.where(inside, mid, lo)
        hi = np.where(inside, hi, mid)
    P = centre + d * ((lo + hi) / 2)[:, None]
    return Piece(P, F, mats, name, sdf=field, **kw)


def relax(piece, iters=2, k=0.35):
    """Even the vertex spacing a little (Laplacian), then project back onto the field."""
    nb = [set() for _ in range(len(piece.V))]
    for f in piece.F:
        for j in range(len(f)):
            nb[f[j]].add(f[j - 1])
            nb[f[j]].add(f[(j + 1) % len(f)])
    nb = [np.array(sorted(s)) for s in nb]
    for _ in range(iters):
        avg = np.array([piece.V[n].mean(axis=0) for n in nb])
        piece.V = piece.V + (avg - piece.V) * k
        if piece.sdf is not None:
            piece.V = project(piece.sdf, piece.V)
    return piece


def project(field, P, iters=6):
    """Points slid onto the field's surface along its gradient."""
    P = P.copy()
    e = 0.5
    for _ in range(iters):
        d = field(P)
        g = np.stack([(field(P + np.array([e, 0, 0])) - field(P - np.array([e, 0, 0]))),
                      (field(P + np.array([0, e, 0])) - field(P - np.array([0, e, 0]))),
                      (field(P + np.array([0, 0, e])) - field(P - np.array([0, 0, e])))], axis=1) / (2 * e)
        gl = np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
        P = P - (d[:, None] * g / gl / gl)
    return P


# --- Tubes -------------------------------------------------------------------------------------

def tube(path, radii, sides=8, mats="skin", name="", caps=("round", "round"), cap_k=0.55, twist=0.0, up=(0, 0, 1), **kw):
    """
    A closed tube along a path (k x 3 points): radii per point (a number, or (across, up) for an oval
    section), `sides` corners around (starting from `up`, turned by twist radians). Each end is
    closed with a ring pulled in to cap_k of its radius and a centre vertex ('round'), or flat.
    """
    path = np.asarray(path, dtype=float)
    k = len(path)
    radii = [np.broadcast_to(np.asarray(r, dtype=float), (2,)) for r in radii]
    # Frames: tangent, and a normal kept as close as possible to `up`.
    T = np.zeros_like(path)
    T[0] = path[1] - path[0]
    T[-1] = path[-1] - path[-2]
    T[1:-1] = path[2:] - path[:-2]
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    up = np.asarray(up, dtype=float)
    V = []
    rings = []
    for i in range(k):
        n = up - T[i] * np.dot(up, T[i])
        if np.linalg.norm(n) < 1e-6:
            n = np.cross(T[i], [0, 1, 0])
        n /= np.linalg.norm(n)
        b = np.cross(T[i], n)  # so the quads below wind outward
        ring = []
        for s in range(sides):
            ang = twist + 2 * math.pi * s / sides
            p = path[i] + n * math.cos(ang) * radii[i][1] + b * math.sin(ang) * radii[i][0]
            ring.append(len(V))
            V.append(p)
        rings.append(ring)
    F = []
    for i in range(k - 1):
        r0, r1 = rings[i], rings[i + 1]
        for s in range(sides):
            F.append((r0[s], r0[(s + 1) % sides], r1[(s + 1) % sides], r1[s]))
    for end, (ring, sign) in enumerate(((rings[0], -1), (rings[-1], 1))):
        kind = caps[end]
        cen = path[0] if end == 0 else path[-1]
        tan = T[0] if end == 0 else T[-1]
        rr = radii[0] if end == 0 else radii[-1]
        if kind == "round":
            inner = []
            for s in range(sides):
                p = cen + (V[ring[s]] - cen) * cap_k + tan * sign * max(rr) * 0.45
                inner.append(len(V))
                V.append(p)
            tip = len(V)
            V.append(cen + tan * sign * max(rr) * 0.62)
            for s in range(sides):
                q = (ring[s], ring[(s + 1) % sides], inner[(s + 1) % sides], inner[s])
                F.append(q if sign > 0 else tuple(reversed(q)))
                t3 = (inner[s], inner[(s + 1) % sides], tip)
                F.append(t3 if sign > 0 else tuple(reversed(t3)))
        elif kind == "point":
            tip = len(V)
            V.append(cen + tan * sign * max(rr) * 1.0)
            for s in range(sides):
                t3 = (ring[s], ring[(s + 1) % sides], tip)
                F.append(t3 if sign > 0 else tuple(reversed(t3)))
        else:
            cap = tuple(ring) if sign > 0 else tuple(reversed(ring))
            F.append(cap)
    piece = Piece(np.array(V), F, mats, name, **kw)
    # The winding depends on the frame's handedness: make it point out.
    _orient_out(piece)
    return piece


def _orient_out(piece):
    """Turn the polygons inside out if most of them face inward (by the signed volume)."""
    tri, _ = piece.tris()
    P = piece.V
    vol = np.einsum("ij,ij->i", P[tri[:, 0]], np.cross(P[tri[:, 1]], P[tri[:, 2]])).sum()
    if vol < 0:
        piece.F = [tuple(reversed(f)) for f in piece.F]
    return piece


def signed_volume(piece):
    tri, _ = piece.tris()
    P = piece.V
    return np.einsum("ij,ij->i", P[tri[:, 0]], np.cross(P[tri[:, 1]], P[tri[:, 2]])).sum() / 6


# --- Googly eyes (as the zombies have them) -------------------------------------------------------

def octagon(r, rot=math.pi / 8):
    return [(math.cos(rot + i * math.pi / 4) * r, math.sin(rot + i * math.pi / 4) * r) for i in range(8)]


def googly_eye(centre, r, depth, facing, name, shell=6.0, pupil=0.52, squash=1.0):
    """
    A zombie's eye: a domed octagonal white (r across, `depth` deep) facing `facing` (a unit vector in
    (a, c, h)), its outline shell, and a black octagonal pupil (a front face and its sides, open at the
    back, sunk into the white) a little proud of the dome. Returns (white, pupil).
    """
    centre = np.asarray(centre, dtype=float)
    fwd = np.asarray(facing, dtype=float)
    fwd = fwd / np.linalg.norm(fwd)
    side = np.cross([0, 0, 1], fwd)
    if np.linalg.norm(side) < 1e-6:
        side = np.array([0, 1, 0])
    side = side / np.linalg.norm(side)
    up = np.cross(fwd, side)
    up = up / np.linalg.norm(up)

    def at(x, y, z):  # x across, y up, z out along fwd
        return centre + side * x + up * y * squash + fwd * z

    V = []
    rings = []
    # back ring, outer ring, inner ring, dome top
    for rr, zz in ((r * 0.86, -depth * 0.5), (r, 0.0), (r * 0.62, depth * 0.34), (r * 0.3, depth * 0.48)):
        ring = []
        for x, y in octagon(rr):
            ring.append(len(V))
            V.append(at(x, y, zz))
        rings.append(ring)
    top = len(V)
    V.append(at(0, 0, depth * 0.52))
    back = len(V)
    V.append(at(0, 0, -depth * 0.5))
    F = []
    for i in range(3):
        r0, r1 = rings[i], rings[i + 1]
        for s in range(8):
            F.append((r0[s], r0[(s + 1) % 8], r1[(s + 1) % 8], r1[s]))
    for s in range(8):
        F.append((rings[3][s], rings[3][(s + 1) % 8], top))
        F.append((rings[0][(s + 1) % 8], rings[0][s], back))
    white = Piece(np.array(V), F, "eye_white", name + "_white", shell, 40)
    _orient_out(white)
    # The pupil: a flat octagon just in front of the dome, with short sides going back into it.
    pr = r * pupil
    V = []
    front = []
    rear = []
    for x, y in octagon(pr):
        front.append(len(V))
        V.append(at(x, y, depth * 0.56))
    for x, y in octagon(pr):
        rear.append(len(V))
        V.append(at(x, y, depth * 0.56 - pr * 0.2))
    F = [tuple(front)]
    for s in range(8):
        F.append((front[(s + 1) % 8], front[s], rear[s], rear[(s + 1) % 8]))
    pup = Piece(np.array(V), F, "black", name + "_pupil", 0, 30)
    # Wind the front face toward fwd.
    n, _ = pup.face_normals()
    if np.dot(n[0], fwd) < 0:
        pup.F = [tuple(reversed(f)) for f in pup.F]
    return white, pup
