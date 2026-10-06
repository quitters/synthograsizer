import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConversationPrompt, generateAgentResponse, generateText, setGeminiClient } from './gemini.js';
import { RECENT_WINDOW, SUMMARY_BATCH } from './summarizer.js';

const body = (i) => `UNIQUE-${String(i).padStart(3, '0')} ${'lorem ipsum dolor sit amet '.repeat(6)}tail-of-${i}`;
const conversation = (n) => Array.from({ length: n }, (_, i) => ({
  id: `m${i}`, agentId: i % 2 ? 'b' : 'a', agentName: i % 2 ? 'Ben' : 'Ann', content: body(i),
}));

/** The history builder as it was before the rolling summary, for plain-text messages. */
function legacyPrompt(messages, goal, agentName) {
  if (messages.length === 0) {
    return `The discussion is just beginning. The shared goal is: ${goal}

Please provide your opening statement to kick off the discussion. Remember, write ONLY your response - do not simulate other participants.`;
  }
  const WINDOW_SIZE = 15;
  const recentMessages = messages.slice(-WINDOW_SIZE);
  const olderMessages = messages.length > WINDOW_SIZE ? messages.slice(0, -WINDOW_SIZE) : [];
  let transcript = `CONVERSATION TRANSCRIPT:\n`;
  transcript += `========================================\n`;
  if (olderMessages.length > 0) {
    transcript += `[Earlier discussion - ${olderMessages.length} messages summarized]\n`;
    const speakerSummaries = {};
    for (const msg of olderMessages) {
      if (!speakerSummaries[msg.agentName]) speakerSummaries[msg.agentName] = [];
      speakerSummaries[msg.agentName].push((msg.content || '').slice(0, 80).replace(/\n/g, ' '));
    }
    for (const [name, briefs] of Object.entries(speakerSummaries)) {
      transcript += `  ${name} discussed: ${briefs.map(b => b + '...').join('; ')}\n`;
    }
    transcript += `\n`;
  }
  for (const msg of recentMessages) transcript += `[${msg.agentName}]: ${msg.content}\n\n`;
  transcript += `========================================\n\n`;
  transcript += `Now it's YOUR turn to respond as ${agentName}.\n`;
  transcript += `Write ONLY your response. Do NOT include a name prefix. Do NOT write responses for other panelists.\n`;
  transcript += `Engage with what was said above and contribute your unique perspective. Complete your full thought.`;
  return transcript;
}

const notes = (upTo, text = 'NOTES: Ann and Ben settled on teal; the logo is still open.') =>
  ({ text, upTo, lastId: `m${upTo - 1}` });

// ── no summary: exactly what it always was ──────────────────────────────────

test('without a summary the prompt is unchanged, short or long', () => {
  for (const n of [0, 1, 7, 15, 16, 40]) {
    const messages = conversation(n);
    assert.equal(buildConversationPrompt(messages, 'a goal', 'Ann'), legacyPrompt(messages, 'a goal', 'Ann'), `${n} messages`);
    assert.equal(buildConversationPrompt(messages, 'a goal', 'Ann', null), legacyPrompt(messages, 'a goal', 'Ann'), `${n} messages, null`);
  }
});

test('a summary that no longer matches the history is ignored', () => {
  const messages = conversation(40);
  const legacy = legacyPrompt(messages, 'g', 'Ann');
  assert.equal(buildConversationPrompt(messages, 'g', 'Ann', { text: 'x', upTo: 20, lastId: 'not-the-message' }), legacy);
  assert.equal(buildConversationPrompt(messages.slice(0, 10), 'g', 'Ann', notes(20)), legacyPrompt(messages.slice(0, 10), 'g', 'Ann'));
});

// ── with a summary ───────────────────────────────────────────────────────────

