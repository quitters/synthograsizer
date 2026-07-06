"""Creative brief: LOCAL NEWS REMOTES — surreal mid-90s field journalism.

Every clip is a different fictional small-market station's live remote where
the story behind the reporter quietly stops obeying. COMPLIANCE RAILS ARE
LOAD-BEARING HERE: everything is blatantly impossible, every place fictional,
no real-world-plausible events - this register must never be mistakable for
actual news about actual things.
"""

TARGET_SHOTS = {"EP1": 30}
SHOT_SECONDS = 8
TAPE_PRESET = "news"

CONCEPT = """\
WORKING TITLE: invent a bland fictional small-market station identity (spoken
only, never shown as text).
FORMAT: 30 standalone live-remote moments from DIFFERENT fictional local news
stations, circa 1993-1997: county-fair puff pieces, ribbon cuttings, weather
standups, human-interest segments, road-construction updates, lost-pet
stories, harvest festivals, new-donut-shop openings. Each clip: one reporter
(adult) mid-standup, shot by one camera operator - and the mundane story
behind them is quietly, blatantly impossible. The reporter either doesn't
notice, or narrates it in perfect unbothered news cadence.

TONE: chipper small-market professionalism over bottomless wrongness. The
reporter's cadence never breaks. The comedy-dread is in the gap between the
register ("...back to you, Dan") and what's on screen.

MANDATORY UNREALITY (compliance is part of the aesthetic): every incident
must be IMMEDIATELY impossible to a casual viewer - physics, scale, duration,
or logic - never merely unusual. NO real-world-plausible news events: no
crime, accidents, fires, weather disasters, protests, politics, health
stories, or missing persons. Whimsical-impossible only.

INCIDENT REGISTER (invent 30 new ones in this spirit): a ribbon cutting where
the ribbon re-ties itself and the ceremony politely restarts; a county-fair
pumpkin that is visibly larger each time the camera drifts back to it; a
reporter interviewing a crowd of townspeople who all inhale in unison before
each answer; a weather standup where only the reporter's patch of sidewalk is
raining upward; a marching band that files past the same tuba player eleven
times; a new bridge whose far end cannot be filmed - the pan always arrives
back at the near end; a donut-shop opening where the line of customers
extends into the shop and out the back into the same line. Wrongness lives in
physics, repetition, scale, and civic ceremony - never harm, never plausibly
real events.

PRODUCTION TRUTH (bake into every prompt):
- Camera: shoulder-mounted ENG Betacam - steadier than home video, but human:
  breathing frame, small corrections, occasional hunt for focus on the zoom;
  classic reporter standup framing (waist-up, off-center, story behind them).
- Light: outdoor available light or a single harsh camera-top light at dusk;
  honest small-town backdrops - courthouse lawns, fairgrounds, strip malls.
- People: one reporter in station blazer holding a stick mic with a blank mic
  flag (no logo, no text), ordinary townspeople (adults only).

HARD RULES:
- ADULTS ONLY on camera. No children, no minors.
- No real stations, call signs, towns, people, brands, or events; station and
  town names may be SPOKEN (fictional) but never shown as text.
- No crime, disasters, politics, or any plausibly-real news subject.
- NO on-screen text: no lower thirds, no tickers, no bugs, no captions.
"""

STYLE_ANCHOR_BRIEF = """\
Write ONE reusable style-anchor sentence (30-45 words) locking the look:
mid-90s local-news field footage - shoulder-mounted Betacam ENG camera,
breathing handheld standup framing, outdoor available light or harsh
camera-top light, honest small-town backdrops, flat broadcast video color,
single continuous take, no on-screen graphics."""

CASTING = ("Return an EMPTY characters list (every clip invents its own "
           "anonymous reporter and townspeople inline - no recurring cast). "
           "Provide 10-14 locations: distinct fictional small-town remote "
           "settings (fairground, courthouse lawn, strip-mall lot, bridge "
           "approach, grain elevator, park gazebo, diner exterior).")

STRUCTURE_NOTES = ("Structure act EP1 as exactly 30 scenes, each with "
                   "target_shots: 1 - one scene per live remote, a brand-new "
                   "fictional station, reporter, and story every time. Scene "
                   "'intent' = the impossible story in one line.")

SHOT_RULES = """\
Every shot object must contain:
- "title": 3-6 word slug.
- "veo_prompt": 70-130 words. ONE continuous shoulder-mounted take: the
  reporter mid-standup (adult, no names, blank mic flag), the small-town
  setting, the blatantly impossible story unfolding behind or around them,
  and the camera's human behavior (breathing frame, small corrections, one
  focus hunt or drift to the action and back). The reporter's news cadence
  never breaks. End with an "Audio:" clause: stick-mic voice up front, wind
  buffet, distant crowd/traffic; dialogue only if this shot speaks (ONE
  speaker, <=14 words, double quotes, chipper news cadence). No real names,
  brands, or on-screen text of any kind.
- "keyframe_prompt": "" (empty string - text-to-video project).
- "characters": [] always.
- "location": one location id.
- "needs_keyframe": false always.
- "dialogue": the spoken line if any, else "".
Vary stations, reporters, seasons, times of day, and stories so no two clips
feel alike. Every incident must be impossible at a glance."""

QC_NOTES = """\
IMPORTANT: this is INTENTIONALLY surreal mid-90s local news field footage.
Broadcast-video flatness, handheld breathing, wind noise, and blatantly
impossible events are desired - do NOT deduct for them. Deduct 'artifacts'
points only for breaking the illusion: cinematic lighting or composition,
modern digital sharpness, tripod-static or gimbal-smooth movement, readable
text anywhere, or - CRITICAL - an incident that could plausibly be a real
news event (score adherence 2 or lower if the clip could pass as actual
news about a real occurrence)."""
