/**
 * The Hall: the collaboration layer of a company, in one object.
 * ───────────────────────────────────────────────────────────────
 * Mailboxes, forums, the workspace, the board and norms (each its own small module), over the same database as the roster, plus the three
 * things that need them together: the directory (who works here, in which room, reporting to whom), the digest (what is waiting for a
 * person at the top of their turn) and the setup of a new company (channels, a README, a welcome to each person).
 *
 * The principles it carries, from the account of agents that organised themselves in a shared space: names for themselves (the directory),
 * personal mailboxes (mail), group forums (forum and the rooms), shared files and programs (workspace), rules of their own (norms, decided by
 * the owner), leaders and followers forming task teams (board), shared infrastructure (all of it, kept as data the people maintain).
 * The conditions that make that safe are in the individual modules and in tools.js.
 */
import { Mail } from './mail.js';
import { Forum } from './forum.js';
import { Workspace } from './workspace.js';
import { Board } from './board.js';
import { Norms } from './norms.js';
import { fenced } from './render.js';
import { neutralize } from '../layer.js';
import { HALL_LIMITS } from './limits.js';

const DIRECTORY_MAX = 40;

export const DEFAULT_README = (company) => `# How we work at ${company.name}

This is the company's own handbook. The owner locks it; you can read it and not change it. Propose a working agreement (propose_norm) if something here should change.

## Where things are
- **Rooms**: each department has a room, a live conversation among the people in it. The lead closes a session; the rest of us say in a sentence what we checked and what is still open.
- **Mailboxes**: one for each of us, for what must outlast a room. A message is an ask, handoff, review, decision or fyi, with a subject and a few sentences. Say what you need, by when, and where the work is. Nobody replies to news.
- **Forums**: lasting threads everyone can read. #announcements (leads and the owner), #general (work that crosses departments), #help (questions to the whole company), #decisions (what we decided and why), and one for each department.
- **Workspace**: shared files that outlast a session. Write the COMPLETE file, say what changed. Long things live here, with a one-line message pointing at them.
- **Board**: tasks with a lead and members. The lead moves a task along and closes it.

## How we behave
- Concrete, short, and to the person it concerns. No chatter.
- Evidence before claims: look at the work (render it, read it) before saying it is good.
- Whoever reviews speaks after every save of the thing they review.
- Nothing leaves the company until a person has read it and approved it.
`;

export class Hall {
  /** @param {{ db: object, roster: import('../flow/roster.js').RosterStore, now?: () => Date }} options */
  constructor({ db, roster, now = () => new Date() }) {
    this.db = db;
    this.roster = roster;
    this.now = now;
    this.mail = new Mail({ db, now });
    this.forum = new Forum({ db, now });
    this.workspace = new Workspace({ db, now });
    this.board = new Board({ db, people: (o, c) => this.mail.people(o, c), now });
    this.norms = new Norms({ db, now });
  }

  // ── who is who ─────────────────────────────────────────────────────────────

  /**
   * The people of a company, each with the rooms they sit in and who they report to.
   * @param {{ id: string, name: string, departments: {id: string, name: string}[] }} company
   */
  directory(ownerId, company) {
    const seats = this.roster.seatsOf(ownerId, company.id);
    const deptName = new Map(company.departments.map(d => [d.id, d.name]));
    const nameOf = new Map(this.roster.employeesOf(ownerId, company.id).map(e => [e.id, e.name]));
    const byPerson = new Map();
    for (const s of seats) {
      if (!byPerson.has(s.employeeId)) byPerson.set(s.employeeId, { employeeId: s.employeeId, name: s.name, title: s.title, role: s.role, reportsTo: s.reportsTo ? nameOf.get(s.reportsTo) || null : null, seats: [] });
      const p = byPerson.get(s.employeeId);
      p.seats.push({ departmentId: s.departmentId, department: deptName.get(s.departmentId) || (s.taskId ? 'a task team' : 'a department'), position: s.position, isLead: s.isLead, reviewerOf: s.reviewerOf });
      if (!p.reportsTo && s.reportsTo) p.reportsTo = nameOf.get(s.reportsTo) || null;
    }
    return [...byPerson.values()];
  }

  /** The directory as the lines of a prompt. `forEmployeeId` marks the reader. */
  directoryText(ownerId, company, forEmployeeId = null) {
    const people = this.directory(ownerId, company);
    const lines = people.slice(0, DIRECTORY_MAX).map(p => {
      const where = p.seats.map(s => `${s.department}${s.isLead ? ' (lead)' : ''}${s.reviewerOf ? ` (reviews ${s.reviewerOf})` : ''}`).join(', ');
      return `- ${p.name}${p.employeeId === forEmployeeId ? ' (you)' : ''}: ${p.title}${where ? `; ${where}` : ''}${p.reportsTo ? `; reports to ${p.reportsTo}` : ''}`;
    });
    if (people.length > DIRECTORY_MAX) lines.push(`- and ${people.length - DIRECTORY_MAX} more`);
    return lines.join('\n');
  }

