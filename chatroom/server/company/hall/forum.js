/**
 * Forums: the group channels of a company, lasting and readable by everyone in it.
 * ────────────────────────────────────────────────────────────────────────────────
 * A department room is a live chat among the people in it. A forum is for what more than one person, or more than one room, needs to know or
 * answer, and for what should still be there next week: announcements, general work that crosses departments, questions to the whole company,
 * a record of decisions, and one channel for each department. Threads, not a stream: a post starts a thread with a title, a reply answers it,
 * and a thread can only grow so long.
 *
 * Who may post is a property of the channel: everyone, the leads (and the company), or only the company. Who a post is from is stamped by
 * the server. The owner reads every channel and can pin or remove a post. Posts are screened before they are written (tools.js).
 */
import { transaction, plain } from '../flow/sqlite.js';
import { PolicyError } from '../errors.js';
import { HALL_LIMITS, DEFAULT_CHANNELS } from './limits.js';
import { rid, bad, refuse, missing, cleanLine, cleanBlock } from './common.js';

const L = HALL_LIMITS.forum;
const slugOf = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, L.slug);

export class Forum {
  constructor({ db, now = () => new Date() }) {
    this.db = db;
    this.now = now;
  }

  _stamp() { return this.now().toISOString(); }

  _channelShape(r) {
    return { id: r.id, slug: r.slug, title: r.title, purpose: r.purpose, kind: r.kind, departmentId: r.department_id, postPolicy: r.post_policy, createdAt: r.created_at };
  }

  _postShape(r) {
    return {
      id: r.id, channelId: r.channel_id, channel: r.channel_slug, threadId: r.thread_id, replyTo: r.reply_to,
      author: { id: r.author_id, name: r.author_name }, title: r.title, body: r.body, pinned: Boolean(r.pinned), createdAt: r.created_at,
    };
  }

  _channel(ownerId, companyId, slug) {
    const row = this.db.prepare('SELECT * FROM forum_channels WHERE owner_id = ? AND company_id = ? AND slug = ?').get(ownerId, companyId, String(slug ?? '').toLowerCase());
    if (!row) {
      const known = this.db.prepare('SELECT slug FROM forum_channels WHERE owner_id = ? AND company_id = ? ORDER BY rowid').all(ownerId, companyId).map(r => r.slug);
      throw new PolicyError(`No channel called "${String(slug ?? '').slice(0, 40)}". Channels: ${known.join(', ') || 'none yet'}.`, { status: 404, code: 'no_channel' });
    }
    return plain(row);
  }

