/**
 * The Hall's tools: what a person in a room can actually do.
 * ───────────────────────────────────────────────────────────
 * Five tools, one for each part of the Hall, each taking an `action` so that a person holds five declarations and not fifteen:
 *
 *   mailbox      read, send, reply, done
 *   forum        list, read, post, reply
 *   workspace    list, read, write
 *   board        list, create, update
 *   propose_norm propose a working agreement (the owner decides)
 *
 * What this layer adds to the data layer's rules (hall/*.js), and the guard dispatcher's (orchestrator._guardDispatch) before it:
 *
 *   WHO       the person is the employee the SERVER found for the speaking agent; nothing in the arguments can name the sender or the company.
 *   HOW MUCH  every write is counted against the person's budget for the session (the company's maxMessagesPerPerson and
 *             maxWorkspaceWritesPerPerson ceilings). A write that fails does not use any.
 *   OPEN      a part of the Hall the company has closed refuses, though its tool is not offered in the first place.
 *   RECORDED  each write leaves a line in the company's audit log: who, what kind, where. Never the words.
 *
 * (The independent screen has already read the words of every write before the handler is reached: the guard dispatcher runs it on the text
 * RoomPolicy.screenToolCall extracts from these arguments.) A handler answers { ok, text, summary? }; a refusal is { ok: false } and says why,
 * in words the person can act on. Anything that is not a refusal of the Hall's own rules is left to throw: the dispatcher reports it as a failure.
 */
import { isPolicyError } from '../errors.js';
import { renderMail, renderChannels, renderThreads, renderThread, renderFile, renderFiles, renderTasks } from './render.js';
import { AGENT_MAIL_KINDS } from './limits.js';

const asList = (v) => (Array.isArray(v) ? v : (typeof v === 'string' && v.trim() ? [v] : []));

/**
 * @param {object} ctx
 * @param {import('./hall.js').Hall} ctx.hall
 * @param {string} ctx.ownerId
 * @param {{ id: string, name: string, departments: {id: string, name: string}[] }} ctx.company
 * @param {{ id: string, name: string }} ctx.me      the employee the server says is speaking
 * @param {boolean} ctx.isLead                       whether they lead a department (for channels only leads may post in)
 * @param {string} ctx.nonce                         the reader's fence marker (layer.js)
 * @param {Record<string, boolean>} ctx.features     the parts of the Hall that are open
 * @param {{ left: (kind: 'messages'|'workspace') => number, commit: (kind: 'messages'|'workspace') => void }} ctx.use
 * @param {(type: string, data?: object) => void} [ctx.record]  audit log
 * @param {() => Date} [ctx.now]
 */
