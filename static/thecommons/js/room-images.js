// Room images: what a piece finds in room.images.
//
// room.images is always an array of { id, width, height, bitmap, thumb, default }:
//   bitmap  the image, decoded, long edge at most 1920 px -- draw it with drawImage
//   thumb   the same image at most 256 px on its long edge, for per-pixel work
//           (sampling colours, particles, sorting) that would be ruinous at full size
//   default true for the suite's sample images, which a room uses until its owner
//           uploads any of their own
// It is empty only for the moment before the first images decode, and it is
// replaced, never changed in place, so a piece can hold on to one and compare.
// Bitmaps that leave the wall are never closed, only dropped: a piece may
// still hold one from a list it cached, and drawing a closed bitmap throws.
//
// The wall only ever decodes files served from this origin: the defaults below
// and, later, uploads the server has already re-encoded. A piece is handed
// pixels, never a URL. backend/service/thecommons_images.py lists the same
// defaults; tests/test_thecommons_images.py keeps the two lists in step.

export const DEFAULTS_URL = '/thecommons/img/defaults';

export const DEFAULT_IMAGES = Object.freeze([
  { id: 'default-harbour', file: 'harbour.webp', width: 1920, height: 1080 },
  { id: 'default-fox', file: 'fox.webp', width: 1080, height: 1440 },
  { id: 'default-emblem', file: 'emblem.webp', width: 1024, height: 1024 },
]);

export const THUMB_EDGE = 256;

async function decode(entry, src) {
  const response = await fetch(src, { cache: 'force-cache', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`${src}: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  const scale = Math.min(1, THUMB_EDGE / Math.max(bitmap.width, bitmap.height));
  const thumb = await createImageBitmap(bitmap, {
    resizeWidth: Math.max(1, Math.round(bitmap.width * scale)),
    resizeHeight: Math.max(1, Math.round(bitmap.height * scale)),
    resizeQuality: 'high',
  });
  return Object.freeze({
    id: entry.id, width: bitmap.width, height: bitmap.height, bitmap, thumb, default: !!entry.default,
  });
}

/**
 * Decode a list of images for pieces, in order. An image that fails to load
 * is left out rather than holding up the rest; the list that comes back is
 * frozen, ready to be put on room.images in one assignment.
 */
export async function loadImages(entries) {
  const decoded = await Promise.all(entries.map((entry) => decode(entry, entry.src).catch((error) => {
    console.warn('[room images] skipped', entry.id, error);
    return null;
  })));
  return Object.freeze(decoded.filter(Boolean));
}

/** The suite's sample images, as loadImages() takes them. */
export function defaultEntries() {
  return DEFAULT_IMAGES.map((d) => ({ id: d.id, src: `${DEFAULTS_URL}/${d.file}`, default: true }));
}
