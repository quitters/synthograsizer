/**
 * The board: what the company is working on, who leads it and who is on it.
 * ──────────────────────────────────────────────────────────────────────────
 * Leaders and followers are not a label; they are a task with a lead and members, a status everyone can see, and a place to say what is
 * blocked. A person creates a task, names a lead and a few members, and says what "done" looks like (a deliverable and, if it can be
 * checked, the same done-when criteria a room uses). The lead moves it along. A task can ask for a TASK TEAM, a room formed for it from the
 * people it needs: asking is free, but making the room, saying go and paying for it stay with the owner.
 *
 * The board holds data, not code: it schedules nothing and starts nothing by itself.
 */
import { plain } from '../flow/sqlite.js';
import { HALL_LIMITS, TASK_STATUSES, OPEN_TASK_STATUSES } from './limits.js';
import { rid, parse, bad, refuse, missing, cleanLine, cleanBlock } from './common.js';

const L = HALL_LIMITS.board;
// A member can report progress; closing or cancelling a task, and changing who is on it, belongs to its lead, its creator and the owner.
const MEMBER_STATUSES = ['doing', 'review', 'blocked'];

export class Board {
  /** @param {{ db: object, people: (ownerId: string, companyId: string) => {id: string, name: string}[], now?: () => Date }} options */
  constructor({ db, people, now = () => new Date() }) {
    this.db = db;
    this.people = people;
    this.now = now;
  }

  _stamp() { return this.now().toISOString(); }

