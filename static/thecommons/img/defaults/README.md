# The Commons — default room images

Pieces that use images get these three when a room's owner hasn't uploaded any.
Made once by `scripts/commons_default_images.py` with the suite's image model (`gemini-3.1-flash-image-preview`), fitted to size and re-encoded by `backend/service/thecommons_images.py`.
Nothing here depicts a real person, a brand, or any artist's style.

## harbour.webp — 1920×1080

Asked for at 16:9:

> A small fishing harbour at golden hour, photographed from the quay: brightly painted wooden boats in red, yellow and blue moored in rippling water full of their reflections, a white lighthouse at the end of a stone pier, green hills and a warm sky behind, a few gulls. Rich saturated colour, crisp detail, strong edges. No people, no text, no logos.

## fox.webp — 1080×1440

Asked for at 3:4:

> A studio portrait of a red fox sitting upright and looking straight at the camera, sharp detail in its fur and whiskers, soft side lighting, against a plain smooth teal backdrop with nothing else in frame. No text, no logos.

## emblem.webp — 1024×1024

Asked for at 1:1:

> A bold flat graphic emblem centred in the frame: a stylised sun with twelve thick rays inside a round badge ring, in orange, magenta, deep blue and cream, heavy dark outlines, no gradients. The background is one flat, perfectly uniform pure green (#00FF00) with nothing on it, and no green anywhere in the emblem. No text, no letters, no logos.

The emblem was drawn on a flat green ground, keyed out to transparency by the script.
