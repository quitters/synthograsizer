/**
 * Mailboxes: one per person, for the messages that must outlast a room.
 * ──────────────────────────────────────────────────────────────────────
 * A department room is a live conversation; people in different rooms cannot hear each other, and nothing said in a room reaches a person
 * who was not in it. A mailbox is the individual, asynchronous channel between rooms and between sessions. What keeps it from becoming
 * chatter (the Backrooms with extra steps):
 *
 *   TYPED      every message is an ask, handoff, review, decision or fyi (an answer only as a reply, a notice only from the company), with a
 *              subject and a body of a few sentences at most. Anything longer is a file in the workspace with a line pointing at it.
 *   BOUNDED    a few recipients, a cap on what may wait in one inbox, a cap on how deep a thread may go, and (in the tool layer) a cap on
 *              what one person may send in a session. Nobody replies to news or notices.
 *   STAMPED    the sender is whoever the server says: it is never read from the message. A person cannot write as a colleague, as the
 *              Producer or as the owner.
 *   CLOSED     recipients are looked up among the people of the sender's own company. There is no address that leaves it.
 *   READABLE   the owner can read every mailbox. There is no private channel.
 *
 * This is the data layer. Screening a message (the independent reviewer reads every one before it is delivered) and counting what a person
 * has sent this session are the tool layer's job (tools.js), where the model's call is.
 */
import { transaction, plain } from '../flow/sqlite.js';
import { HALL_LIMITS, AGENT_MAIL_KINDS, NO_REPLY_KINDS } from './limits.js';
import { rid, bad, refuse, missing, cleanLine, cleanBlock } from './common.js';

const L = HALL_LIMITS.mail;

export class Mail {
  /** @param {{ db: object, now?: () => Date }} options */
  constructor({ db, now = () => new Date() }) {
    this.db = db;
    this.now = now;
  }

  _stamp() { return this.now().toISOString(); }

  /** The people at a company who can receive mail: everyone who has not left. */
  people(ownerId, companyId) {
    return this.db.prepare(
      `SELECT e.id AS id, c.name AS name FROM employees e JOIN candidates c ON c.id = e.candidate_id
       WHERE e.owner_id = ? AND e.company_id = ? AND e.left_at IS NULL ORDER BY e.rowid`,
    ).all(ownerId, companyId).map(plain);
  }

  /**
   * Names to people. A full name matches exactly (any case); a first name matches if only one person has it.
   * @returns {{ found: {id: string, name: string}[], unknown: string[], ambiguous: string[] }}
   */
  resolve(people, names) {
    const found = [];
    const unknown = [];
    const ambiguous = [];
    for (const raw of names) {
      const n = String(raw ?? '').trim().toLowerCase();
      if (!n) continue;
      let hits = people.filter(p => p.name.toLowerCase() === n);
      if (!hits.length) hits = people.filter(p => p.name.toLowerCase().split(' ')[0] === n);
      if (hits.length === 1) { if (!found.some(f => f.id === hits[0].id)) found.push(hits[0]); }
      else if (hits.length > 1) ambiguous.push(String(raw).slice(0, 60));
      else unknown.push(String(raw).slice(0, 60));
    }
    return { found, unknown, ambiguous };
  }

  _shape(r) {
    return {
      id: r.id, threadId: r.thread_id, replyTo: r.reply_to,
      from: { id: r.from_id, name: r.from_name }, to: { id: r.to_id, name: r.to_name },
      kind: r.kind, subject: r.subject, body: r.body, ref: r.ref, state: r.state,
      createdAt: r.created_at, readAt: r.read_at, doneAt: r.done_at,
    };
  }

  _select(where, args, { limit = 100, order = 'DESC' } = {}) {
    return this.db.prepare(
      `SELECT m.*, c.name AS to_name FROM mail m JOIN employees e ON e.id = m.to_id JOIN candidates c ON c.id = e.candidate_id
       WHERE ${where} ORDER BY m.rowid ${order} LIMIT ?`,
    ).all(...args, limit).map(r => this._shape(plain(r)));
  }

  _insert(ownerId, companyId, sender, recipient, { kind, subject, body, ref, threadId, replyTo }) {
    const id = rid();
    const row = {
      id, owner_id: ownerId, company_id: companyId, thread_id: threadId, reply_to: replyTo || null,
      from_id: sender.id || null, from_name: sender.name, to_id: recipient.id, kind, subject, body, ref: ref || null,
      state: 'unread', created_at: this._stamp(), read_at: null, done_at: null,
    };
    this.db.prepare(`INSERT INTO mail (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`).run(...Object.values(row));
    return id;
  }

  _unread(toId) {
    return this.db.prepare("SELECT COUNT(*) AS n FROM mail WHERE to_id = ? AND state = 'unread'").get(toId).n;
  }

