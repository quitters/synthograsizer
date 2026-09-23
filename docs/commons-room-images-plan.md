# The Commons — room images: plan

**Status:** plan, revised 2026-09-23. PR 1 to PR 3 built; PR 4 not started.
**Decided:** images live in the GCS bucket; they belong to one room and are never used by gallery
pieces; only the room's owner can upload them, and there is no automated moderation. A room with
no uploads uses a set of default images, so image pieces can be tested before anyone uploads.
**Builds on:** #8 (the stub-canvas harness, `library.js` listings, `scripts/commons_promote.py`)
and #7 (the 24-control cap). PR 1 below is stacked on #8's branch while #8 is open; the rest
follow in order.

## What it is

The owner of a room uploads a handful of images on the creator desk. The wall hands them to the
running piece as ready-to-draw bitmaps in `room.images`, and the generator can be asked to write
pieces that use them: images as sprites that float round the wall, glitch and slit-scan
treatments, uploads that bleed into one another over time, photos that dissolve into particles,
mosaics of every upload, a slideshow with transitions. Until the owner uploads anything, pieces get
the suite's default images instead. Phones never see the images and never run code, exactly as
today.

## The safety model, in one paragraph

The wall runs generated code in its own page with no sandbox, so a malformed or hostile image
file must never reach the wall as a file. Every upload is decoded and **re-encoded on the
server** with Pillow into a fresh WebP, capped in size, with metadata dropped; the original
bytes are discarded and never stored. The wall only ever fetches that re-encoded file, or one of
the suite's own default images, from the suite's own origin, and gives the piece a decoded
`ImageBitmap`. Generated code gets pixels, never a URL or a file. Only the room's owner can
upload, so the person accountable for what is on the wall is the only one who can put an image
there. There is no automated content check: that is the owner's call, by design.

## Shape of the feature

```
desk (owner)                      server                               wall
────────────                      ──────                               ────
upload file  ── multipart ──▶ decode + re-encode (Pillow)
                              store  users/{uid}/rooms/{room}/{id}.webp  (GCS)
                              row in commons_room_images
                              relay ── {"type":"images", manifest} ──▶ uploads? fetch each one
                                                                        none?    the default set
                                                                        createImageBitmap ×2
                                                                        room.images = [...]
generate / remix ── "use this room's images" ──▶ image rules + manifest in the prompt
```

## The default images

Three images ship with the suite in `static/thecommons/img/defaults/`, chosen to exercise what
pieces have to handle:

| File | Shape | Why |
|---|---|---|
| `harbour.webp` | 16:9 landscape, 1920×1080 | a full-frame photo-like scene: lots of colour and edges for glitch, pixel-sort and particle pieces |
| `fox.webp` | 3:4 portrait, 1080×1440 | a clear subject on a plain ground, in the wrong shape for the wall, so fitting and cropping get tested |
| `emblem.webp` | 1:1, 1024×1024, **transparent background** | a bold graphic with alpha, the natural sprite for floating-asset pieces |

Three rather than one, so pieces that cycle, blend or tile several uploads have something to
work with, and so aspect ratio and transparency are tested from the start.

- **How they're made:** once, with the suite's own image model (`MODEL_IMAGE_GEN_NB2`), by a
  small `scripts/commons_default_images.py`. The emblem is generated on a flat background that
  the script keys out to transparency. The script then fits each image to the size above and
  writes it with the same Pillow encoder uploads go through. Nothing depicts a real person, a
  brand or a living artist's style. The prompts and model are recorded in a README beside the
  files, and the images are committed, so builds never call the model.
- **When they're used:** a room with **no uploads** hands pieces the three defaults. The first
  upload replaces them entirely; they are never mixed with uploads, and deleting every upload
  brings them back. Each entry carries `default: true`, so the desk can label it as a sample and
  a piece can tell them apart if it wants to.
- **Served** as static files from the suite's own origin with a long cache. They need no
  bucket, no database and no upload, so the wall, the tests and the generator all work
  locally and on a deployment with storage switched off.
- **Everywhere a piece runs:** the wall, the Sketchbook's page, and the
  manifest the generator is shown. The node harness uses stubs of the same three sizes.

## PR 1 — the wall, the runtime contract and the default images

No backend and no storage: this makes image pieces real, end to end, before uploads exist.

**`room.images`**, set by `static/thecommons/js/display.js`: a stable array in the owner's
order, of `{ id, width, height, bitmap, thumb, default }`.
- `bitmap` is the full image (long edge at most 1920 px).
- `thumb` is a second `ImageBitmap` of at most 256 px, made once at load with
  `createImageBitmap(bitmap, {resizeWidth, resizeHeight})`, for per-pixel work (sampling
  colours, particles, pixel sorting) that would be ruinous at full size.
