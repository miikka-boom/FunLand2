"""The specials as files to open anywhere: a binary FBX laid out the way the artist's zombies.fbx is
(Blender's FBX 7.4: Y up, centimetres, one Phong material with the texture as its diffuse colour),
and a GLB (glTF 2.0, metres, the texture inside).

Each part is an object of its own, its origin at its joint (the torso's at the ground under it), its
mesh as modeled (an arm pointing forward from the shoulder, as the zombies' arms do) and its object
rotation the pose the figure stands in; the other parts are children of the torso. Outline shells
are part of each mesh, coloured from the palette's black, faces turned inward, as on the zombies:
seen with back faces culled (the default in glTF), they draw the black rim.

The game's axes (a forward, c right, h up) go to the files' (x, y, z) = (-c, h, a): x to the
figure's left, y up, z forward, as on the zombies. That is a mirror, so polygons are written in
reverse order to keep them facing out.
"""

import math
import struct
import zlib

import numpy as np

# Game (a, c, h) -> file (x, y, z).
M = np.array([[0.0, -1.0, 0.0], [0.0, 0.0, 1.0], [1.0, 0.0, 0.0]])


def to_file(v):
    return np.asarray(v, dtype=float) @ M.T


def part_rotation(yaw, pitch):
    """A part's pose (the game's yaw, then pitch) as a rotation matrix in the files' axes."""
    import kit

    R = kit.rot_c(pitch) @ kit.rot_h(yaw)
    return M @ R @ M.T


def euler_xyz(R):
    """Degrees (x, y, z) with R = Rz Ry Rx (FBX's default rotation order)."""
    y = math.asin(max(-1.0, min(1.0, -R[2, 0])))
    if abs(math.cos(y)) > 1e-6:
        x = math.atan2(R[2, 1], R[2, 2])
        z = math.atan2(R[1, 0], R[0, 0])
    else:
        x = math.atan2(-R[1, 2], R[1, 1])
        z = 0.0
    return tuple(math.degrees(v) for v in (x, y, z))


def quaternion(R):
    """(x, y, z, w) of a rotation matrix."""
    t = R[0, 0] + R[1, 1] + R[2, 2]
    if t > 0:
        s = math.sqrt(t + 1.0) * 2
        w, x, y, z = 0.25 * s, (R[2, 1] - R[1, 2]) / s, (R[0, 2] - R[2, 0]) / s, (R[1, 0] - R[0, 1]) / s
    elif R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
        s = math.sqrt(1.0 + R[0, 0] - R[1, 1] - R[2, 2]) * 2
        w, x, y, z = (R[2, 1] - R[1, 2]) / s, 0.25 * s, (R[0, 1] + R[1, 0]) / s, (R[0, 2] + R[2, 0]) / s
    elif R[1, 1] > R[2, 2]:
        s = math.sqrt(1.0 + R[1, 1] - R[0, 0] - R[2, 2]) * 2
        w, x, y, z = (R[0, 2] - R[2, 0]) / s, (R[0, 1] + R[1, 0]) / s, 0.25 * s, (R[1, 2] + R[2, 1]) / s
    else:
        s = math.sqrt(1.0 + R[2, 2] - R[0, 0] - R[1, 1]) * 2
        w, x, y, z = (R[1, 0] - R[0, 1]) / s, (R[0, 2] + R[2, 0]) / s, (R[1, 2] + R[2, 1]) / s, 0.25 * s
    n = math.sqrt(x * x + y * y + z * z + w * w)
    return (x / n, y / n, z / n, w / n)


def polygons(pieces, uv_of):
    """A part's polygons in the files' axes (model units), each corner (position, normal, uv), facing out."""
    out = []
    for pc in pieces:
        V = to_file(pc.V)
        cn = pc.corner_normals()
        for fi, f in enumerate(pc.F):
            corners = [(V[v], to_file(cn[fi][j]), uv_of(pc, fi, j)) for j, v in enumerate(f)]
            out.append(corners[::-1])
    return out


# --- FBX (binary, 7.4) -----------------------------------------------------------------------------


class Node:
    def __init__(self, name, *props, children=None):
        self.name = name
        self.props = list(props)
        self.children = children or []

    def add(self, *nodes):
        self.children += nodes
        return self


