"""Creative brief: PUBLIC-ACCESS CABLE — surreal early-90s community television.

Every clip is a moment from a different fictional low-budget public-access
show, where the format's earnest jank curdles into quiet impossibility.
"""

TARGET_SHOTS = {"EP1": 30}
SHOT_SECONDS = 8
TAPE_PRESET = "publicaccess"

CONCEPT = """\
WORKING TITLE: invent a bland cable-access channel identity (community
television energy - invent your own, fictional).
FORMAT: 30 standalone moments from DIFFERENT fictional public-access cable
shows, circa 1991-1995: local talk shows with folding-chair sets, cooking
segments in church kitchens, psychic call-in hours, community bulletin hosts,
amateur puppet ministries, cable-exercise ladies, model-railroad showcases,
teen poetry hours, accordion instruction. Each clip: one show, one host or
guest pair (all adults), one on-air moment that starts as charming low-budget
jank and turns quietly impossible while everyone stays in broadcast mode.

TONE: deadpan uncanny played with public-access earnestness. Nobody breaks
format. The host keeps hosting. The horror is procedural: the show must go on.

INCIDENT REGISTER (invent 30 new ones in this spirit): a guest who answers
questions one beat before they are asked; a call-in caller whose voice is the
host's; a cooking demo where the dish assembles itself while hands hover; a
puppet that keeps performing after the puppeteer's arms are visibly at rest;
studio audience of three who clap in perfect unison slightly too long; a
bulletin host reading community events for a town that keeps renaming itself
mid-sentence (spoken, never shown as text); set walls that are closer each
time the camera cuts back (within one continuous shot: slowly); a co-host
nobody addresses; an exercise instructor mirrored by the wrong number of
students. Wrongness lives in timing, repetition, spatial logic, and broadcast
etiquette - never gore.

PRODUCTION TRUTH (bake into every prompt):
- Studio: tripod-locked pedestal camera, occasional slow clumsy zoom or a late
  pan operated by a volunteer; mis-framed headroom; subjects centered too
  precisely or not at all.
- Sets: folding tables, office ferns, donated couches, painted plywood flats,
  a single mug; harsh even key light from cheap studio fixtures, hot spots on
  foreheads, shadows doubled on the backdrop.
- People: ordinary volunteers and local characters, dated haircuts, blazers
  with shoulder pads, clip-on mics with visible cables.

HARD RULES:
- ADULTS ONLY on camera. No children, no minors.
- No injuries, blood, or violence - politeness and impossibility only.
- No real people, names, celebrities, brands, shows, or channel numbers.
  Refer to people only as roles ("the host", "the psychic", "a caller").
- NO on-screen text, graphics, bugs, or captions of any kind.
"""

STYLE_ANCHOR_BRIEF = """\
Write ONE reusable style-anchor sentence (30-45 words) locking the look:
early-90s public-access cable studio video - S-VHS master, tripod pedestal
camera, harsh flat studio lighting with hot foreheads and doubled shadows,
overdriven color, plywood-and-fern set dressing, untreated room echo, single
continuous take, no on-screen graphics."""

CASTING = ("Return an EMPTY characters list (every clip invents its own "
           "anonymous hosts/guests inline - no recurring cast). Provide 10-14 "
           "locations: distinct cheap public-access studio sets and remote "
           "community venues (church kitchen, rec-center gym, library corner).")

STRUCTURE_NOTES = ("Structure act EP1 as exactly 30 scenes, each with "
                   "target_shots: 1 - one scene per show moment, a brand-new "
                   "fictional show and host every time. Scene 'intent' = the "
                   "on-air incident in one line.")

SHOT_RULES = """\
Every shot object must contain:
- "title": 3-6 word slug.
- "veo_prompt": 70-130 words. ONE continuous studio-camera take: the show
  format, who is on camera (adult roles only, no names), the set, the on-air
  moment turning quietly impossible, and the camera's behavior (tripod-locked,
  or one slow clumsy volunteer zoom/pan, mis-framed headroom). Everyone stays
  relentlessly in broadcast mode. End with an "Audio:" clause: untreated
  studio room echo, clip-on mic rustle, buzzing lights, phone-line hiss when
  relevant; dialogue only if this shot speaks (one speaker, <=14 words, double
  quotes). No real names, brands, on-screen text or graphics of any kind.
- "keyframe_prompt": "" (empty string - this project renders text-to-video).
- "characters": [] always.
- "location": one location id.
- "needs_keyframe": false always.
- "dialogue": the spoken line if any, else "".
Vary show formats, sets, hosts, and incidents so no two clips feel alike."""

QC_NOTES = """\
IMPORTANT: this is INTENTIONALLY surreal early-90s public-access cable video.
Analog artifacts, awkward framing, stiff hosting, and impossible events are
desired - do NOT deduct for them. Deduct 'artifacts' points only for breaking
the illusion: cinematic lighting or composition, modern digital sharpness,
handheld camerawork, professional broadcast polish, or readable text/graphics.
Judge 'adherence' on whether one clear uncanny on-air incident occurs in a
convincing low-budget cable-access moment."""
