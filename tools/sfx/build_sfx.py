#!/usr/bin/env python3
"""Build the zombie game's sound effects from the sound libraries in AudioPacks/.

AudioPacks/ holds the purchased libraries (about 1.2 GB of 96 kHz WAV) and is not in git. This
script takes only the sounds the game uses, trims and levels them, and writes small web files:

  assets/sfx/sfx-mono.mp3     one-shots and loops that are placed in the world (mono, end to end)
  assets/sfx/sfx-stereo.mp3   the player's guns and the explosions (stereo)
  assets/sfx/amb-*.mp3        ambience beds (stereo loops), one file per bed
  assets/sfx/bank.js          where every sound sits in those files (generated: do not edit)

Each file starts with a short sync blip at a known time; the game measures where the browser's
MP3 decoder put it and shifts every offset by the difference, so decoders that keep the encoder
delay (Safari) and ones that trim it (Chrome, Firefox) line up the same.

Run it with a Python that has numpy, scipy and soundfile (libsndfile 1.1 or newer, for MP3):
    <python> tools/sfx/build_sfx.py            build everything
    <python> tools/sfx/build_sfx.py --check    only check that every source file is there

The PICKS section below is the whole sound list: change a pick there and run the script again.
"""

import hashlib
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, resample_poly, sosfilt

ROOT = Path(__file__).resolve().parents[2]
PACKS = ROOT / "AudioPacks"
OUT = ROOT / "assets" / "sfx"
SR = 44100

ZOMB = PACKS / "344 Audio - Zombie Specimens Vol. 2" / "344 Audio - Zombie Specimens Vol. 2" / "Sound Effects"
GUNS = PACKS / "Gamemaster-Audio-Guns-Bullets-and-Explosions-24bit-96Khz" / "Gamemaster Audio - Guns, Bullets and Explosions - 24bit 96Khz"
FOLEY = PACKS / "Gamemaster-Audio-Footstep-and-Foley-Sounds-24bit-96Khz" / "Gamemaster Audio - Footstep and Foley Sounds - 24bit 96Khz"
GORE = PACKS / "Gore_SFX_Pack" / "Gore_SFX_Pack"


# --- Source files --------------------------------------------------------------------------------

def Z(code):
    """344 Audio, Zombie Specimens Vol. 2: 'S2-15' is Test Subject 2, take 15."""
    s, n = code[1:].split("-")
    folder = ZOMB / f"Test Subject {s}"
    for p in sorted(folder.glob("*.wav")):
        m = re.search(rf"Subject {s}\s+0*(\d+)_344", p.name)
        if m and int(m.group(1)) == int(n):
            return p
    raise FileNotFoundError(f"zombie take {code} in {folder}")


def _find(base, subs, stem):
    for sub in subs:
        p = base / sub / f"{stem}.wav"
        if p.exists():
            return p
    raise FileNotFoundError(f"{stem}.wav under {base}")


def G(stem):
    """Gamemaster Audio, Guns, Bullets and Explosions (and its bonus sounds)."""
    return _find(GUNS, ("Guns", "Bullets", "Explosions", "ProSoundCollection_BonusSounds"), stem)


def F(stem):
    """Gamemaster Audio, Footstep and Foley Sounds (and its bonus sounds)."""
    return _find(FOLEY, ("Footsteps", "Foley", "ProSoundCollection_BonusSounds"), stem)


def V(desc):
    """Gore SFX Pack (VADI): 'Splat, Bloody Flesh Impact' -> 'Gore, Splat, Bloody Flesh Impact, VADI.wav'."""
    p = GORE / f"Gore, {desc}, VADI.wav"
    if not p.exists():
        raise FileNotFoundError(p.name)
    return p


def nums(fmt, *ns):
    return [fmt.format(n) for n in ns]


# --- PICKS ---------------------------------------------------------------------------------------
# S(id, sources, **opts): a one-shot with one variant per source.
#   ch      1 = mono (placed in the world), 2 = stereo
#   max     longest it may be after the onset (s); fade: fade-out at the end (s)
#   start   skip this much of the source first (s)
#   hp, lp  high / low pass (Hz); excite: add upper harmonics of the lows (0..1) so phone speakers carry it
#   loud    level the loudest 50 ms of every variant to this (dBFS); link: use the gain of another sound
#   rev     play it backwards (a breath out becomes a breath in)
#   bank    "lo": goes in the 22 kHz file (voices and rumbles with nothing up high), which the game
#           decodes at 22 kHz to use half the memory
# L(id, source, seconds, **opts): a seamless loop (crossfaded), in a sprite or its own file (file=...).
# Loudness and the mix between sounds is set in src/audio.js; here every variant is levelled alike.

