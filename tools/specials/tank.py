"""The Tank: a hulking brute, hunched over, its small googly-eyed head sunk between huge shoulders,
arms like tree trunks ending in fists the size of its head, short legs in torn shorts.

Parts (see figure.py): torso (chest, belly, the hump of its back, the shoulders and the shorts, with
the thighs), head, arm_l and arm_r (shoulder to fist, mirror images), leg_l and leg_r (shin and foot).
"""

import numpy as np

import kit
from figure import Figure, Part

LINE = 9.0  # outline thickness (the zombies' are 6 to 10)
SHOULDER = (10.0, 236.0, 446.0)  # the right shoulder joint (a, c, h); the left is its mirror
NECK = (180.0, 0.0, 368.0)  # where the head sits
HIP = (8.0, 92.0, 0.0)  # under the right leg


def torso():
    E = kit.sd_ellipsoid
    lean = kit.rot_c(-0.32)  # the whole upper body hunched forward
    upper = kit.smin(
        58,
        E((26, 0, 344), (128, 188, 128)),  # chest
        E((-62, 0, 470), (116, 164, 96)),  # the hump of the back (trapezius)
        E((6, 210, 436), (110, 106, 104)),  # shoulders (deltoids)
        E((6, -210, 436), (110, 106, 104)),
        E((-30, 140, 356), (100, 84, 124)),  # lats, widening the back
        E((-30, -140, 356), (100, 84, 124)),
    )
    # A hollow at the front between the shoulders, where the head sits.
    upper = kit.ssub(40, upper, E((150, 0, 452), (92, 96, 84)))
    upper = kit.rotated(upper, lean, about=(0, 0, 230))
    belly = kit.smin(
        40,
        E((40, 0, 284), (112, 130, 98)),  # belly
        E((4, 0, 200), (94, 116, 62)),  # hips (under the shorts)
        E((14, 86, 112), (62, 60, 74)),  # thighs
        E((14, -86, 112), (62, 60, 74)),
    )
    field = kit.smin(52, upper, belly)
    body = kit.sculpt(field, (20, 0, 300), (180, 270, 250), n=9, mats="tank_skin", name="torso", shell=LINE, crease=55)
    kit.relax(body, iters=3)
    # The shorts: a garment of their own over the hips and the tops of the thighs (its outline is the
    # waistband and the hems); torn along the hems in the paint.
    shorts = kit.smin(
        34,
        E((10, 0, 208), (116, 150, 72)),
        E((16, 90, 134), (80, 78, 70)),
        E((16, -90, 134), (80, 78, 70)),
    )
    shorts = kit.ssub(24, shorts, kit.sd_box((40, 0, 322), (240, 300, 64), 10))  # cut level at the waist
    s = kit.sculpt(shorts, (12, 0, 170), (130, 180, 90), n=8, mats="tank_shorts", name="shorts", shell=LINE, crease=60)
    kit.relax(s, iters=2)
    return [body, s]


def arm():
    """The right arm, pointing forward from its shoulder joint (the origin): upper arm, forearm, fist."""
    E = kit.sd_ellipsoid
    C = kit.sd_capsule
    limb = kit.smin(
        26,
        C((-40, 0, 0), (174, 0, -6), 84, 62),  # upper arm
        E((82, 0, 16), (92, 86, 92)),  # biceps
        C((174, 0, -6), (312, 0, -24), 64, 72),  # forearm
        E((248, 0, -10), (84, 100, 102)),  # the forearm's bulk
    )
    fist = kit.smin(
        18,
        kit.sd_box((396, 0, -30), (78, 92, 86), 40),
        E((466, -50, -40), (32, 32, 36)),  # knuckles
        E((474, -16, -38), (34, 32, 38)),
        E((474, 20, -38), (34, 32, 38)),
        E((466, 54, -40), (32, 32, 36)),
        E((410, -96, -2), (56, 36, 38)),  # the thumb, on the inside
    )
    field = kit.smin(22, limb, fist)
    a = kit.sculpt(field, (226, 0, -14), (296, 120, 120), n=10, mats="tank_arm", name="arm", shell=LINE, crease=55)
    kit.relax(a, iters=3)
    return [a]


def leg():
    """The right leg: a thick shin and a broad foot, its sole on the ground under the pivot."""
    E = kit.sd_ellipsoid
    field = kit.smin(
        30,
        kit.sd_capsule((0, 0, 172), (4, 0, 58), 62, 50),  # shin (its top goes up into the shorts)
        kit.sd_box((40, 0, 30), (84, 58, 30), 24),  # foot
        E((112, -30, 26), (26, 22, 22)),  # toes
        E((116, 4, 26), (26, 22, 22)),
        E((112, 36, 24), (24, 21, 20)),
    )
    p = kit.sculpt(field, (20, 0, 70), (100, 70, 120), n=7, mats="tank_leg", name="leg", shell=LINE, crease=55)
    kit.relax(p, iters=2)
    # A flat sole.
    p.V[:, 2] = np.maximum(p.V[:, 2], 0.0)
    return [p]


HEAD_SCALE = 1.18


def head():
    """The head, about its neck (the origin): a squat skull, a heavy brow, googly eyes, a small mouth."""
    E = kit.sd_ellipsoid
    skull = kit.smin(
        30,
        E((-4, 0, 100), (96, 106, 94)),  # the dome of the skull
        E((34, 0, 52), (80, 96, 54)),  # jaw and cheeks
        kit.sd_box((66, 0, 136), (34, 96, 24), 20),  # the brow ridge
    )
    s = kit.sculpt(skull, (10, 0, 92), (110, 120, 100), n=7, mats="tank_head", name="skull", shell=LINE, crease=50)
    kit.relax(s, iters=2)
    pieces = [s]
    eyes = []
    for side in (-1, 1):
        cen = (100.0, 46.0 * side, 96.0)
        w, p = kit.googly_eye(cen, 40, 36, (1, 0.05 * side, 0.08), f"eye{'L' if side < 0 else 'R'}", shell=7)
        pieces += [w, p]
        eyes.append({"mid": cen, "r": 40})
        # An angry brow over each eye: a black slab, low toward the middle.
        b = kit.chamfer_box((14, 44, 11), 5, mats="black", name="brow", shell=0)
        b.rotate(kit.rot_a(-0.42 * side))
        b.move((108, 50 * side, 146))
        pieces.append(b)
    m = kit.chamfer_box((10, 19, 13), 7, mats="black", name="mouth", shell=0)
    m.move((106, 5, 40))
    pieces.append(m)
    for pc in pieces:
        pc.scale(HEAD_SCALE)
    for e in eyes:
        e["mid"] = tuple(v * HEAD_SCALE for v in e["mid"])
        e["r"] *= HEAD_SCALE
    return pieces, eyes


def build():
    arm_r = arm()
    arm_l = [p.mirror() for p in arm_r]
    leg_r = leg()
    leg_l = [p.mirror() for p in leg_r]
    hp, eyes = head()
    sx, sc, sh = SHOULDER
    parts = [
        Part("torso", torso()),
        Part("head", hp, NECK),
        Part("arm_l", arm_l, (sx, -sc, sh), (-0.1, -1.2)),
        Part("arm_r", arm_r, (sx, sc, sh), (0.1, -1.2)),
        Part("leg_l", leg_l, (HIP[0], -HIP[1], 0)),
        Part("leg_r", leg_r, HIP),
    ]
    # The arms hang down and forward until the fists (the hands) rest on the ground.
    for p in parts:
        if p.name.startswith("arm"):
            p.rest_on_ground(2.0)
    return Figure("tank", parts, eyes)
