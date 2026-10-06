import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContentParts, generateAgentResponse, setGeminiClient } from './gemini.js';
import { planSessionMedia, MEDIA_LIMITS } from './mediaContext.js';
import { orchestrator } from './orchestrator.js';

const b64 = (text) => Buffer.from(text, 'utf-8').toString('base64');
const png = (id, chars = 2000, addedAtMessage = 0) => ({ id, name: `${id}.png`, mimeType: 'image/png', data: 'A'.repeat(chars), addedAtMessage });
const mp4 = (id, addedAtMessage = 0) => ({ id, name: `${id}.mp4`, mimeType: 'video/mp4', data: 'B'.repeat(3000), addedAtMessage });
const notes = (id, body, addedAtMessage = 0) => ({ id, name: `${id}.txt`, mimeType: 'text/plain', data: b64(body), addedAtMessage });

/** The attachment part of the request as it was before: everything, but only in the opening turns. */
function legacyContentParts(promptText, sessionMedia) {
  const isVisual = (m) => m && (m.startsWith('image/') || m === 'video/mp4' || m === 'video/webm');
  const isText = (m) => ['application/json', 'text/plain', 'text/csv', 'text/html', 'text/markdown', 'text/xml',
    'application/xml', 'text/css', 'text/javascript', 'application/javascript'].includes(m);
  const block = (m) => m.mimeType === 'application/pdf' ? { type: 'document', data: m.data, mime_type: m.mimeType }
    : m.mimeType.startsWith('video/') ? { type: 'video', data: m.data, mime_type: m.mimeType }
    : { type: 'image', data: m.data, mime_type: m.mimeType };
  const parts = [];
  let pre = `\nSESSION REFERENCE MATERIALS (${sessionMedia.length} files uploaded by the user):\n`;
  for (const media of sessionMedia) {
    if (isVisual(media.mimeType)) {
      pre += `- [Image/Media: "${media.name}" - ID: ${media.id}] (attached below, can be remixed with [REMIX: ${media.id} | changes])\n`;
    } else if (isText(media.mimeType)) {
      const content = Buffer.from(media.data, 'base64').toString('utf-8');
      pre += `- [File: "${media.name}" (${media.mimeType})]:\n\`\`\`\n${content}\n\`\`\`\n`;
    } else if (media.mimeType === 'application/pdf') {
      pre += `- [PDF: "${media.name}" - ID: ${media.id}] (attached below)\n`;
    } else {
      pre += `- [File: "${media.name}" (${media.mimeType}) - ID: ${media.id}]\n`;
    }
  }
  pre += `\nYou may reference, analyze, critique, or remix these materials in your response.\n`;
  parts.push({ type: 'text', text: pre + '\n' + promptText });
  for (const media of sessionMedia) if (isVisual(media.mimeType) || media.mimeType === 'application/pdf') parts.push(block(media));
  return parts;
}

// ── the opening turns are unchanged ──────────────────────────────────────────

test('in the opening turns the request is exactly what it was', () => {
  const media = [
    png('p1'), notes('n1', 'A short notes file.'), mp4('v1'),
    { id: 'd1', name: 'brief.pdf', mimeType: 'application/pdf', data: 'C'.repeat(500), addedAtMessage: 0 },
    { id: 'z1', name: 'x.zip', mimeType: 'application/zip', data: 'DDDD', addedAtMessage: 0 },
  ];
  for (const messageCount of [0, 1, 2]) {
    const plan = planSessionMedia(media, { messageCount, agentCount: 3 });
    assert.deepEqual(buildContentParts('PROMPT', plan, []), legacyContentParts('PROMPT', media), `at ${messageCount}`);
  }
});

test('with no reference files the request is just the prompt', () => {
  assert.deepEqual(buildContentParts('PROMPT', [], []), [{ type: 'text', text: 'PROMPT' }]);
});

// ── later turns ──────────────────────────────────────────────────────────────

const blocks = (parts, type) => parts.filter(p => p.type === type);

test('late in a chat an image is still attached and a text file is still readable', () => {
  const media = [png('ref'), notes('codes', 'The codeword is PERIWINKLE-42.')];
  const parts = buildContentParts('PROMPT', planSessionMedia(media, { messageCount: 30, agentCount: 3 }), []);

  assert.equal(blocks(parts, 'image').length, 1);
  assert.match(parts[0].text, /PERIWINKLE-42/);
  assert.match(parts[0].text, /ref\.png.*attached below/);
  assert.doesNotMatch(parts[0].text, /not attached/);
});