class Arr:
    """A typed array property: code 'd' (float64), 'f', 'i' (int32), 'l' (int64), 'b' (bool)."""

    def __init__(self, code, values):
        self.code = code
        self.values = values


def _prop(p):
    if isinstance(p, Arr):
        fmt = {"d": "<f8", "f": "<f4", "i": "<i4", "l": "<i8", "b": "u1"}[p.code]
        raw = np.asarray(p.values).astype(fmt).tobytes()
        comp = zlib.compress(raw, 9) if len(raw) > 128 else None
        if comp is not None and len(comp) < len(raw):
            return p.code.encode() + struct.pack("<III", len(p.values), 1, len(comp)) + comp
        return p.code.encode() + struct.pack("<III", len(p.values), 0, len(raw)) + raw
    if isinstance(p, bool):
        return b"C" + struct.pack("<?", p)
    if isinstance(p, int):
        if -(2 ** 31) <= p < 2 ** 31:
            return b"I" + struct.pack("<i", p)
        return b"L" + struct.pack("<q", p)
    if isinstance(p, Long):
        return b"L" + struct.pack("<q", p.v)
    if isinstance(p, float):
        return b"D" + struct.pack("<d", p)
    if isinstance(p, bytes):
        return b"R" + struct.pack("<I", len(p)) + p
    if isinstance(p, str):
        b = p.encode("utf-8")
        return b"S" + struct.pack("<I", len(b)) + b
    raise TypeError(p)


class Long:
    """An int64 property even when it is small (object ids)."""

    def __init__(self, v):
        self.v = int(v)


SENTINEL = b"\0" * 13


def _node_bytes(node, offset):
    props = b"".join(_prop(p) for p in node.props)
    name = node.name.encode("ascii")
    head_len = 12 + 1 + len(name)
    body = bytearray()
    pos = offset + head_len + len(props)
    for c in node.children:
        cb = _node_bytes(c, pos)
        body += cb
        pos += len(cb)
    if node.children or not node.props:
        body += SENTINEL
    end = offset + head_len + len(props) + len(body)
    return struct.pack("<III", end, len(node.props), len(props)) + bytes([len(name)]) + name + props + bytes(body)


FOOT_ID = bytes.fromhex("fabcab09d0c8d466b176fb831cf7267e")
FOOT_MAGIC = bytes.fromhex("f85a8c6adef5d97eece90ce3758f290b")
FILE_ID = bytes.fromhex("28b32aebb624ccc2bfc8b02aa92bfcf1")  # Blender writes this one, always
VERSION = 7400


def write_fbx_nodes(path, top):
    out = bytearray(b"Kaydara FBX Binary  \x00\x1a\x00" + struct.pack("<I", VERSION))
    for n in top:
        out += _node_bytes(n, len(out))
    out += SENTINEL
    out += FOOT_ID + b"\0" * 4
    pad = ((len(out) + 15) & ~15) - len(out)
    out += b"\0" * (pad or 16)
    out += struct.pack("<I", VERSION) + b"\0" * 120 + FOOT_MAGIC
    with open(path, "wb") as f:
        f.write(out)


def P70(*ps):
    return Node("Properties70", children=[Node("P", *p) for p in ps])


