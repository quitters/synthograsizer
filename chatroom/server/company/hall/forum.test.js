import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteAvailable } from '../flow/sqlite.js';
import { world, clock } from './hallKit.js';
import { HALL_LIMITS } from './limits.js';
import { newId } from '../util.js';

/** Forums: lasting threads for the whole company, with a posting rule per channel, a bound per thread, and the owner able to read, pin and remove. */
const skip = !sqliteAvailable() && 'node:sqlite is not available in this Node';
const L = HALL_LIMITS.forum;

function setup() {
  const w = world();
  w.hall.forum.ensureDefaults(w.ownerId, w.companyId, w.company.departments);
  const author = (key) => ({ ...w.who(key), isLead: Boolean(w.seats[key].isLead) });
  return { ...w, author, forum: w.hall.forum };
}

test('a company starts with its channels and one for each department; asking again changes nothing', { skip }, () => {
  const w = setup();
  const slugs = w.forum.channels(w.ownerId, w.companyId).map(c => c.slug);
  assert.deepEqual(slugs, ['announcements', 'general', 'help', 'decisions', 'dept-archive-desk']);
  assert.equal(w.forum.channels(w.ownerId, w.companyId).find(c => c.slug === 'dept-archive-desk').departmentId, 'abcd1234');
  assert.equal(w.forum.ensureDefaults(w.ownerId, w.companyId, w.company.departments).length, 5);
  assert.equal(w.forum.channels(newId(), w.companyId).length, 0, 'another owner sees none');
  w.roster.close();
});

test('a post starts a thread, a reply answers it; who it is from is stamped, and a thread is read whole', { skip }, () => {
  const w = setup();
  const post = w.forum.post(w.ownerId, w.companyId, w.author('zayd'), { channel: 'help', title: 'How do we count twelve?', body: 'The server wants exactly twelve values per variable. Who has a check?' });
  assert.deepEqual([post.channel, post.author.name, post.title, post.threadId === post.id], ['help', 'Zayd Siddiqui', 'How do we count twelve?', true]);
  clock.tick();
  const reply = w.forum.reply(w.ownerId, w.companyId, w.author('kasia'), { threadId: post.id, body: 'Count in code, not by eye: value.length === 12.' });
  assert.deepEqual([reply.author.name, reply.replyTo, reply.threadId, reply.title], ['Kasia Wójcik-Lindqvist', post.id, post.id, null]);
  const read = w.forum.read(w.ownerId, w.companyId, { threadId: post.id });
  assert.equal(read.thread.id, post.id);
  assert.deepEqual(read.posts.map(p => p.id), [reply.id]);
  assert.throws(() => w.forum.reply(w.ownerId, w.companyId, w.author('kasia'), { threadId: reply.id, body: 'x' }), (e) => e.status === 404, 'a reply is not a thread');
  assert.throws(() => w.forum.reply(newId(), w.companyId, w.author('kasia'), { threadId: post.id, body: 'x' }), (e) => e.status === 404, 'not another owner');
  w.roster.close();
});

test('who may post is the channel\'s rule: leads in announcements, only the company where it says so, everyone elsewhere', { skip }, () => {
  const w = setup();
  const system = { id: null, name: 'Owner', system: true };
  assert.throws(() => w.forum.post(w.ownerId, w.companyId, w.author('zayd'), { channel: 'announcements', title: 'Hi', body: 'hello' }), (e) => e.code === 'not_allowed' && /leads and the company/.test(e.message));
  assert.equal(w.forum.post(w.ownerId, w.companyId, w.author('rima'), { channel: 'announcements', title: 'Plan', body: 'We start at ten.' }).author.name, 'Rima Haddad-Boudreau');
  assert.equal(w.forum.post(w.ownerId, w.companyId, system, { channel: 'announcements', title: 'From the owner', body: 'Welcome.' }).author.id, null);
  w.forum.addChannel(w.ownerId, w.companyId, { slug: 'Owner Only', title: 'Owner only', postPolicy: 'owner' });
  assert.throws(() => w.forum.post(w.ownerId, w.companyId, w.author('rima'), { channel: 'owner-only', title: 'x', body: 'y' }), (e) => e.code === 'not_allowed');
  const t = w.forum.post(w.ownerId, w.companyId, system, { channel: 'owner-only', title: 'Rules', body: 'Read these.' });
  assert.throws(() => w.forum.reply(w.ownerId, w.companyId, w.author('zayd'), { threadId: t.id, body: 'ok' }), (e) => e.code === 'not_allowed', 'nor reply');
  // anyone may answer an announcement
  const ann = w.forum.read(w.ownerId, w.companyId, { channel: 'announcements' }).threads[0];
  assert.ok(w.forum.reply(w.ownerId, w.companyId, w.author('zayd'), { threadId: ann.id, body: 'Understood.' }).id);
  w.roster.close();
});

