"""Creative brief: MALL SECURITY FOOTAGE — surreal mid-90s surveillance tape.

Every clip is a different ceiling camera in a different dying retail space,
recording something that should not be recordable. Near-silent, stepped
time-lapse cadence, dead color. The loneliest register of the set.
"""

TARGET_SHOTS = {"EP1": 30}
SHOT_SECONDS = 8
TAPE_PRESET = "cctv"

CONCEPT = """\
WORKING TITLE: invent a bland security-archive label (fictional).
FORMAT: 30 standalone surveillance moments from DIFFERENT fictional mid-90s
retail spaces: mall concourses, food courts, department-store floors, parking
garages, service corridors, arcades after close, fountain atriums, escalator
banks, loading bays. Each clip: one fixed ceiling camera, ordinary shoppers
and staff (all adults) - and one thing in frame is quietly impossible. No one
on tape reacts; the camera cannot react.

TONE: the uncanny of being unwatched. No comedy framing here - this register
is pure liminal dread played absolutely dry. The impossibility is often small
and easy to miss, like something you'd rewind three times.

INCIDENT REGISTER (invent 30 new ones in this spirit): a shopper who exits a
storefront that the camera shows as a blank wall; every person on a concourse
turning a corner in perfect synchrony; an escalator whose riders arrive at
the top in a different order than they boarded; a janitor mopping a spill
that recedes ahead of the mop; a crowd that thins until one figure remains
standing in the exact center of frame; a food court where every table's
occupants swap between camera exposures; a fountain whose water pauses while
coins continue to land; a mannequin closer to the glass at each step of a
passerby; a parking garage where a car's headlights sweep past twice with no
car; someone walking a dog leash with nothing on it and a dog's shadow.
Wrongness lives in continuity between moments, crowd behavior, physics, and
architecture - never violence, never crime, never anything a real security
tape would be evidence of.

PRODUCTION TRUTH (bake into every prompt):
- Camera: single FIXED high-angle ceiling camera, wide lens, slight downward
  tilt, mild wide-angle distortion; NO panning, NO zooming, NO handheld -
  the frame never moves.
- Image: deep depth of field, drab fluorescent retail light, waxed floor
  reflections, dated storefronts and planters; distant small figures.
- People: ordinary mid-90s shoppers and staff (adults only), unaware of the
  camera; movement reads as pedestrian traffic, not performance.

HARD RULES:
- ADULTS ONLY on camera. No children, no minors.
- No crime, no violence, no injuries, nothing evidentiary - impossibility only.
- No real malls, stores, brands, logos, or people. Generic storefronts only.
- NO on-screen text, timestamps, camera IDs, or captions of any kind.
"""

STYLE_ANCHOR_BRIEF = """\
Write ONE reusable style-anchor sentence (30-45 words) locking the look:
mid-90s time-lapse security VCR footage from a fixed high-angle ceiling
camera - wide retail interior, drab fluorescent light, deep focus, small
distant figures, washed-out low-saturation image, motionless locked frame,
no on-screen text."""

CASTING = ("Return an EMPTY characters list (anonymous shoppers/staff only - "
           "no recurring cast). Provide 10-14 locations: distinct mid-90s "
           "retail surveillance vantages (concourse, food court, garage "
           "level, escalator bank, service corridor, atrium, arcade).")

STRUCTURE_NOTES = ("Structure act EP1 as exactly 30 scenes, each with "
                   "target_shots: 1 - one scene per camera, a brand-new "
                   "space and impossibility every time. Scene 'intent' = the "
                   "incident in one line.")

SHOT_RULES = """\
Every shot object must contain:
- "title": 3-6 word slug.
- "veo_prompt": 70-130 words. ONE take from a FIXED high-angle ceiling
  security camera: the retail space, the ordinary pedestrian activity (adults
  only, no names), and the single quiet impossibility. The frame NEVER moves,
  zooms, or refocuses. No one on tape acknowledges anything. End with an
  "Audio:" clause: distant muffled mall ambience - HVAC, faint crowd murmur,
  fountain or escalator drone; NO dialogue, NO close sound, NO music.
- "keyframe_prompt": "" (empty string - text-to-video project).
- "characters": [] always.
- "location": one location id.
- "needs_keyframe": false always.
- "dialogue": "" always (surveillance cameras record no speech).
Vary spaces, crowd densities, times of day, and incidents; some clips should
be nearly empty and slow - emptiness is part of the register."""

QC_NOTES = """\
IMPORTANT: this is INTENTIONALLY surreal mid-90s time-lapse security footage.
Washed-out color, judder, distant tiny figures, near-empty frames, slowness,
and impossible events are desired - do NOT deduct for them. Era-correct
burned-in surveillance overlays (date/time stamps, camera IDs) are the ONE
text exception in this register: they are AUTHENTIC, never deduct for them.
Any fixed elevated mount reads as surveillance (steep god's-eye, ceiling
corner, or high wall mount are all correct); deduct vantage only for
eye-level or lower. Deduct 'artifacts' points only for breaking the illusion:
camera movement of any kind, cinematic lighting or composition, close-ups,
visible dialogue scenes, modern sharpness, or readable text other than
surveillance overlays. Judge 'adherence' on whether the frame stays fixed and
one quiet impossibility occurs in a convincing surveillance vantage."""
