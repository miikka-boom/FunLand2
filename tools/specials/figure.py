"""A figure: parts that turn about their own joints, as the game's zombies do.

Each part is modeled in its own frame, its pivot (joint) at the origin, the zombies' way: an arm
points forward (+a) from its shoulder, so the game's arm pitch raises or lowers it; a head sits on
its neck; a leg (shin and foot) stands under its hip with its sole on the ground; the torso's
pivot is the ground under its middle. `at` is where the pivot sits in the body, and `pose` the
(yaw, pitch) the part is shown at in the figure's standing pose.
"""

import math

import numpy as np

import kit


class Part:
    def __init__(self, name, pieces, at=(0, 0, 0), pose=(0.0, 0.0)):
        self.name = name
        self.pieces = pieces
        self.at = np.asarray(at, dtype=float)
        self.pose = pose

    def rest_on_ground(self, lift=0.0):
        """Pitch the part (keeping its yaw) until its lowest point is `lift` above the ground: a fist
        or a hand resting on the ground in the standing pose."""

        def low(p):
            return min(float(pc.V[:, 2].min()) for pc in self.placed(self.pose[0], p))

        lo, hi = -math.pi / 2, 0.6  # pitched right down ... raised
        assert low(lo) < lift < low(hi), f"{self.name} can't reach the ground"
        for _ in range(40):
            mid = (lo + hi) / 2
            if low(mid) < lift:
                lo = mid
            else:
                hi = mid
        self.pose = (self.pose[0], round(hi, 4))
        return self

    def placed(self, yaw=None, pitch=None):
        """Its pieces in the body's frame, turned (yaw, then pitch, as the game's baker does)."""
        y = self.pose[0] if yaw is None else yaw
        p = self.pose[1] if pitch is None else pitch
        R = kit.rot_c(p) @ kit.rot_h(y)
        out = []
        for pc in self.pieces:
            q = pc.copy()
            q.rotate(R)
            q.move(self.at)
            out.append(q)
        return out


class Figure:
    def __init__(self, name, parts, eyes=None, notes=""):
        self.name = name
        self.parts = {p.name: p for p in parts}
        self.eyes = eyes or []  # the head's googly eyes: centre (a, c, h from the neck), radius
        self.notes = notes

    def pieces(self, pose=None):
        """Every piece in the body's frame; pose: {part: (yaw, pitch)} overrides."""
        out = []
        for name, part in self.parts.items():
            yp = (pose or {}).get(name)
            out += part.placed(*(yp or (None, None)))
        return out
