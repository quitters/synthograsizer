"""Creative brief: HOME VIDEO SHOWCASE — a surreal mid-90s clip-show episode.

Anthology format: every scene is one self-contained camcorder clip, a new
anonymous family in a new suburban setting, where the "funny incident" is
quietly impossible. Uncanny domestic surrealism in the lineage of late-night
adult-swim-style infomercial horror — WITHOUT ever naming any real artist,
show, person, or brand in any prompt.
"""

TARGET_SHOTS = {"EP1": 30}
SHOT_SECONDS = 8
TAPE_PRESET = "vhs"

CONCEPT = """\
WORKING TITLE: invent a bland, chipper clip-show name (e.g. "REAL FUNNY
FAMILIES" energy - but invent your own).
FORMAT: a set of 30 standalone home-video clips as if broadcast on a mid-1990s
family clip show. Each clip: ONE family (all adults), ONE suburban setting,
ONE incident that begins as classic pratfall/candid-camera material and turns
quietly WRONG - impossible, liminal, dread-inducing - while everyone on tape
keeps treating it as hilarious.

TONE: deadpan uncanny. The horror is never announced; the tape believes it is
a comedy show. Canned studio-audience laughter sometimes erupts at nothing, or
fails to stop. The camcorder operator reacts like it's adorable.

INCIDENT REGISTER (these were ALL used in a previous episode - invent 30
ENTIRELY NEW incidents in the same register, reusing none of them): a
background figure standing too still; a duplicated family member; a laugh that
outlives the mouth; reverse-relighting candles; nested identical pinatas;
splashless pool water; an endless waving neighbor; a dog snubbing one person;
a mannequin uncle; a wrong-stepped staircase; crawling wallpaper; a TV aerobics
instructor watching the room; a looping cul-de-sac. NEW territory to mine:
holiday mornings, garage sales, church potlucks, home karaoke, wedding
receptions, home workouts, car washes, board game nights, home haircuts,
sprinkler seasons, basement band practice, teleshopping calls, family
portraits. The wrongness should live in physics, repetition, duration, spatial
logic, or social behavior - never gore. Escalate quietly; end each clip a beat
too early or a beat too late.

VARIETY: living rooms, backyards, garages, kitchens, dens, driveways,
basements, church halls, above-ground pools, minivan interiors - wood paneling,
CRT televisions, popcorn ceilings, windbreakers, scrunchies, VCR clocks
blinking 12:00. Vary time of day; vary family configurations (all adults).

HARD RULES:
- ADULTS ONLY on camera. No children, no minors, no "teens".
- No injuries, blood, or violence - pratfalls and impossibilities only.
- No real people, names, celebrities, brands, logos, or show titles. Refer to
  people only as roles ("a father", "the grandmother", "two adult brothers").
- NO on-screen display of any kind: no REC indicator, no timestamp, no battery
  icon, no camcorder overlay graphics, no readable text or captions anywhere.
"""

STYLE_ANCHOR_BRIEF = """\
Write ONE reusable style-anchor sentence (30-45 words) locking the look:
1994-96 consumer VHS camcorder footage - heavy color bleeding, tracking noise,
washed-out muddy contrast, strictly available light (blown-out windows, murky
underexposed tungsten rooms), low resolution, hunting autofocus, single
continuous handheld take, clean image with no on-screen overlay."""

CASTING = ("Return an EMPTY characters list (every clip invents its own "
           "anonymous adult family inline - no recurring cast). Provide 10-14 "
           "locations: generic mid-90s American suburban settings.")

STRUCTURE_NOTES = ("Structure act EP1 as exactly 30 scenes, each with "
                   "target_shots: 1 - one scene per home-video clip, a brand-new "
                   "anonymous family and setting every time. Scene 'intent' = the "
                   "incident in one line.")

SHOT_RULES = """\
Every shot object must contain:
- "title": 3-6 word slug.
- "veo_prompt": 70-130 words. ONE continuous handheld camcorder take: who is
  on tape (adult roles only, no names), the setting, the incident starting as
  clip-show comedy and turning quietly impossible, and the camcorder's own
  behavior. THE OPERATOR IS AN UNTRAINED FAMILY MEMBER: subjects drift
  off-center or half out of frame, heads cropped by the frame edge, the camera
  is late to the action and pans after the fact, autofocus hunts at the worst
  moment. People are ordinary and unglamorous (dated 90s haircuts, ill-fitting
  clothes); rooms genuinely cluttered and lived-in (mail piles, cords,
  mismatched furniture); reactions distracted and mid-conversation - nobody
  performs for the camera. NEVER cinematic lighting or composed framing.
  End with an "Audio:" clause: camcorder mono - room tone, tape
  hiss, unnamed adult voices, optional canned studio laughter behaving wrongly;
  dialogue only if this shot speaks (one speaker, <=14 words, double quotes).
  No real names, brands, on-screen displays, or readable text of any kind.
- "keyframe_prompt": "" (empty string - this project renders text-to-video).
- "characters": [] always.
- "location": one location id.
- "needs_keyframe": false always.
- "dialogue": the spoken line if any, else "".
Every clip self-contained; no clip references another. Vary incidents,
families, rooms, lighting, and camcorder behavior so no two clips feel alike."""

QC_NOTES = """\
IMPORTANT for this project: it is INTENTIONALLY surreal 1990s VHS camcorder
footage. Analog artifacts, warping, smearing, uncanny motion, and impossible
events are desired - do NOT deduct for them. Deduct 'artifacts' points only
for breaking the illusion: modern digital sharpness, cinematic lighting,
non-camcorder camera moves, or readable modern text/UI. Judge 'adherence' on
whether one clear uncanny incident occurs in a convincing mid-90s home video."""
