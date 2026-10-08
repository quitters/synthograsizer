import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteAvailable } from '../flow/sqlite.js';
import { world, clock, DEPT } from './hallKit.js';
import { HALL_LIMITS } from './limits.js';
import { newId } from '../util.js';

/**
 * Mailboxes: typed, bounded, stamped by the server, closed to the company, readable by the owner.
 * Skipped where this Node has no node:sqlite (npm test passes --experimental-sqlite).
 */
const skip = !sqliteAvailable() && 'node:sqlite is not available in this Node';
const L = HALL_LIMITS.mail;

const msg = (over = {}) => ({ to: ['Kasia'], kind: 'ask', subject: 'Which values print lettering?', body: 'Can you list the values you expect to print captions? I will cut them.', ...over });

test('a person writes to colleagues by name; the sender is whoever the server says, and each recipient gets their own copy in one thread', { skip }, () => {
  const w = world();
  const sent = w.hall.mail.send(w.ownerId, w.companyId, w.who('zayd'), msg({ to: ['Kasia', 'Rima Haddad-Boudreau'], ref: 'engine.json' }));
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map(m => m.to.name), ['Kasia Wójcik-Lindqvist', 'Rima Haddad-Boudreau']);
  assert.ok(sent.every(m => m.from.id === w.who('zayd').id && m.from.name === 'Zayd Siddiqui' && m.state === 'unread' && m.kind === 'ask' && m.ref === 'engine.json'));
  assert.equal(new Set(sent.map(m => m.threadId)).size, 1, 'one thread');
  assert.notEqual(sent[0].id, sent[1].id);
  assert.equal(w.hall.mail.digest(w.ownerId, w.who('kasia').id).unread, 1);
  assert.equal(w.hall.mail.digest(w.ownerId, w.who('tavita').id).unread, 0);
  w.roster.close();
});

test('the message is cleaned and bounded: kinds are typed, text has a length, a secret is refused, hidden characters are dropped', { skip }, () => {
  const w = world();
  const send = (over) => w.hall.mail.send(w.ownerId, w.companyId, w.who('zayd'), msg(over));
  for (const kind of ['answer', 'notice', 'chat', undefined]) assert.throws(() => send({ kind }), (e) => e.status === 400 && /kind must be one of/.test(e.message), String(kind));
  assert.throws(() => send({ subject: '' }), (e) => e.status === 400);
  assert.throws(() => send({ subject: 'x'.repeat(L.subject + 1) }), (e) => /at most 120/.test(e.message));
  assert.throws(() => send({ body: '  ' }), (e) => e.status === 400);
  assert.throws(() => send({ body: 'x'.repeat(L.body + 1) }), (e) => /at most 2000/.test(e.message));
  assert.throws(() => send({ body: 'use AIzaSyA1234567890abcdefghijklmnopqrstuvw' }), (e) => e.code === 'secret_in_text');
  assert.throws(() => send({ subject: 5 }), (e) => e.status === 400);
  assert.throws(() => send({ to: [] }), (e) => e.field === 'to');
  assert.throws(() => send({ to: ['Kasia', 'Rima', 'Tavita', 'Zayd Siddiqui', 'Kasia Wójcik-Lindqvist'] }), (e) => /at most 4 people/.test(e.message));
  const [m] = send({ subject: '  two\nlines‮ here ', body: 'a\r\nb​c', ref: '' });
  assert.equal(m.subject, 'two lines here');
  assert.equal(m.body, 'a\nbc');
  assert.equal(m.ref, null);
  w.roster.close();
});

test('names are looked up among the sender\'s own company: a first name works if it is unique; an unknown or ambiguous name is refused with the people who can be written to', { skip }, () => {
  const w = world({ people: [
    ['a', 'Ann Reed', 'editor', {}], ['b', 'Ann Okoye', 'engineer', {}], ['c', 'Cy Tanaka', 'archivist', {}],
  ] });
  const err = (to) => { try { w.hall.mail.send(w.ownerId, w.companyId, w.who('c'), msg({ to })); } catch (e) { return e; } return null; };
  assert.match(err(['Ann']).message, /"Ann" could be more than one person; use the full name/);
  assert.match(err(['Nobody Here']).message, /No one here is called "Nobody Here"/);
  assert.match(err(['Nobody Here']).message, /People you can write to: Ann Reed, Ann Okoye\./, 'and not yourself');
  assert.equal(err(['Cy']).message, 'You cannot write to yourself; use your own notes.');
  assert.equal(err(['ann okoye']), null, 'any case');

  // another company's people are not addressable, even by their exact name
  const other = world({ people: [['x', 'Xavier Stranger', 'editor', {}]] });
  assert.match(err(['Xavier Stranger']).message, /No one here is called "Xavier Stranger"/);
  // nor are people who have left
  w.roster.leave(w.ownerId, w.seats.a.employeeId);
  assert.match(err(['Ann Reed']).message, /No one here is called "Ann Reed"/);
  w.roster.close();
  other.roster.close();
});