  _shape(r, names = null) {
    const nameOf = (id) => names?.get(id) || null;
    const members = parse(r.members, []);
    return {
      id: r.id, title: r.title, description: r.description, status: r.status,
      lead: r.lead_id ? { id: r.lead_id, name: nameOf(r.lead_id) } : null,
      members: members.map(id => ({ id, name: nameOf(id) })),
      departmentId: r.department_id, deliverable: r.deliverable, doneWhen: parse(r.done_when, null),
      needsTeam: Boolean(r.needs_team), teamDepartmentId: r.team_department_id,
      createdBy: { id: r.created_by_id, name: r.created_by }, log: parse(r.log, []), createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  _names(ownerId, companyId) { return new Map(this.people(ownerId, companyId).map(p => [p.id, p.name])); }

  _row(ownerId, companyId, taskId) {
    const row = this.db.prepare('SELECT * FROM board_tasks WHERE id = ? AND owner_id = ? AND company_id = ?').get(String(taskId), ownerId, companyId);
    if (!row) throw missing('task');
    return plain(row);
  }

  /** Names or ids to people of this company, refusing anyone who is not one. */
  _who(ownerId, companyId, list, label) {
    const people = this.people(ownerId, companyId);
    const out = [];
    for (const raw of Array.isArray(list) ? list : []) {
      const key = String(raw ?? '').trim().toLowerCase();
      if (!key) continue;
      const hits = people.filter(p => p.id === raw || p.name.toLowerCase() === key);
      const first = hits.length ? hits : people.filter(p => p.name.toLowerCase().split(' ')[0] === key);
      if (first.length !== 1) throw bad(`${label}: ${first.length ? `"${raw}" could be more than one person; use the full name` : `no one here is called "${raw}"`}. People: ${people.map(p => p.name).join(', ')}.`, { field: label.toLowerCase() });
      if (!out.includes(first[0].id)) out.push(first[0].id);
    }
    return out;
  }

  /**
   * Add a task.
   * @param {{ id: string|null, name: string, system?: boolean }} author
   * @param {{ title: string, description?: string, lead?: string, members?: string[], departmentId?: string, deliverable?: string, doneWhen?: object[], needsTeam?: boolean }} task
   */
  create(ownerId, companyId, author, task) {
    const open = this.db.prepare(`SELECT COUNT(*) AS n FROM board_tasks WHERE company_id = ? AND status IN (${OPEN_TASK_STATUSES.map(() => '?').join(',')})`).get(companyId, ...OPEN_TASK_STATUSES).n;
    if (open >= L.openTasks) throw refuse(`The board holds at most ${L.openTasks} open tasks. Close or cancel some first.`, 'board_full', 403);
    const title = cleanLine(task?.title, 'The title', L.title, 'title');
    const description = task?.description ? cleanBlock(task.description, 'The description', L.description, 'description') : '';
    const leadIds = task?.lead ? this._who(ownerId, companyId, [task.lead], 'Lead') : (author.id ? [author.id] : []);
    const memberIds = this._who(ownerId, companyId, task?.members, 'Members').filter(id => id !== leadIds[0]);
    if (memberIds.length > L.members) throw bad(`A task can have a lead and at most ${L.members} members.`, { field: 'members' });
    const deliverable = task?.deliverable ? cleanLine(task.deliverable, 'The deliverable', 200, 'deliverable') : null;
    if (task?.doneWhen !== undefined && task.doneWhen !== null && (!Array.isArray(task.doneWhen) || task.doneWhen.length > 10)) throw bad('doneWhen is a list of at most 10 checks.', { field: 'doneWhen' });
    const stamp = this._stamp();
    const id = rid();
    this.db.prepare(
      `INSERT INTO board_tasks (id, owner_id, company_id, title, description, status, lead_id, members, department_id, deliverable, done_when, needs_team, team_department_id, created_by, created_by_id, log, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    ).run(id, ownerId, companyId, title, description, leadIds[0] || null, JSON.stringify(memberIds), task?.departmentId || null, deliverable,
      task?.doneWhen ? JSON.stringify(task.doneWhen) : null, task?.needsTeam ? 1 : 0, author.name, author.id || null,
      JSON.stringify([{ at: stamp, by: author.name, text: 'created the task' }]), stamp, stamp);
    return this.get(ownerId, companyId, id);
  }

  get(ownerId, companyId, taskId) {
    return this._shape(this._row(ownerId, companyId, taskId), this._names(ownerId, companyId));
  }

  list(ownerId, companyId, { status = null, assignee = null, includeClosed = false, limit = L.listAtOnce } = {}) {
    const where = ['owner_id = ?', 'company_id = ?'];
    const args = [ownerId, companyId];
    if (status) {
      where.push('status = ?');
      args.push(status);
    } else if (!includeClosed) {
      where.push(`status IN (${OPEN_TASK_STATUSES.map(() => '?').join(',')})`);
      args.push(...OPEN_TASK_STATUSES);
    }
    const names = this._names(ownerId, companyId);
    let rows = this.db.prepare(`SELECT * FROM board_tasks WHERE ${where.join(' AND ')} ORDER BY rowid DESC LIMIT 200`).all(...args).map(r => this._shape(plain(r), names));
    if (assignee) rows = rows.filter(t => t.lead?.id === assignee || t.members.some(m => m.id === assignee));
    return rows.slice(0, Math.max(1, Math.min(Number(limit) || L.listAtOnce, 200)));
  }

  /**
   * Change a task. The lead, the creator and the owner can change anything; a member can report progress (doing, review, blocked) and add a note.
   * @param {{ id: string|null, name: string, system?: boolean }} actor
   * @param {{ status?: string, note?: string, lead?: string, members?: string[], deliverable?: string, needsTeam?: boolean }} patch
   */
  update(ownerId, companyId, actor, taskId, patch = {}) {
    const row = this._row(ownerId, companyId, taskId);
    const members = parse(row.members, []);
    const isBoss = actor.system || (actor.id && (actor.id === row.lead_id || actor.id === row.created_by_id));
    const isMember = actor.id && members.includes(actor.id);
    if (!isBoss && !isMember) throw refuse('Only the lead, the creator, the members and the owner can change a task. Write to its lead if it needs to change.', 'not_allowed', 403);
    const set = {};
    const said = [];
    if (patch.status !== undefined) {
      if (!TASK_STATUSES.includes(patch.status)) throw bad(`status must be one of ${TASK_STATUSES.join(', ')}.`, { field: 'status' });
      if (!isBoss && !MEMBER_STATUSES.includes(patch.status)) throw refuse(`A member can set a task to ${MEMBER_STATUSES.join(', ')}; its lead closes it.`, 'not_allowed', 403);
      set.status = patch.status;
      said.push(`moved it to ${patch.status}`);
    }
    if (patch.lead !== undefined || patch.members !== undefined || patch.deliverable !== undefined || patch.needsTeam !== undefined) {
      if (!isBoss) throw refuse('Only the lead, the creator and the owner can change who is on a task or what it delivers.', 'not_allowed', 403);
      if (patch.lead !== undefined) { set.lead_id = this._who(ownerId, companyId, [patch.lead], 'Lead')[0] || null; said.push('changed the lead'); }
      if (patch.members !== undefined) {
        const ids = this._who(ownerId, companyId, patch.members, 'Members').filter(id => id !== (set.lead_id ?? row.lead_id));
        if (ids.length > L.members) throw bad(`A task can have a lead and at most ${L.members} members.`, { field: 'members' });
        set.members = JSON.stringify(ids);
        said.push('changed the members');
      }
      if (patch.deliverable !== undefined) { set.deliverable = patch.deliverable ? cleanLine(patch.deliverable, 'The deliverable', 200, 'deliverable') : null; said.push('changed the deliverable'); }
      if (patch.needsTeam !== undefined) { set.needs_team = patch.needsTeam ? 1 : 0; if (patch.needsTeam) said.push('asked for a task team'); }
    }
    if (patch.note) said.push(`noted: ${cleanLine(patch.note, 'The note', L.note, 'note')}`);
    if (!said.length) return this.get(ownerId, companyId, taskId);
    const stamp = this._stamp();
    const log = parse(row.log, []);
    log.push({ at: stamp, by: actor.name, text: said.join('; ') });
    set.log = JSON.stringify(log.slice(-50));
    set.updated_at = stamp;
    this.db.prepare(`UPDATE board_tasks SET ${Object.keys(set).map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(set), row.id);
    return this.get(ownerId, companyId, taskId);
  }

  /** The owner has made a room for the task. */
  setTeam(ownerId, companyId, taskId, departmentId) {
    const row = this._row(ownerId, companyId, taskId);
    this.db.prepare('UPDATE board_tasks SET team_department_id = ?, updated_at = ? WHERE id = ?').run(departmentId, this._stamp(), row.id);
    return this.get(ownerId, companyId, taskId);
  }

  remove(ownerId, companyId, taskId) {
    const row = this._row(ownerId, companyId, taskId);
    this.db.prepare('DELETE FROM board_tasks WHERE id = ?').run(row.id);
    return { removed: true };
  }

  /** Tasks someone leads or is a member of that are still open, for the digest at the top of their turn. */
  openFor(ownerId, companyId, employeeId) {
    return this.list(ownerId, companyId, { assignee: employeeId, limit: 8 });
  }

  removeCompany(ownerId, companyId) {
    return { removed: Number(this.db.prepare('DELETE FROM board_tasks WHERE owner_id = ? AND company_id = ?').run(ownerId, companyId).changes) };
  }
}
