#!/usr/bin/env python3
"""Build the horde's zombie models from the artist's FBX and texture.

Source (in git, as the artist delivered them):
  tools/zombies/source/zombies.fbx   Blender export: six zombies side by side, each a body and a head
  tools/zombies/source/zombies.png   their texture: four colour blocks with the same layout, and a
                                     palette strip (eye white, black) that all of them share

This script writes:
  assets/zombies/meshes.js     the parts, as the game uses them (generated: do not edit by hand)
  assets/zombies/zombies.png   the texture at 1024 px, its islands padded so mipmaps don't bleed

The game bakes sprites of these parts for its camera at run time (src/render/zombie-bake.js).

Parts. A body is a torso, an arm and a foot: both arms are the same mesh mounted at two
shoulders, both feet the same mesh at two ankles. Each piece carries its black outline shell (an
inverted hull: the same shape a little bigger, faces turned inward, coloured from the palette's
black). A head is one mesh: skull, ears, eyes, mouth, hair, and their shells. Heads sit on the
body they were made for at its neck (the top of its torso), so a head made for the normal body
fits any normal body, whatever its colours.

Colours. The texture's four blocks (A top right, B top left, C bottom right, D bottom left) are
laid out alike, so every UV here is given in block B and the game shifts it to the block a
zombie wears (BLOCKS), except UVs in the shared palette strip (PALETTE).

Axes and units: a forward (where the zombie faces), c to its right, h up, in the model's units
(the FBX's centimetres: 100 per Blender metre); the ground is h = 0.

Run it with a Python that has numpy and Pillow:
    python3 tools/zombies/build_zombies.py
"""

import base64
import json
import math
import struct
import sys
import zlib
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC_FBX = ROOT / "tools" / "zombies" / "source" / "zombies.fbx"
SRC_PNG = ROOT / "tools" / "zombies" / "source" / "zombies.png"
OUT = ROOT / "assets" / "zombies"
TEX_SIZE = 1024

POS_Q = 8  # positions are stored as Int16 in 1/8 model units
# The palette strip (eye white, black for outlines, pupils and mouths): shared by every colour block.
PALETTE = (0.0, 0.85, 0.07, 1.0)  # u0, v0, u1, v1
BACKGROUND = (78, 67, 73)  # the texture's empty space

# The six zombies as authored: which body, head and colour block each one is.
AUTHORED = [
    # (fbx model prefix, head id, colour block)
    ("zombie1", "bald", "A"),
    ("zombie2", "baldB", "B"),
    ("zombie3", "ponytail", "A"),
    ("zombie4", "swept", "B"),
    ("zombie5", "wide", "C"),
    ("zombie6", "wideBig", "D"),
]
BIG = "zombie6"  # the one with the big body; the rest share the normal one


# --- Binary FBX (7.x) --------------------------------------------------------------------------

class Node:
    __slots__ = ("name", "props", "children")

    def __init__(self, name, props, children):
        self.name = name
        self.props = props
        self.children = children

    def find(self, name):
        for c in self.children:
            if c.name == name:
                return c
        return None

    def findall(self, name):
        return [c for c in self.children if c.name == name]


ARRAYS = {"f": ("f", 4), "d": ("d", 8), "l": ("q", 8), "i": ("i", 4), "b": ("?", 1)}
SCALARS = {"Y": ("<h", 2), "C": ("<?", 1), "I": ("<i", 4), "F": ("<f", 4), "D": ("<d", 8), "L": ("<q", 8)}