test('an inbox only holds so many unread messages; the sender is told, and who', { skip }, () => {
  const w = world();
  const kasia = w.who('kasia');
  for (let i = 0; i < L.inboxUnread; i++) w.hall.mail.notify(w.ownerId, w.companyId, { toIds: [kasia.id], subject: `Notice ${i}`, body: 'FYI' });
  assert.throws(() => w.hall.mail.send(w.ownerId, w.companyId, w.who('zayd'), msg()), (e) => e.code === 'inbox_full' && /Kasia Wójcik-Lindqvist has 40 unread/.test(e.message));
  // reading makes room
  w.hall.mail.readWaiting(w.ownerId, kasia.id, { limit: 40 });
  assert.equal(w.hall.mail.send(w.ownerId, w.companyId, w.who('zayd'), msg()).length, 1);
  // and a message to several is all or nothing
  for (let i = 0; i < L.inboxUnread - 1; i++) w.hall.mail.notify(w.ownerId, w.companyId, { toIds: [w.who('rima').id], subject: `Notice ${i}`, body: 'FYI' });
  w.hall.mail.notify(w.ownerId, w.companyId, { toIds: [w.who('rima').id], subject: 'The last one', body: 'FYI' });
  const before = w.hall.mail.digest(w.ownerId, kasia.id).unread;
  assert.throws(() => w.hall.mail.send(w.ownerId, w.companyId, w.who('zayd'), msg({ to: ['Kasia', 'Rima'] })), (e) => e.code === 'inbox_full');
  assert.equal(w.hall.mail.digest(w.ownerId, kasia.id).unread, before, 'Kasia did not get her copy either');
  w.roster.close();
});

test('a reply goes to whoever wrote, in the same thread, marks the original done, and nobody replies to news or to the company', { skip }, () => {
  const w = world();
  const [asked] = w.hall.mail.send(w.ownerId, w.companyId, w.who('zayd'), msg());
  clock.tick();
  const answer = w.hall.mail.reply(w.ownerId, w.companyId, w.who('kasia'), asked.id, { body: 'Values 3 and 6: "glass plate" and "negative print".' });
  assert.deepEqual([answer.kind, answer.to.name, answer.from.name, answer.threadId, answer.replyTo, answer.subject], ['answer', 'Zayd Siddiqui', 'Kasia Wójcik-Lindqvist', asked.threadId, asked.id, 'Re: Which values print lettering?']);
  assert.equal(w.hall.mail.forOwner(w.ownerId, w.companyId, { thread: asked.threadId }).find(m => m.id === asked.id).state, 'done');

  // only the person it was written to can answer it
  assert.throws(() => w.hall.mail.reply(w.ownerId, w.companyId, w.who('rima'), asked.id, { body: 'hello' }), (e) => e.status === 404);
  assert.throws(() => w.hall.mail.reply(w.ownerId, w.companyId, w.who('zayd'), asked.id, { body: 'hello' }), (e) => e.status === 404, 'not the sender, either');

  const [news] = w.hall.mail.send(w.ownerId, w.companyId, w.who('zayd'), msg({ kind: 'fyi', subject: 'Saved version 3', to: ['Rima'] }));
  assert.throws(() => w.hall.mail.reply(w.ownerId, w.companyId, w.who('rima'), news.id, { body: 'Great!' }), (e) => e.code === 'no_reply' && /news/.test(e.message));
  const [notice] = w.hall.mail.notify(w.ownerId, w.companyId, { toIds: [w.who('rima').id], subject: 'Welcome', body: 'Hello' });
  assert.throws(() => w.hall.mail.reply(w.ownerId, w.companyId, w.who('rima'), notice.id, { body: 'Thanks' }), (e) => e.code === 'no_reply' && /notice/.test(e.message));
  assert.equal(notice.from.name, 'Producer');
  assert.equal(notice.from.id, null);
  w.roster.close();
});

test('a reply to someone who has left is refused; a thread can only run so long', { skip }, () => {
  const w = world();
  const [first] = w.hall.mail.send(w.ownerId, w.companyId, w.who('zayd'), msg());
  w.roster.leave(w.ownerId, w.seats.zayd.employeeId);
  assert.throws(() => w.hall.mail.reply(w.ownerId, w.companyId, w.who('kasia'), first.id, { body: 'x' }), (e) => e.code === 'sender_left');

  const v = world();
  let last = v.hall.mail.send(v.ownerId, v.companyId, v.who('zayd'), msg({ kind: 'ask' }))[0];
  let turn = 'kasia';
  let n = 1;
  while (n < L.threadDepth) {
    last = v.hall.mail.reply(v.ownerId, v.companyId, v.who(turn), last.id, { body: `reply ${n}` });
    turn = turn === 'kasia' ? 'zayd' : 'kasia';
    n += 1;
  }
  assert.throws(() => v.hall.mail.reply(v.ownerId, v.companyId, v.who(turn), last.id, { body: 'one more' }), (e) => e.code === 'thread_too_long' && /decisions/.test(e.message));
  // a new thread is allowed
  assert.equal(v.hall.mail.send(v.ownerId, v.companyId, v.who(turn), msg({ to: [turn === 'kasia' ? 'Zayd' : 'Kasia'], subject: 'A fresh start' })).length, 1);
  w.roster.close();
  v.roster.close();
});