- **Always an array:** empty only for the moment before the first images decode, then the
  room's uploads or the defaults. Replaced, never mutated, when the manifest changes, in one
  assignment, so a piece never sees a half-loaded list. An image that fails to load is left out
  rather than blocking the rest.
- The wall fetches with `cache: 'force-cache'` and decodes off the frame loop, and only once a
  piece whose code mentions `room.images` comes on, so a wall that never shows one downloads
  nothing. In this PR it always loads the defaults; PR 2 adds the `images` message that swaps
  in uploads.
- A list that leaves the wall is dropped, **never closed**: a piece may still hold a bitmap from
  a list it cached, and drawing a closed `ImageBitmap` throws.

**Everywhere else a piece runs:**
- **The desk** runs only gallery pieces live; saved looks and pieces made in the room get a
  poster card. Gallery pieces never use images, so nothing on the desk needs images yet.
- **The gallery's node harness** (`tests/test_thecommons_gallery.py`): stub images at the three
  default sizes, in a fourth run of every piece. The Sketchbook's `evaluate.py` imports that
  harness, so it inherits them.
- **A reference piece** in `tests/fixtures/`: a small hand-written piece that floats the images
  as sprites, with a fallback for an empty list. The harness runs it with no images and with
  the stubs, and it is what the wall is checked with by hand before the generator can write
  image pieces.

**Per-room only, enforced:**
- A gallery piece may not use room images: a test fails any gallery `.js` that mentions
  `room.images`, and `scripts/commons_promote.py` refuses one.
- Saved looks and "Made in this room" pieces are the only place an image piece lives.

**Derived tag:** a saved look or room-made piece whose code mentions `room.images` carries a
"Uses your images" tag on the desk, in the "What the room does" group, derived the way
`usesPeople` is.

**Verify** in the browser pane: the real `display.js`, fed the reference piece by a stand-in
socket, fetches the three defaults and floats them; fed a piece without images, it fetches
none.

## PR 2 — upload, storage and API

**Schema** (`backend/service/schema.sql`, schema v5):

```sql
CREATE TABLE IF NOT EXISTS commons_room_images (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id     BIGINT NOT NULL REFERENCES commons_rooms(id) ON DELETE CASCADE,
  position    INT NOT NULL,       -- the order pieces see them in
  width       INT NOT NULL,
  height      INT NOT NULL,
  bytes       INT NOT NULL,       -- counts toward the owner's storage quota
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commons_room_images_room_idx ON commons_room_images(room_id, position);
```

**Object path** `users/{owner_id}/rooms/{room_id}/{image_id}.webp`, derived from those three
integers rather than stored, so there is no path column to trust and nothing user-controlled in
it. Putting it under the owner's prefix means the existing account delete
(`storage.delete_prefix("users/{id}/")` in `routers/account.py`) removes every room image with
no new code. Room delete gains one best-effort `delete_prefix("users/{owner}/rooms/{room}/")`.

**Sanitising** (`thecommons_images.sanitize()`; the one place that touches upload bytes):

- Caps before decoding: 15 MB, and 40 MP read from the header, so a decompression bomb costs a
  few hundred bytes of reading. Pillow's own bomb refusal (far larger headers) is reported the
  same way.
- The file type is decided by Pillow from the bytes, never by the filename or declared content
  type: PNG, JPEG, WebP and GIF. JPEG includes MPO, which is how many phones save a photo.
  BMP, TIFF, SVG and anything else are refused. An animated GIF or WebP keeps its first frame.
- `ImageOps.exif_transpose` first, so phone photos come out upright. Then convert to RGB, or to
  RGBA if the image has transparency.
- Resize so the long edge is at most **1920 px**, the wall's resolution.
- Re-encode as WebP (quality 85, alpha kept), with no EXIF, ICC or XMP. What gets stored is only
  ever this output. Decoding runs off the event loop, since the same process serves the relay.

**Endpoints** (owner-only through the existing `_require_owned_room`; CSRF and session checks
come from the middleware as for every `/api/` path):

| Method | Path | Does |
|---|---|---|
| `POST` | `/api/thecommons/rooms/{id}/images` | multipart upload of one file; sanitise, check the quota, add a row at the end, store, rebroadcast |
| `GET` | `/api/thecommons/rooms/{id}/images` | for the desk: `images` (`{id, position, width, height, bytes, url}`), `limit`, `storageEnabled`, storage used and limit, and the `samples` pieces use while there are none |
| `GET` | `/api/thecommons/rooms/{id}/images/{image_id}` | the bytes, for the desk's thumbnails |
| `PUT` | `/api/thecommons/rooms/{id}/images/order` | `{"ids": [...]}`, every image exactly once |
| `DELETE` | `/api/thecommons/rooms/{id}/images/{image_id}` | remove the row and the object, and rebroadcast |
| `GET` | `/api/thecommons/display/{join_code}/images/{image_id}` | the bytes, for the wall, reached by the join code the wall already has |

