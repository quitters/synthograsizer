import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteAvailable } from '../flow/sqlite.js';
import { createHallTools } from './tools.js';
import { world, clock } from './hallKit.js';
import { DEFAULT_COLLABORATION } from '../collaboration.js';

/**
 * The Hall's tools as a person in a room holds them: one handler per tool, bound to the employee the server found, counted against a budget,
 * recorded in the audit log without the words, and answering in plain text what happened or why not.
 */
const skip = !sqliteAvailable() && 'node:sqlite is not available in this Node';
const NONCE = 'fence0123456';

function tools(w, key, { features = DEFAULT_COLLABORATION, messages = 30, workspace = 20, isLead = false } = {}) {
  const used = { messages: 0, workspace: 0 };
  const budget = { messages, workspace };
  const audit = [];
  const handlers = createHallTools({
    hall: w.hall, ownerId: w.ownerId, company: w.company, me: w.who(key), isLead, nonce: NONCE, features, now: () => clock.now(),
    use: { left: (k) => Math.max(0, budget[k] - used[k]), commit: (k) => { used[k] += 1; } },
    record: (type, data) => audit.push({ type, ...data }),
  });
  return { ...handlers, used, audit };
}

test('mailbox: send, read, reply, done, as one person; the sender is who the server found and the words never reach the audit log', { skip }, async () => {
  const w = world();
  const zayd = tools(w, 'zayd');
  const kasia = tools(w, 'kasia');

  const sent = await zayd.mailbox({ action: 'send', to: ['Kasia'], kind: 'review', subject: 'Check engine.json', body: 'Version 3 is saved. Value six prints lettering?', ref: 'engine.json' });
  assert.equal(sent.ok, true);
  assert.equal(sent.text, 'Sent review "Check engine.json" to Kasia Wójcik-Lindqvist.');
  assert.deepEqual(zayd.audit, [{ type: 'hall_mail_sent', agent: 'Zayd Siddiqui', kind: 'review', to: 1 }]);
  assert.ok(!JSON.stringify(zayd.audit).includes('lettering'), 'decisions, never content');

  const read = await kasia.mailbox({ action: 'read' });
  assert.equal(read.ok, true);
  assert.match(read.text, /^1 message is waiting for you\./);
  assert.match(read.text, new RegExp(`<<<MAIL ${NONCE}`));
  assert.match(read.text, /review from Zayd Siddiqui \(just now\), subject "Check engine\.json", about engine\.json/);
  const id = /\[([a-f0-9]{16})\]/.exec(read.text)[1];
  assert.equal(read.summary, 'Read 1 message');
  assert.equal((await kasia.mailbox({ action: 'read' })).text.includes('NEW'), false, 'read once, no longer new');

  const replied = await kasia.mailbox({ action: 'reply', message_id: id, body: 'Yes: values 3 and 6.' });
  assert.equal(replied.text, 'Replied to Zayd Siddiqui on "Re: Check engine.json".');
  const back = await zayd.mailbox({ action: 'read' });
  assert.match(back.text, /answer from Kasia Wójcik-Lindqvist/);
  const thread = await zayd.mailbox({ action: 'read', thread: /thread ([a-f0-9]{16})/.exec(back.text)[1] });
  assert.match(thread.text, /review from Zayd Siddiqui[\s\S]*answer from Kasia/);

  const second = await zayd.mailbox({ action: 'send', to: 'Rima', kind: 'fyi', subject: 'Saved', body: 'Done.' });
  assert.equal(second.ok, true, 'a single name as a string works too');
  const rima = tools(w, 'rima');
  const fyi = /\[([a-f0-9]{16})\]/.exec((await rima.mailbox({ action: 'read' })).text)[1];
  assert.equal((await rima.mailbox({ action: 'done', message_id: fyi })).ok, true);
  assert.equal((await rima.mailbox({ action: 'reply', message_id: fyi, body: 'thanks' })).ok, false, 'nobody replies to news');
  w.roster.close();
});

test('mailbox: every refusal says what to do next, and an unknown action is named', { skip }, async () => {
  const w = world();
  const z = tools(w, 'zayd');
  const send = (over) => z.mailbox({ action: 'send', to: ['Kasia'], kind: 'ask', subject: 'S', body: 'B', ...over });
  assert.match((await send({ kind: 'answer' })).text, /kind must be one of ask, handoff, review, decision, fyi/);
  assert.match((await send({ to: ['Nobody'] })).text, /No one here is called "Nobody"\. People you can write to: .*Kasia/);
  assert.match((await send({ to: [] })).text, /Say who the message is for/);
  assert.match((await send({ body: '' })).text, /cannot be empty/);
  assert.match((await z.mailbox({ action: 'reply', message_id: 'nope', body: 'x' })).text, /No such message/);
  assert.match((await z.mailbox({ action: 'done', message_id: 'nope' })).text, /No such message/);
  assert.match((await z.mailbox({ action: 'sing' })).text, /action must be read, send, reply or done/);
  assert.match((await z.mailbox({})).text, /action must be read/);
  assert.match((await z.mailbox(null)).text, /action must be read/);
  assert.equal((await z.mailbox({ action: 'read' })).text, 'No messages are waiting for you.');
  assert.equal(z.used.messages, 0, 'a refusal uses none of the budget');
  w.roster.close();
});