test('reading: unread first, they become read, the rest is counted; a thread shows only to those in it', { skip }, () => {
  const w = world();
  const kasia = w.who('kasia');
  const [m1] = w.hall.mail.send(w.ownerId, w.companyId, w.who('zayd'), msg({ subject: 'First' }));
  clock.tick();
  w.hall.mail.readWaiting(w.ownerId, kasia.id);                                  // m1 is now read
  clock.tick();
  const [m2] = w.hall.mail.send(w.ownerId, w.companyId, w.who('rima'), msg({ subject: 'Second', kind: 'review' }));
  for (let i = 0; i < 12; i++) { clock.tick(); w.hall.mail.send(w.ownerId, w.companyId, w.who('tavita'), msg({ subject: `Filler ${i}`, kind: 'fyi' })); }

  const got = w.hall.mail.readWaiting(w.ownerId, kasia.id, { limit: 5 });
  assert.equal(got.waiting, 14);
  assert.equal(got.more, 9);
  assert.equal(got.messages.length, 5);
  assert.ok(got.messages.slice(0, 5).every(m => m.state === 'unread'), 'unread come first');
  assert.equal(w.hall.mail.digest(w.ownerId, kasia.id).unread, 8, 'thirteen were unread, five were shown and became read');
  assert.equal(w.hall.mail.readThread(w.ownerId, kasia.id, m2.threadId)[0].id, m2.id);
  assert.throws(() => w.hall.mail.readThread(w.ownerId, w.who('tavita').id, m1.threadId), (e) => e.status === 404, 'not her thread');
  assert.throws(() => w.hall.mail.readThread(newId(), kasia.id, m1.threadId), (e) => e.status === 404, 'not her owner');
  w.roster.close();
});

test('marking done; the digest; the owner reads every mailbox; counts per person', { skip }, () => {
  const w = world();
  const kasia = w.who('kasia');
  const [a] = w.hall.mail.send(w.ownerId, w.companyId, w.who('zayd'), msg({ subject: 'A' }));
  w.hall.mail.send(w.ownerId, w.companyId, w.who('rima'), msg({ subject: 'B', kind: 'review' }));
  let d = w.hall.mail.digest(w.ownerId, kasia.id);
  assert.deepEqual([d.unread, d.open, d.items.length], [2, 0, 2]);
  assert.throws(() => w.hall.mail.done(w.ownerId, w.who('rima').id, a.id), (e) => e.status === 404, 'only the recipient');
  w.hall.mail.readWaiting(w.ownerId, kasia.id);
  d = w.hall.mail.digest(w.ownerId, kasia.id);
  assert.deepEqual([d.unread, d.open], [0, 2]);
  w.hall.mail.done(w.ownerId, kasia.id, a.id);
  assert.equal(w.hall.mail.digest(w.ownerId, kasia.id).open, 1);

  assert.equal(w.hall.mail.forOwner(w.ownerId, w.companyId).length, 2, 'the owner sees every message');
  assert.equal(w.hall.mail.forOwner(w.ownerId, w.companyId, { toId: kasia.id, state: 'done' }).length, 1);
  assert.equal(w.hall.mail.forOwner(newId(), w.companyId).length, 0, 'and nobody else does');
  assert.deepEqual(w.hall.mail.counts(w.ownerId, w.companyId), [{ employeeId: kasia.id, unread: 0, open: 1, total: 2 }]);
  void DEPT;
  w.roster.close();
});

test('the company writes notices: from the Producer or the owner, to chosen people, not repliable', { skip }, () => {
  const w = world();
  const ids = [w.who('rima').id, w.who('kasia').id];
  const sent = w.hall.mail.notify(w.ownerId, w.companyId, { from: 'Owner', toIds: ids, subject: 'Go', body: 'The company is active.' });
  assert.deepEqual(sent.map(m => [m.from.name, m.from.id, m.kind]), [['Owner', null, 'notice'], ['Owner', null, 'notice']]);
  assert.deepEqual(w.hall.mail.notify(w.ownerId, w.companyId, { toIds: [newId()], subject: 'x', body: 'y' }), [], 'someone who is not here gets nothing');
  w.roster.close();
});

test('removing a company, or a person, removes the mail', { skip }, () => {
  const w = world();
  w.hall.mail.send(w.ownerId, w.companyId, w.who('zayd'), msg());
  w.hall.mail.send(w.ownerId, w.companyId, w.who('rima'), msg({ to: ['Zayd'] }));
  w.roster.leave(w.ownerId, w.seats.kasia.employeeId);
  w.roster.forgetEmployee(w.ownerId, w.seats.kasia.employeeId);
  assert.equal(w.hall.mail.forOwner(w.ownerId, w.companyId).length, 1, 'her mailbox went with her; what she was sent is gone, what others sent her is not theirs to keep');
  assert.deepEqual(w.hall.mail.removeCompany(w.ownerId, w.companyId), { removed: 1 });
  assert.equal(w.hall.mail.forOwner(w.ownerId, w.companyId).length, 0);
  w.roster.close();
});
