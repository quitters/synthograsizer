/**
 * Typed composition slots for the image path.
 *
 * gemini-3.1-flash-image accepts up to 10 object images, 4 character-consistency
 * images and 3 style references, and treats each slot differently. The character
 * slots are the ones that matter for a room: they are how a storyboard holds a
 * recurring character across beats, which is what the `memory_visualization` and
 * `cinematic_short` workflow templates want.
 *
 * This module is deliberately dependency-free so it can be unit tested without
 * pulling in the Google SDK, sharp, or the workflow engine.
 */

export const SLOTS = ['objects', 'character', 'style'];

/** Per-slot caps the model documents. */
export const SLOT_LIMITS = Object.freeze({
  objects: 10,
  character: 4,
  style: 3,
});

// What a caller may write on a reference, mapped to its canonical slot.
const ROLE_ALIASES = Object.freeze({
  object: 'objects',
  objects: 'objects',
  character: 'character',
  characters: 'character',
  style: 'style',
  styles: 'style',
});

/**
 * Resolve a caller-supplied role to a canonical slot name.
 * @param {string|undefined|null} role
 * @returns {string|null} canonical slot, or null for an untyped reference
 * @throws {Error} if the role is a non-empty string that names no slot
 */
export function resolveSlot(role) {
  if (role === undefined || role === null || role === '') return null;
  const slot = ROLE_ALIASES[String(role).toLowerCase()];
  if (!slot) {
    throw new Error(
      `Unknown reference role "${role}"; expected one of ${SLOTS.join(' / ')}`
    );
  }
  return slot;
}

/**
 * Turn a mixed reference list into the /api/generate/image payload fields.
 *
 * References without a `role` stay in the flat `input_images` list — that is
 * the shape every existing caller already sends and it keeps working byte for
 * byte. References with a role are grouped into `references`, which the backend
 * sends as slot-tagged image blocks.
 *
 * Over-cap slots are trimmed rather than throwing: dropping the 5th character
 * reference still produces the picture the room asked for, where failing the
 * whole generation does not.
 *
 * @param {Array<{imageData: string, mimeType?: string, role?: string}>} referenceImages
 * @param {{ warn?: (msg: string) => void }} [opts]
 * @returns {{ input_images?: string[], references?: Record<string, string[]> }}
 */
export function buildReferencePayload(referenceImages = [], opts = {}) {
  const warn = opts.warn || ((msg) => console.warn(msg));

  const flat = [];
  const slots = {};

  for (const ref of referenceImages || []) {
    if (!ref) continue;
    const data = ref.imageData;
    if (!data) continue;
    const slot = resolveSlot(ref.role);
    if (slot === null) {
      flat.push(data);
    } else {
      (slots[slot] ||= []).push(data);
    }
  }

  const payload = {};
  if (flat.length > 0) payload.input_images = flat;

  const references = {};
  for (const slot of SLOTS) {
    const images = slots[slot];
    if (!images || images.length === 0) continue;
    const cap = SLOT_LIMITS[slot];
    if (images.length > cap) {
      warn(
        `buildReferencePayload: ${images.length} "${slot}" references given but ` +
        `the model accepts ${cap}; dropping the extras.`
      );
    }
    references[slot] = images.slice(0, cap);
  }
  if (Object.keys(references).length > 0) payload.references = references;

  return payload;
}
