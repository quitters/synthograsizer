/**
 * Phase 6: per-agent voices and session audio.
 *
 * The WAV encoder and the synthesis planner are pure functions, so these are
 * real assertions rather than shape checks — a malformed RIFF header is
 * exactly the kind of bug that survives a code review and fails silently in
 * a media player.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.SYNTH_BACKEND_URL = 'http://127.0.0.1:9';

const { initializeTTS, planSynthesis, splitForContext, pcmToWav, renderTranscript } =
  await import('../server/services/tts.js');
const {
  VOICES, DEFAULT_VOICE, isKnownVoice, defaultVoiceForIndex, MAX_CHARS_PER_REQUEST,
} = await import('../server/config/voices.js');
const { orchestrator } = await import('../server/services/orchestrator.js');

/** Fake TTS client returning silence of a chosen length. */
function ttsClient({ pcmBytes = 480, failOn = [], sampleRate = 24000 } = {}) {
  const requests = [];
  return {
    requests,
    interactions: {
      create: async (req) => {
        requests.push(req);
        if (failOn.includes(requests.length)) throw new Error('synthesis failed');
        return {
          output_audio: {
            type: 'audio',
            data: Buffer.alloc(pcmBytes).toString('base64'),
            mime_type: 'audio/l16',
            sample_rate: sampleRate,
            channels: 1,
          },
        };
      },
    },
  };
}

const msg = (agentId, agentName, content) => ({ agentId, agentName, content });

describe('voice registry', () => {
  test('has the full documented set, with unique ids', () => {
    assert.equal(VOICES.length, 30);
    assert.equal(new Set(VOICES.map(v => v.id)).size, 30);
    for (const v of VOICES) assert.ok(v.style, `${v.id} needs a style label`);
  });

  test('validates known and unknown voices', () => {
    assert.ok(isKnownVoice('Kore'));
    assert.ok(isKnownVoice('Zubenelgenubi'));
    assert.ok(!isKnownVoice('Gandalf'));
    assert.ok(!isKnownVoice(undefined));
    assert.ok(isKnownVoice(DEFAULT_VOICE));
  });

  test('gives the first agents distinct voices, then wraps', () => {
    const first = [0, 1, 2, 3].map(defaultVoiceForIndex);
    assert.equal(new Set(first).size, 4, 'a fresh room should not sound like one person');
    assert.equal(defaultVoiceForIndex(30), defaultVoiceForIndex(0), 'wraps around');
  });
});

describe('synthesis planning', () => {
  test('merges consecutive messages from the same speaker', () => {
    const units = planSynthesis(
      [msg('a', 'Ada', 'First.'), msg('a', 'Ada', 'Still me.'), msg('b', 'Grace', 'My turn.')],
      new Map([['a', 'Kore'], ['b', 'Puck']])
    );
    assert.equal(units.length, 2, 'one run per speaker, not one per message');
    assert.equal(units[0].voice, 'Kore');
    assert.ok(units[0].text.includes('First.') && units[0].text.includes('Still me.'));
    assert.equal(units[1].voice, 'Puck');
  });

  test('does not merge across a speaker change', () => {
    const units = planSynthesis(
      [msg('a', 'Ada', 'One.'), msg('b', 'Grace', 'Two.'), msg('a', 'Ada', 'Three.')],
      new Map([['a', 'Kore'], ['b', 'Puck']])
    );
    assert.deepEqual(units.map(u => u.voice), ['Kore', 'Puck', 'Kore']);
  });

  test('falls back to the default voice for an unknown agent', () => {
    const units = planSynthesis([msg('ghost', 'Ghost', 'Boo.')], new Map());
    assert.equal(units[0].voice, DEFAULT_VOICE);
  });

  test('skips empty and whitespace-only messages', () => {
    const units = planSynthesis(
      [msg('a', 'Ada', ''), msg('a', 'Ada', '   '), msg('a', 'Ada', 'Real.')],
      new Map([['a', 'Kore']])
    );
    assert.equal(units.length, 1);
    assert.equal(units[0].text, 'Real.');
  });

  test('an empty transcript plans nothing', () => {
    assert.deepEqual(planSynthesis([], new Map()), []);
  });
});

describe('context splitting', () => {
  test('leaves short text alone', () => {
    assert.deepEqual(splitForContext('Just one sentence.'), ['Just one sentence.']);
  });

  test('splits long text on sentence boundaries', () => {
    const sentence = 'This is a sentence of reasonable length. ';
    const pieces = splitForContext(sentence.repeat(400));

    assert.ok(pieces.length > 1);
    for (const p of pieces) {
      assert.ok(p.length <= MAX_CHARS_PER_REQUEST, `piece of ${p.length} exceeds the cap`);
    }
    // A seam must not land mid-word.
    for (const p of pieces) assert.ok(!/\w$/.test(p.trim()) || p.trim().endsWith('length.'));
  });

  test('hard-splits a single sentence longer than the cap', () => {
    const pieces = splitForContext('x'.repeat(MAX_CHARS_PER_REQUEST * 2 + 50));
    assert.ok(pieces.length >= 3);
    for (const p of pieces) assert.ok(p.length <= MAX_CHARS_PER_REQUEST);
  });

  test('loses no characters when splitting', () => {
    const text = 'Alpha beta. '.repeat(600);
    const rejoined = splitForContext(text).join(' ').replace(/\s+/g, ' ').trim();
    assert.equal(rejoined, text.replace(/\s+/g, ' ').trim());
  });
});