test('a current summary replaces the one-line notes for what it covers', () => {
  const messages = conversation(40);                                   // window starts at 25
  const prompt = buildConversationPrompt(messages, 'g', 'Ann', notes(20));

  assert.match(prompt, /notes on the first 20 messages/);
  assert.match(prompt, /NOTES: Ann and Ben settled on teal/);
  assert.doesNotMatch(prompt, /discussed:/, 'no crude one-line notes');
  for (let i = 0; i < 20; i++) assert.ok(!prompt.includes(`UNIQUE-${String(i).padStart(3, '0')} `), `message ${i} is only in the notes`);
  // everything the notes do not cover is shown in full (messages 20..39)
  for (let i = 20; i < 40; i++) assert.ok(prompt.includes(`tail-of-${i}`), `message ${i} in full`);
  assert.match(prompt, /Now it's YOUR turn to respond as Ann/);
});

test('a summary that is one batch behind still shows the unsummarized messages in full', () => {
  const messages = conversation(40);
  const prompt = buildConversationPrompt(messages, 'g', 'Ann', notes(25 - SUMMARY_BATCH));   // 19: gap of exactly one batch
  assert.doesNotMatch(prompt, /briefly/);
  assert.ok(prompt.includes('tail-of-19') && prompt.includes('tail-of-39'));
});

test('a summary that has fallen far behind gets one-line notes for the gap, not a prompt that grows without bound', () => {
  const messages = conversation(60);                                    // window starts at 45, fullFrom = 39
  const prompt = buildConversationPrompt(messages, 'g', 'Ann', notes(10));

  assert.match(prompt, /notes on the first 10 messages/);
  assert.match(prompt, /Between those notes and the recent messages - 29 messages, briefly/);
  assert.ok(!prompt.includes('tail-of-20'), 'a gap message appears only as its first 80 characters');
  assert.ok(prompt.includes('UNIQUE-020'));
  const shownInFull = (prompt.match(/tail-of-\d+/g) || []).length;
  assert.equal(shownInFull, RECENT_WINDOW + SUMMARY_BATCH);
});

test('the prompt with a summary is much shorter than the full history it stands in for', () => {
  const messages = conversation(80);
  const withNotes = buildConversationPrompt(messages, 'g', 'Ann', notes(65));
  const full = messages.map(m => m.content).join('\n');
  assert.ok(withNotes.length < full.length / 2, `${withNotes.length} vs ${full.length}`);
});

// ── through the model call ──────────────────────────────────────────────────

/** A stand-in for the Gemini client that records requests and streams a fixed reply. */
function fakeClient({ reply = 'ok', output_text = 'NEW NOTES' } = {}) {
  const requests = [];
  return {
    requests,
    interactions: {
      async create(request) {
        requests.push(request);
        if (!request.stream) return { output_text };
        return (async function* () {
          yield { event_type: 'step.start', step: { type: 'model_output' } };
          yield { event_type: 'step.delta', delta: { type: 'text', text: reply } };
          yield { event_type: 'interaction.completed', interaction: { status: 'completed' } };
        })();
      },
    },
  };
}

test("the agent's request to the model contains the summary", async () => {
  const client = fakeClient();
  const previous = setGeminiClient(client);
  try {
    const messages = conversation(40);
    const agent = { id: 'a', name: 'Ann', bio: 'You are Ann.' };
    const events = [];
    for await (const e of generateAgentResponse(agent, [agent], messages, 'a goal', [], { summary: notes(20) })) events.push(e);

    assert.equal(events.at(-1).type, 'complete');
    const sent = JSON.stringify(client.requests[0].input);
    assert.match(sent, /settled on teal/);
    assert.doesNotMatch(sent, /UNIQUE-005/);
  } finally {
    setGeminiClient(previous);
  }
});

test('generateText makes one stateless, non-streaming call on the fast model', async () => {
  const client = fakeClient({ output_text: 'Ann and Ben agreed on blue.' });
  const previous = setGeminiClient(client);
  try {
    assert.equal(await generateText('summarize this'), 'Ann and Ben agreed on blue.');
    const [req] = client.requests;
    assert.equal(req.input, 'summarize this');
    assert.equal(req.store, false);
    assert.ok(!req.stream);
    assert.match(req.model, /flash/);
  } finally {
    setGeminiClient(previous);
  }
});