def read_fbx(path):
    data = Path(path).read_bytes()
    if data[:20] != b"Kaydara FBX Binary  ":
        sys.exit(f"{path}: not a binary FBX")
    version = struct.unpack_from("<I", data, 23)[0]
    wide = version >= 7500  # 64-bit node headers

    def prop(off):
        t = chr(data[off])
        off += 1
        if t in SCALARS:
            fmt, n = SCALARS[t]
            return struct.unpack_from(fmt, data, off)[0], off + n
        if t in ARRAYS:
            count, enc, clen = struct.unpack_from("<III", data, off)
            off += 12
            raw = data[off:off + clen]
            if enc == 1:
                raw = zlib.decompress(raw)
            fmt, size = ARRAYS[t]
            return list(struct.unpack(f"<{count}{fmt}", raw[:count * size])), off + clen
        if t in "SR":
            n = struct.unpack_from("<I", data, off)[0]
            raw = data[off + 4:off + 4 + n]
            return (raw.decode("utf-8", "replace") if t == "S" else raw), off + 4 + n
        raise ValueError(f"unknown FBX property type {t!r} at {off - 1}")

    def node(off):
        end, nprops, _ = struct.unpack_from("<QQQ" if wide else "<III", data, off)
        off += 24 if wide else 12
        nlen = data[off]
        off += 1
        if end == 0:
            return None, off
        name = data[off:off + nlen].decode("ascii")
        off += nlen
        props = []
        for _ in range(nprops):
            p, off = prop(off)
            props.append(p)
        children = []
        sentinel = 25 if wide else 13
        while off < end:
            if end - off == sentinel:
                break
            child, off = node(off)
            if child is None:
                break
            children.append(child)
        return Node(name, props, children), end

    roots = []
    off = 27
    while off < len(data):
        n, off2 = node(off)
        if n is None:
            break
        roots.append(n)
        off = off2
    return Node("ROOT", [], roots)


def rotation(rx, ry, rz):
    """FBX's default Euler order (XYZ): R = Rz Ry Rx."""
    rx, ry, rz = (math.radians(a) for a in (rx, ry, rz))
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def load_models(path):
    """{model name: [polygon, ...]}, a polygon being [(pos, normal, uv), ...] in the game's axes."""
    root = read_fbx(path)
    objects = root.find("Objects")
    geoms = {n.props[0]: n for n in objects.findall("Geometry")}
    models = {n.props[0]: n for n in objects.findall("Model")}
    geom_of = {}
    for c in root.find("Connections").findall("C"):
        child, parent = c.props[1], c.props[2]
        if child in geoms and parent in models:
            geom_of[parent] = child
    out = {}
    for mid, m in models.items():
        name = m.props[1].split("\x00")[0].replace("::Model", "")
        p70 = {p.props[0]: p.props[4:] for p in m.find("Properties70").findall("P")}
        t = np.array(p70.get("Lcl Translation", [0, 0, 0]), dtype=float)
        R = rotation(*p70.get("Lcl Rotation", [0, 0, 0]))
        s = np.array(p70.get("Lcl Scaling", [1, 1, 1]), dtype=float)
        g = geoms[geom_of[mid]]
        verts = np.array(g.find("Vertices").props[0], dtype=float).reshape(-1, 3)
        world = (R @ (verts * s).T).T + t
        pvi = g.find("PolygonVertexIndex").props[0]
        uvl = g.find("LayerElementUV")
        uv = uvl.find("UV").props[0]
        uvi = uvl.find("UVIndex").props[0]
        nl = g.find("LayerElementNormal")
        assert uvl.find("MappingInformationType").props[0] == "ByPolygonVertex"
        assert nl.find("MappingInformationType").props[0] == "ByPolygonVertex"
        nrm = np.array(nl.find("Normals").props[0], dtype=float).reshape(-1, 3)
        nri = nl.find("NormalsIndex").props[0] if nl.find("NormalsIndex") else list(range(len(pvi)))
        nrm = (R @ nrm.T).T  # rotation only (the scaling is uniform)

        # FBX: x left of a zombie facing +z, y up. Game: a forward, c to its right, h up.
        # Positions are relative to the model's own spot on the ground (its x and z).
        def game(p, origin=True):
            if origin:
                return (p[2] - t[2], -(p[0] - t[0]), p[1])
            return (p[2], -p[0], p[1])

        polys = []
        cur = []
        for k, idx in enumerate(pvi):
            vi = ~idx if idx < 0 else idx
            n = nrm[nri[k]]
            n = n / (np.linalg.norm(n) or 1)
            cur.append((game(world[vi]), game(n, False), (uv[uvi[k] * 2], uv[uvi[k] * 2 + 1])))
            if idx < 0:
                polys.append(cur)
                cur = []
        out[name] = polys
    return out


