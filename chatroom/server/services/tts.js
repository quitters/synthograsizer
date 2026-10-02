/**
 * Session audio rendering.
 * ────────────────────────
 * Turns a transcript into a listenable recording: one voice per agent,
 * concatenated into a single WAV.
 *
 * Rendering is per contiguous same-speaker run rather than multi-speaker,
 * because the multi-speaker config accepts at most two speakers and a room
 * routinely has more. See MAX_SPEAKERS_PER_REQUEST for the full reasoning.
 */
import { GoogleGenAI } from '@google/genai';
import {
  TTS_MODEL, DEFAULT_VOICE, isKnownVoice, MAX_CHARS_PER_REQUEST,
  DEFAULT_SAMPLE_RATE, DEFAULT_CHANNELS, BITS_PER_SAMPLE,
} from '../config/voices.js';

let genAI = null;

export function initializeTTS(apiKey, client = null) {
  genAI = client || new GoogleGenAI({ apiKey });
}

/**
 * Split a transcript into synthesis units: contiguous runs by the same
 * speaker, each further split to stay well inside the context window.
 *
 * Splitting long runs on sentence boundaries rather than mid-word keeps the
 * seam between two audio segments from landing inside a word.
 *
 * @param {Array<{agentId, agentName, content, isUser}>} messages
 * @param {Map<string,string>} voiceByAgentId
 * @returns {Array<{speaker: string, voice: string, text: string}>}
 */
export function planSynthesis(messages, voiceByAgentId = new Map()) {
  const units = [];

  for (const msg of messages) {
    const text = (msg.content || '').trim();
    if (!text) continue;

    const speaker = msg.agentName || 'Narrator';
    const voice = voiceByAgentId.get(msg.agentId) || DEFAULT_VOICE;

    for (const piece of splitForContext(text)) {
      const last = units[units.length - 1];
      // Merge with the previous unit when the same person is still talking
      // and there is room — fewer requests, and no seam mid-thought.
      if (last && last.speaker === speaker && last.voice === voice &&
          last.text.length + piece.length + 1 <= MAX_CHARS_PER_REQUEST) {
        last.text += '\n' + piece;
      } else {
        units.push({ speaker, voice, text: piece });
      }
    }
  }
  return units;
}

/** Split text on sentence boundaries into pieces under the char cap. */
export function splitForContext(text, maxChars = MAX_CHARS_PER_REQUEST) {
  if (text.length <= maxChars) return [text];

  const pieces = [];
  // Keep the delimiter with the sentence it ends.
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = '';

  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > maxChars) {
      pieces.push(current);
      current = '';
    }
    // A single sentence longer than the cap: hard-split it rather than
    // emitting an oversized request.
    if (sentence.length > maxChars) {
      if (current) { pieces.push(current); current = ''; }
      for (let i = 0; i < sentence.length; i += maxChars) {
        pieces.push(sentence.slice(i, i + maxChars));
      }
      continue;
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * Wrap raw PCM in a WAV container.
 *
 * The API returns headerless 16-bit PCM, which no browser will play. This is
 * a standard 44-byte RIFF header — pure arithmetic, no dependency needed.
 */
export function pcmToWav(pcmBuffer, {
  sampleRate = DEFAULT_SAMPLE_RATE,
  channels = DEFAULT_CHANNELS,
  bitsPerSample = BITS_PER_SAMPLE,
} = {}) {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4); // file size minus RIFF+size
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);                   // PCM fmt chunk size
  header.writeUInt16LE(1, 20);                    // audio format 1 = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/** Synthesise one unit. Returns raw PCM plus whatever format the API reported. */
async function synthesizeUnit(unit) {
  const interaction = await genAI.interactions.create({
    model: TTS_MODEL,
    input: unit.text,
    store: false,
    response_format: { type: 'audio' },
    generation_config: {
      speech_config: [{ voice: unit.voice }],
    },
  });

  const audio = interaction.output_audio;
  if (!audio?.data) throw new Error(`no audio returned for ${unit.speaker}`);

  return {
    pcm: Buffer.from(audio.data, 'base64'),
    // Trust the response over our defaults — the model decides the format.
    sampleRate: audio.sample_rate || DEFAULT_SAMPLE_RATE,
    channels: audio.channels || DEFAULT_CHANNELS,
    mimeType: audio.mime_type,
  };
}

/**
 * Render a whole transcript to one WAV.
 *
 * @param {Array} messages
 * @param {Map<string,string>} voiceByAgentId
 * @param {(done: number, total: number, speaker: string) => void} [onProgress]
 * @returns {Promise<{wav: Buffer, units: number, failed: number, durationSeconds: number}>}
 */
export async function renderTranscript(messages, voiceByAgentId, onProgress) {
  if (!genAI) throw new Error('TTS not initialized');

  const units = planSynthesis(messages, voiceByAgentId);
  if (units.length === 0) throw new Error('nothing to render — transcript is empty');

  const chunks = [];
  let failed = 0;
  let sampleRate = DEFAULT_SAMPLE_RATE;
  let channels = DEFAULT_CHANNELS;

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    try {
      const result = await synthesizeUnit(unit);
      chunks.push(result.pcm);
      sampleRate = result.sampleRate;
      channels = result.channels;
    } catch (err) {
      // One bad line should not lose the whole recording. Skip it and keep
      // going; the caller reports how many were dropped.
      failed++;
      console.warn(`[tts] unit ${i + 1}/${units.length} (${unit.speaker}) failed: ${err.message}`);
    }
    onProgress?.(i + 1, units.length, unit.speaker);
  }

  if (chunks.length === 0) throw new Error('every synthesis request failed');

  const pcm = Buffer.concat(chunks);
  const bytesPerSecond = sampleRate * channels * (BITS_PER_SAMPLE / 8);
  return {
    wav: pcmToWav(pcm, { sampleRate, channels }),
    units: units.length,
    failed,
    durationSeconds: Math.round(pcm.length / bytesPerSecond),
  };
}