test('a stale video is listed with the reason instead of attached, and the agent is told what to do', () => {
  const parts = buildContentParts('PROMPT', planSessionMedia([mp4('clip')], { messageCount: 30, agentCount: 3 }), []);
  assert.equal(blocks(parts, 'video').length, 0);
  assert.match(parts[0].text, /clip\.mp4.*not attached this turn: .*only attached for a few turns/);
  assert.match(parts[0].text, /ask the user to share one again/);
});

test('a stale image over the budget can still be remixed by id', () => {
  const big = MEDIA_LIMITS.imageBudgetChars / 2 + 1;
  const media = [png('old', big, 1), png('new', big, 9)];
  const parts = buildContentParts('PROMPT', planSessionMedia(media, { messageCount: 30, agentCount: 3 }), []);
  assert.equal(blocks(parts, 'image').length, 1);
  assert.match(parts[0].text, /old\.png.*not attached this turn.*remix it with \[REMIX: old \|/);
});

test('a truncated text file says how long it really was', () => {
  const parts = buildContentParts('PROMPT', planSessionMedia([notes('long', 'x'.repeat(20000))], { messageCount: 30, agentCount: 2 }), []);
  assert.match(parts[0].text, /truncated, 20000 chars total/);
});

test('generated images are still appended after the reference files', () => {
  const generated = [{ id: 'g1', data: 'GGGG', mimeType: 'image/png', prompt: 'a fern', agentName: 'Ann' }];
  const parts = buildContentParts('PROMPT', planSessionMedia([png('ref')], { messageCount: 30, agentCount: 2 }), generated);
  assert.deepEqual(parts.map(p => p.type), ['text', 'image', 'text', 'image']);
  assert.equal(parts[1].data, 'A'.repeat(2000));
  assert.equal(parts[3].data, 'GGGG');
});

// ── through the model call ──────────────────────────────────────────────────

function fakeClient() {
  const requests = [];
  return {
    requests,
    interactions: {
      async create(request) {
        requests.push(request);
        return (async function* () {
          yield { event_type: 'step.start', step: { type: 'model_output' } };
          yield { event_type: 'step.delta', delta: { type: 'text', text: 'ok' } };
          yield { event_type: 'interaction.completed', interaction: { status: 'completed' } };
        })();
      },
    },
  };
}

const chat = (n) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, agentId: i % 2 ? 'b' : 'a', agentName: i % 2 ? 'Ben' : 'Ann', content: `turn ${i}` }));
const ann = { id: 'a', name: 'Ann', bio: 'You are Ann.' };
const ben = { id: 'b', name: 'Ben', bio: 'You are Ben.' };

async function requestFor(messages, media) {
  const client = fakeClient();
  const previous = setGeminiClient(client);
  try {
    for await (const e of generateAgentResponse(ann, [ann, ben], messages, 'a goal', media, {})) {
      if (e.type === 'error') throw new Error(e.error);
    }
    return client.requests[0].input;
  } finally {
    setGeminiClient(previous);
  }
}

test("on turn 9 the agent's request still carries the reference image and the notes file", async () => {
  const input = await requestFor(chat(9), [png('ref'), notes('codes', 'The codeword is PERIWINKLE-42.')]);
  assert.equal(blocks(input, 'image').length, 1);
  assert.match(input[0].text, /PERIWINKLE-42/);
  assert.doesNotMatch(input[0].text, /were provided at session start/, 'the old name-only reminder is gone');
});

test('a file uploaded on turn 12 is shown to the next agents, not skipped for the rest of the chat', async () => {
  const messages = chat(12);
  const media = [png('late', 2000, 12)];
  assert.equal(blocks(await requestFor(messages, media), 'image').length, 1);

  const afterOthers = await requestFor(chat(14), media);                       // everyone has had a look; still an image
  assert.equal(blocks(afterOthers, 'image').length, 1);

  const video = [mp4('lateclip', 12)];
  assert.equal(blocks(await requestFor(chat(13), video), 'video').length, 1, 'fresh video attached');
  assert.equal(blocks(await requestFor(chat(30), video), 'video').length, 0, 'stale video left out');
});

// ── recording when a file arrived ───────────────────────────────────────────

test('a file added to the session is stamped with how far into the chat it arrived', () => {
  orchestrator.reset();
  orchestrator.messages = chat(7);
  const added = orchestrator.addSessionMedia({ id: 'x', name: 'x.png', mimeType: 'image/png', data: 'AAAA' });
  assert.equal(added.addedAtMessage, 7);

  const given = orchestrator.addSessionMedia({ id: 'y', name: 'y.png', mimeType: 'image/png', data: 'AAAA', addedAtMessage: 2 });
  assert.equal(given.addedAtMessage, 2, 'an explicit position is kept');
  orchestrator.reset();
});
