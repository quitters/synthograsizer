/**
 * The room's ledger: what happened in it, in order, kept for the "done when" checks.
 * ─────────────────────────────────────────────────────────────────────────────────
 * An agent can say "I rendered it" or "I saved it" and be wrong; a check that decides whether a room may end has to look at what
 * the server saw. The ledger holds only facts the server witnessed, each with a sequence number so "after the latest save" is a
 * comparison and not a guess:
 *
 *   save   an artifact was saved:  { artifact, version, messageCount }   (messageCount = messages posted before it, so the message
 *          that carries the save is at that index, and "after the save" means a higher one)
 *   tool   a tool ran:             { tool, ok, agent, artifact? }
 *
 * It is small on purpose (the newest MAX_ENTRIES), per room, and cleared when the room is reset.
 */
export const MAX_ENTRIES = 2000;

export class RoomLedger {
  constructor() {
    this.entries = [];
    this._seq = 0;
  }

  /** Add an entry and return it. */
  record(type, data = {}) {
    const entry = { seq: ++this._seq, at: new Date().toISOString(), type, ...data };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
    return entry;
  }

  clear() {
    this.entries = [];
    this._seq = 0;
  }

  /** Every entry of a type (optionally narrowed by a predicate), oldest first. */
  all(type, predicate = () => true) {
    return this.entries.filter(e => e.type === type && predicate(e));
  }

  /** The newest entry of a type (optionally narrowed by a predicate), or null. */
  latest(type, predicate = () => true) {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (e.type === type && predicate(e)) return e;
    }
    return null;
  }

  /** The newest save of an artifact, or null. */
  latestSave(artifact) {
    return this.latest('save', e => e.artifact === artifact);
  }

  /** A copy for an API answer. */
  snapshot({ limit = 200 } = {}) {
    return this.entries.slice(-limit).map(e => ({ ...e }));
  }
}