export function createHallTools(ctx) {
  const { hall, ownerId, company, me, nonce, features, use, record = () => {}, now = () => new Date() } = ctx;
  const author = { id: me.id, name: me.name, isLead: Boolean(ctx.isLead) };
  const ok = (text, summary) => ({ ok: true, text, summary: summary || text.split('\n')[0].slice(0, 160) });
  const no = (text) => ({ ok: false, text, summary: text.slice(0, 160) });

  /** Wrap a handler: closed parts refuse, the Hall's own refusals become answers, anything else is a real error. */
  const guarded = (feature, closedText, fn) => async (args = {}) => {
    if (!features[feature]) return no(closedText);
    try {
      return await fn(args && typeof args === 'object' ? args : {});
    } catch (err) {
      if (isPolicyError(err)) return no(err.message);
      throw err;
    }
  };

  /** Out of budget? Say so before doing the work. */
  const budget = (kind, what) => {
    const left = use.left(kind);
    return left > 0 ? null : no(`You have used all ${what} you may write in one session. Say what is left in your next room message, or put it in a file in the workspace.`);
  };
  const spent = (kind, what) => { use.commit(kind); const left = use.left(kind); return left <= 3 ? ` (${left} ${what} left this session)` : ''; };

  const mailbox = guarded('mail', 'Mailboxes are closed at this company.', async (a) => {
    switch (a.action) {
      case 'read': {
        if (a.thread) return ok(renderMail(hall.mail.readThread(ownerId, me.id, a.thread), { nonce, now: now() }), 'Read a thread');
        const r = hall.mail.readWaiting(ownerId, me.id);
        return ok(renderMail(r.messages, { nonce, now: now(), waiting: r.waiting, more: r.more }), r.messages.length ? `Read ${r.messages.length} message${r.messages.length === 1 ? '' : 's'}` : 'No mail');
      }
      case 'send': {
        const out = budget('messages', 'the messages');
        if (out) return out;
        if (!AGENT_MAIL_KINDS.includes(a.kind)) return no(`kind must be one of ${AGENT_MAIL_KINDS.join(', ')}. (ask: you need something; handoff: work passes to them, name the file; review: please check something; decision: record what was decided; fyi: they need to know, no reply expected.)`);
        const sent = hall.mail.send(ownerId, company.id, me, { to: asList(a.to), kind: a.kind, subject: a.subject, body: a.body, ref: a.ref });
        record('hall_mail_sent', { agent: me.name, kind: a.kind, to: sent.length });
        return ok(`Sent ${a.kind} "${sent[0].subject}" to ${sent.map(m => m.to.name).join(', ')}.${spent('messages', 'messages')}`);
      }
      case 'reply': {
        const out = budget('messages', 'the messages');
        if (out) return out;
        const m = hall.mail.reply(ownerId, company.id, me, a.message_id, { body: a.body });
        record('hall_mail_replied', { agent: me.name, to: 1 });
        return ok(`Replied to ${m.to.name} on "${m.subject}".${spent('messages', 'messages')}`);
      }
      case 'done':
        hall.mail.done(ownerId, me.id, a.message_id);
        return ok('Marked done.');
      default:
        return no('action must be read, send, reply or done.');
    }
  });

  const forum = guarded('forums', 'The forums are closed at this company.', async (a) => {
    switch (a.action) {
      case 'list':
        return ok(renderChannels(hall.forum.channels(ownerId, company.id, { employeeId: me.id })), 'Listed the channels');
      case 'read': {
        if (a.thread) return ok(renderThread(hall.forum.read(ownerId, company.id, { threadId: a.thread, employeeId: me.id }), { nonce, now: now() }), 'Read a thread');
        if (!a.channel) return no('Say which channel to read (see list), or give a thread id.');
        return ok(renderThreads(hall.forum.read(ownerId, company.id, { channel: a.channel, employeeId: me.id }), { nonce, now: now() }), `Read #${String(a.channel).slice(0, 40)}`);
      }
      case 'post': {
        const out = budget('messages', 'the messages');
        if (out) return out;
        const p = hall.forum.post(ownerId, company.id, author, { channel: a.channel, title: a.title, body: a.body });
        record('hall_forum_post', { agent: me.name, channel: p.channel });
        return ok(`Posted "${p.title}" in #${p.channel} (thread ${p.id}).${spent('messages', 'messages')}`);
      }
      case 'reply': {
        const out = budget('messages', 'the messages');
        if (out) return out;
        const p = hall.forum.reply(ownerId, company.id, author, { threadId: a.thread, body: a.body });
        record('hall_forum_reply', { agent: me.name, channel: p.channel });
        return ok(`Replied in #${p.channel}.${spent('messages', 'messages')}`);
      }
      default:
        return no('action must be list, read, post or reply.');
    }
  });

  const workspace = guarded('workspace', 'The workspace is closed at this company.', async (a) => {
    switch (a.action) {
      case 'list':
        return ok(renderFiles(hall.workspace.list(ownerId, company.id)), 'Listed the workspace');
      case 'read':
        return ok(renderFile(hall.workspace.read(ownerId, company.id, a.path, { version: a.version ?? null }), { nonce }), `Read ${String(a.path).slice(0, 60)}`);
      case 'write': {
        const out = budget('workspace', 'the workspace writes');
        if (out) return out;
        const f = hall.workspace.write(ownerId, company.id, { name: me.name }, { path: a.path, content: a.content, note: a.note });
        record('hall_workspace_write', { agent: me.name, path: f.path, version: f.version });
        return ok(`Saved ${f.path} as version ${f.version}.${spent('workspace', 'writes')}`);
      }
      default:
        return no('action must be list, read or write.');
    }
  });

  const board = guarded('board', 'The board is closed at this company.', async (a) => {
    switch (a.action) {
      case 'list':
        return ok(renderTasks(hall.board.list(ownerId, company.id, { status: a.status || null }), { nonce }), 'Listed the board');
      case 'create': {
        const out = budget('messages', 'the messages');
        if (out) return out;
        const t = hall.board.create(ownerId, company.id, author, { title: a.title, description: a.description, lead: a.lead, members: asList(a.members), deliverable: a.deliverable, needsTeam: Boolean(a.needs_team) });
        record('hall_task_created', { agent: me.name, task: t.id, needsTeam: t.needsTeam });
        return ok(`Created task ${t.id}, "${t.title}", led by ${t.lead?.name || 'nobody yet'}.${t.needsTeam ? ' You asked for a task team: the owner decides whether a room is made for it.' : ''}${spent('messages', 'messages')}`);
      }
      case 'update': {
        if (a.note) { const out = budget('messages', 'the messages'); if (out) return out; }
        const t = hall.board.update(ownerId, company.id, author, a.task_id, { status: a.status, note: a.note, lead: a.lead, members: a.members === undefined ? undefined : asList(a.members), deliverable: a.deliverable, needsTeam: a.needs_team });
        if (a.note) use.commit('messages');
        record('hall_task_updated', { agent: me.name, task: t.id, status: t.status });
        return ok(`Task ${t.id} is ${t.status}.`);
      }
      default:
        return no('action must be list, create or update.');
    }
  });

  const propose_norm = guarded('norms', 'Working agreements are closed at this company.', async (a) => {
    const out = budget('messages', 'the messages');
    if (out) return out;
    const n = hall.norms.propose(ownerId, company.id, author, { text: a.text, why: a.why });
    use.commit('messages');
    record('hall_norm_proposed', { agent: me.name, norm: n.id });
    return ok(`Proposed the agreement (${n.id}). The owner decides; until then it binds no one, and nothing you do will approve it.`);
  });

  return { mailbox, forum, workspace, board, propose_norm };
}
