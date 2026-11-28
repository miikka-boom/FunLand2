"""The special infected in the game's mesh format (the same as assets/zombies/meshes.js).

A mesh: n vertices; pos (base64 Int16 a, c, h in 1/8 units, relative to the part's pivot), nrm (Int8
unit normals * 127), uv (Uint16 u, v * 65535, v up), tri (Uint16 corners, wound so (b - a) x (c - a)
points along the normals: outward for skin, inward for outline shells), and for a head grp (Uint8
per vertex: 1, 2 the left and right eye's white and outline; 3, 4 their pupils), so the game's
baker (src/render/zombie-bake.js) can draw them exactly as it draws the horde.
"""

import base64
import json

import numpy as np

POS_Q = 8


def b64(arr):
    return base64.b64encode(np.ascontiguousarray(arr).tobytes()).decode("ascii")


def eye_tag(name):
    """grp tag of a head piece by its name: eyeL_white(_line) 1, eyeR_white(_line) 2, eyeL_pupil 3, eyeR_pupil 4."""
    for side, k in (("eyeL", 0), ("eyeR", 1)):
        if name.startswith(side + "_white"):
            return 1 + k
        if name.startswith(side + "_pupil"):
            return 3 + k
    return 0


def encode(pieces, uv_of, eyes=False):
    """
    pieces: closed pieces (and their outline shells) in the part's frame, pivot at the origin.
    uv_of(piece, face, corner) -> (u, v).
    """
    index = {}
    pos, nrm, uvs, tri, grp = [], [], [], [], []
    for pc in pieces:
        cn = pc.corner_normals()
        g = eye_tag(pc.name) if eyes else 0
        for fi, f in enumerate(pc.F):
            ids = []
            for j, v in enumerate(f):
                q = tuple(int(round(x)) for x in pc.V[v] * POS_Q)
                n = cn[fi][j]
                qn = tuple(int(max(-127, min(127, round(x * 127)))) for x in n)
                u, vv = uv_of(pc, fi, j)
                qt = (int(max(0, min(65535, round(u * 65535)))), int(max(0, min(65535, round(vv * 65535)))))
                k = q + qn + qt + (g,)
                if k not in index:
                    index[k] = len(pos)
                    pos.append(q)
                    nrm.append(qn)
                    uvs.append(qt)
                    grp.append(g)
                ids.append(index[k])
            navg = np.sum(cn[fi], axis=0)
            for j in range(1, len(ids) - 1):
                a, b, c = ids[0], ids[j], ids[j + 1]
                pa, pb, pc_ = (np.array(pos[x], dtype=float) for x in (a, b, c))
                if np.dot(np.cross(pb - pa, pc_ - pa), navg) < 0:
                    b, c = c, b
                if len({a, b, c}) == 3:
                    tri += [a, b, c]
    assert len(pos) < 65536
    P = np.array(pos)
    out = {
        "n": len(pos),
        "tris": len(tri) // 3,
        "box": [round(float(x), 1) for x in (*(P.min(axis=0) / POS_Q), *(P.max(axis=0) / POS_Q))],
        "pos": b64(np.array(pos, dtype="<i2")),
        "nrm": b64(np.array(nrm, dtype="i1")),
        "uv": b64(np.array(uvs, dtype="<u2")),
        "tri": b64(np.array(tri, dtype="<u2")),
    }
    if eyes:
        out["grp"] = b64(np.array(grp, dtype="u1"))
    return out


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