test('the budget: a person may write only so much in a session; refusals cost nothing; a warning comes before the end', { skip }, async () => {
  const w = world();
  const z = tools(w, 'zayd', { messages: 5, workspace: 2 });
  const fyi = (n) => z.mailbox({ action: 'send', to: ['Rima'], kind: 'fyi', subject: `News ${n}`, body: 'x' });
  const outcomes = [];
  for (let i = 0; i < 5; i++) outcomes.push(await fyi(i));
  assert.deepEqual(outcomes.map(o => o.ok), [true, true, true, true, true]);
  assert.match(outcomes[2].text, /\(2 messages left this session\)/);
  assert.match(outcomes[4].text, /\(0 messages left this session\)/);
  const over = await fyi(6);
  assert.equal(over.ok, false);
  assert.match(over.text, /You have used all the messages you may write in one session/);
  assert.equal((await z.forum({ action: 'post', channel: 'general', title: 'T', body: 'B' })).ok, false, 'one budget for mail and forums');
  assert.equal((await z.mailbox({ action: 'read' })).ok, true, 'reading is always allowed');
  assert.equal((await z.forum({ action: 'list' })).ok, true);

  assert.equal((await z.workspace({ action: 'write', path: 'a.md', content: 'x' })).ok, true);
  assert.match((await z.workspace({ action: 'write', path: 'b.md', content: 'x' })).text, /\(0 writes left this session\)/);
  assert.match((await z.workspace({ action: 'write', path: 'c.md', content: 'x' })).text, /all the workspace writes/);
  w.roster.close();
});

