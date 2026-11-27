#!/usr/bin/env python3
"""Turn a prop's GLB (made with Scenario: a concept image, then image-to-3D) into the game's mesh
format, the same one the zombie models use (assets/zombies/meshes.js), so the baker in
src/render/zombie-bake.js can render it into sprites for the camera.

    python3 tools/props/build_props.py car tools/props/source/car.glb
    python3 tools/props/build_props.py newsbox tools/props/source/newsbox.glb --axis short --size 110
    python3 tools/props/build_props.py shelter tools/props/source/shelter.glb --axis short --size 640
    python3 tools/props/build_props.py lamp tools/props/source/lamp.glb --front x+ --pivot base --height 960
    python3 tools/props/build_props.py bench tools/props/source/bench.glb --axis short --size 500 --specks 100
    python3 tools/props/build_props.py fountain tools/props/source/fountain.glb --height 560

Writes assets/props/<name>.js (the mesh, base64) and assets/props/<name>.webp (its texture).

Axes as the zombies have them: a forward (the prop's front), c to its right, h up; model units
are a tenth of a world unit (zombie-art.js SCALE). Its forward axis is its longer side (a car)
or, with --axis short, its shorter one (a bus shelter faces across its length), or the GLB's
own axis given by --front (x+, x-, z+, z-: a street lamp's arm). It is scaled so its longer side
is --size model units (LENGTH by default), or so it is --height tall, and centred on the ground
under its middle, or with --pivot base under the middle of its foot (a lamp's pole). --specks N
drops loose pieces of fewer than N triangles (strays image-to-3D can leave).

Every triangle gets an outline shell: the same surface pushed out along its normals by SHELL
model units, wound inward and coloured from a black band added along the top of the texture.
The baker draws only what turns its winding toward the camera, so a shell's near side is culled
and its far side shows as a black rim round the prop: the hand-inked edge the zombies have.

Which end is the front: a car's cabin (its highest part) sits back from its middle, behind a
long hood, so the front is the end away from the cabin (a newspaper box's coin hood sits back the
same way). --flip turns it round if a model needs (check with a bake: tests/prop-art.test.js).
"""

import base64
import json
import struct
import sys
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

POS_Q = 8  # positions stored as Int16 in 1/8 model units (as the zombies)
LENGTH = 800  # model units nose to tail (80 world units)
SHELL = 7.0  # outline thickness, model units
BAND = 16  # rows of black added along the top of the texture, for the shells
TEX_MAX = 1024

COMPONENT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
COUNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_glb(path):
    data = Path(path).read_bytes()
    magic, _version, _length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67, "not a GLB"
    off = 12
    gltf = None
    binary = None
    while off < len(data):
        n, kind = struct.unpack_from("<II", data, off)
        chunk = data[off + 8 : off + 8 + n]
        if kind == 0x4E4F534A:
            gltf = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        off += 8 + n
    return gltf, binary


def accessor(gltf, binary, i):
    a = gltf["accessors"][i]
    bv = gltf["bufferViews"][a["bufferView"]]
    dt = COMPONENT[a["componentType"]]
    k = COUNT[a["type"]]
    start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride", 0)
    item = np.dtype(dt).itemsize * k
    if stride and stride != item:
        rows = [np.frombuffer(binary, dt, k, start + r * stride) for r in range(a["count"])]
        out = np.array(rows)
    else:
        out = np.frombuffer(binary, dt, a["count"] * k, start).reshape(a["count"], k) if k > 1 else np.frombuffer(binary, dt, a["count"], start)
    if a.get("normalized"):
        out = out.astype(np.float32) / np.iinfo(dt).max
    return np.array(out)


def node_matrix(node):
    if "matrix" in node:
        return np.array(node["matrix"], dtype=np.float64).reshape(4, 4).T
    t = np.array(node.get("translation", [0, 0, 0]), dtype=np.float64)
    q = np.array(node.get("rotation", [0, 0, 0, 1]), dtype=np.float64)
    s = np.array(node.get("scale", [1, 1, 1]), dtype=np.float64)
    x, y, z, w = q
    R = np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])
    M = np.eye(4)
    M[:3, :3] = R * s
    M[:3, 3] = t
    return M


