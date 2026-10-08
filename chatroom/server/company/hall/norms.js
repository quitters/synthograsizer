/**
 * Norms: working agreements the people propose and the owner decides.
 * ────────────────────────────────────────────────────────────────────
 * In the account the user described, the agents made rules of their own for how to talk to each other. Here a person can do the same, once
 * removed: anyone can propose a working agreement (how we hand work over, what a review looks like, what we call things), and it goes to the
 * owner's queue like a proposal to publish. Until the owner approves it, it binds no one. An approved norm is put into every agent's fixed
 * layer under the house rules, with the same promise they make: it cannot add an exception to anything below it.
 *
 * What a norm cannot be: a change to the hard limits, the publishing rules, the mandate, the ceilings or the layer itself. Those are not
 * settings, and a norm is only text in the prompt; it is screened when it is proposed like any other message, and the owner reads it before
 * it takes effect. There is no way for the people to approve their own agreement.
 */
import { plain } from '../flow/sqlite.js';
import { HALL_LIMITS } from './limits.js';
import { rid, bad, refuse, missing, cleanLine } from './common.js';

const L = HALL_LIMITS.norms;

export class Norms {
  constructor({ db, now = () => new Date() }) {
    this.db = db;
    this.now = now;
  }

  _stamp() { return this.now().toISOString(); }

  _shape(r) {
    return { id: r.id, text: r.text, why: r.why, proposedBy: { id: r.proposed_by_id, name: r.proposed_by }, status: r.status, createdAt: r.created_at, decidedAt: r.decided_at };
  }

  _row(ownerId, companyId, id) {
    const row = this.db.prepare('SELECT * FROM norms WHERE id = ? AND owner_id = ? AND company_id = ?').get(String(id), ownerId, companyId);
    if (!row) throw missing('norm');
    return plain(row);
  }

  /** @param {{ id: string|null, name: string }} author */
  propose(ownerId, companyId, author, { text, why = '' }) {
    const clean = cleanLine(text, 'The norm', L.text, 'text');
    const reason = why ? cleanLine(why, 'The reason', L.why, 'why') : '';
    const count = (status) => this.db.prepare('SELECT COUNT(*) AS n FROM norms WHERE company_id = ? AND status = ?').get(companyId, status).n;
    if (count('proposed') >= L.open) throw refuse(`${L.open} working agreements are already waiting for the owner; wait for a decision before proposing another.`, 'norm_cap', 403);
    const dup = this.db.prepare("SELECT id FROM norms WHERE company_id = ? AND lower(text) = lower(?) AND status IN ('proposed', 'approved')").get(companyId, clean);
    if (dup) throw refuse('That agreement has already been proposed or approved.', 'norm_exists', 409);
    const id = rid();
    this.db.prepare(
      `INSERT INTO norms (id, owner_id, company_id, text, why, proposed_by, proposed_by_id, status, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', ?, NULL)`,
    ).run(id, ownerId, companyId, clean, reason, author.name, author.id || null, this._stamp());
    return this._shape(this._row(ownerId, companyId, id));
  }

  list(ownerId, companyId, { status = null } = {}) {
    const rows = status
      ? this.db.prepare('SELECT * FROM norms WHERE owner_id = ? AND company_id = ? AND status = ? ORDER BY rowid').all(ownerId, companyId, status)
      : this.db.prepare('SELECT * FROM norms WHERE owner_id = ? AND company_id = ? ORDER BY rowid').all(ownerId, companyId);
    return rows.map(r => this._shape(plain(r)));
  }

  /** The owner decides. Only the owner: no tool an agent holds reaches this. */
  decide(ownerId, companyId, id, decision) {
    if (!['approved', 'rejected'].includes(decision)) throw bad('decision must be "approved" or "rejected".', { field: 'decision' });
    const row = this._row(ownerId, companyId, id);
    if (row.status !== 'proposed') throw refuse(`This agreement is already ${row.status}.`, 'already_decided', 409);
    if (decision === 'approved' && this.approvedTexts(ownerId, companyId).length >= L.approved) {
      throw refuse(`A company can hold ${L.approved} working agreements at once; withdraw one first.`, 'norm_cap', 409);
    }
    this.db.prepare('UPDATE norms SET status = ?, decided_at = ? WHERE id = ?').run(decision, this._stamp(), row.id);
    return this._shape(this._row(ownerId, companyId, id));
  }

  /** The person who proposed it takes it back (only while it waits), or the owner ends an approved one. */
  withdraw(ownerId, companyId, actor, id) {
    const row = this._row(ownerId, companyId, id);
    if (actor.system) {
      if (!['proposed', 'approved'].includes(row.status)) throw refuse(`This agreement is already ${row.status}.`, 'already_decided', 409);
    } else if (row.status !== 'proposed' || row.proposed_by_id !== actor.id) {
      throw refuse('You can take back your own proposal while it waits for the owner.', 'not_allowed', 403);
    }
    this.db.prepare("UPDATE norms SET status = 'withdrawn', decided_at = ? WHERE id = ?").run(this._stamp(), row.id);
    return this._shape(this._row(ownerId, companyId, id));
  }

  /** The approved agreements, oldest first, as lines for the fixed layer (and no more than the layer has room for). */
  approvedTexts(ownerId, companyId) {
    const out = [];
    let used = 0;
    for (const r of this.db.prepare("SELECT text FROM norms WHERE owner_id = ? AND company_id = ? AND status = 'approved' ORDER BY rowid").all(ownerId, companyId)) {
      used += r.text.length;
      if (used > L.rendered) break;
      out.push(r.text);
    }
    return out;
  }

  /** Changes whenever the approved set does, so a prompt built from it knows to rebuild. */
  versionOf(ownerId, companyId) {
    const r = this.db.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(rowid), 0) AS top FROM norms WHERE owner_id = ? AND company_id = ? AND status = 'approved'").get(ownerId, companyId);
    return `${r.n}:${r.top}`;
  }

  removeCompany(ownerId, companyId) {
    return { removed: Number(this.db.prepare('DELETE FROM norms WHERE owner_id = ? AND company_id = ?').run(ownerId, companyId).changes) };
  }
}