  /** The starting channels, and one for each department. Safe to run again: what exists is left as it is. */
  ensureDefaults(ownerId, companyId, departments = []) {
    const add = (c) => this.db.prepare(
      `INSERT OR IGNORE INTO forum_channels (id, owner_id, company_id, slug, title, purpose, kind, department_id, post_policy, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(rid(), ownerId, companyId, c.slug, c.title, c.purpose, c.kind, c.departmentId || null, c.postPolicy, this._stamp());
    transaction(this.db, () => {
      for (const c of DEFAULT_CHANNELS) add(c);
      for (const d of departments) {
        add({ slug: `dept-${slugOf(d.name) || d.id}`, title: `${d.name}`, purpose: `Threads for and about the ${d.name} department.`, kind: 'department', departmentId: d.id, postPolicy: 'everyone' });
      }
    });
    return this.channels(ownerId, companyId);
  }

  /** The owner adds a channel. */
  addChannel(ownerId, companyId, { slug, title, purpose = '', postPolicy = 'everyone' }) {
    const clean = slugOf(cleanLine(slug ?? title, 'The channel name', L.slug, 'slug'));
    if (!clean) throw bad('A channel name needs letters or digits.', { field: 'slug' });
    if (!['everyone', 'leads', 'owner'].includes(postPolicy)) throw bad('postPolicy must be everyone, leads or owner.', { field: 'postPolicy' });
    const count = this.db.prepare('SELECT COUNT(*) AS n FROM forum_channels WHERE company_id = ?').get(companyId).n;
    if (count >= L.channels) throw refuse(`A company has at most ${L.channels} channels.`, 'channel_cap', 403);
    try {
      this.db.prepare(
        `INSERT INTO forum_channels (id, owner_id, company_id, slug, title, purpose, kind, department_id, post_policy, created_at) VALUES (?, ?, ?, ?, ?, ?, 'custom', NULL, ?, ?)`,
      ).run(rid(), ownerId, companyId, clean, cleanLine(title ?? slug, 'The title', 80, 'title'), purpose ? cleanLine(purpose, 'The purpose', L.purpose, 'purpose') : '', postPolicy, this._stamp());
    } catch (err) {
      if (/UNIQUE/.test(String(err.message))) throw refuse(`There is already a channel called "${clean}".`, 'channel_exists', 409, { field: 'slug' });
      throw err;
    }
    return this._channelShape(this._channel(ownerId, companyId, clean));
  }

  /** The channels with how many threads and posts each holds, and (for a person) how many posts by others they have not seen. */
  channels(ownerId, companyId, { employeeId = null } = {}) {
    const rows = this.db.prepare('SELECT * FROM forum_channels WHERE owner_id = ? AND company_id = ? ORDER BY rowid').all(ownerId, companyId).map(plain);
    return rows.map(c => {
      const totals = this.db.prepare('SELECT COUNT(*) AS posts, COUNT(DISTINCT thread_id) AS threads FROM forum_posts WHERE channel_id = ?').get(c.id);
      let unread = 0;
      if (employeeId) {
        const seen = this.db.prepare('SELECT last_seen_rowid FROM forum_reads WHERE employee_id = ? AND channel_id = ?').get(employeeId, c.id)?.last_seen_rowid || 0;
        unread = this.db.prepare('SELECT COUNT(*) AS n FROM forum_posts WHERE channel_id = ? AND rowid > ? AND (author_id IS NULL OR author_id != ?)').get(c.id, seen, employeeId).n;
      }
      return { ...this._channelShape(c), threads: totals.threads, posts: totals.posts, ...(employeeId ? { unread } : {}) };
    });
  }

  /** Channels with posts a person has not seen, for the digest at the top of their turn. */
  unreadFor(ownerId, companyId, employeeId) {
    return this.channels(ownerId, companyId, { employeeId }).filter(c => c.unread > 0).map(c => ({ slug: c.slug, title: c.title, unread: c.unread }));
  }

  _mayPost(channel, author) {
    if (author.system) return;
    if (channel.post_policy === 'owner') throw refuse(`Only the company posts in #${channel.slug}.`, 'not_allowed', 403);
    if (channel.post_policy === 'leads' && !author.isLead) throw refuse(`Only department leads and the company post in #${channel.slug}. Ask your lead, or post in #general or #help.`, 'not_allowed', 403);
  }

  /** Start a thread. @param {{ id: string|null, name: string, isLead?: boolean, system?: boolean }} author */
  post(ownerId, companyId, author, { channel, title, body }) {
    const c = this._channel(ownerId, companyId, channel);
    this._mayPost(c, author);
    const cleanTitle = cleanLine(title, 'The title', L.title, 'title');
    const text = cleanBlock(body, 'The post', L.body, 'body');
    const id = rid();
    this.db.prepare(
      `INSERT INTO forum_posts (id, owner_id, company_id, channel_id, thread_id, reply_to, author_id, author_name, title, body, pinned, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 0, ?)`,
    ).run(id, ownerId, companyId, c.id, id, author.id || null, author.name, cleanTitle, text, this._stamp());
    return this._post(id, c.slug);
  }

  /** Answer a thread. */
  reply(ownerId, companyId, author, { threadId, body }) {
    const start = this.db.prepare(
      `SELECT p.*, ch.slug AS channel_slug, ch.post_policy AS post_policy FROM forum_posts p JOIN forum_channels ch ON ch.id = p.channel_id
       WHERE p.id = ? AND p.thread_id = p.id AND p.owner_id = ? AND p.company_id = ?`,
    ).get(String(threadId), ownerId, companyId);
    if (!start) throw missing('thread');
    if (start.post_policy === 'owner' && !author.system) throw refuse(`Only the company posts in #${start.channel_slug}; if you have a question about it, ask in #help.`, 'not_allowed', 403);
    const replies = this.db.prepare('SELECT COUNT(*) AS n FROM forum_posts WHERE thread_id = ? AND id != thread_id').get(start.id).n;
    if (replies >= L.threadReplies) throw refuse(`This thread has ${replies} replies. Write down what was decided in #decisions and start a new thread if there is more to do.`, 'thread_too_long', 409);
    const text = cleanBlock(body, 'The reply', L.body, 'body');
    const id = rid();
    this.db.prepare(
      `INSERT INTO forum_posts (id, owner_id, company_id, channel_id, thread_id, reply_to, author_id, author_name, title, body, pinned, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?)`,
    ).run(id, ownerId, companyId, start.channel_id, start.id, start.id, author.id || null, author.name, text, this._stamp());
    return this._post(id, start.channel_slug);
  }

  _post(id, slug) {
    return this._postShape({ ...plain(this.db.prepare('SELECT * FROM forum_posts WHERE id = ?').get(id)), channel_slug: slug });
  }

  /**
   * Read a channel (its threads: pinned first, then by latest activity) or one thread (the starter and its replies, oldest first).
   * A person who reads has seen what is there, so their unread count for the channel clears.
   */
  read(ownerId, companyId, { channel, threadId = null, employeeId = null, limit = L.readThreads } = {}) {
    if (threadId) {
      const rows = this.db.prepare(
        `SELECT p.*, ch.slug AS channel_slug FROM forum_posts p JOIN forum_channels ch ON ch.id = p.channel_id
         WHERE p.owner_id = ? AND p.company_id = ? AND p.thread_id = ? ORDER BY p.rowid LIMIT ?`,
      ).all(ownerId, companyId, String(threadId), L.readPosts + 1).map(r => this._postShape(plain(r)));
      if (!rows.length) throw missing('thread');
      if (employeeId) this._markSeen(employeeId, rows[0].channelId);
      return { thread: rows[0], posts: rows.slice(1, L.readPosts + 1), more: Math.max(0, rows.length - 1 - L.readPosts) };
    }
    const c = this._channel(ownerId, companyId, channel);
    const threads = this.db.prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM forum_posts r WHERE r.thread_id = s.id AND r.id != s.id) AS replies,
              (SELECT MAX(r.created_at) FROM forum_posts r WHERE r.thread_id = s.id) AS last_at
       FROM forum_posts s WHERE s.channel_id = ? AND s.id = s.thread_id ORDER BY s.pinned DESC, last_at DESC, s.rowid DESC LIMIT ?`,
    ).all(c.id, Math.max(1, Math.min(Number(limit) || L.readThreads, 50))).map(r => ({ ...this._postShape({ ...plain(r), channel_slug: c.slug }), replies: r.replies, lastAt: r.last_at }));
    if (employeeId) this._markSeen(employeeId, c.id);
    return { channel: this._channelShape(c), threads };
  }

  _markSeen(employeeId, channelId) {
    const top = this.db.prepare('SELECT COALESCE(MAX(rowid), 0) AS r FROM forum_posts WHERE channel_id = ?').get(channelId).r;
    this.db.prepare(
      `INSERT INTO forum_reads (employee_id, channel_id, last_seen_rowid) VALUES (?, ?, ?)
       ON CONFLICT (employee_id, channel_id) DO UPDATE SET last_seen_rowid = excluded.last_seen_rowid`,
    ).run(employeeId, channelId, top);
  }

  // ── the owner ──────────────────────────────────────────────────────────────

  pin(ownerId, companyId, postId, pinned = true) {
    const row = this.db.prepare('SELECT id, thread_id FROM forum_posts WHERE id = ? AND owner_id = ? AND company_id = ?').get(String(postId), ownerId, companyId);
    if (!row || row.id !== row.thread_id) throw missing('thread');
    this.db.prepare('UPDATE forum_posts SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, row.id);
    return { pinned: Boolean(pinned) };
  }

  /** Remove a post; removing a thread's first post removes the thread. */
  removePost(ownerId, companyId, postId) {
    const row = this.db.prepare('SELECT id, thread_id FROM forum_posts WHERE id = ? AND owner_id = ? AND company_id = ?').get(String(postId), ownerId, companyId);
    if (!row) throw missing('post');
    const n = row.id === row.thread_id
      ? this.db.prepare('DELETE FROM forum_posts WHERE thread_id = ?').run(row.id).changes
      : this.db.prepare('DELETE FROM forum_posts WHERE id = ?').run(row.id).changes;
    return { removed: Number(n) };
  }

  removeCompany(ownerId, companyId) {
    const n = this.db.prepare('DELETE FROM forum_channels WHERE owner_id = ? AND company_id = ?').run(ownerId, companyId).changes;
    return { removed: Number(n) };
  }
}
