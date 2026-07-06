"""Creative brief: CORPORATE TRAINING TAPES — surreal late-80s/early-90s
institutional video. Each clip is from a different fictional company's
training program, where the role-play scenario stops being a role-play.
"""

TARGET_SHOTS = {"EP1": 30}
SHOT_SECONDS = 8
TAPE_PRESET = "betacam"

CONCEPT = """\
WORKING TITLE: invent a bland training-video production-house name (fictional).
FORMAT: 30 standalone moments from DIFFERENT fictional corporate training
tapes, circa 1988-1995: customer-service role-plays, safety demonstrations,
sexual-harassment-seminar staging (handled tastefully - awkward office
politeness only), team-building exercises, phone-etiquette drills, new-hire
orientations, time-management seminars, fire-drill walkthroughs, cash-register
training, motivational break-room segments. Each clip: one company, one
scenario (all adults), staged with stiff non-actor employees - and the
training scenario quietly stops being pretend.

TONE: institutional deadpan. The instructional register never breaks; the
demonstration continues even as it becomes impossible. The horror is
procedural compliance.

INCIDENT REGISTER (invent 30 new ones in this spirit): a role-play "customer"
who knows the employee's home address (spoken politely, no menace); a
demonstration of proper lifting where the box is clearly empty and clearly
too heavy; a phone-etiquette drill where the practice phone rings before it's
dialed; a fire drill the narrator counts in the wrong direction; a trust fall
that pauses mid-air for coaching; an org chart acted out by employees whose
reporting lines physically tangle; a training kitchen where the spill
demonstration wets nothing; an orientation tour of a hallway that returns to
the same door; badge photos taken of the space beside the employee; a
motivational speaker whose pauses grow until the room ages. Wrongness lives
in procedure, timing, spatial logic, and corporate etiquette - never gore.

PRODUCTION TRUTH (bake into every prompt):
- Camera: Betacam on tripod, clean locked framing or slow deliberate zooms;
  occasional awkward rack focus; medium two-shots and instructional close-ups
  of hands; everything slightly over-lit.
- Settings: beige cubicle farms, drop-ceiling conference rooms with fluorescent
  light, break rooms, loading docks, stockrooms; motivational posters WITHOUT
  readable text (abstract shapes only).
- People: stiff volunteer employees acting badly on purpose-of-era, business
  casual, pantyhose-and-blazer, mustaches; wooden line deliveries.

HARD RULES:
- ADULTS ONLY on camera. No children, no minors.
- No injuries, blood, or violence - procedure and impossibility only.
- No real people, names, celebrities, brands, or companies. Roles only
  ("the trainer", "employee one", "the customer").
- NO on-screen text, titles, bullet points, or captions of any kind.
"""

STYLE_ANCHOR_BRIEF = """\
Write ONE reusable style-anchor sentence (30-45 words) locking the look:
late-80s corporate training video - Betacam SP on tripod, over-lit fluorescent
offices, flat institutional color, stiff staged role-plays by non-actors,
clean locked framing with slow instructional zooms, single continuous take,
no on-screen text."""

CASTING = ("Return an EMPTY characters list (every clip invents its own "
           "anonymous employees inline - no recurring cast). Provide 10-14 "
           "locations: distinct beige corporate interiors (cubicles, "
           "conference room, break room, stockroom, loading dock, lobby).")

STRUCTURE_NOTES = ("Structure act EP1 as exactly 30 scenes, each with "
                   "target_shots: 1 - one scene per training moment, a "
                   "brand-new fictional company and scenario every time. "
                   "Scene 'intent' = the incident in one line.")

SHOT_RULES = """\
Every shot object must contain:
- "title": 3-6 word slug.
- "veo_prompt": 70-130 words. ONE continuous tripod take: the training
  scenario, who is on camera (adult roles only, no names), the beige setting,
  the demonstration quietly stopping being pretend, and the camera's behavior
  (locked, or one slow instructional zoom / awkward rack focus). The
  instructional register NEVER breaks. End with an "Audio:" clause: fluorescent
  hum, HVAC rumble, lav-mic dialogue when someone speaks (one speaker, <=14
  words, double quotes), optional too-calm narrator line counted as the one
  speaker. No real names, brands, on-screen text of any kind.
- "keyframe_prompt": "" (empty string - text-to-video project).
- "characters": [] always.
- "location": one location id.
- "needs_keyframe": false always.
- "dialogue": the spoken line if any, else "".
Vary companies, scenarios, rooms, and incidents so no two clips feel alike."""

QC_NOTES = """\
IMPORTANT: this is INTENTIONALLY surreal late-80s corporate training video.
Stiff acting, over-lit flat video, awkward staging, and impossible events are
desired - do NOT deduct for them. Deduct 'artifacts' points only for breaking
the illusion: cinematic lighting or composition, modern digital sharpness,
handheld camerawork, or readable text. Judge 'adherence' on whether one clear
uncanny training moment occurs in a convincing institutional video."""