describe('WAV encoding', () => {
  test('writes a valid 44-byte RIFF header', () => {
    const pcm = Buffer.alloc(1000);
    const wav = pcmToWav(pcm, { sampleRate: 24000, channels: 1 });

    assert.equal(wav.length, 44 + 1000);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.toString('ascii', 12, 16), 'fmt ');
    assert.equal(wav.toString('ascii', 36, 40), 'data');

    assert.equal(wav.readUInt32LE(4), 36 + 1000, 'RIFF chunk size');
    assert.equal(wav.readUInt32LE(16), 16, 'PCM fmt chunk size');
    assert.equal(wav.readUInt16LE(20), 1, 'format 1 = PCM');
    assert.equal(wav.readUInt16LE(22), 1, 'channels');
    assert.equal(wav.readUInt32LE(24), 24000, 'sample rate');
    assert.equal(wav.readUInt32LE(40), 1000, 'data chunk size');
  });

  test('derives byte rate and block align correctly', () => {
    const wav = pcmToWav(Buffer.alloc(8), { sampleRate: 24000, channels: 2 });
    // 2 channels * 16 bits / 8 = 4 bytes per frame; 24000 * 4 = 96000 B/s
    assert.equal(wav.readUInt16LE(32), 4, 'block align');
    assert.equal(wav.readUInt32LE(28), 96000, 'byte rate');
  });

  test('preserves the PCM payload byte for byte', () => {
    const pcm = Buffer.from([1, 2, 3, 4, 250, 251]);
    const wav = pcmToWav(pcm);
    assert.deepEqual(wav.subarray(44), pcm);
  });
});

describe('rendering a transcript', () => {
  test('one request per speaker run, concatenated into one WAV', async () => {
    const client = ttsClient({ pcmBytes: 480 });
    initializeTTS(null, client);
    const result = await renderTranscript(
      [msg('a', 'Ada', 'One.'), msg('b', 'Grace', 'Two.'), msg('a', 'Ada', 'Three.')],
      new Map([['a', 'Kore'], ['b', 'Puck']])
    );

    assert.equal(client.requests.length, 3);
    assert.equal(result.units, 3);
    assert.equal(result.failed, 0);
    assert.equal(result.wav.length, 44 + 480 * 3, 'segments are concatenated');
    assert.equal(result.wav.toString('ascii', 0, 4), 'RIFF');
  });

  test('uses single-speaker config — multi-speaker caps at two voices', async () => {
    const client = ttsClient();
    initializeTTS(null, client);
    await renderTranscript([msg('a', 'Ada', 'Hello.')], new Map([['a', 'Puck']]));

    const req = client.requests[0];
    assert.deepEqual(req.generation_config.speech_config, [{ voice: 'Puck' }]);
    assert.deepEqual(req.response_format, { type: 'audio' });
    assert.equal(req.store, false);
  });

  test('one failed segment does not lose the recording', async () => {
    const client = ttsClient({ pcmBytes: 480, failOn: [2] });
    initializeTTS(null, client);
    const result = await renderTranscript(
      [msg('a', 'Ada', 'One.'), msg('b', 'Grace', 'Two.'), msg('a', 'Ada', 'Three.')],
      new Map([['a', 'Kore'], ['b', 'Puck']])
    );

    assert.equal(result.failed, 1);
    assert.equal(result.wav.length, 44 + 480 * 2, 'the surviving segments still render');
  });

  test('throws only when everything fails', async () => {
    initializeTTS(null, ttsClient({ failOn: [1] }));
    await assert.rejects(
      () => renderTranscript([msg('a', 'Ada', 'One.')], new Map()),
      /every synthesis request failed/
    );
  });

  test('refuses an empty transcript rather than billing for silence', async () => {
    initializeTTS(null, ttsClient());
    await assert.rejects(
      () => renderTranscript([msg('a', 'Ada', '  ')], new Map()),
      /empty/
    );
  });

  test('reports duration from the rate the API actually returned', async () => {
    // 48000 bytes at 24kHz mono 16-bit = 1 second.
    initializeTTS(null, ttsClient({ pcmBytes: 48000, sampleRate: 24000 }));
    const result = await renderTranscript([msg('a', 'Ada', 'One.')], new Map());
    assert.equal(result.durationSeconds, 1);
  });

  test('reports progress per unit', async () => {
    initializeTTS(null, ttsClient());
    const seen = [];
    await renderTranscript(
      [msg('a', 'Ada', 'One.'), msg('b', 'Grace', 'Two.')],
      new Map(),
      (done, total, speaker) => seen.push({ done, total, speaker })
    );
    assert.deepEqual(seen, [
      { done: 1, total: 2, speaker: 'Ada' },
      { done: 2, total: 2, speaker: 'Grace' },
    ]);
  });
});

describe('agents carry a voice', () => {
  beforeEach(() => orchestrator.reset());

  test('new agents get distinct default voices', () => {
    const a = orchestrator.addAgent('Ada', 'bio');
    const b = orchestrator.addAgent('Grace', 'bio');
    assert.ok(isKnownVoice(a.voice));
    assert.notEqual(a.voice, b.voice);
  });

  test('an explicit voice is kept, an unknown one is not', () => {
    const a = orchestrator.addAgent('Ada', 'bio', { voice: 'Enceladus' });
    assert.equal(a.voice, 'Enceladus');
    const b = orchestrator.addAgent('Grace', 'bio', { voice: 'Gandalf' });
    assert.ok(isKnownVoice(b.voice));
    assert.notEqual(b.voice, 'Gandalf');
  });

  test('updateAgent can change the voice', () => {
    orchestrator.addAgent('Ada', 'bio');
    assert.equal(orchestrator.updateAgent('Ada', { voice: 'Sulafat' }).voice, 'Sulafat');
    assert.notEqual(orchestrator.updateAgent('Ada', { voice: 'nope' }).voice, 'nope');
  });
});