SOUNDS = []
LOOPS = []


def S(id, sources, **opts):
    SOUNDS.append({"id": id, "src": sources, **opts})


def L(id, source, seconds, **opts):
    LOOPS.append({"id": id, "src": source, "seconds": seconds, **opts})


# The player's guns (stereo). Automatic guns are a first shot, short bodies and one tail that rings
# out after the last shot (the way the library is built: see its 'How to setup automatic guns' PDF).
S("smg.first", [G("gun_submachine_auto_shot_00_first_01")], ch=2, max=0.2, fade=0.01, link="smg.shot")
S("smg.shot", [G(n) for n in nums("gun_submachine_auto_shot_{:02d}", 1, 2, 3, 4, 5, 6, 7, 8, 9)], ch=2, max=0.2, fade=0.01, loud=-12)
S("smg.tail", [G("gun_submachine_auto_shot_00_tail_only_01")], ch=2, max=1.6, fade=0.6, link="smg.shot")
S("rifle.first", [G("gun_semi_auto_rifle_shot_00_first_01")], ch=2, max=0.2, fade=0.01, link="rifle.shot")
S("rifle.shot", [G(n) for n in nums("gun_semi_auto_rifle_shot_{:02d}", 1, 2, 3, 4, 5, 6, 7, 8)], ch=2, max=0.2, fade=0.01, loud=-12)
S("rifle.tail", [G("gun_semi_auto_rifle_shot_00_tail_only_01")], ch=2, max=2.0, fade=0.8, link="rifle.shot")
S("shotgun.shot", [G(n) for n in nums("gun_shotgun_shot_{:02d}", 1, 3, 4)], ch=2, max=1.8, fade=0.7, loud=-10)
S("hunting.shot", [G(n) for n in nums("gun_rifle_sniper_shot_{:02d}", 1, 2, 4)], ch=2, max=1.6, fade=0.6, loud=-10)
S("explosion", [G(n) for n in nums("explosion_large_{:02d}", 3, 10)], ch=2, max=2.6, fade=1.0, hp=45, excite=0.5, loud=-10)
S("explosion.small", [G("explosion_small_no_tail_01"), G("explosion_small_no_tail_04")], ch=2, max=0.85, fade=0.3, hp=45, excite=0.5, loud=-10)

# Gun handling (mono).
S("smg.magout", [G("gun_submachine_auto_magazine_unload_01"), G("gun_submachine_auto_magazine_unload_02")], max=0.45)
S("smg.magin", [G("gun_submachine_auto_magazine_load_02"), G("gun_submachine_auto_magazine_load_03")], max=0.4)
S("smg.cock", [G("gun_submachine_auto_cock_01"), G("gun_submachine_auto_cock_04")], max=0.5)
S("rifle.magout", [G("gun_semi_auto_rifle_magazine_unload_01"), G("gun_semi_auto_rifle_magazine_unload_04")], max=0.5)
S("rifle.magin", [G("gun_semi_auto_rifle_magazine_load_02"), G("gun_semi_auto_rifle_magazine_load_04")], max=0.55)
S("rifle.cock", [G("gun_semi_auto_rifle_cock_02"), G("gun_semi_auto_rifle_cock_05")], max=0.65)
S("hunting.magout", [G("gun_rifle_magazine_unload_01"), G("gun_rifle_magazine_unload_04")], max=0.5)
S("hunting.magin", [G("gun_rifle_magazine_load_01"), G("gun_rifle_magazine_load_02")], max=0.4)
S("hunting.cock", [G("gun_rifle_sniper_cock_01"), G("gun_rifle_sniper_cock_04")], max=0.8)
S("shotgun.shell", [G(n) for n in nums("gun_shotgun_load_bullet_{:02d}", 2, 4, 6, 8)], max=0.5, fade=0.08)
S("shotgun.pump", [G(n) for n in nums("gun_shotgun_cock_{:02d}", 2, 4, 5)], max=0.55)
S("gun.dry", [G("gun_submachine_auto_dry_fire_02"), G("gun_rifle_dry_fire_02"), G("gun_shotgun_dry_fire_01")], max=0.2)
S("swap.smg", [G("gun_submachine_auto_cock_02")], max=0.4)
S("swap.rifle", [G("gun_rifle_grab_pickup_01")], max=0.4)
S("swap.shotgun", [G("gun_shotgun_pickup_02")], max=0.5)
S("swap.hunting", [G("gun_rifle_sniper_cock_02")], max=0.8)

