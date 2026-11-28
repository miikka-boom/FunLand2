"""The Hunter: a wiry infected in a torn hoodie, the hood up, crouched low on all fours, ready to
pounce; big googly eyes in the shadow of the hood, long arms with clawed hands.

Parts (see figure.py): torso (the hoodie's body, hunched forward, with the thighs bent under it),
head (hood and face), arm_l and arm_r (sleeve, hand and claws, mirror images), leg_l and leg_r (shin
and shoe).
"""

import numpy as np

import kit
from figure import Figure, Part

LINE = 7.5  # outline thickness
SHOULDER = (58.0, 84.0, 218.0)  # the right shoulder joint; the left is its mirror
NECK = (92.0, 0.0, 214.0)  # where the head sits
HIP = (-18.0, 50.0, 136.0)  # the right hip joint (the thigh starts here)
KNEE = (66.0, 74.0, 108.0)  # the right knee
FOOT = (40.0, 66.0, 0.0)  # under the right shoe


def torso():
    E = kit.sd_ellipsoid
    body = kit.smin(
        40,
        E((24, 0, 192), (80, 90, 72)),  # chest, hunched forward
        E((-34, 0, 152), (70, 80, 62)),  # the small of the back and hips
        E((52, 76, 212), (50, 46, 46)),  # shoulders
        E((52, -76, 212), (50, 46, 46)),
        E((-10, 0, 214), (70, 64, 50)),  # the hood's fold over the upper back
    )
    body = kit.rotated(body, kit.rot_c(-0.16), about=(0, 0, 170))
    t = kit.sculpt(body, (6, 0, 186), (120, 120, 100), n=8, mats="hunter_hoodie", name="hoodie", shell=LINE, crease=55)
    kit.relax(t, iters=2)
    pieces = [t]
    # The thighs, in trousers: from the hip forward and down to the knee.
    for side in (1, -1):
        hx, hc, hh = HIP
        kx, kc, kh = KNEE
        th = kit.tube([(hx - 14, hc * side, hh + 6), ((hx + kx) / 2, (hc + kc) / 2 * side, (hh + kh) / 2 + 4), (kx + 6, kc * side, kh)],
                      [42, 40, 34], sides=8, mats="hunter_pants", name="thigh", shell=LINE, crease=50)
        pieces.append(th)
    return pieces


def leg():
    """The right leg: from the knee down to a shoe, its sole on the ground under the pivot (FOOT)."""
    fx, fc, _ = FOOT
    kx, kc, kh = KNEE
    knee = (kx - fx, kc - fc, kh)
    shin = kit.tube([(knee[0] + 6, knee[1], knee[2] + 10), (knee[0] - 12, knee[1] - 3, knee[2] - 34), (-6, knee[1] - 6, 46), (-10, 0, 30)],
                    [32, 33, 28, 24], sides=8, mats="hunter_pants", name="shin", shell=LINE, crease=50)
    shoe = kit.chamfer_box((52, 30, 20), 11, mats="hunter_shoe", name="shoe", shell=LINE, n=(2, 1, 1))
    shoe.deform(lambda V: V + np.stack([np.zeros(len(V)), np.zeros(len(V)), np.where(V[:, 0] > 20, -(V[:, 0] - 20) * 0.12 * (V[:, 2] > 0), 0)], axis=1))
    shoe.move((8, 0, 20))
    return [shin, shoe]


def arm():
    """The right arm, pointing forward from its shoulder (the origin): a long sleeve, a bony hand, claws."""
    # A baggy sleeve, the elbow a little bent.
    sleeve = kit.tube([(-24, 0, 4), (40, 0, 4), (106, 0, -2), (160, 0, -24), (200, 0, -42)],
                      [40, 38, (34, 36), (29, 30), (31, 32)], sides=8, mats="hunter_hoodie", name="sleeve", shell=LINE, crease=50)
    # The hand: bent up a little at the wrist (so it lies on the ground when the arm reaches down), and
    # four long fingers that curl down into claws, the thumb on the inside.
    wrist = kit.rot_c(0.15)
    palm = kit.chamfer_box((30, 28, 11), 8, mats="hunter_skin", name="hand", shell=6.0, n=(1, 1, 1))
    palm.move((26, 0, 0))
    pieces = [palm]
    for i, (dc, ln) in enumerate(((-18, 70), (-6, 82), (7, 80), (19, 66))):
        k = ln / 80
        f = kit.tube([(48, dc, 0), (48 + 34 * k, dc * 1.15, 2), (48 + 62 * k, dc * 1.25, -10), (48 + 76 * k, dc * 1.3, -26)],
                     [7.5, 6.5, 5, 3.5], sides=5, mats="hunter_claw", name="finger", caps=("flat", "point"), shell=4.5, crease=50)
        pieces.append(f)
    thumb = kit.tube([(20, -22, -2), (40, -38, -4), (58, -44, -14)], [7, 6, 4], sides=5, mats="hunter_claw", name="thumb", caps=("flat", "point"), shell=4.5)
    pieces.append(thumb)
    for p in pieces:
        p.rotate(wrist)
        p.move((198, 0, -44))
    return [sleeve] + pieces


def head():
    """Hood and face about the neck (the origin): the hood up, peaked, its opening framing the face."""
    E = kit.sd_ellipsoid
    hood = kit.smin(
        30,
        E((0, 0, 94), (110, 108, 100)),
        kit.rotated(E((-60, 0, 150), (58, 46, 36)), kit.rot_c(0.5), about=(-60, 0, 150)),  # the peak, flopping back
        E((-40, 0, 40), (70, 84, 58)),  # down the back of the neck
    )
    hood = kit.ssub(16, hood, E((122, 0, 86), (66, 80, 86)))  # the opening
    h = kit.sculpt(hood, (-10, 0, 100), (130, 120, 120), n=8, mats="hunter_hood", name="hood", shell=LINE, crease=60)
    kit.relax(h, iters=2)
    face = kit.superquadric((66, 70, 80), 2.4, n=4, mats="hunter_face", name="face", shell=LINE, crease=60, centre=(48, 0, 84))
    pieces = [h, face]
    eyes = []
    for side in (-1, 1):
        cen = (108.0, 38.0 * side, 96.0)
        w, p = kit.googly_eye(cen, 36, 34, (1, 0.04 * side, 0.02), f"eye{'L' if side < 0 else 'R'}", shell=6.5)
        pieces += [w, p]
        eyes.append({"mid": cen, "r": 36})
    m = kit.chamfer_box((8, 20, 9), 5, mats="black", name="mouth", shell=0)
    m.move((110, -4, 40))
    pieces.append(m)
    return pieces, eyes


def build():
    arm_r = arm()
    arm_l = [p.mirror() for p in arm_r]
    leg_r = leg()
    leg_l = [p.mirror() for p in leg_r]
    hp, eyes = head()
    sx, sc, sh = SHOULDER
    fx, fc, _ = FOOT
    parts = [
        Part("torso", torso()),
        Part("head", hp, NECK, (0.0, -0.12)),
        Part("arm_l", arm_l, (sx, -sc, sh), (-0.2, -0.98)),
        Part("arm_r", arm_r, (sx, sc, sh), (0.2, -0.98)),
        Part("leg_l", leg_l, (fx, -fc, 0)),
        Part("leg_r", leg_r, (fx, fc, 0)),
    ]
    # The arms hang down and forward until the fists (the hands) rest on the ground.
    for p in parts:
        if p.name.startswith("arm"):
            p.rest_on_ground(1.0)
    return Figure("hunter", parts, eyes)