# --- Splitting the models into parts -----------------------------------------------------------

def islands(polys):
    """Connected pieces of a mesh (polygons that share a corner position)."""
    parent = {}

    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def key(p):
        return tuple(round(x, 3) for x in p)

    for poly in polys:
        k0 = key(poly[0][0])
        for corner in poly[1:]:
            a, b = find(k0), find(key(corner[0]))
            if a != b:
                parent[a] = b
    groups = {}
    for poly in polys:
        groups.setdefault(find(key(poly[0][0])), []).append(poly)
    return list(groups.values())


def bbox(polys):
    pts = np.array([c[0] for poly in polys for c in poly])
    return pts.min(axis=0), pts.max(axis=0)


def in_palette(uv):
    return PALETTE[0] <= uv[0] <= PALETTE[2] and PALETTE[1] <= uv[1] <= PALETTE[3]


def is_shell(polys):
    """An outline shell: coloured from the palette's black, faces turned inward."""
    if not all(in_palette(c[2]) for poly in polys for c in poly):
        return False
    lo, hi = bbox(polys)
    mid = (lo + hi) / 2
    inward = sum(1 for poly in polys for c in poly if np.dot(np.array(c[1]), np.array(c[0]) - mid) < 0)
    total = sum(len(poly) for poly in polys)
    return inward > total / 2


def split_body(polys):
    """torso, the arm on its right (box + fingers), its right foot: each with its shells."""
    pieces = islands(polys)
    solid = [p for p in pieces if not is_shell(p)]
    shells = [p for p in pieces if is_shell(p)]
    # Each shell goes with the solid piece whose box is the nearest fit.
    owner = {}
    for sh in shells:
        slo, shi = bbox(sh)
        best = min(range(len(solid)), key=lambda i: sum(np.abs(bbox(solid[i])[0] - slo)) + sum(np.abs(bbox(solid[i])[1] - shi)))
        owner.setdefault(best, []).append(sh)
    parts = {"torso": [], "arm_r": [], "arm_l": [], "foot_r": [], "foot_l": []}
    torso = max(range(len(solid)), key=lambda i: len(solid[i]))
    for i, piece in enumerate(solid):
        lo, hi = bbox(piece)
        mid = (lo + hi) / 2
        if i == torso:
            kind = "torso"
        elif hi[2] < 40:
            kind = "foot_r" if mid[1] > 0 else "foot_l"
        else:
            kind = "arm_r" if mid[1] > 0 else "arm_l"  # arm boxes and fingers
        parts[kind] += piece + [poly for sh in owner.get(i, []) for poly in sh]
    return parts


# --- Mesh encoding -----------------------------------------------------------------------------

def b64(arr):
    return base64.b64encode(np.ascontiguousarray(arr).tobytes()).decode("ascii")


