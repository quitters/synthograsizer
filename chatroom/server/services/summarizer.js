/**
 * A rolling summary of the part of a conversation that no longer fits in the prompt.
 *
 * Each agent turn sees the last RECENT_WINDOW messages in full. Everything older used
 * to be reduced to the first 80 characters of each message, which keeps a topic's
 * name and loses what was decided, who disagreed, and what is still open -- so long
 * sessions drifted and agents re-argued settled points. Now a cheap model folds
 * messages into one running summary as they age out of the window, a few at a time.
 *
 * The summary is advisory and best-effort: it is built in the background between
 * turns, a failure only means the older, cruder notes are used a little longer, and
 * it is dropped the moment the messages it describes change (rewind, branch restore).
 *
 * This module is pure -- it never calls a model itself. The caller supplies
 * `generate(prompt) -> text`, which keeps it testable and keeps API plumbing in gemini.js.
 */

/** Messages shown to an agent in full. */
export const RECENT_WINDOW = 15;
/** Messages that must age out of the window before a (billed) summary refresh is worth it. */
export const SUMMARY_BATCH = 6;
/** Most messages folded in by one refresh; a long backlog is worked off over several turns. */
export const MAX_FOLD_MESSAGES = 30;
/** Hard cap on the summary text kept and sent to every agent every turn. */
export const SUMMARY_MAX_CHARS = 3000;
/** A single message is clipped to this when it is fed to the summarizer. */
const MESSAGE_CLIP_CHARS = 1500;

/** A message as the summarizer reads it: name, text, and a note of anything attached. */
export function describeMessage(msg) {
  const who = msg.isUser ? `${msg.agentName || 'User'} (the user)` : msg.agentName;
  let text = (msg.content || '').trim();
  if (text.length > MESSAGE_CLIP_CHARS) text = `${text.slice(0, MESSAGE_CLIP_CHARS)}...`;
  const notes = [];
  if (msg.images?.length) notes.push(`generated ${msg.images.length} image(s): ${msg.images.map(i => `"${i.prompt || i.caption || 'untitled'}"`).join(', ')}`);
  if (msg.synthMedia?.length) notes.push(`produced ${msg.synthMedia.length} media item(s)`);
  if (msg.toolResults?.length) {
    notes.push(`used tools: ${msg.toolResults.map(r => `${r.type} "${r.query || r.url || ''}"`).join(', ')}`);
  }
  if (msg.workflowIds?.length) notes.push(`started ${msg.workflowIds.length} workflow(s)`);
  const suffix = notes.length ? `\n  [${notes.join('; ')}]` : '';
  return `[${who}]: ${text}${suffix}`;
}

/** The instruction sent to the summarizing model. */
export function buildSummaryPrompt({ goal, previous, messages }) {
  const lines = messages.map(describeMessage).join('\n\n');
  return `You keep the running notes for a discussion between several participants. The notes are read by the participants before every turn to remember what already happened, so they must be accurate and compact.

SHARED GOAL OF THE DISCUSSION:
${goal || '(none stated)'}

${previous ? `NOTES SO FAR:\n${previous}\n` : 'There are no notes yet.\n'}
NEW MESSAGES TO FOLD INTO THE NOTES:
${lines}

Write the updated notes. Rules:
- Keep what a participant would need to continue without repeating themselves: decisions made and who made them, positions each participant holds (especially disagreements), concrete choices and details (names, numbers, options picked or rejected), what is still open or unresolved, and work already produced (files, images, workflows).
- Keep everything important from the notes so far; shorten older material before dropping it.
- Attribute by name. Write in the third person and the past tense. Do not address the participants and do not add advice or opinions of your own.
- Do not invent anything that is not in the notes or the new messages.
- At most ${Math.round(SUMMARY_MAX_CHARS / 6)} words. Plain text with short paragraphs or dashes, no headings.
Reply with the updated notes only.`;
}

/** Fold `messages` into `previous` (a string, possibly empty). Returns the new notes. */
export async function foldIntoSummary({ goal, previous = '', messages, generate }) {
  const raw = await generate(buildSummaryPrompt({ goal, previous, messages }));
  const text = String(raw ?? '').trim();
  if (!text) throw new Error('summarizer returned nothing');
  if (text.length <= SUMMARY_MAX_CHARS) return text;
  // Over budget: cut at a sentence/line end where possible, never mid-word.
  const cut = text.slice(0, SUMMARY_MAX_CHARS);
  const end = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. '));
  return `${(end > SUMMARY_MAX_CHARS * 0.6 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '')).trim()} ...`;
}

/**
 * Is `summary` ({ text, upTo, lastId }) still a true account of `messages[0..upTo)`?
 * It stops being one when the history is rewound, a branch is restored, or the chat
 * is reset, which is detected by the id of the last message it covers.
 */
export function summaryIsValid(summary, messages) {
  return !!summary && !!summary.text && summary.upTo > 0 && summary.upTo <= messages.length
    && messages[summary.upTo - 1]?.id === summary.lastId;
}

/** Index range of messages that have aged out of the window and are not yet summarized. */
export function agedRange(messages, summary) {
  const from = summaryIsValid(summary, messages) ? summary.upTo : 0;
  const to = Math.max(0, messages.length - RECENT_WINDOW);
  return { from, to: Math.max(from, to) };
}

/** Enough new aged-out messages to justify a refresh? */
export function needsRefresh(messages, summary) {
  const { from, to } = agedRange(messages, summary);
  return to - from >= SUMMARY_BATCH;
}