test('posts are cleaned and bounded, a channel must exist (and the error lists them), a thread only grows so far', { skip }, () => {
  const w = setup();
  const post = (over) => w.forum.post(w.ownerId, w.companyId, w.author('zayd'), { channel: 'general', title: 'T', body: 'B', ...over });
  assert.throws(() => post({ title: '' }), (e) => e.status === 400);
  assert.throws(() => post({ title: 'x'.repeat(L.title + 1) }), (e) => /at most 120/.test(e.message));
  assert.throws(() => post({ body: 'x'.repeat(L.body + 1) }), (e) => /at most 3000/.test(e.message));
  assert.throws(() => post({ body: 'AIzaSyA1234567890abcdefghijklmnopqrstuvw' }), (e) => e.code === 'secret_in_text');
  assert.throws(() => post({ channel: 'water-cooler' }), (e) => e.code === 'no_channel' && /Channels: announcements, general, help, decisions, dept-archive-desk/.test(e.message));
  assert.equal(post({ channel: 'GENERAL', body: 'a​\r\nb' }).body, 'a\nb', 'the channel name is case-insensitive; hidden characters go');

  const t = post({ title: 'Long thread' });
  for (let i = 0; i < L.threadReplies; i++) w.forum.reply(w.ownerId, w.companyId, w.author('kasia'), { threadId: t.id, body: `reply ${i}` });
  assert.throws(() => w.forum.reply(w.ownerId, w.companyId, w.author('kasia'), { threadId: t.id, body: 'one more' }), (e) => e.code === 'thread_too_long' && /decisions/.test(e.message));
  w.roster.close();
});

test('reading a channel lists its threads, pinned first then by latest activity; reading clears what was new to the reader', { skip }, () => {
  const w = setup();
  const a = w.forum.post(w.ownerId, w.companyId, w.author('zayd'), { channel: 'general', title: 'Alpha', body: 'a' });
  clock.tick();
  const b = w.forum.post(w.ownerId, w.companyId, w.author('zayd'), { channel: 'general', title: 'Beta', body: 'b' });
  clock.tick();
  w.forum.reply(w.ownerId, w.companyId, w.author('kasia'), { threadId: a.id, body: 'late reply to alpha' });

  const kasia = w.who('kasia').id;
  assert.equal(w.forum.channels(w.ownerId, w.companyId, { employeeId: kasia }).find(c => c.slug === 'general').unread, 2, 'two posts by others; her own reply is not news to her');
  assert.deepEqual(w.forum.unreadFor(w.ownerId, w.companyId, kasia).map(u => [u.slug, u.unread]), [['general', 2]]);

  const channel = w.forum.read(w.ownerId, w.companyId, { channel: 'general', employeeId: kasia });
  assert.deepEqual(channel.threads.map(t => [t.title, t.replies]), [['Alpha', 1], ['Beta', 0]], 'latest activity first');
  assert.deepEqual(w.forum.unreadFor(w.ownerId, w.companyId, kasia), []);
  assert.equal(w.forum.unreadFor(w.ownerId, w.companyId, w.who('tavita').id).length, 1, 'someone who has not read still has news');

  w.forum.pin(w.ownerId, w.companyId, b.id);
  assert.deepEqual(w.forum.read(w.ownerId, w.companyId, { channel: 'general' }).threads.map(t => [t.title, t.pinned]), [['Beta', true], ['Alpha', false]]);
  assert.throws(() => w.forum.pin(w.ownerId, w.companyId, 'nope'), (e) => e.status === 404);
  w.roster.close();
});

test('the owner removes a reply, or a whole thread; another owner cannot', { skip }, () => {
  const w = setup();
  const t = w.forum.post(w.ownerId, w.companyId, w.author('zayd'), { channel: 'help', title: 'Q', body: 'q' });
  const r = w.forum.reply(w.ownerId, w.companyId, w.author('kasia'), { threadId: t.id, body: 'a' });
  assert.throws(() => w.forum.removePost(newId(), w.companyId, r.id), (e) => e.status === 404);
  assert.deepEqual(w.forum.removePost(w.ownerId, w.companyId, r.id), { removed: 1 });
  assert.equal(w.forum.read(w.ownerId, w.companyId, { threadId: t.id }).posts.length, 0);
  assert.deepEqual(w.forum.removePost(w.ownerId, w.companyId, t.id), { removed: 1 });
  assert.throws(() => w.forum.read(w.ownerId, w.companyId, { threadId: t.id }), (e) => e.status === 404);
  w.roster.close();
});

test('the owner adds channels (a few at most, each name once) and a company\'s forums are its own', { skip }, () => {
  const w = setup();
  const c = w.forum.addChannel(w.ownerId, w.companyId, { title: 'Sound ideas', purpose: 'For the audio side' });
  assert.deepEqual([c.slug, c.title, c.postPolicy, c.kind], ['sound-ideas', 'Sound ideas', 'everyone', 'custom']);
  assert.throws(() => w.forum.addChannel(w.ownerId, w.companyId, { title: 'Sound ideas' }), (e) => e.code === 'channel_exists');
  assert.throws(() => w.forum.addChannel(w.ownerId, w.companyId, { title: 'x', postPolicy: 'nobody' }), (e) => e.status === 400);
  for (let i = 0; i < L.channels; i++) { try { w.forum.addChannel(w.ownerId, w.companyId, { title: `Extra ${i}` }); } catch (e) { assert.equal(e.code, 'channel_cap'); break; } }
  assert.equal(w.forum.channels(w.ownerId, w.companyId).length, L.channels);

  const other = world();
  other.hall.forum.ensureDefaults(other.ownerId, other.companyId, []);
  assert.throws(() => other.hall.forum.read(other.ownerId, other.companyId, { channel: 'sound-ideas' }), (e) => e.code === 'no_channel');
  w.roster.close();
  other.roster.close();
});

test('removing a company removes its channels and everything posted in them', { skip }, () => {
  const w = setup();
  w.forum.post(w.ownerId, w.companyId, w.author('zayd'), { channel: 'help', title: 'Q', body: 'q' });
  assert.deepEqual(w.forum.removeCompany(w.ownerId, w.companyId), { removed: 5 });
  assert.equal(w.roster.db.prepare('SELECT COUNT(*) AS n FROM forum_posts').get().n, 0);
  w.roster.close();
});