  _content({ subject, body, ref }) {
    return {
      subject: cleanLine(subject, 'The subject', L.subject, 'subject'),
      body: cleanBlock(body, 'The message', L.body, 'body'),
      ref: ref === undefined || ref === null || ref === '' ? null : cleanLine(ref, 'The reference', 200, 'ref'),
    };
  }

  /**
   * A person writes to colleagues, by name.
   * @param {string} ownerId
   * @param {string} companyId
   * @param {{ id: string, name: string }} sender  the employee the server says is sending
   * @param {{ to: string[], kind: string, subject: string, body: string, ref?: string }} message
   * @returns {object[]} the messages delivered, one per recipient
   */
  send(ownerId, companyId, sender, message) {
    if (!AGENT_MAIL_KINDS.includes(message?.kind)) throw bad(`kind must be one of ${AGENT_MAIL_KINDS.join(', ')}. (An answer is a reply to a message you received.)`, { field: 'kind' });
    const names = Array.isArray(message.to) ? message.to : (typeof message.to === 'string' ? [message.to] : []);
    if (!names.length) throw bad('Say who the message is for: "to" takes the names of your colleagues.', { field: 'to' });
    if (names.length > L.recipients) throw bad(`A message can go to at most ${L.recipients} people. For more, post in a forum.`, { field: 'to' });
    const people = this.people(ownerId, companyId);
    const { found, unknown, ambiguous } = this.resolve(people, names);
    if (unknown.length || ambiguous.length) {
      const known = people.filter(p => p.id !== sender.id).map(p => p.name).join(', ');
      throw bad(`${unknown.length ? `No one here is called ${unknown.map(n => `"${n}"`).join(', ')}. ` : ''}${ambiguous.length ? `${ambiguous.map(n => `"${n}"`).join(', ')} could be more than one person; use the full name. ` : ''}People you can write to: ${known || 'no one else yet'}.`, { field: 'to' });
    }
    if (found.some(p => p.id === sender.id)) throw bad('You cannot write to yourself; use your own notes.', { field: 'to' });
    const content = this._content(message);
    return this._deliver(ownerId, companyId, sender, found, { kind: message.kind, ...content, threadId: rid(), replyTo: null });
  }

  _deliver(ownerId, companyId, sender, recipients, { kind, subject, body, ref, threadId, replyTo }) {
    const full = recipients.filter(p => this._unread(p.id) >= L.inboxUnread);
    if (full.length) throw refuse(`${full.map(p => p.name).join(', ')} ${full.length === 1 ? 'has' : 'have'} ${L.inboxUnread} unread messages already; they cannot take more until they read some. Put it in a forum or the workspace instead.`, 'inbox_full', 409);
    const ids = transaction(this.db, () => recipients.map(p => this._insert(ownerId, companyId, sender, p, { kind, subject, body, ref, threadId, replyTo })));
    return ids.map(id => this._select('m.id = ? AND m.owner_id = ?', [id, ownerId], { limit: 1 })[0]);
  }

  /** The company itself writes (the Producer, or the owner): a notice, which nobody replies to. */
  notify(ownerId, companyId, { from = 'Producer', toIds, subject, body, ref, kind = 'notice' }) {
    const people = this.people(ownerId, companyId).filter(p => toIds.includes(p.id));
    if (!people.length) return [];
    const content = this._content({ subject, body, ref });
    return this._deliver(ownerId, companyId, { id: null, name: String(from).slice(0, 40) }, people, { kind, ...content, threadId: rid(), replyTo: null });
  }

  /**
   * A person answers a message they received. The answer goes to whoever wrote it, in the same thread, and the message is marked done.
   * Nobody replies to news (fyi) or to a notice, and a thread can only run so long.
   */
  reply(ownerId, companyId, sender, messageId, { body }) {
    const original = this._select('m.id = ? AND m.owner_id = ? AND m.company_id = ?', [String(messageId), ownerId, companyId], { limit: 1 })[0];
    if (!original || original.to.id !== sender.id) throw missing('message');
    if (NO_REPLY_KINDS.includes(original.kind)) throw refuse(`That is ${original.kind === 'fyi' ? 'news' : 'a notice'}, which nobody replies to. If you have something to add, write a new message with its own subject.`, 'no_reply', 409);
    if (!original.from.id) throw refuse('That message came from the company itself, so there is no one to reply to.', 'no_reply', 409);
    const author = this.people(ownerId, companyId).find(p => p.id === original.from.id);
    if (!author) throw refuse(`${original.from.name} has left the company, so there is no one to reply to.`, 'sender_left', 409);
    const depth = this.db.prepare('SELECT COUNT(*) AS n FROM mail WHERE company_id = ? AND thread_id = ? AND (to_id = ? OR from_id = ?)').get(companyId, original.threadId, sender.id, sender.id).n;
    if (depth >= L.threadDepth) throw refuse(`This thread already has ${depth} messages. Write down what was decided (the "decisions" forum) and, if there is more to do, start a new thread with a new subject.`, 'thread_too_long', 409);
    const text = cleanBlock(body, 'The reply', L.body, 'body');
    const subject = original.subject.startsWith('Re: ') ? original.subject : `Re: ${original.subject}`.slice(0, L.subject);
    const [message] = this._deliver(ownerId, companyId, sender, [author], { kind: 'answer', subject, body: text, ref: original.ref, threadId: original.threadId, replyTo: original.id });
    this.db.prepare("UPDATE mail SET state = 'done', done_at = ? WHERE id = ?").run(this._stamp(), original.id);
    return message;
  }

