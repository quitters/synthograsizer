/**
 * Which of the user's reference files an agent should see on a given turn.
 *
 * Reference files (images, text, PDFs, video) used to be shown only while the chat had
 * two messages or fewer. After that agents were told the file names and nothing else:
 * a reference image or a notes file was invisible for the whole rest of the session, and
 * anything uploaded after the first exchange was never shown at all.
 *
 * The rule is now budgeted rather than all-or-nothing, because every attached byte is
 * re-sent on every turn:
 *
 *   images   attached every turn, newest first, up to a count and a size budget
 *   text     included inline every turn, with a shared character budget
 *   video,   heavy in tokens and bytes: attached while "fresh" (the opening turns, and
 *   PDF     the few turns after an upload, so every agent gets a look) and listed by
 *            name afterwards
 *   other    listed by name
 *
 * Anything not attached is still listed with the reason, so an agent can tell the user
 * what it cannot see rather than guessing.
 *
 * This module is pure: it only decides. gemini.js turns the plan into request blocks.
 */

export const MEDIA_LIMITS = Object.freeze({
  maxImages: 8,
  imageBudgetChars: 6_000_000,     // base64 characters of images attached per turn
  heavyBudgetChars: 8_000_000,     // video + PDF attached per turn (while fresh)
  textBudgetChars: 30_000,         // decoded text included per turn, across all text files
  textPerFileChars: 8_000,
  minTextPerFileChars: 500,
});

const TEXT_TYPES = new Set([
  'application/json', 'text/plain', 'text/csv', 'text/html', 'text/markdown', 'text/xml',
  'application/xml', 'text/css', 'text/javascript', 'application/javascript',
]);

export const isImage = (m) => /^image\//.test(m.mimeType || '');
export const isVideo = (m) => m.mimeType === 'video/mp4' || m.mimeType === 'video/webm';
export const isPdf = (m) => m.mimeType === 'application/pdf';
export const isTextMedia = (mimeType) => TEXT_TYPES.has(mimeType);
/** Media a model can look at inline: images and the two video types. */
export const isVisualMedia = (mimeType) => !!mimeType && (mimeType.startsWith('image/') || mimeType === 'video/mp4' || mimeType === 'video/webm');

/**
 * Is this file one every agent should still be shown in full? True for the opening
 * turns, and for the turns right after it was uploaded -- as many as there are agents,
 * plus one, so each of them speaks at least once while it is fresh.
 */
export function isFresh(media, { messageCount, agentCount }) {
  if (messageCount <= 2) return true;
  const addedAt = media.addedAtMessage ?? 0;
  if (messageCount < addedAt) return true;            // history was rewound to before the upload
  return messageCount - addedAt <= Math.max(1, agentCount);
}

/**
 * @param {Array} sessionMedia   [{ id, name, mimeType, data (base64), addedAtMessage? }]
 * @param {{ messageCount: number, agentCount: number, limits?: object }} ctx
 * @returns {Array} one entry per file, in upload order:
 *   { media, kind: 'image'|'heavy'|'text'|'other', attached: boolean,
 *     reason?: string,            // why a visual file or PDF was not attached
 *     text?: string, truncated?: boolean, totalChars?: number, undecodable?: boolean }  // text files
 */
export function planSessionMedia(sessionMedia, { messageCount, agentCount, limits = MEDIA_LIMITS }) {
  const entries = sessionMedia.map((media) => ({
    media,
    kind: isImage(media) ? 'image' : (isVideo(media) || isPdf(media)) ? 'heavy' : isTextMedia(media.mimeType) ? 'text' : 'other',
    attached: false,
  }));
  const newestFirst = (a, b) => ((b.media.addedAtMessage ?? 0) - (a.media.addedAtMessage ?? 0)) || (entries.indexOf(b) - entries.indexOf(a));

  // Images: newest first until the count or the byte budget runs out.
  let count = 0;
  let used = 0;
  for (const entry of entries.filter(e => e.kind === 'image').sort(newestFirst)) {
    const size = entry.media.data?.length || 0;
    if (count >= limits.maxImages) { entry.reason = `only the ${limits.maxImages} newest images are attached each turn`; continue; }
    if (used + size > limits.imageBudgetChars) { entry.reason = 'over the size budget for images attached each turn'; continue; }
    entry.attached = true;
    count++;
    used += size;
  }

  // Video and PDF: only while fresh, within their own budget.
  used = 0;
  for (const entry of entries.filter(e => e.kind === 'heavy').sort(newestFirst)) {
    const size = entry.media.data?.length || 0;
    if (!isFresh(entry.media, { messageCount, agentCount })) {
      entry.reason = 'video and PDF files are only attached for a few turns after they are added, to keep each turn small';
    } else if (used + size > limits.heavyBudgetChars) {
      entry.reason = 'over the size budget for video and PDF attached each turn';
    } else {
      entry.attached = true;
      used += size;
    }
  }

  // Text: always included, sharing one budget.
  const textEntries = entries.filter(e => e.kind === 'text');
  const perFile = Math.min(limits.textPerFileChars,
    Math.max(limits.minTextPerFileChars, Math.floor(limits.textBudgetChars / Math.max(1, textEntries.length))));
  for (const entry of textEntries) {
    try {
      const full = Buffer.from(entry.media.data, 'base64').toString('utf-8');
      entry.attached = true;
      entry.totalChars = full.length;
      entry.truncated = full.length > perFile;
      entry.text = entry.truncated ? full.slice(0, perFile) : full;
    } catch {
      entry.undecodable = true;
    }
  }

  return entries;
}
