"""Creative brief for THE ART OLYMPICS — the seed the develop stage expands.

Everything here is direction, not final text: the showrunner pass (Gemini Pro)
invents the specifics within these rails.
"""

TARGET_SHOTS = {"A1": 60, "A2": 90, "A3": 75}   # 225 shots x 8s = 30:00
SHOT_SECONDS = 8

CASTING = "Give the film exactly 5 competitors + 1 host, and 6-10 locations."
STRUCTURE_NOTES = ("Distribute each act's shot budget across 6-12 scenes per "
                   "act (scenes of 4-12 shots each).")
QC_NOTES = None

CONCEPT = """\
WORKING TITLE: The Art Olympics (invent a better one).
FORMAT: 30-minute broadcast-mockumentary hybrid. The first-ever global Art
Olympics: nations send their greatest artists to compete head-to-head in
creativity itself, and the world watches like it is the World Cup final.

TONE: earnest wonder played completely straight, with deadpan sports-broadcast
comedy underneath. Christopher Guest sincerity x Olympic title-package grandeur
x Chef's Table cinematography. Never cynical, never mocking the artists; the
comedy comes from treating creativity with the deadly seriousness of sport.

CAST: exactly 5 competitor artists from 5 different countries and 5 visually
spectacular disciplines (choose disciplines for maximum on-camera spectacle and
visual contrast with each other, e.g. ice carving, large-scale murals, kinetic
sculpture, sand tapestry, fire/glass work, textile installation - your pick).
Characters must be fictional, dignified, specific, and non-stereotypical; give
each a distinct silhouette, palette, and working style so they are instantly
recognizable in wide shots. One competitor is the emotional spine (an underdog).
Plus ONE broadcast host/commentator used sparingly (max 3 speaking shots total).

STRUCTURE (3 acts):
ACT 1 - THE GATHERING: cold-open opening ceremony at the arena; meet the five
competitors via short vox-pop interviews and b-roll of their home practices in
their home countries; Round One "the Speed Round" (one hour, found materials).
ACT 2 - THE CRUCIBLE: Round Two "the City Round" (create in and with the host
city itself); rivalries form; a devastating setback destroys the underdog's
piece mid-act; a quiet act of solidarity between rivals; semifinal scores.
ACT 3 - THE MAGNUM OPUS: the 72-hour arena-scale final; exhausted artists at
their limits; the two finalists' works unexpectedly interact/merge into
something neither planned; the inscrutable Jury of Nine; a podium moment where
the winner shares the medal; closing image echoing the cold open.

DIALOGUE RULES (hard constraints of the medium):
- At most ONE speaker per shot, at most 14 spoken words per shot, always in
  double quotes with a brief voice description. Most shots have NO dialogue.
- Interview/vox-pop shots: subject 3/4 to camera, documentary framing.
- Never rely on remembering a previous shot; every shot is self-contained.

VISUAL RULES:
- No on-screen text, captions, scoreboards, logos, or national flags close-up.
- No real people, brands, or existing artworks.
- Crowds, drone shots of venues, and macro shots of art-making are encouraged.
"""

STYLE_ANCHOR_BRIEF = """\
Write ONE reusable style-anchor sentence (30-45 words) that will be appended
verbatim to every single shot prompt to lock the film's look. It should
specify: documentary-meets-broadcast cinematography, anamorphic lensing for
establishing shots, handheld verite in workshops, warm golden-hour exteriors,
tungsten workshop interiors, teal-shadow/amber-highlight color grade, subtle
35mm film grain."""

SHOT_RULES = """\
Every shot object must contain:
- "title": 3-6 word slug.
- "veo_prompt": 60-120 words. A complete, SELF-CONTAINED Veo 3.1 prompt:
  camera/shot type, subject action that fits in 8 seconds, setting, lighting.
  When a recurring character appears, embed their FULL visual description
  verbatim (from the character bible) - the video model has no memory.
  End with an "Audio:" clause: ambience + SFX, plus dialogue only if this shot
  speaks (one speaker, <=14 words, in double quotes, with voice description).
  No text overlays. No named real people/brands.
- "keyframe_prompt": 40-90 words. The same moment as a single cinematic STILL
  frame (composition, subjects, setting, light - no motion words, no audio).
- "characters": list of character ids present (may be empty).
- "location": one location id.
- "needs_keyframe": true when any recurring character is clearly visible or
  composition precision matters; false for crowds, aerials, macro/abstract
  b-roll where text-to-video with reference images is enough.
- "dialogue": the spoken line if any, else "".
Vary shot grammar: wides, drone aerials, macro hands-at-work, whip-pans on
crowds, slow push-ins on faces, broadcast two-shots. Every scene needs at
least one macro art-making detail shot. Respect 8 seconds: one action beat
per shot, no montages inside a shot."""