# Bullet impacts (mono).
S("imp.flesh", [G(n) for n in nums("bullet_impact_body_flesh_{:02d}", 1, 2, 3, 5, 7, 8)], max=0.45, fade=0.15)
S("imp.thump", [G(n) for n in nums("bullet_impact_body_thump_{:02d}", 1, 3, 5)], max=0.45, fade=0.15, excite=0.3)
S("imp.concrete", [G(n) for n in nums("bullet_impact_concrete_brick_{:02d}", 1, 3, 5, 7, 8)], max=0.35, fade=0.1)
S("imp.metal", [G(n) for n in nums("bullet_impact_metal_heavy_{:02d}", 1, 3, 4, 6, 8)], max=0.6, fade=0.3)
S("imp.metallight", [G(n) for n in nums("bullet_impact_metal_light_{:02d}", 2, 4, 7)], max=0.6, fade=0.3)
S("imp.wood", [G("bullet_impact_wood_heavy_02"), G("bullet_impact_wood_heavy_04"), G("bullet_impact_wood_heavy_06"), G("bullet_impact_wood_light_04")], max=0.4, fade=0.12, excite=0.3)
S("imp.dirt", [G(n) for n in nums("bullet_impact_dirt_{:02d}", 3, 5, 8)], max=0.35, fade=0.1)
S("imp.rock", [G(n) for n in nums("bullet_impact_rock_{:02d}", 1, 2, 7)], max=0.35, fade=0.1)
S("imp.glass", [G("bullet_impact_glass_03"), G("bullet_impact_glass_07")], max=0.6, fade=0.2)
S("debris", [G(n) for n in nums("stones_gravel_small_dirt_movement_{:02d}", 1, 2, 4)], max=0.35, fade=0.1)

# Gore and bodies (mono).
S("gore.splat", [V("Splat, Bloody Flesh Impact"), V("Squish, Squirting Blood, Orange 01"), V("Squish, Squirting Blood, Orange 03"), V("Splat, Bloody Flesh, Orange"), V("Stab, Slicing Flesh, Fast")], max=0.55, fade=0.2)
S("gore.bone", [V("Bone, Break And Snap 01"), V("Bone, Stab And Break 02"), V("Bone, Ripping Apart Joints"), F("bone_break_neck_snap_crack_02"), F("bone_break_neck_snap_crack_04")], max=0.5, fade=0.15)
S("gore.slash", [V("Stab, Slicing Flesh With Sword"), V("Stab, Slicing Flesh, Fast")], max=0.5, fade=0.15)
S("gore.squish", [V("Squish, Squeezing Bloody Organs"), V("Ooze, Bloody Suction 02")], max=0.7, fade=0.25)
S("body.punch", [G(n) for n in nums("punch_general_body_impact_{:02d}", 1, 3, 7, 8)], max=0.35, fade=0.12, hp=35, excite=0.5)
S("body.wet", [G(n) for n in nums("punch_grit_wet_impact_{:02d}", 6, 7, 8)], max=0.4, fade=0.15, hp=35, excite=0.3)
S("body.fall", [F("footstep_dirt_land_v2_01"), F("footstep_dirt_land_v2_03"), F("footstep_dirt_land_v2_05"), F("footstep_concrete_land_v2_02")], max=0.45, fade=0.15, excite=0.4)
S("whoosh", [G(n) for n in nums("whoosh_swish_high_fast_{:02d}", 1, 2, 3, 4)], max=0.25, fade=0.05, hp=90, excite=0.3)

# Footsteps (mono), by surface; the player runs most of the time.
S("step.concrete.run", [F(n) for n in nums("footstep_concrete_run_{:02d}", 1, 4, 7, 10, 13, 16, 19)], max=0.3, fade=0.06)
S("step.concrete.walk", [F(n) for n in nums("footstep_concrete_walk_{:02d}", 2, 6, 10, 14, 18)], max=0.3, fade=0.06)
S("step.grass.run", [F(n) for n in nums("footstep_grass_run_{:02d}", 1, 3, 5, 7, 9)], max=0.32, fade=0.08)
S("step.grass.walk", [F(n) for n in nums("footstep_grass_walk_{:02d}", 1, 4, 7, 10)], max=0.38, fade=0.08)
S("step.gravel.run", [F(n) for n in nums("footstep_gravel_run_{:02d}", 1, 4, 7, 10, 13)], max=0.32, fade=0.08)
S("step.gravel.walk", [F(n) for n in nums("footstep_gravel_walk_{:02d}", 2, 6, 10, 14)], max=0.4, fade=0.08)
S("step.dirt", [F(n) for n in nums("footstep_dirt_walk_run_{:02d}", 1, 3, 5, 7, 9, 11)], max=0.28, fade=0.06)
S("step.wood.run", [F(n) for n in nums("footstep_wood_run_{:02d}", 1, 4, 7, 10, 13)], max=0.25, fade=0.06, excite=0.5)
S("step.wood.walk", [F(n) for n in nums("footstep_wood_walk_{:02d}", 2, 6, 10, 14)], max=0.28, fade=0.06, excite=0.5)
S("step.metal", [F(n) for n in nums("footstep_metal_high_run_{:02d}", 1, 5, 9, 13)], max=0.32, fade=0.08, excite=0.4)
S("step.heavy", [F("footstep_concrete_land_v2_01"), F("footstep_concrete_land_v2_04"), F("footstep_dirt_land_v2_02")], max=0.5, fade=0.2, excite=0.6)
S("step.land", [F("footstep_dirt_land_02"), F("footstep_dirt_land_05")], max=0.3, fade=0.08)