def write_fbx(path, fig, uv_of, texture_file, creator="FunLand2 tools/specials (Blender FBX 7.4 layout)"):
    """One figure: a model per part (the torso the parent of the rest), one material, its texture."""
    ids = iter(range(1_000_001, 10_000_000, 7919))
    nid = lambda: next(ids)  # noqa: E731
    objects = Node("Objects")
    conns = Node("Connections")
    mat_id, tex_id, vid_id = nid(), nid(), nid()
    models = {}
    n_models = 0
    for name, part in fig.parts.items():
        polys = polygons(part.all, uv_of)
        verts = []
        vindex = {}
        pvi = []
        normals = []
        uvs = []
        uvindex = {}
        uvi = []
        for poly in polys:
            for j, (p, n, uv) in enumerate(poly):
                k = tuple(np.round(p, 4))
                if k not in vindex:
                    vindex[k] = len(verts)
                    verts.append(p)
                i = vindex[k]
                pvi.append(~i if j == len(poly) - 1 else i)
                normals.append(n)
                ku = (round(uv[0], 6), round(uv[1], 6))
                if ku not in uvindex:
                    uvindex[ku] = len(uvs)
                    uvs.append(ku)
                uvi.append(uvindex[ku])
        gid, mid = nid(), nid()
        geom = Node("Geometry", Long(gid), f"{fig.name}_{name}\x00\x01Geometry", "Mesh").add(
            Node("Properties70"),
            Node("GeometryVersion", 124),
            Node("Vertices", Arr("d", np.array(verts).ravel())),
            Node("PolygonVertexIndex", Arr("i", pvi)),
            Node("LayerElementNormal", 0).add(
                Node("Version", 101), Node("Name", ""), Node("MappingInformationType", "ByPolygonVertex"),
                Node("ReferenceInformationType", "Direct"), Node("Normals", Arr("d", np.array(normals).ravel()))),
            Node("LayerElementUV", 0).add(
                Node("Version", 101), Node("Name", "UVMap"), Node("MappingInformationType", "ByPolygonVertex"),
                Node("ReferenceInformationType", "IndexToDirect"), Node("UV", Arr("d", np.array(uvs).ravel())),
                Node("UVIndex", Arr("i", uvi))),
            Node("LayerElementMaterial", 0).add(
                Node("Version", 101), Node("Name", ""), Node("MappingInformationType", "AllSame"),
                Node("ReferenceInformationType", "IndexToDirect"), Node("Materials", Arr("i", [0]))),
            Node("Layer", 0).add(
                Node("Version", 100),
                Node("LayerElement").add(Node("Type", "LayerElementNormal"), Node("TypedIndex", 0)),
                Node("LayerElement").add(Node("Type", "LayerElementUV"), Node("TypedIndex", 0)),
                Node("LayerElement").add(Node("Type", "LayerElementMaterial"), Node("TypedIndex", 0))),
        )
        t = to_file(part.at)
        rx, ry, rz = euler_xyz(part_rotation(*part.pose))
        model = Node("Model", Long(mid), f"{fig.name}_{name}\x00\x01Model", "Mesh").add(
            Node("Version", 232),
            P70(("Lcl Translation", "Lcl Translation", "", "A", *map(float, t)),
                ("Lcl Rotation", "Lcl Rotation", "", "A", float(rx), float(ry), float(rz)),
                ("Lcl Scaling", "Lcl Scaling", "", "A", 1.0, 1.0, 1.0),
                ("DefaultAttributeIndex", "int", "Integer", "", 0),
                ("InheritType", "enum", "", "", 1)),
            Node("MultiLayer", 0), Node("MultiTake", 0), Node("Shading", True), Node("Culling", "CullingOff"),
        )
        objects.add(geom, model)
        models[name] = mid
        n_models += 1
        conns.add(Node("C", "OO", Long(gid), Long(mid)))
        conns.add(Node("C", "OO", Long(mat_id), Long(mid)))
    for name, mid in models.items():
        parent = 0 if name == "torso" else models["torso"]
        conns.add(Node("C", "OO", Long(mid), Long(parent)))
    objects.add(
        Node("Material", Long(mat_id), f"{fig.name}\x00\x01Material", "").add(
            Node("Version", 102), Node("ShadingModel", "Phong"), Node("MultiLayer", 0),
            P70(("DiffuseColor", "Color", "", "A", 0.8, 0.8, 0.8), ("EmissiveColor", "Color", "", "A", 1.0, 1.0, 1.0),
                ("EmissiveFactor", "Number", "", "A", 0.0), ("AmbientColor", "Color", "", "A", 0.05, 0.05, 0.05),
                ("AmbientFactor", "Number", "", "A", 0.0), ("BumpFactor", "double", "Number", "", 0.0),
                ("SpecularColor", "Color", "", "A", 0.8, 0.8, 0.8), ("SpecularFactor", "Number", "", "A", 0.0),
                ("Shininess", "Number", "", "A", 2.0), ("ShininessExponent", "Number", "", "A", 2.0),
                ("ReflectionColor", "Color", "", "A", 0.8, 0.8, 0.8), ("ReflectionFactor", "Number", "", "A", 0.0))),
        Node("Texture", Long(tex_id), "base_color_texture\x00\x01Texture", "").add(
            Node("Type", "TextureVideoClip"), Node("Version", 202), Node("TextureName", "base_color_texture\x00\x01Texture"),
            Node("Media", f"{texture_file}\x00\x01Video"), Node("FileName", texture_file), Node("RelativeFilename", texture_file),
            P70(("UseMaterial", "bool", "", "", 1))),
        Node("Video", Long(vid_id), f"{texture_file}\x00\x01Video", "Clip").add(
            Node("Type", "Clip"), P70(("Path", "KString", "Url", "", texture_file)), Node("UseMipMap", 0),
            Node("Filename", texture_file), Node("RelativeFilename", texture_file)),
    )
    conns.add(Node("C", "OP", Long(tex_id), Long(mat_id), "DiffuseColor"))
    conns.add(Node("C", "OO", Long(vid_id), Long(tex_id)))

    header = Node("FBXHeaderExtension").add(
        Node("FBXHeaderVersion", 1003), Node("FBXVersion", VERSION), Node("EncryptionType", 0),
        Node("CreationTimeStamp").add(Node("Version", 1000), Node("Year", 2026), Node("Month", 1), Node("Day", 1),
                                      Node("Hour", 0), Node("Minute", 0), Node("Second", 0), Node("Millisecond", 0)),
        Node("Creator", creator),
        Node("SceneInfo", "GlobalInfo\x00\x01SceneInfo", "UserData").add(
            Node("Type", "UserData"), Node("Version", 100),
            Node("MetaData").add(Node("Version", 100), Node("Title", fig.name), Node("Subject", ""), Node("Author", ""),
                                 Node("Keywords", ""), Node("Revision", ""), Node("Comment", "")),
            P70(("DocumentUrl", "KString", "Url", "", f"/{fig.name}.fbx"), ("SrcDocumentUrl", "KString", "Url", "", f"/{fig.name}.fbx"),
                ("Original", "Compound", "", ""), ("Original|ApplicationVendor", "KString", "", "", "FunLand2"),
                ("Original|ApplicationName", "KString", "", "", "tools/specials"),
                ("Original|ApplicationVersion", "KString", "", "", "1"),
                ("Original|DateTime_GMT", "DateTime", "", "", "01/01/1970 00:00:00.000"),
                ("Original|FileName", "KString", "", "", f"/{fig.name}.fbx"),
                ("LastSaved", "Compound", "", ""), ("LastSaved|ApplicationVendor", "KString", "", "", "FunLand2"),
                ("LastSaved|ApplicationName", "KString", "", "", "tools/specials"),
                ("LastSaved|ApplicationVersion", "KString", "", "", "1"),
                ("LastSaved|DateTime_GMT", "DateTime", "", "", "01/01/1970 00:00:00.000"))),
    )
    settings = Node("GlobalSettings").add(
        Node("Version", 1000),
        P70(("UpAxis", "int", "Integer", "", 1), ("UpAxisSign", "int", "Integer", "", 1),
            ("FrontAxis", "int", "Integer", "", 2), ("FrontAxisSign", "int", "Integer", "", 1),
            ("CoordAxis", "int", "Integer", "", 0), ("CoordAxisSign", "int", "Integer", "", 1),
            ("OriginalUpAxis", "int", "Integer", "", -1), ("OriginalUpAxisSign", "int", "Integer", "", 1),
            ("UnitScaleFactor", "double", "Number", "", 1.0), ("OriginalUnitScaleFactor", "double", "Number", "", 1.0),
            ("AmbientColor", "ColorRGB", "Color", "", 0.0, 0.0, 0.0), ("DefaultCamera", "KString", "", "", "Producer Perspective"),
            ("TimeMode", "enum", "", "", 11), ("TimeSpanStart", "KTime", "Time", "", Long(0)),
            ("TimeSpanStop", "KTime", "Time", "", Long(46186158000)), ("CustomFrameRate", "double", "Number", "", 24.0)),
    )
    definitions = Node("Definitions").add(
        Node("Version", 100), Node("Count", 1 + 2 * n_models + 3),
        Node("ObjectType", "GlobalSettings").add(Node("Count", 1)),
        Node("ObjectType", "Geometry").add(Node("Count", n_models)),
        Node("ObjectType", "Model").add(Node("Count", n_models)),
        Node("ObjectType", "Material").add(Node("Count", 1)),
        Node("ObjectType", "Texture").add(Node("Count", 1)),
        Node("ObjectType", "Video").add(Node("Count", 1)),
    )
    top = [
        header,
        Node("FileId", FILE_ID),
        Node("CreationTime", "1970-01-01 10:00:00:000"),
        Node("Creator", creator),
        settings,
        Node("Documents").add(Node("Count", 1), Node("Document", Long(nid()), "Scene", "Scene").add(
            P70(("SourceObject", "object", "", ""), ("ActiveAnimStackName", "KString", "", "", "")), Node("RootNode", Long(0)))),
        Node("References"),
        definitions,
        objects,
        conns,
        Node("Takes").add(Node("Current", "")),
    ]
    write_fbx_nodes(path, top)