test('forum: list, post, read, reply; only leads post where the channel says so', { skip }, async () => {
  const w = world();
  w.hall.forum.ensureDefaults(w.ownerId, w.companyId, w.company.departments);
  const z = tools(w, 'zayd');
  const k = tools(w, 'kasia');
  const r = tools(w, 'rima', { isLead: true });

  const list = await z.forum({ action: 'list' });
  assert.match(list.text, /^#announcements \(Announcements\): 0 threads\. What everyone needs to know\. Leads and the owner post here\. Posting: leads and the company\./m);
  assert.match(list.text, /#dept-archive-desk \(Archive Desk\)/);

  assert.match((await z.forum({ action: 'post', channel: 'announcements', title: 'Hi', body: 'hello' })).text, /Only department leads and the company post in #announcements/);
  assert.match((await r.forum({ action: 'post', channel: 'announcements', title: 'Plan', body: 'We start at ten.' })).text, /Posted "Plan" in #announcements \(thread [a-f0-9]{16}\)\./);
  const posted = await z.forum({ action: 'post', channel: 'help', title: 'How do we count twelve?', body: 'Who has a check?' });
  const threadId = /thread ([a-f0-9]{16})/.exec(posted.text)[1];
  assert.match((await k.forum({ action: 'reply', thread: threadId, body: 'Count in code.' })).text, /Replied in #help\./);

  const channel = await z.forum({ action: 'read', channel: 'help' });
  assert.match(channel.text, new RegExp(`\\[${threadId}\\] "How do we count twelve\\?" by Zayd Siddiqui, 1 reply`));
  const whole = await z.forum({ action: 'read', thread: threadId });
  assert.match(whole.text, /Count in code\./);
  assert.match((await z.forum({ action: 'read' })).text, /Say which channel to read/);
  assert.match((await z.forum({ action: 'read', channel: 'nowhere' })).text, /No channel called "nowhere"/);
  assert.equal(z.audit.map(a => a.type).join(), 'hall_forum_post');
  w.roster.close();
});

test('workspace: list, write, read; a locked file refuses with the way out', { skip }, async () => {
  const w = world();
  w.hall.workspace.write(w.ownerId, w.companyId, { name: 'Owner', system: true }, { path: 'README.md', content: 'Handbook.' });
  w.hall.workspace.setLocked(w.ownerId, w.companyId, 'README.md', true);
  const z = tools(w, 'zayd');

  assert.match((await z.workspace({ action: 'list' })).text, /^README\.md {2}v1 {2}9 bytes {2}locked {2}by Owner$/m);
  const wrote = await z.workspace({ action: 'write', path: 'checklists/engine.md', content: '- count in code', note: 'first' });
  assert.equal(wrote.text, 'Saved checklists/engine.md as version 1.');
  const read = await z.workspace({ action: 'read', path: 'checklists/engine.md' });
  assert.match(read.text, /^checklists\/engine\.md \(version 1, 15 bytes, last written by Zayd Siddiqui: first\)/);
  assert.match(read.text, new RegExp(`<<<FILE ${NONCE}\\n- count in code\\nFILE ${NONCE}>>>`));
  assert.match((await z.workspace({ action: 'write', path: 'README.md', content: 'mine' })).text, /README\.md is locked/);
  assert.match((await z.workspace({ action: 'read', path: 'nope.md' })).text, /There is no file "nope\.md" in the workspace\. Files: checklists\/engine\.md, README\.md\./);
  assert.match((await z.workspace({ action: 'write', path: '../x.md', content: 'x' })).text, /Use letters, digits/);
  assert.deepEqual(z.audit, [{ type: 'hall_workspace_write', agent: 'Zayd Siddiqui', path: 'checklists/engine.md', version: 1 }]);
  w.roster.close();
});

test('board: create, list, update; members report, the lead closes; a task team is asked for, not made', { skip }, async () => {
  const w = world();
  const z = tools(w, 'zayd');
  const k = tools(w, 'kasia');

  const made = await z.board({ action: 'create', title: 'Write the engine', description: 'Six variables.', members: ['Kasia'], deliverable: 'engine.json', needs_team: true });
  assert.match(made.text, /Created task [a-f0-9]{16}, "Write the engine", led by Zayd Siddiqui\. You asked for a task team: the owner decides whether a room is made for it\./);
  const id = /task ([a-f0-9]{16})/.exec(made.text)[1];
  const list = await k.board({ action: 'list' });
  assert.match(list.text, new RegExp(`\\[${id}\\] todo: "Write the engine", lead Zayd Siddiqui, with Kasia Wójcik-Lindqvist, delivers engine\\.json, asked for a task team`));
  assert.equal((await k.board({ action: 'update', task_id: id, status: 'doing', note: 'reading it' })).text, `Task ${id} is doing.`);
  assert.match((await k.board({ action: 'update', task_id: id, status: 'done' })).text, /its lead closes it/);
  assert.equal((await z.board({ action: 'update', task_id: id, status: 'done' })).ok, true);
  assert.equal((await k.board({ action: 'list' })).text, 'No open tasks.');
  assert.match((await tools(w, 'tavita').board({ action: 'update', task_id: id, note: 'let me in' })).text, /Only the lead, the creator, the members and the owner/);
  assert.equal(k.used.messages, 1, 'a note counts as a message; moving a card does not');
  w.roster.close();
});

test('propose_norm: it goes to the owner, binds no one, and says so', { skip }, async () => {
  const w = world();
  const k = tools(w, 'kasia');
  const out = await k.propose_norm({ text: 'Whoever saves a file says what changed.', why: 'Reviewers keep asking.' });
  assert.match(out.text, /Proposed the agreement \([a-f0-9]{16}\)\. The owner decides; until then it binds no one, and nothing you do will approve it\./);
  assert.deepEqual(w.hall.norms.approvedTexts(w.ownerId, w.companyId), []);
  assert.equal(w.hall.norms.list(w.ownerId, w.companyId)[0].status, 'proposed');
  assert.match((await k.propose_norm({ text: 'Whoever saves a file says what changed.' })).text, /already been proposed/);
  assert.match((await k.propose_norm({ text: '' })).text, /cannot be empty/);
  w.roster.close();
});

test('a part of the Hall the company has closed refuses, and the others still work', { skip }, async () => {
  const w = world();
  const z = tools(w, 'zayd', { features: { ...DEFAULT_COLLABORATION, mail: false, norms: false } });
  assert.equal((await z.mailbox({ action: 'read' })).text, 'Mailboxes are closed at this company.');
  assert.equal((await z.propose_norm({ text: 'x' })).text, 'Working agreements are closed at this company.');
  assert.equal((await z.workspace({ action: 'list' })).ok, true);
  assert.equal((await z.board({ action: 'list' })).ok, true);
  w.roster.close();
});

test('nothing in the arguments can name the sender or the company: unknown fields are ignored', { skip }, async () => {
  const w = world();
  const other = world();
  const z = tools(w, 'zayd');
  const out = await z.mailbox({ action: 'send', to: ['Kasia'], kind: 'fyi', subject: 'S', body: 'B', from: 'Rima Haddad-Boudreau', company: other.companyId, owner: other.ownerId, from_id: other.seats.rima.employeeId });
  assert.equal(out.ok, true);
  const mail = w.hall.mail.forOwner(w.ownerId, w.companyId)[0];
  assert.equal(mail.from.name, 'Zayd Siddiqui');
  assert.equal(other.hall.mail.forOwner(other.ownerId, other.companyId).length, 0);
  assert.match((await z.mailbox({ action: 'send', to: ['Xavier Stranger'], kind: 'fyi', subject: 'S', body: 'B' })).text, /No one here is called "Xavier Stranger"/);
  w.roster.close();
  other.roster.close();
});

test('an unexpected error is not hidden as a refusal', { skip }, async () => {
  const w = world();
  const z = tools(w, 'zayd');
  w.roster.db.exec('DROP TABLE mail');
  await assert.rejects(z.mailbox({ action: 'read' }), /no such table/);
  w.roster.close();
});