# Foley, props, the world (mono).
S("foley.cloth", [F(n) for n in nums("foley_cloth_light_fast_movement_{:02d}", 3, 6, 9, 13, 14)], max=0.35, fade=0.1)
S("foley.rattle", [F(n) for n in nums("foley_soldier_gear_equipment_rattle_movement_light_{:02d}", 1, 4, 7)], max=0.45, fade=0.15)
S("foley.grab", [F(n) for n in nums("foley_soldier_gear_equipment_movement_grab_item_{:02d}", 1, 3, 6)], max=0.45, fade=0.12)
S("foley.bag", [F("foley_sports_bag_grab_pickup_catch_02"), F("foley_sports_bag_grab_pickup_catch_03")], max=0.5, fade=0.15)
S("foley.zip", [F("foley_zip_zipper_short_02"), F("foley_zip_zipper_short_05")], max=0.45, fade=0.08)
S("foley.search", [F("foley_soldier_gear_equipment_movement_search_bag_01"), F("foley_sports_bag_movements_02"), F("foley_sports_bag_movements_05")], max=0.9, fade=0.25)
S("metal.lid", [G("metal_lid_movement_impact_08"), G("metal_lid_movement_impact_10"), F("metal_lid_movement_impact_09")], max=0.8, fade=0.25)
S("metal.clank", [G(n) for n in nums("metal_impact_light_{:02d}", 6, 7, 8)], max=0.6, fade=0.25)
S("door.slam", [G("metal_door_hatch_close_slam_02")], max=1.8, fade=0.6, excite=0.5)
S("door.lock", [G("door_lock_slide_02")], max=0.6, fade=0.1)
S("door.creak", [G("door_A_creak_03"), G("door_hatch_squeak_open_01")], max=0.9, fade=0.25)
S("switch", [G("door_lock_open_02")], max=0.35, fade=0.05)
S("zap", [G("taser_stun_gun_zap_electricity_02"), G("taser_stun_gun_zap_electricity_04")], max=0.3, fade=0.05)
S("wood.creak", [G(n) for n in nums("wood_tree_branch_move_{:02d}", 1, 4, 5, 12)], max=1.0, fade=0.3)
S("fire.whoomp", [G("gas_large_flame_ignite_02"), F("gas_large_flame_ignite_01")], max=0.6, fade=0.2, hp=40, excite=0.5)
S("fire.ignite", [G("fire_start_light_flame_ignite_01")], max=0.7, fade=0.2, excite=0.3)
S("flare.sparks", [G("lighter_gas_sparks_flame_02")], max=0.95, fade=0.3)
S("radio", [G(n) for n in nums("radio_tv_electronic_static_{:02d}", 3, 4, 5)], max=0.8, fade=0.15)
S("thunder", [G("thunder_lightning_strike_rumble_01")], max=5.0, fade=2.0, hp=32, excite=0.3, loud=-14, bank="lo")
S("rumble", [G("cinematic_deep_low_whoosh_impact_05")], max=3.0, fade=1.2, hp=32, excite=0.5, bank="lo")
S("riser", [G("cinematic_buildup_reverse_whoosh_01")], max=1.8, fade=0.02, hp=60, excite=0.4)
S("crow", [G("bird_med_songbird_magpie_crow_call_chirp_04")], max=2.7, fade=0.3)
S("ui.click", [G("ui_menu_button_click_22"), G("ui_menu_button_click_24")], max=0.3, fade=0.05)