def encode(polys, pivot, block_shift, groups=None):
    """
    One mesh, relative to `pivot`. Corners are merged when position, normal and UV agree.
    Triangles are wound so that (b - a) x (c - a) points along the normals (outward for skin,
    inward for a shell), which is what the baker culls by. UVs move to block B. groups: a tag
    per polygon (id(polygon) -> small int), written per vertex as `grp`.
    """
    pivot = np.array(pivot, dtype=float)
    index = {}
    pos, nrm, uvs, tri, grp = [], [], [], [], []
    for poly in polys:
        ids = []
        g = groups.get(id(poly), 0) if groups else 0
        for p, n, uv in poly:
            q = tuple(int(round(x)) for x in (np.array(p) - pivot) * POS_Q)
            qn = tuple(int(max(-127, min(127, round(x * 127)))) for x in n)
            if not in_palette(uv):
                uv = (uv[0] - block_shift[0], uv[1] - block_shift[1])
            qt = tuple(int(max(0, min(65535, round(x * 65535)))) for x in uv)
            k = q + qn + qt + (g,)
            if k not in index:
                index[k] = len(pos)
                pos.append(q)
                nrm.append(qn)
                uvs.append(qt)
                grp.append(g)
            ids.append(index[k])
        navg = np.sum([np.array(c[1]) for c in poly], axis=0)
        for j in range(1, len(ids) - 1):
            a, b, c = ids[0], ids[j], ids[j + 1]
            pa, pb, pc = (np.array(pos[x], dtype=float) for x in (a, b, c))
            geo = np.cross(pb - pa, pc - pa)
            if np.dot(geo, navg) < 0:
                b, c = c, b
            tri += [a, b, c]
    lo, hi = np.array(pos).min(axis=0) / POS_Q, np.array(pos).max(axis=0) / POS_Q
    assert len(pos) < 65536
    out = {
        "n": len(pos),
        "tris": len(tri) // 3,
        "box": [round(float(x), 1) for x in (*lo, *hi)],
        "pos": b64(np.array(pos, dtype="<i2")),
        "nrm": b64(np.array(nrm, dtype="i1")),
        "uv": b64(np.array(uvs, dtype="<u2")),
        "tri": b64(np.array(tri, dtype="<u2")),
    }
    if groups:
        out["grp"] = b64(np.array(grp, dtype="u1"))
    return out


EYE_WHITE_V = 0.94  # the palette's eye white is its top swatch


def eye_groups(polys, pivot):
    """
    A head's googly eyes, so the game can move the pupils and close the eyes: tags per polygon
    (1, 2: the left and right eye's white and its outline; 3, 4: the left and right pupil; 0: the
    rest, the mouth included) and each eye's middle and half-size (c, h), relative to `pivot`.
    """
    pieces = islands(polys)
    whites = [i for i in pieces if not is_shell(i) and all(in_palette(c[2]) and c[2][1] > EYE_WHITE_V for poly in i for c in poly)]
    assert len(whites) == 2, f"expected two eye whites, found {len(whites)}"
    whites.sort(key=lambda isl: centre(isl)[1])  # the left eye (c < 0) first
    eyes = []
    for w in whites:
        lo, hi = bbox(w)
        eyes.append({"lo": lo, "hi": hi, "mid": (lo + hi) / 2})
    tags = {}
    for isl in pieces:
        tag = 0
        mid = (bbox(isl)[0] + bbox(isl)[1]) / 2
        for e, eye in enumerate(eyes):
            radius = (eye["hi"][1] - eye["lo"][1]) / 2
            if any(isl is w for w in whites[e:e + 1]):
                tag = 1 + e
            elif is_shell(isl) and np.linalg.norm(mid - eye["mid"]) < radius * 0.6:
                tag = 1 + e  # the eye's outline
            elif not is_shell(isl) and all(in_palette(c[2]) and c[2][1] < EYE_WHITE_V for poly in isl for c in poly) \
                    and eye["lo"][1] <= mid[1] <= eye["hi"][1] and eye["lo"][2] <= mid[2] <= eye["hi"][2]:
                tag = 3 + e  # the pupil in front of it
        for poly in isl:
            tags[id(poly)] = tag
    pivot = np.array(pivot, dtype=float)
    info = [{"mid": [round(float(x), 2) for x in eye["mid"] - pivot], "half": [round(float((eye["hi"][i] - eye["lo"][i]) / 2), 2) for i in (1, 2)]} for eye in eyes]
    counts = [sum(1 for t in tags.values() if t == k) for k in range(5)]
    assert counts[3] > 0 and counts[4] > 0, f"pupils not found: {counts}"
    return tags, info


def centre(polys, axes=(0, 1, 2)):
    lo, hi = bbox(polys)
    return [(lo[i] + hi[i]) / 2 for i in axes]


# --- Texture -----------------------------------------------------------------------------------

