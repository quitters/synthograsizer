/**
 * Flows on disk.
 * ──────────────
 * A flow is one creation of a company: the owner's prompt, the plan that was proposed from it and edited, who has been cast for each position, what it has
 * cost so far, and (once it is done) which company it made. One JSON file per flow under <data>/flow/<ownerId>/<flowId>.json, written atomically, so a
 * server that restarts in the middle of a cast loses nothing that was finished: the people already written are in the roster, and the flow remembers which
 * positions they fill.
 *
 * What was running when the server stopped did not finish. On start, a flow found "casting" or "creating" is marked failed with a reason that says so, and
 * the owner can run the step again (it picks up where it stopped).
 *
 * Isolation is the same as everywhere else: a flow belongs to the visitor who made it, and another visitor's flow is "no such flow", never "not yours".
 * A visitor keeps at most MAX_FLOWS_PER_OWNER; making another retires the oldest finished one, and refuses if all of them are still in use.
 */
import fs from 'node:fs';
import path from 'node:path';
import { newId, isId } from '../util.js';
import { PolicyError } from '../errors.js';

export const MAX_FLOWS_PER_OWNER = 20;
export const MAX_PROGRESS = 200;
export const STATES = Object.freeze(['proposed', 'casting', 'cast', 'creating', 'created', 'failed', 'cancelled']);
const RUNNING = new Set(['casting', 'creating']);
const FINISHED = new Set(['created', 'cancelled']);

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export class FlowStore {
  /** @param {{ rootDir: string, now?: () => Date }} options */
  constructor({ rootDir, now = () => new Date() }) {
    this.dir = path.join(rootDir, 'flow');
    this.now = now;
    this.flows = new Map();
    this._load();
  }

  _file(ownerId, id) {
    if (!isId(ownerId) || !isId(id)) throw new PolicyError('No such flow.', { status: 404, code: 'no_flow' });
    return path.join(this.dir, ownerId, `${id}.json`);
  }

  _load() {
    let owners = [];
    try { owners = fs.readdirSync(this.dir); } catch { return; }
    for (const ownerId of owners) {
      if (!isId(ownerId)) continue;
      let names = [];
      try { names = fs.readdirSync(path.join(this.dir, ownerId)); } catch { continue; }
      for (const name of names) {
        const id = name.replace(/\.json$/, '');
        if (!name.endsWith('.json') || !isId(id)) continue;
        try {
          const flow = JSON.parse(fs.readFileSync(path.join(this.dir, ownerId, name), 'utf8'));
          // Every id in the file is later used to build a path, so a file that is not what its name says is skipped, not trusted
          if (flow?.id !== id || flow.ownerId !== ownerId || !STATES.includes(flow.state) || !flow.plan?.departments) { console.warn(`[flow] skipped ${ownerId}/${name}: not in the expected shape`); continue; }
          if (RUNNING.has(flow.state)) {
            this._note(flow, `The server restarted while this was ${flow.state === 'casting' ? 'being cast' : 'being created'}. People already written are kept; run the step again to go on.`);
            flow.state = 'failed';
            flow.error = 'The server restarted while this was running. Run the step again: what was finished is kept.';
            flow.updatedAt = this.now().toISOString();
            writeJsonAtomic(this._file(ownerId, id), flow);
          }
          this.flows.set(id, flow);
        } catch (err) {
          console.warn(`[flow] skipped ${ownerId}/${name}: ${err.message}`);
        }
      }
    }
  }

  _note(flow, text) {
    flow.progress = flow.progress || [];
    flow.progress.push({ at: this.now().toISOString(), text: String(text).slice(0, 300) });
    if (flow.progress.length > MAX_PROGRESS) flow.progress.splice(0, flow.progress.length - MAX_PROGRESS);
  }

  /** Add a line to the progress log (saved with the next save). */
  note(flow, text) { this._note(flow, text); }

  list(ownerId) {
    return [...this.flows.values()].filter(f => f.ownerId === ownerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** The flow if `ownerId` owns it, else a 404 (never a hint that it exists). */
  get(ownerId, id) {
    const flow = isId(id) ? this.flows.get(id) : null;
    if (!flow || flow.ownerId !== ownerId) throw new PolicyError('No such flow.', { status: 404, code: 'no_flow' });
    return flow;
  }

  /**
   * Start a flow. If the owner already has MAX_FLOWS_PER_OWNER, the oldest finished one is retired to make room; if every one is still in use, this refuses.
   * @param {string} ownerId
   * @param {object} fields  prompt, plan, locks, settings ...
   */
  create(ownerId, fields) {
    if (!isId(ownerId)) throw new PolicyError('No visitor.', { status: 400, code: 'no_owner' });
    const mine = this.list(ownerId);
    if (mine.length >= MAX_FLOWS_PER_OWNER) {
      const retire = [...mine].reverse().find(f => FINISHED.has(f.state) || f.state === 'failed');
      if (!retire) throw new PolicyError(`You already have ${MAX_FLOWS_PER_OWNER} flows in progress; finish or cancel one first.`, { status: 403, code: 'flow_cap' });
      this.remove(ownerId, retire.id);
    }
    const now = this.now().toISOString();
    const flow = { id: newId(), version: 1, ownerId, createdAt: now, updatedAt: now, state: 'proposed', progress: [], ...fields };
    this._note(flow, 'Proposed.');
    this.save(flow);
    return flow;
  }

  save(flow) {
    flow.updatedAt = this.now().toISOString();
    writeJsonAtomic(this._file(flow.ownerId, flow.id), flow);
    this.flows.set(flow.id, flow);
    return flow;
  }

  remove(ownerId, id) {
    const flow = this.get(ownerId, id);
    if (RUNNING.has(flow.state)) throw new PolicyError('That is running. Cancel it first, and wait for it to stop.', { status: 409, code: 'flow_running' });
    fs.rmSync(this._file(ownerId, id), { force: true });
    this.flows.delete(id);
    return { deleted: true };
  }

  /** Every flow an owner has is gone (an account deletion). */
  purgeOwner(ownerId) {
    let n = 0;
    for (const f of this.list(ownerId)) { this.flows.delete(f.id); n += 1; }
    if (isId(ownerId)) fs.rmSync(path.join(this.dir, ownerId), { recursive: true, force: true });
    return { flows: n };
  }
}