# The common infected (mono, 344 Audio Zombie Specimens).
S("z.groan", [Z(c) for c in ("S1-01", "S1-02", "S1-03", "S1-06", "S1-07", "S1-09", "S1-11", "S3-03")], max=2.1, fade=0.35, bank="lo")
S("z.snarl", [Z(c) for c in ("S2-15", "S2-16", "S2-18", "S2-20", "S4-04", "S4-06", "S4-10", "S6-08")], max=1.3, fade=0.25, bank="lo")
S("z.attack", [Z(c) for c in ("S2-10", "S2-13", "S4-03", "S7-5", "S7-6", "S3-12")], max=0.85, fade=0.2, bank="lo")
S("z.death", [Z(c) for c in ("S1-08", "S3-01", "S3-13", "S3-14", "S3-11")], max=1.1, fade=0.3, bank="lo")
S("z.scream", [Z(c) for c in ("S2-21", "S6-05", "S6-09", "S1-12")], max=2.0, fade=0.5, bank="lo")

# The special infected (mono).
S("hunter.growl", [Z(c) for c in ("S6-02", "S6-03", "S7-2")], max=1.2, fade=0.3, bank="lo")
S("hunter.screech", [Z(c) for c in ("S5-06", "S5-07", "S5-10")], max=1.0, fade=0.3, bank="lo")
S("hunter.pounce", [Z(c) for c in ("S5-08", "S5-01")], max=0.9, fade=0.2, bank="lo")
S("hunter.die", [Z(c) for c in ("S5-03", "S5-04")], max=1.0, fade=0.3, bank="lo")
S("tank.roar", [Z(c) for c in ("S8-2", "S8-4", "S8-5")], max=2.4, fade=0.7, excite=0.3, bank="lo")
S("tank.grunt", [Z(c) for c in ("S8-1", "S8-3")], max=1.0, fade=0.3, excite=0.3, bank="lo")
S("tank.die", [Z("S8-6")], max=3.2, fade=1.0, excite=0.3, bank="lo")
S("terror.whisper", [Z(c) for c in ("S2-02", "S2-03", "S2-05")], max=1.2, fade=0.3, bank="lo")
S("terror.inhale", [Z(c) for c in ("S2-03", "S2-07")], max=0.9, fade=0.25, rev=True, bank="lo")
S("terror.shriek", [Z(c) for c in ("S5-12", "S5-14", "S5-16")], max=1.1, fade=0.35, bank="lo")
S("terror.die", [Z("S5-13")], max=2.2, fade=0.9, bank="lo")
S("witch.growl", [Z(c) for c in ("S2-09", "S2-11", "S2-12")], max=1.2, fade=0.3, bank="lo")
S("witch.scream", [Z(c) for c in ("S5-15", "S5-05")], max=2.3, fade=0.7, bank="lo")
S("witch.die", [Z("S5-17")], max=2.2, fade=0.9, bank="lo")

# Loops placed in the world (mono, in the mono sprite).
L("loop.fire", G("fire_burning_flames_crackle_loop_02"), 6.0, xfade=1.0, rms=-20)
L("loop.generator", G("engine_generator_loop_02"), 5.0, xfade=0.8, rms=-20, excite=0.4, bank="lo")
L("loop.engine", G("engine_generator_loop_01"), 5.0, xfade=0.8, rms=-20, excite=0.4, bank="lo")
L("loop.flare", G("gas_leak_01_loop"), 2.5, xfade=0.4, rms=-22, lp=9000)
L("loop.horde", "gen:horde", 10.0, rms=-20, bank="lo")
L("loop.feet", "gen:feet", 5.0, rms=-20, bank="lo")

# Ambience beds (stereo, one file each).
L("amb.wind", G("wind_cold_howling_haunted_loop_02"), 15.0, xfade=1.5, ch=2, file="amb-wind", rms=-22, rate=22050)
L("amb.night", G("swamp_night_frogs_crickets_insects_loop_01"), 13.5, xfade=1.0, ch=2, file="amb-night", rms=-24, rate=22050)
L("amb.water", G("river_stream_flowing_water_loop_07_long_version"), 16.0, xfade=1.5, ch=2, file="amb-water", rms=-24, lp=2400, rate=22050)
L("amb.room", F("sci-fi_spaceship_background_room_tone_hum_loop_01"), 9.5, xfade=1.0, ch=2, file="amb-room", rms=-24, start=0.3, excite=0.4, rate=22050)

