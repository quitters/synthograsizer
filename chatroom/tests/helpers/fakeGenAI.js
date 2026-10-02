import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures');

/** Load a recorded SSE event sequence by name (no extension). */
export function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf-8'));
}

/**
 * Wrap an array of events as an async iterable, the way the SDK returns a
 * stream. Events are yielded across microtask boundaries so the consumer
 * really does interleave rather than draining a synchronous array.
 */
async function* asStream(events) {
  for (const event of events) {
    await Promise.resolve();
    yield event;
  }
}

/**
 * A stand-in for `GoogleGenAI` that serves scripted responses to
 * `interactions.create` and records every request it was given.
 *
 * `script` is a list of entries consumed in call order. The last entry repeats
 * if there are more calls than entries, so a test only has to describe the
 * calls it cares about. Each entry is one of:
 *   { events: [...] }        replay this event sequence
 *   { fixture: 'name' }      replay tests/fixtures/name.json
 *   { throws: Error|string } reject the create() call itself
 *
 * @example
 *   const fake = new FakeGenAI([{ fixture: 'truncated-turn' }, { fixture: 'continuation-turn' }]);
 */
export class FakeGenAI {
  constructor(script = []) {
    this.script = Array.isArray(script) ? script : [script];
    /** Every request object passed to interactions.create, in order. */
    this.requests = [];
    this.interactions = {
      create: async (request) => {
        this.requests.push(request);
        const entry = this.script[Math.min(this.requests.length - 1, this.script.length - 1)];
        if (!entry) throw new Error('FakeGenAI: no scripted response for this call');

        if (entry.throws) {
          throw entry.throws instanceof Error ? entry.throws : new Error(entry.throws);
        }
        const events = entry.events ?? loadFixture(entry.fixture);
        return asStream(events);
      },
    };
  }

  /** Number of times interactions.create was called. */
  get callCount() {
    return this.requests.length;
  }

  /** The nth request (0-indexed). */
  request(n = 0) {
    return this.requests[n];
  }
}

/** Minimal agent object, shaped like orchestrator.addAgent output. */
export function makeAgent(overrides = {}) {
  return {
    id: 'agent-1',
    name: 'Ada Lovelace',
    bio: 'Mathematician. Terse, precise, allergic to hand-waving.',
    color: '#FF6B6B',
    model: null,
    thinkingLevel: 'low',
    ...overrides,
  };
}

/**
 * Drain the async generator into the event list the orchestrator sees.
 * Returns { chunks, complete, error, events } — `complete` and `error` are the
 * single terminal event of each kind, if present.
 */
export async function drain(generator) {
  const events = [];
  for await (const event of generator) events.push(event);
  return {
    events,
    chunks: events.filter(e => e.type === 'chunk').map(e => e.text),
    complete: events.find(e => e.type === 'complete') || null,
    error: events.find(e => e.type === 'error') || null,
  };
}