  // ── what is waiting ────────────────────────────────────────────────────────

  /**
   * The digest at the top of a person's turn: what is in their mailbox, which forums have news, what tasks they hold. Fenced as data.
   * Returns '' when there is nothing to say, so a quiet turn carries nothing.
   */
  digestText(ownerId, company, employeeId, { nonce }) {
    const lines = [];
    const mail = this.mail.digest(ownerId, employeeId);
    if (mail.unread) {
      const shown = mail.items.map(m => `${m.from.name}: ${m.kind}, "${neutralize(m.subject, nonce).slice(0, 60)}"`).join('; ');
      lines.push(`MAILBOX: ${mail.unread} unread (${shown}${mail.unread > mail.items.length ? '; more' : ''}). Read them with the mailbox tool before you start something they might change.`);
    } else if (mail.open) {
      lines.push(`MAILBOX: nothing new; ${mail.open} message${mail.open === 1 ? ' is' : 's are'} read but not answered or closed.`);
    }
    const news = this.forum.unreadFor(ownerId, company.id, employeeId);
    if (news.length) lines.push(`FORUMS: new posts in ${news.map(n => `#${n.slug} (${n.unread})`).join(', ')}.`);
    const tasks = this.board.openFor(ownerId, company.id, employeeId);
    if (tasks.length) lines.push(`YOUR TASKS: ${tasks.map(t => `"${neutralize(t.title, nonce).slice(0, 60)}" (${t.status}${t.lead?.id === employeeId ? ', you lead' : ''})`).join('; ')}.`);
    return lines.length ? fenced(lines.join('\n'), nonce, 'HALL') : '';
  }

  // ── a new company ──────────────────────────────────────────────────────────

  /**
   * Set the Hall up for a company: its channels, a locked README, and a welcome to each person. Safe to run again: what exists is left alone,
   * and a person who already has mail is not welcomed twice.
   * @param {{ id: string, name: string, departments: {id: string, name: string}[] }} company
   * @param {{ readme?: string, welcome?: boolean }} [options]
   */
  seedCompany(ownerId, company, { readme = null, welcome = true } = {}) {
    this.forum.ensureDefaults(ownerId, company.id, company.departments);
    if (!this.workspace.list(ownerId, company.id).some(f => f.path.toLowerCase() === 'readme.md')) {
      this.workspace.write(ownerId, company.id, { name: 'Owner', system: true }, { path: 'README.md', content: readme || DEFAULT_README(company), note: 'the handbook' });
      this.workspace.setLocked(ownerId, company.id, 'README.md', true);
    }
    let welcomed = 0;
    if (welcome) {
      const people = this.mail.people(ownerId, company.id);
      for (const p of people) {
        if (this.db.prepare('SELECT 1 AS x FROM mail WHERE to_id = ? LIMIT 1').get(p.id)) continue;
        const me = this.directory(ownerId, company).find(d => d.employeeId === p.id);
        const seats = me ? me.seats.map(s => `${s.position} in ${s.department}${s.isLead ? ' (you lead it)' : ''}`).join('; ') : 'a new colleague';
        this.mail.notify(ownerId, company.id, {
          from: 'Producer', toIds: [p.id], subject: `Welcome to ${company.name}`.slice(0, HALL_LIMITS.mail.subject),
          body: `You are ${p.name}, ${seats}${me?.reportsTo ? `, reporting to ${me.reportsTo}` : ''}. The handbook is the workspace file README.md. Your mailbox is for what must outlast a room, the forums are for what more than one of us needs, and the board shows who is leading what. Nothing leaves the company until the owner has read it and approved it.`,
        });
        welcomed += 1;
      }
    }
    return { channels: this.forum.channels(ownerId, company.id).length, welcomed };
  }

  /** For the owner: the whole Hall at a glance. */
  overview(ownerId, company) {
    const directory = this.directory(ownerId, company);
    const counts = new Map(this.mail.counts(ownerId, company.id).map(c => [c.employeeId, c]));
    return {
      people: directory.map(p => ({ ...p, mail: counts.get(p.employeeId) || { unread: 0, open: 0, total: 0 } })),
      channels: this.forum.channels(ownerId, company.id),
      files: this.workspace.list(ownerId, company.id),
      tasks: this.board.list(ownerId, company.id, { includeClosed: true, limit: 100 }),
      norms: this.norms.list(ownerId, company.id),
    };
  }

  /** The company was deleted: everything the Hall kept for it goes. (The roster removes the people, and with them their mailboxes.) */
  removeCompany(ownerId, companyId) {
    return {
      mail: this.mail.removeCompany(ownerId, companyId).removed,
      forum: this.forum.removeCompany(ownerId, companyId).removed,
      workspace: this.workspace.removeCompany(ownerId, companyId).removed,
      board: this.board.removeCompany(ownerId, companyId).removed,
      norms: this.norms.removeCompany(ownerId, companyId).removed,
    };
  }
}