# Generated loops: a crowd of the infected (their voices; their feet running), mixed in a ring so
# the loop has no seam. Gains in dB, pitch as a playback-rate factor.
GEN = {
    "horde": {
        "src": [Z(c) for c in ("S1-01", "S1-03", "S1-06", "S1-09", "S2-15", "S2-16", "S2-18", "S2-20", "S3-03", "S3-05",
                                "S4-04", "S4-06", "S4-10", "S6-04", "S6-05", "S6-08", "S6-09", "S7-1", "S7-3", "S7-7")],
        "count": 42, "gain": (-14, 0), "pitch": (0.86, 1.14), "max": 2.4, "lp": 7000,
    },
    "feet": {
        "src": [F(n) for n in nums("footstep_dirt_walk_run_{:02d}", 2, 4, 6, 8, 10, 12)]
        + [F(n) for n in nums("footstep_concrete_run_{:02d}", 2, 5, 8, 11, 14, 17, 20)]
        + [F(n) for n in nums("footstep_gravel_run_{:02d}", 2, 5, 8, 11)],
        "count": 84, "gain": (-16, 0), "pitch": (0.85, 1.12), "max": 0.3, "lp": 6000,
    },
}


# --- DSP -----------------------------------------------------------------------------------------

def load(path, ch):
    x, sr = sf.read(str(path), dtype="float64", always_2d=True)
    if ch == 1:
        x = x.mean(axis=1, keepdims=True)
    elif x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    else:
        x = x[:, :2]
    if sr != SR:
        g = math.gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g, axis=0)
    return x


def filt(x, kind, f, order=2):
    sos = butter(order, f, kind, fs=SR, output="sos")
    return sosfilt(sos, x, axis=0)


def excite(x, amount, f=140.0):
    """Psychoacoustic bass: saturate the lows into harmonics a phone speaker can play."""
    if amount <= 0:
        return x
    lo = filt(x, "low", f, 4)
    peak = np.max(np.abs(lo)) + 1e-12
    h = np.tanh(lo / peak * 3.0)
    h = filt(filt(h, "high", f * 1.4, 2), "low", 1600, 2)
    rl = np.sqrt(np.mean(lo ** 2)) + 1e-12
    rh = np.sqrt(np.mean(h ** 2)) + 1e-12
    return x + h * (amount * rl / rh)


def env_db(x, hop):
    frames = len(x) // hop
    if frames < 1:
        return np.array([-120.0])
    p = (x[: frames * hop] ** 2).mean(axis=1).reshape(frames, hop).mean(axis=1)
    return 10 * np.log10(p + 1e-14)


def trim(x, maxlen, fade, start=0.0, on_db=-40, off_db=-52, pre=0.003):
    x = x[int(start * SR):]
    hop = int(0.005 * SR)
    e = env_db(x, hop)
    top = e.max()
    on = int(np.argmax(e > top + on_db)) * hop
    on = max(0, on - int(pre * SR))
    loud = np.where(e > top + off_db)[0]
    off = (int(loud[-1]) + 1) * hop if len(loud) else len(x)
    y = x[on:off].copy()
    if maxlen:
        y = y[: int(maxlen * SR)]
    fi = min(len(y), int(0.0015 * SR))
    if fi > 1 and on > 0:
        y[:fi] *= np.linspace(0, 1, fi)[:, None]
    fo = min(len(y), int(fade * SR))
    if fo > 1:
        y[-fo:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fo)))[:, None]
    return y


def short_term_db(x, win=0.05):
    w = max(1, int(win * SR))
    p = (x ** 2).mean(axis=1)
    if len(p) <= w:
        return 10 * np.log10(p.mean() + 1e-14)
    c = np.concatenate([[0.0], np.cumsum(p)])
    return 10 * np.log10(((c[w:] - c[:-w]) / w).max() + 1e-14)


CEIL = 10 ** (-1.0 / 20)  # -1 dBFS


def level_gain(x, target):
    g = 10 ** ((target - short_term_db(x)) / 20)
    pk = np.max(np.abs(x)) * g
    if pk > CEIL:
        g *= CEIL / pk
    return g


def rms_gain(x, target):
    r = 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
    g = 10 ** ((target - r) / 20)
    pk = np.max(np.abs(x)) * g
    if pk > CEIL:
        g *= CEIL / pk
    return g


def make_loop(x, seconds, xfade):
    n = int(seconds * SR)
    xf = int(xfade * SR)
    if len(x) < n + xf:
        raise ValueError(f"source too short for a {seconds} s loop with {xfade} s crossfade")
    body = x[:n].copy()
    t = np.linspace(0, 1, xf)[:, None]
    body[:xf] = x[:xf] * np.sin(t * np.pi / 2) + x[n:n + xf] * np.cos(t * np.pi / 2)
    return body