Content responses are served same-origin by proxying `storage.get()`, with
`Content-Type: image/webp`, `X-Content-Type-Options: nosniff` and
`Cache-Control: private, max-age=86400`. Image ids are never reused, so caching is safe.

**Refusals**, each with an `error` code for the desk: `room_full` (409, checked before any
decode), `not_an_image` (415), `too_large` and `too_many_pixels` (413), `storage_quota` (413).
Storage off is 503 and a failed store 502. In service mode the server scrubs every 5xx body to
a correlation id, so for those two the desk has the status code, and the list's
`storageEnabled`.

**Limits:**
- **12 images per room.** The count and the insert are one statement. Two uploads landing in
  the same instant could still both pass at Postgres's default isolation; the quota bounds it.
- **Quota:** room images count toward the same per-user storage quota as "My creations", through
  one helper (`backend/service/storage_quota.py`) that both routers use.
- **Storage off:** with `SYNTH_GCS_BUCKET` unset, uploads return 503. Rooms keep working with
  the default images.

**Relay:** `get_or_create_relay` loads the manifest from the rows, so it survives a restart.
`connect_display` sends `{"type": "images", "images": [{id, width, height}]}` **before** the
sketch, so a wall never shows the samples for a moment before the room's own uploads; an empty
list means "use the samples". Every upload, delete or reorder rebroadcasts it. It goes to
**displays only**, through a new `"displays"` target; phones never receive it.

**The wall** keeps the latest manifest and loads it whenever a piece that uses images is on.
The newest list always wins over a slower earlier load, and if no manifest ever arrives it
falls back to the samples after two seconds. Upload ids reach pieces as `upload-{id}`.

**Local development:** there is no local storage backend. Rooms need Postgres anyway, so the
way to try the whole path by hand is the test suite's own fakes (`FakeCommonsPool` and an
in-memory bucket) under the real app, which is how this PR was checked.

**Tests** (`tests/test_thecommons_room_uploads.py`):
- **Sanitiser:** a decompression bomb, an oversize upload, non-images (script, SVG, empty),
  BMP and TIFF, a truncated JPEG, and a polyglot (valid PNG plus a trailing script) whose
  stored output doesn't contain the trailer. Also EXIF orientation, metadata dropped, alpha
  kept, a GIF's first frame, an MPO phone photo, and the long edge capped.
- **Access:** signed out gets 401 and non-owner 404 on every route; the wall's route needs no
  session but 404s for a wrong, closed or other room's join code.
- **Limits and cleanup:** the image-count limit (refused without decoding), the shared quota,
  503 when storage is off, a failed store leaving no row, reordering, delete, and room delete
  clearing the bucket.
- **The wall:** a connected wall hears each upload and delete (and gets the samples back when
  the last one goes), a wall connecting after a restart is told the room's images first, and
  phones never hear about images.

## PR 3 — the desk

A new **Your images** section (03) in `static/thecommons/desk/index.html`, between the library
and "Shape what comes next" (now 04; "Save this look" is 05), run by its own module,
`static/thecommons/js/room-images-desk.js`. Its eyebrow reads "Only on your wall", with help
text saying phones never see the images, that every image is re-made on the server, and that
the owner answers for what they put up:
- **Add images:** a button opening a file picker (`accept="image/png,image/jpeg,image/webp,image/gif"`,
  `multiple`). Files upload one at a time with progress ("Adding 2 of 3: …"). A file over 15 MB
  is skipped without sending it; everything else is the server's call, and each refusal is
  shown in its words, next to the file's name.
- **The image grid:** thumbnails in the order pieces see them, each fitted whole into a 4:3
  frame over a checkerboard (so transparency shows), numbered with its size. Arrow buttons move
  an image earlier or later (buttons rather than drag and drop, so it works by keyboard, and
  focus follows the moved image). Remove takes a second click ("Really remove?"), since unlike
  loading a piece it has no Undo.
- **Before any upload:** the three samples, labelled "Sample", with "Pieces use these samples
  until you add your own. The first image you add replaces them all." They have no buttons.
- **Count and storage:** "2 of 12 images · 1.4 of 200 MB of your storage used" (the account's
  whole quota, shared with "My creations").
- **Storage off:** the Add button is hidden and the section says the samples are in use.

The "Use this room's images" checkbox moved to PR 4: until the generator knows about images it
would do nothing, and a control that does nothing is worse than none.