def gather(gltf, binary):
    """Every primitive's positions, normals, UVs and triangles, in the scene's space, and the texture."""
    P, N, T, F = [], [], [], []
    texture = None
    base = 0

    def walk(ni, parent):
        nonlocal base, texture
        node = gltf["nodes"][ni]
        M = parent @ node_matrix(node)
        if "mesh" in node:
            for prim in gltf["meshes"][node["mesh"]]["primitives"]:
                at = prim["attributes"]
                pos = accessor(gltf, binary, at["POSITION"]).astype(np.float64)
                pos = (np.c_[pos, np.ones(len(pos))] @ M.T)[:, :3]
                if "NORMAL" in at:
                    nrm = accessor(gltf, binary, at["NORMAL"]).astype(np.float64) @ np.linalg.inv(M[:3, :3])
                else:
                    nrm = np.zeros_like(pos)
                uv = accessor(gltf, binary, at["TEXCOORD_0"]).astype(np.float64)
                idx = accessor(gltf, binary, prim["indices"]).astype(np.int64).reshape(-1, 3)
                P.append(pos)
                N.append(nrm)
                T.append(uv)
                F.append(idx + base)
                base += len(pos)
                if texture is None and "material" in prim:
                    mat = gltf["materials"][prim["material"]]
                    pbr = mat.get("pbrMetallicRoughness", {})
                    ti = pbr.get("baseColorTexture", {}).get("index")
                    if ti is not None:
                        img = gltf["images"][gltf["textures"][ti]["source"]]
                        bv = gltf["bufferViews"][img["bufferView"]]
                        raw = binary[bv.get("byteOffset", 0) : bv.get("byteOffset", 0) + bv["byteLength"]]
                        texture = Image.open(BytesIO(raw)).convert("RGB")
        for c in node.get("children", []):
            walk(c, M)

    scene = gltf["scenes"][gltf.get("scene", 0)]
    for ni in scene["nodes"]:
        walk(ni, np.eye(4))
    return np.vstack(P), np.vstack(N), np.vstack(T), np.vstack(F), texture