def ring_mix(seconds, ch, events):
    n = int(seconds * SR)
    out = np.zeros((n, ch))
    for clip, pos, gain in events:
        idx = (np.arange(len(clip)) + int(pos * SR)) % n
        np.add.at(out, idx, clip * gain)
    return out


def generate(name, seconds):
    g = GEN[name]
    rng = np.random.default_rng(9)
    clips = [trim(load(p, 1), g["max"], 0.15) for p in g["src"]]
    clips = [c * level_gain(c, -16) for c in clips]
    events = []
    for i in range(g["count"]):
        c = clips[i % len(clips)] if i < len(clips) else clips[rng.integers(len(clips))]
        r = rng.uniform(*g["pitch"])
        c2 = resample_poly(c, 1000, int(round(1000 * r)), axis=0)  # r > 1: higher and shorter
        events.append((c2, rng.uniform(0, seconds), 10 ** (rng.uniform(*g["gain"]) / 20)))
    y = ring_mix(seconds, 1, events)
    return filt(y, "low", g["lp"], 2)


# --- Sprites -------------------------------------------------------------------------------------

GAP = 0.05  # silence between sounds in a sprite (s): more than an MP3 frame
PAD = 0.15  # copy of the loop's other end on each side of a loop (s)


class Sprite:
    """Sounds end to end in one file, at `rate` (everything is made at SR and resampled on the way in)."""

    def __init__(self, name, ch, rate=SR):
        self.name = name
        self.ch = ch
        self.rate = rate
        self.parts = []
        self.n = 0
        self._silence(0.05)
        k = int(0.003 * rate)
        blip = np.sin(2 * np.pi * 3000 * np.arange(k) / rate) * np.hanning(k) * 0.3
        self.marker = round((self.n + k // 2) / rate, 6)  # where the blip peaks
        self._add(np.repeat(blip[:, None], ch, axis=1))
        self._silence(0.3)

    def _add(self, y):
        self.parts.append(y)
        self.n += len(y)

    def _silence(self, s):
        self._add(np.zeros((int(s * self.rate), self.ch)))

    def _rate(self, y, ring=False):
        if self.rate == SR:
            return y
        g = math.gcd(self.rate, SR)
        if not ring:
            return resample_poly(y, self.rate // g, SR // g, axis=0)
        # A loop: resample it as a ring (wrapped on both sides), so the seam stays seamless.
        k = 2048
        z = resample_poly(np.concatenate([y[-k:], y, y[:k]]), self.rate // g, SR // g, axis=0)
        m = k * self.rate // SR
        return z[m: m + len(y) * self.rate // SR]

    def add(self, y):
        y = self._rate(y)
        t0 = self.n / self.rate
        self._add(y)
        self._silence(GAP)
        return [round(t0, 5), round(len(y) / self.rate, 5)]

    def add_loop(self, body):
        body = self._rate(body, ring=True)
        p = int(PAD * self.rate)
        t0 = self.n / self.rate
        self._add(np.concatenate([body[-p:], body, body[:p]]))
        self._silence(GAP)
        return {"a": round(t0 + PAD, 5), "b": round(t0 + PAD + len(body) / self.rate, 5)}

    def write(self, quality):
        y = np.concatenate(self.parts).astype(np.float32)
        path = OUT / f"{self.name}.mp3"
        with sf.SoundFile(str(path), "w", self.rate, self.ch, format="MP3", subtype="MPEG_LAYER_III",
                          compression_level=quality, bitrate_mode="VARIABLE") as f:
            for i in range(0, len(y), 1 << 16):
                f.write(y[i: i + (1 << 16)])
        # The hash goes on the URL, so a browser never pairs a cached old file with a new bank.js.
        digest = hashlib.sha1(path.read_bytes()).hexdigest()[:10]
        info = {"file": path.name, "hash": digest, "marker": self.marker, "seconds": round(len(y) / self.rate, 3)}
        if self.rate != SR:
            info["rate"] = self.rate  # decode at this rate (half the memory of 44.1/48 kHz)
        return info, path.stat().st_size


# --- Build ---------------------------------------------------------------------------------------

def check():
    missing = 0
    for s in SOUNDS:
        for p in s["src"]:
            if not Path(p).exists():
                print("missing:", p)
                missing += 1
    for lp in LOOPS:
        if not str(lp["src"]).startswith("gen:") and not Path(lp["src"]).exists():
            print("missing:", lp["src"])
            missing += 1
    for g in GEN.values():
        for p in g["src"]:
            if not Path(p).exists():
                print("missing:", p)
                missing += 1
    print(f"{len(SOUNDS)} sounds, {len(LOOPS)} loops: {'all sources found' if not missing else f'{missing} missing'}")
    return missing == 0


def process(s, p):
    ch = s.get("ch", 1)
    x = load(p, ch)
    if s.get("hp"):
        x = filt(x, "high", s["hp"])
    if s.get("lp"):
        x = filt(x, "low", s["lp"])
    x = excite(x, s.get("excite", 0))
    if s.get("rev"):
        y = trim(x, None, 0.0, s.get("start", 0))[::-1].copy()
        n = min(len(y), int(s.get("max", 2) * SR))
        y = y[-n:]  # keep the end (the original onset), where the breath peaks
        fi = min(len(y), int(0.25 * len(y)))
        y[:fi] *= np.linspace(0, 1, fi)[:, None]
        fo = min(len(y), int(0.012 * SR))
        y[-fo:] *= np.linspace(1, 0, fo)[:, None]
        return y
    return trim(x, s.get("max", 2.0), s.get("fade", 0.05), s.get("start", 0))


def build():
    if not check():
        sys.exit(1)
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.mp3"):
        old.unlink()
    sprites = {"mono": Sprite("sfx-mono", 1), "lo": Sprite("sfx-lo", 1, 22050), "stereo": Sprite("sfx-stereo", 2)}
    sounds = {}
    gains = {}
    rendered = {}
    # Unlinked sounds first, so linked ones can borrow their gain.
    order = [s for s in SOUNDS if not s.get("link")] + [s for s in SOUNDS if s.get("link")]
    for s in order:
        ys = [process(s, p) for p in s["src"]]
        if s.get("link"):
            g = gains[s["link"]]
            ys = [y * g for y in ys]
            ys = [y * min(1.0, CEIL / (np.max(np.abs(y)) + 1e-12)) for y in ys]
        else:
            gs = [level_gain(y, s.get("loud", -16)) for y in ys]
            gains[s["id"]] = float(np.median(gs))
            ys = [y * g for y, g in zip(ys, gs)]
        rendered[s["id"]] = ys
    for s in SOUNDS:  # back in list order, so the files read in the order above
        key = "stereo" if s.get("ch", 1) == 2 else s.get("bank", "mono")
        sounds[s["id"]] = {"s": key, "v": [sprites[key].add(y) for y in rendered[s["id"]]]}
    loops = {}
    files = []
    for lp in LOOPS:
        ch = lp.get("ch", 1)
        if str(lp["src"]).startswith("gen:"):
            body = generate(str(lp["src"])[4:], lp["seconds"])
        else:
            x = load(lp["src"], ch)[int(lp.get("start", 0) * SR):]
            if lp.get("lp"):
                x = filt(x, "low", lp["lp"])
            x = excite(x, lp.get("excite", 0))
            body = make_loop(x, lp["seconds"], lp.get("xfade", 1.0))
        body = body * rms_gain(body, lp.get("rms", -20))
        if lp.get("file"):
            key = lp["file"]
            sprites[key] = Sprite(key, ch, lp.get("rate", SR))
        else:
            key = lp.get("bank", "mono")
        loops[lp["id"]] = {"s": key, **sprites[key].add_loop(body)}
    meta = {}
    total = 0
    for key, sp in sprites.items():
        info, size = sp.write(0.3 if key in ("mono", "lo", "stereo") else 0.4)
        meta[key] = info
        total += size
        files.append((info["file"], size, info["seconds"]))
    js = [
        "// Generated by tools/sfx/build_sfx.py from the sound libraries in AudioPacks/: do not edit by hand.",
        "// Times are seconds into each file. `marker` is where the sync blip peaks: the game measures where the",
        "// decoder put it and shifts everything by the difference. Sounds: [start, duration] per variant.",
        "// Loops: a..b is the seamless part (a copy of the loop's other end pads either side).",
        f"export const SPRITES = {json.dumps(meta, indent=2)};",
        f"export const SOUNDS = {json.dumps(sounds, separators=(',', ':'))};",
        f"export const LOOPS = {json.dumps(loops, indent=2)};",
        "",
    ]
    (OUT / "bank.js").write_text("\n".join(js), encoding="utf-8")
    for name, size, secs in files:
        print(f"  {name:22s} {size / 1024:7.0f} KB  {secs:6.1f} s")
    nvar = sum(len(v["v"]) for v in sounds.values())
    print(f"{len(sounds)} sounds ({nvar} variants), {len(loops)} loops, {total / 1024 / 1024:.2f} MB in all")


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(0 if check() else 1)
    build()
