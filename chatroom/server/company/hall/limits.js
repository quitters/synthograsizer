/**
 * The Hall's limits, as data.
 * ───────────────────────────
 * The Hall is where the people of a company reach each other between rooms: mailboxes, forums, shared files, a task board, working agreements.
 * A shared space between agents is where a swarm either organises or drifts into the Backrooms, so everything here is bounded: the size of a
 * message, how many may wait, how long a thread may run, how many a person may send in a session (that one is a company ceiling, see
 * ceilings.js), how many files and tasks a company may keep. The numbers are small on purpose; a message that needs more words is a file in the
 * workspace with a one-line message pointing at it.
 */
import { deepFreeze } from '../util.js';

export const HALL_LIMITS = deepFreeze({
  mail: { subject: 120, body: 2000, recipients: 4, inboxUnread: 40, threadDepth: 8, readAtOnce: 10, readChars: 1200, digestItems: 5 },
  forum: { title: 120, body: 3000, channels: 20, threadReplies: 30, slug: 40, readThreads: 15, readPosts: 20, readChars: 1500, purpose: 200 },
  workspace: { path: 80, segments: 4, bytes: 60_000, files: 100, versions: 20, note: 200, readChars: 12_000 },
  board: { title: 120, description: 2000, openTasks: 100, members: 7, note: 300, listAtOnce: 30 },
  norms: { text: 400, why: 300, open: 12, approved: 8, rendered: 3000 },
});

/** What an agent may send. An answer is only ever a reply, and a notice only ever comes from the company (the Producer or the owner). */
export const AGENT_MAIL_KINDS = Object.freeze(['ask', 'handoff', 'review', 'decision', 'fyi']);
export const ALL_MAIL_KINDS = Object.freeze([...AGENT_MAIL_KINDS, 'answer', 'notice']);
/** Kinds nobody replies to: a reply to one is refused, which keeps notices and plain news from turning into conversations. */
export const NO_REPLY_KINDS = Object.freeze(['fyi', 'notice']);

export const TASK_STATUSES = Object.freeze(['todo', 'doing', 'review', 'done', 'blocked', 'cancelled']);
export const OPEN_TASK_STATUSES = Object.freeze(['todo', 'doing', 'review', 'blocked']);

/** The channels every company starts with (the department channels are added when the departments are known). */
export const DEFAULT_CHANNELS = Object.freeze([
  { slug: 'announcements', title: 'Announcements', purpose: 'What everyone needs to know. Leads and the owner post here.', kind: 'announcements', postPolicy: 'leads' },
  { slug: 'general', title: 'General', purpose: 'Work that crosses departments. Be concrete; this is not a lounge.', kind: 'general', postPolicy: 'everyone' },
  { slug: 'help', title: 'Help', purpose: 'Ask the company for what you cannot find out alone, and answer what you can.', kind: 'help', postPolicy: 'everyone' },
  { slug: 'decisions', title: 'Decisions', purpose: 'A record of what was decided and why, one line of context each.', kind: 'decisions', postPolicy: 'everyone' },
]);