def smooth_normals(pos, tri):
    n = np.zeros_like(pos)
    a, b, c = pos[tri[:, 0]], pos[tri[:, 1]], pos[tri[:, 2]]
    fn = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(n, tri[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)


def drop_specks(pos, tri, smaller_than):
    """The triangles less any loose piece of fewer than smaller_than of them (image-to-3D strays)."""
    _, weld = np.unique(np.round(pos * 1e4).astype(np.int64), axis=0, return_inverse=True)
    weld = weld.ravel()
    parent = np.arange(weld.max() + 1)

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for t in tri:
        r0, r1, r2 = (find(weld[i]) for i in t)
        parent[r1] = r0
        parent[find(r2)] = r0
    roots = np.array([find(weld[t[0]]) for t in tri])
    ids, counts = np.unique(roots, return_counts=True)
    keep = np.isin(roots, ids[counts >= smaller_than])
    if not keep.all():
        print(f"dropped {int((~keep).sum())} triangles of loose specks")
    return tri[keep]


def b64(arr):
    return base64.b64encode(np.ascontiguousarray(arr).tobytes()).decode("ascii")


def build(name, src, flip=False, axis="long", size=LENGTH, front=None, pivot="middle", height=None, specks=0):
    gltf, binary = read_glb(src)
    pos, nrm, uv, tri, tex = gather(gltf, binary)
    assert tex is not None, "the GLB has no base colour texture"
    if specks:
        tri = drop_specks(pos, tri, specks)
    if not np.any(np.linalg.norm(nrm, axis=1) > 0.5):
        nrm = smooth_normals(pos, tri)
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)

    # glTF: y up. The long ground axis is the prop's length.
    ext = pos.max(axis=0) - pos.min(axis=0)
    along = 0 if ext[0] >= ext[2] else 2
    if axis == "short":
        along = 2 if along == 0 else 0
    if front:
        along = 0 if front[0] == "x" else 2
    across = 2 if along == 0 else 0
    h = pos[:, 1] - pos[:, 1].min()
    mid = (pos.max(axis=0) + pos.min(axis=0)) / 2
    if pivot == "base":
        # The middle of its foot (the lowest twelfth of it): a lamp's pole, not halfway out its arm.
        foot = h < h.max() / 12
        mid = (pos[foot].max(axis=0) + pos[foot].min(axis=0)) / 2
    a = pos[:, along] - mid[along]
    c = pos[:, across] - mid[across]
    na, nc, nh = nrm[:, along], nrm[:, across], nrm[:, 1]
    if front:
        if front[1] == "-":  # turned round (not mirrored)
            a, na, c, nc = -a, -na, -c, -nc
    else:
        # The front: away from the cabin (the top fifth of the prop).
        top = h > h.max() * 0.8
        if np.mean(a[top]) > 0:
            a, na = -a, -na
    if flip:
        a, na = -a, -na
    # c to the prop's right as it faces +a, h up: (a, c, h) must be right-handed like (x, z, y)
    # flipped... keep the winding: if the axis swap mirrored the mesh, mirror c back.
    M = np.array([[1 if along == 0 else 0, 0, 1 if along == 2 else 0], [1 if across == 0 else 0, 0, 1 if across == 2 else 0], [0, 1, 0]])
    mirrored = np.linalg.det(M) > 0  # (x, y, z) -> (a, c, h) with det +1 swaps handedness here
    s = height / h.max() if height else size / max(a.max() - a.min(), c.max() - c.min())
    P = np.c_[a, c, h] * s
    Nn = np.c_[na, nc, nh]
    if mirrored:
        P[:, 1] *= -1
        Nn[:, 1] *= -1
    # Winding so (b - a) x (c - a) points along the normals.
    A, B, C = P[tri[:, 0]], P[tri[:, 1]], P[tri[:, 2]]
    fn = np.cross(B - A, C - A)
    avg = Nn[tri[:, 0]] + Nn[tri[:, 1]] + Nn[tri[:, 2]]
    wrong = np.einsum("ij,ij->i", fn, avg) < 0
    tri = tri.copy()
    tri[wrong] = tri[wrong][:, [0, 2, 1]]

    # The texture, with a black band along its top for the shells; UVs moved to match (v up).
    tex.thumbnail((TEX_MAX, TEX_MAX), Image.LANCZOS)
    W, H = tex.size
    out_tex = Image.new("RGB", (W, H + BAND), (0, 0, 0))
    out_tex.paste(tex, (0, BAND))
    uv = uv.copy()
    uv[:, 1] = 1 - uv[:, 1]  # glTF v down -> v up
    uv[:, 1] = uv[:, 1] * H / (H + BAND)
    black_v = 1 - (BAND / 2) / (H + BAND)

    # Shells: the surface pushed out along its normals, wound inward, black.
    n = len(P)
    SP = P + Nn * SHELL
    SP[:, 2] = np.maximum(SP[:, 2], 0)
    allP = np.vstack([P, SP])
    allN = np.vstack([Nn, -Nn])
    allUV = np.vstack([uv, np.tile([0.5, black_v], (n, 1))])
    allT = np.vstack([tri, tri[:, [0, 2, 1]] + n])

    assert len(allP) < 65536, f"{len(allP)} vertices: too many for Uint16 corners"
    q = np.round(allP * POS_Q).astype("<i2")
    nq = np.round(allN * 127).astype("i1")
    uq = np.round(np.clip(allUV, 0, 1) * 65535).astype("<u2")
    lo = q.min(axis=0) / POS_Q
    hi = q.max(axis=0) / POS_Q
    mesh = {
        "n": len(allP),
        "pos": b64(q),
        "nrm": b64(nq),
        "uv": b64(uq),
        "tri": b64(allT.astype("<u2")),
        "box": [[round(float(x), 1) for x in lo], [round(float(x), 1) for x in hi]],
    }
    root = Path(__file__).resolve().parents[2]
    out = root / "assets" / "props"
    out.mkdir(parents=True, exist_ok=True)
    out_tex.save(out / f"{name}.webp", "WEBP", quality=90, method=6)
    lines = [
        f"// Generated by tools/props/build_props.py from tools/props/source/{Path(src).name}: do not edit by hand.",
        "// A prop for the baker (src/render/zombie-bake.js): axes a forward, c to its right, h up, model units",
        "// (a tenth of a world unit), ground at h = 0; with its outline shells. Format as assets/zombies/meshes.js.",
        f"export const {name.upper()}_TEXTURE = 'assets/props/{name}.webp';",
        f"export const {name.upper()} = {json.dumps(mesh)};",
    ]
    (out / f"{name}.js").write_text("\n".join(lines) + "\n")
    print(f"{name}: {len(P)} vertices, {len(tri)} triangles (+ shells), box {mesh['box']}, texture {W}x{H + BAND}")


if __name__ == "__main__":
    argv = sys.argv[1:]
    opt = lambda k, d: argv[argv.index(k) + 1] if k in argv else d
    valued = ("--axis", "--size", "--front", "--pivot", "--height", "--specks")
    args = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or argv[i - 1] not in valued)]
    height = opt("--height", None)
    build(
        args[0],
        args[1],
        flip="--flip" in argv,
        axis=opt("--axis", "long"),
        size=float(opt("--size", LENGTH)),
        front=opt("--front", None),
        pivot=opt("--pivot", "middle"),
        height=float(height) if height else None,
        specks=int(opt("--specks", 0)),
    )