  /** What is waiting for a person: unread first, then read but not done, newest first; unread ones become read. */
  readWaiting(ownerId, employeeId, { limit = L.readAtOnce } = {}) {
    const rows = this._select("m.to_id = ? AND m.owner_id = ? AND m.state != 'done'", [employeeId, ownerId], { limit: 200 });
    rows.sort((a, b) => (a.state === b.state ? 0 : a.state === 'unread' ? -1 : 1));
    const shown = rows.slice(0, limit);
    this._markRead(shown.filter(m => m.state === 'unread').map(m => m.id));
    return { messages: shown, waiting: rows.length, more: Math.max(0, rows.length - shown.length) };
  }

  /** Every message in a thread that this person sent or received, oldest first. */
  readThread(ownerId, employeeId, threadId) {
    const msgs = this.db.prepare(
      `SELECT m.*, c.name AS to_name FROM mail m JOIN employees e ON e.id = m.to_id JOIN candidates c ON c.id = e.candidate_id
       WHERE m.owner_id = ? AND m.thread_id = ? AND (m.to_id = ? OR m.from_id = ?) ORDER BY m.rowid LIMIT 100`,
    ).all(ownerId, String(threadId), employeeId, employeeId).map(r => this._shape(plain(r)));
    if (!msgs.length) throw missing('thread');
    this._markRead(msgs.filter(m => m.to.id === employeeId && m.state === 'unread').map(m => m.id));
    return msgs;
  }

  _markRead(ids) {
    if (!ids.length) return;
    const stamp = this._stamp();
    const mark = this.db.prepare("UPDATE mail SET state = 'read', read_at = ? WHERE id = ? AND state = 'unread'");
    for (const id of ids) mark.run(stamp, id);
  }

  /** The person marks a message handled without replying. */
  done(ownerId, employeeId, messageId) {
    const row = this.db.prepare('SELECT id FROM mail WHERE id = ? AND owner_id = ? AND to_id = ?').get(String(messageId), ownerId, employeeId);
    if (!row) throw missing('message');
    this.db.prepare("UPDATE mail SET state = 'done', done_at = ? WHERE id = ?").run(this._stamp(), row.id);
    return { done: true };
  }

  /** How many are waiting, and the first few, for the digest at the top of a person's turn. */
  digest(ownerId, employeeId, { limit = L.digestItems } = {}) {
    const unread = this._select("m.to_id = ? AND m.owner_id = ? AND m.state = 'unread'", [employeeId, ownerId], { limit: 200 });
    const open = this.db.prepare("SELECT COUNT(*) AS n FROM mail WHERE to_id = ? AND owner_id = ? AND state = 'read'").get(employeeId, ownerId).n;
    return { unread: unread.length, open, items: unread.slice(0, limit) };
  }

  /** The owner's view: every message in the company, or one person's mailbox. */
  forOwner(ownerId, companyId, { toId = null, state = null, thread = null, limit = 100 } = {}) {
    const where = ['m.owner_id = ?', 'm.company_id = ?'];
    const args = [ownerId, companyId];
    if (toId) { where.push('m.to_id = ?'); args.push(toId); }
    if (state) { where.push('m.state = ?'); args.push(state); }
    if (thread) { where.push('m.thread_id = ?'); args.push(thread); }
    return this._select(where.join(' AND '), args, { limit: Math.max(1, Math.min(Number(limit) || 100, 500)) });
  }

  /** Per person: how many are unread and how many are waiting, for the owner's overview. */
  counts(ownerId, companyId) {
    return this.db.prepare(
      `SELECT m.to_id AS employee_id, SUM(m.state = 'unread') AS unread, SUM(m.state != 'done') AS open, COUNT(*) AS total
       FROM mail m WHERE m.owner_id = ? AND m.company_id = ? GROUP BY m.to_id`,
    ).all(ownerId, companyId).map(r => ({ employeeId: r.employee_id, unread: Number(r.unread), open: Number(r.open), total: Number(r.total) }));
  }

  removeCompany(ownerId, companyId) {
    return { removed: Number(this.db.prepare('DELETE FROM mail WHERE owner_id = ? AND company_id = ?').run(ownerId, companyId).changes) };
  }
}