# --- GLB (glTF 2.0) ----------------------------------------------------------------------------------


def write_glb(path, fig, uv_of, png_bytes, unit=0.01):
    """One figure as a GLB: a node per part (children of the torso), one mesh each, the texture inside."""
    import json

    bin_ = bytearray()
    views = []
    accessors = []

    def add_view(data, target=None):
        while len(bin_) % 4:
            bin_.append(0)
        off = len(bin_)
        bin_.extend(data)
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target:
            v["target"] = target
        views.append(v)
        return len(views) - 1

    def add_accessor(arr, ctype, kind, target, minmax=False):
        view = add_view(arr.tobytes(), target)
        acc = {"bufferView": view, "componentType": ctype, "count": int(arr.shape[0]), "type": kind}
        if minmax:
            acc["min"] = [float(x) for x in arr.min(axis=0)]
            acc["max"] = [float(x) for x in arr.max(axis=0)]
        accessors.append(acc)
        return len(accessors) - 1

    meshes = []
    nodes = []
    names = list(fig.parts)
    for name in names:
        part = fig.parts[name]
        polys = polygons(part.all, uv_of)
        index = {}
        pos, nrm, tex, idx = [], [], [], []
        for poly in polys:
            ids = []
            for p, n, uv in poly:
                k = (tuple(np.round(p, 3)), tuple(np.round(n, 4)), (round(uv[0], 6), round(uv[1], 6)))
                if k not in index:
                    index[k] = len(pos)
                    pos.append(p * unit)
                    nrm.append(n / max(np.linalg.norm(n), 1e-9))
                    tex.append((uv[0], 1 - uv[1]))  # glTF's v runs down the image
                ids.append(index[k])
            for j in range(1, len(ids) - 1):
                idx += [ids[0], ids[j], ids[j + 1]]
        P = np.array(pos, dtype="<f4")
        prim = {
            "attributes": {
                "POSITION": add_accessor(P, 5126, "VEC3", 34962, True),
                "NORMAL": add_accessor(np.array(nrm, dtype="<f4"), 5126, "VEC3", 34962),
                "TEXCOORD_0": add_accessor(np.array(tex, dtype="<f4"), 5126, "VEC2", 34962),
            },
            "indices": add_accessor(np.array(idx, dtype="<u4" if len(pos) > 65535 else "<u2"), 5125 if len(pos) > 65535 else 5123, "SCALAR", 34963),
            "material": 0,
        }
        meshes.append({"name": f"{fig.name}_{name}", "primitives": [prim]})
        node = {"name": f"{fig.name}_{name}", "mesh": len(meshes) - 1}
        t = to_file(part.at) * unit
        if np.any(np.abs(t) > 1e-9):
            node["translation"] = [float(x) for x in t]
        q = quaternion(part_rotation(*part.pose))
        if abs(q[3]) < 0.999999:
            node["rotation"] = [float(x) for x in q]
        nodes.append(node)
    torso = names.index("torso")
    nodes[torso]["children"] = [i for i in range(len(names)) if i != torso]
    img_view = add_view(png_bytes)
    while len(bin_) % 4:  # the BIN chunk is padded to 4 bytes; let the buffer say so too
        bin_.append(0)
    gltf = {
        "asset": {"version": "2.0", "generator": "FunLand2 tools/specials"},
        "scene": 0,
        "scenes": [{"name": fig.name, "nodes": [torso]}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": [{
            "name": fig.name,
            "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0.0, "roughnessFactor": 1.0},
        }],
        "textures": [{"sampler": 0, "source": 0}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
        "images": [{"bufferView": img_view, "mimeType": "image/png", "name": f"{fig.name}.png"}],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(bin_)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    while len(bin_) % 4:
        bin_.append(0)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_))
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    out += struct.pack("<II", len(bin_), 0x004E4942) + bytes(bin_)
    with open(path, "wb") as f:
        f.write(out)