def build_texture(pad=40):
    img = np.asarray(Image.open(SRC_PNG).convert("RGB"), dtype=np.float32)
    filled = ~np.all(np.abs(img - np.array(BACKGROUND, dtype=np.float32)) <= 6, axis=2)
    # Down to TEX_SIZE, averaging only painted pixels (an island's edge keeps its own colour).
    f = img.shape[0] // TEX_SIZE
    w = filled.astype(np.float32).reshape(TEX_SIZE, f, TEX_SIZE, f).sum(axis=(1, 3))
    acc = (img * filled[..., None]).reshape(TEX_SIZE, f, TEX_SIZE, f, 3).sum(axis=(1, 3))
    filled = w > 0
    col = np.where(filled[..., None], acc / np.maximum(w, 1)[..., None], 0)
    # Pad the islands: each empty pixel takes the mean of its painted neighbours, ring after ring,
    # so a mipmap of an island's edge never mixes in the background.
    for _ in range(pad):
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
    col[~filled] = np.array(BACKGROUND, dtype=np.float32)
    out = Image.fromarray(np.clip(col + 0.5, 0, 255).astype(np.uint8), "RGB")
    out.save(OUT / "zombies.png", optimize=True)
    return out


# --- Main --------------------------------------------------------------------------------------

def main():
    models = load_models(SRC_FBX)
    # The UV offset of each colour block from block B, measured on the torsos (same layout).
    def torso_uvs(prefix):
        parts = split_body(models[prefix + "_body"])
        return np.array([c[2] for poly in parts["torso"] for c in poly if not in_palette(c[2])])

    ref = torso_uvs("zombie2")  # block B
    blocks = {"B": (0.0, 0.0)}
    for prefix, _, blk in AUTHORED:
        if blk in blocks or prefix == BIG:
            continue
        d = torso_uvs(prefix) - ref
        assert d.std(axis=0).max() < 1e-4, f"{prefix}: torso UVs are not a shifted copy of block B"
        blocks[blk] = tuple(float(x) for x in d.mean(axis=0))
    # Block D only exists on the big zombie: measure it on the feet, which every body shares.
    def foot_uvs(prefix):
        parts = split_body(models[prefix + "_body"])
        return np.array([c[2] for poly in parts["foot_r"] for c in poly if not in_palette(c[2])])

    d = foot_uvs(BIG) - foot_uvs("zombie2")
    assert d.std(axis=0).max() < 1e-4
    blocks["D"] = tuple(float(x) for x in d.mean(axis=0))
    block_of = {prefix: blk for prefix, _, blk in AUTHORED}

    bodies = {}
    foot = None
    for body_name, prefix in (("normal", "zombie1"), ("big", BIG)):
        parts = split_body(models[prefix + "_body"])
        shift = blocks[block_of[prefix]]
        lo, hi = bbox(parts["torso"])
        neck = float(hi[2])  # heads sit on the top of the torso (its shell included)
        arm_boxes = {}
        for side in ("arm_r", "arm_l"):
            # The joint: in the middle of the arm's cross-section, level with the middle of the torso.
            box = max((isl for isl in islands(parts[side]) if not is_shell(isl)), key=len)
            _, cc, hh = centre(box)
            arm_boxes[side] = [0.0, float(cc), float(hh)]
        feet = {}
        for side in ("foot_r", "foot_l"):
            solid = [isl for isl in islands(parts[side]) if not is_shell(isl)][0]
            aa, cc, _ = centre(solid)
            feet[side] = [float(aa), float(cc), 0.0]
        bodies[body_name] = {
            "neck": round(neck, 2),
            "shoulders": [[round(x, 2) for x in arm_boxes["arm_l"]], [round(x, 2) for x in arm_boxes["arm_r"]]],
            "feet": [[round(x, 2) for x in feet["foot_l"]], [round(x, 2) for x in feet["foot_r"]]],
            "torso": encode(parts["torso"], (0, 0, 0), shift),
            "arm": encode(parts["arm_r"], arm_boxes["arm_r"], shift),
        }
        if foot is None:
            foot = encode(parts["foot_r"], feet["foot_r"], shift)
        print(f"body {body_name}: neck {neck:.1f}, shoulders {bodies[body_name]['shoulders']}, feet {bodies[body_name]['feet']}")
        for k in ("torso", "arm"):
            print(f"  {k}: {bodies[body_name][k]['n']} verts, {bodies[body_name][k]['tris']} tris, box {bodies[body_name][k]['box']}")
    print(f"  foot: {foot['n']} verts, {foot['tris']} tris, box {foot['box']}")

    heads = {}
    for prefix, head_id, blk in AUTHORED:
        body_name = "big" if prefix == BIG else "normal"
        polys = models[prefix + "_head"]
        pivot = (0, 0, bodies[body_name]["neck"])
        tags, eyes = eye_groups(polys, pivot)
        mesh = encode(polys, pivot, blocks[blk], tags)
        heads[head_id] = {"body": body_name, "mesh": mesh, "eyes": eyes}
        print(f"head {head_id} ({prefix}, {body_name} body): {mesh['n']} verts, {mesh['tris']} tris, box {mesh['box']}, eyes {eyes}")

    tex = build_texture()
    print(f"texture: {tex.size[0]} px -> {OUT / 'zombies.png'} ({(OUT / 'zombies.png').stat().st_size // 1024} KB)")

    def js(obj, indent=2, depth=0):
        """JSON with lists of numbers kept on one line."""
        pad = " " * (indent * (depth + 1)) if indent else ""
        end = " " * (indent * depth) if indent else ""
        nl = "\n" if indent else ""
        if isinstance(obj, dict):
            items = [f"{pad}{json.dumps(k)}: {js(v, indent, depth + 1)}" for k, v in obj.items()]
            return "{" + nl + ("," + nl if indent else ", ").join(items) + nl + end + "}"
        if isinstance(obj, list) and any(isinstance(x, (dict, list)) for x in obj):
            items = [f"{pad}{js(v, indent, depth + 1)}" for v in obj]
            return "[" + nl + ("," + nl if indent else ", ").join(items) + nl + end + "]"
        return json.dumps(obj)

    lines = [
        "// Generated by tools/zombies/build_zombies.py from tools/zombies/source/zombies.fbx: do not edit by hand.",
        "// Axes: a forward (where the zombie faces), c to its right, h up; the model's units (cm), ground at h = 0.",
        "// A mesh: n vertices; pos (base64 Int16 a, c, h in 1/8 units, relative to the mesh's pivot), nrm (Int8",
        "// unit normals * 127), uv (Uint16 u, v * 65535; v up, as in the FBX; given in colour block B), tri",
        "// (Uint16 corners, wound so (b - a) x (c - a) points along the normals). box: its bounds (lo, hi).",
        "",
        f"export const TEXTURE = 'zombies.png';",
        f"export const TEXTURE_SIZE = {TEX_SIZE};",
        f"export const POS_Q = {POS_Q};",
        "/** The texture's colour blocks: the UV offset of each from block B (top left). */",
        f"export const BLOCKS = {js({k: [round(v[0], 5), round(v[1], 5)] for k, v in sorted(blocks.items())}, None)};",
        "/** UVs inside this box (u0, v0, u1, v1) are the shared palette and stay put whatever the block. */",
        f"export const PALETTE = {js(list(PALETTE), None)};",
        "/** The bodies: torso (pivot: the ground under its middle), one arm (pivot: its shoulder joint), mounted",
        " *  at shoulders[left, right], the foot (FOOT) at feet[left, right], and where a head sits (neck height). */",
        f"export const BODIES = {js(bodies)};",
        "/** One foot (pivot: under its middle), shared by every body. */",
        f"export const FOOT = {js(foot)};",
        "/** The heads, each made for one body (pivot: that body's neck). mesh.grp tags the googly eyes per vertex (1, 2:",
        " *  the left and right eye's white and outline; 3, 4: the pupils); eyes: each eye's middle (a, c, h) and half-size (c, h). */",
        f"export const HEADS = {js(heads)};",
        "/** The six zombies as the artist made them: body, head and colour block. */",
        "export const AUTHORED = " + js([{"body": "big" if p == BIG else "normal", "head": h, "block": b} for p, h, b in AUTHORED], None) + ";",
        "",
    ]
    (OUT / "meshes.js").write_text("\n".join(lines))
    print(f"wrote {OUT / 'meshes.js'} ({(OUT / 'meshes.js').stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