**Verified** in the browser pane with the real app on the test fakes (see PR 2): the samples
show first; adding a wide PNG, a tall JPEG and a fake `.heic` in one go added the two images,
refused the third in the server's words, and replaced the samples; reordering and two-click
removal worked with the keyboard focus in the right place; a wall opened afterwards fetched
exactly the remaining upload; and at phone width the section is one column with no sideways
scroll. Not checked in the browser: the storage-off state.

## PR 4 — the generator

- **Asking for it:** a "Use this room's images" checkbox in the desk's prompt form, beside "Give
  the room actions to take": always available, since there are always images (uploads or
  samples), and ticked automatically when remixing a piece that already uses them.
  `GenerateRequest` gains `use_images: bool`. The job reads the room's
  manifest (the uploads, or the defaults when there are none) and passes it to
  `generate_sketch(..., images=[{width, height}, ...])`. When the flag is set, the model is also
  told how many images there are and their aspect ratios.
- **Remix:** a source whose code uses `room.images` forces image mode on, as a source with
  triggers already forces interactive mode (`thecommons_jobs.py`).
- **Prompt:** `system_prompt(interactive=..., images=...)` appends an `_IMAGE_RULES` block only
  when asked, so an ambient piece is never told images exist. The block says:
  - `room.images` is `[{id, width, height, bitmap, thumb, default}]`. It can be **empty for a
    moment** while images load and **can change while running** when the host uploads. Always
    have a look for zero images, and re-read the array every frame.
  - Draw with `ctx.drawImage(img.bitmap, ...)`, fitting or covering by each image's own aspect
    ratio. Never assume a size.
  - For per-pixel work, draw `img.thumb` into a small `OffscreenCanvas` **once per image id**,
    cache the `ImageData` in `room.state` keyed by id, and drop entries whose id has gone. Never
    call `getImageData` on the main canvas or on full-size images every frame.
  - The piece cannot know what the images show, so it should suit any photo, logo or drawing.
  - Controls cannot list the images as choices, because choices are fixed when the piece is
    written. Use a number (which image, how many), a trigger ("next image") or time instead.
- **Remix context:** `generation_prompt` includes the same manifest line for remixes.
- **Panel designer:** it learns that a piece uses the room's images, so hints can say so.
- **Tests:** the image block appears only when asked; the manifest is in the request (the
  defaults' sizes for a room with no uploads); the remix forcing works; an ambient prompt never
  mentions images.
- **Sketchbook support:**
  - `generate.py --images` passes the default set's manifest.
  - `build_gallery.py` gives image pieces the default images.
  - A first themed batch, **Uploads**, of about 40 prompts (see `commons-sketchbook/themes.md`):
    floating sprite assets, glitch bleed across a gallery of uploads, slit-scan, pixel-sort,
    photo-to-particles, mosaic of all uploads, Ken Burns slideshow, uploads mapped onto the
    facade and flip-dot pieces, and crowd pieces where a person's button stamps, cycles or
    scatters an image.

## Deliberately not in this plan

- **The model never sees the images.** Pieces are written without knowing what the images
  show, which keeps generation text-only and cheap. Sending small thumbnails to the model for
  composition-aware pieces is a possible later step, to judge after the Uploads batch.
- **No switch to turn the samples off.** A piece that uses images always has something to show.
- **No per-image captions, crops or focal points.** The piece does its own fitting.
- **No participant uploads, ever.** That is the point of admin-only.

## Known trade-offs

- **The join code can fetch images.** The wall's image route is reached by the join code, and
  the join link is also what phones use. So anyone who joined the room can fetch its images,
  which are the ones shown on the public wall. Accepted: a separate wall-only token would mean
  changing how the wall URL works, for little gain.
- **Memory on the wall:** 12 images at 1920 px is about 100 MB of bitmaps, plus the 256 px
  thumbnails. Fine on a laptop driving a projector; the per-room limit is what bounds it.
- **Samples on a public wall:** a host who picks an image piece before uploading shows the
  samples to the room. The desk's "Sample" label and help line make that visible.
- **Terms:** the draft terms need a line that the room owner is responsible for the images
  they put on their wall. Add it to the counsel-review list in `HANDOFF_SERVICE_LAUNCH.md`.

## Order and size

PR 1 → PR 2 → PR 3 → PR 4, each shippable on its own.
- **PR 1** needs no backend: image pieces work on the wall with the defaults, testable locally.
- **PR 2** is the largest (upload, storage and most of the tests).
- **PR 3** is mostly front-end.
- **PR 4** is small in the suite and pairs with the first Uploads batch in the Sketchbook.

Uploads reach the wall at the end of PR 2 and the desk in PR 3. With the defaults, every step
can be seen working before the next one starts.
