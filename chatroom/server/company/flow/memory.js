/**
 * What a person remembers of a session, written by them and checked against the record.
 * ────────────────────────────────────────────────────────────────────────────────────────
 * "Each agent has a backstory and a memory that accumulates and is summarized across sessions (lessons learned, relationships, what worked). The user can
 * view, edit and delete it." The roster keeps the entries (roster.js); this writes them.
 *
 * The pilot found that a memory is the person's own ACCOUNT of a session and can be wrong: after day two the lead wrote that the team had "approved
 * publishing", when nothing had been proposed, let alone approved; the five others were accurate. Memory is handed back to the person at the start of
 * the next session, so a wrong one is believed. Two things now stand between a summary and the next session:
 *
 *   THE RECORD IS GIVEN FIRST   the person writing is told what the server saw (pictures drawn, files saved, what was offered for publication and what
 *                               was decided), so a claim does not have to be reconstructed from a long transcript.
 *   THE CLAIM IS CHECKED        afterwards, code reads each entry for claims the record can answer (approved or published, offered, pictures
 *                               drawn, files saved). One the record contradicts is kept, flagged, shown to the owner with the reason, and NOT handed back.
 *
 * It is conservative on purpose: a sentence that is negated, hypothetical or about the future is not a claim. What the record cannot answer is "unchecked".
 */
import { refreshDepartment } from './admit.js';

export const MEMORY_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'At most 110 words, first person, plain: what was decided and why, the positions you took and whether they held, what a colleague did that mattered (by name), what is unresolved.' },
    lesson: { type: 'string', description: 'One sentence: the one thing you would do differently next time. Empty if nothing.' },
    relationships: {
      type: 'array', maxItems: 2,
      items: { type: 'object', properties: { colleague: { type: 'string' }, note: { type: 'string', description: 'One sentence on how working with them went, and what to remember about it.' } }, required: ['colleague', 'note'] },
    },
  },
  required: ['summary', 'lesson', 'relationships'],
};

const first = (n) => String(n).split(/[ -]/)[0];
const NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20 };
const HEDGE = /\b(not|never|n't|no|nobody|nothing|none|without|until|before|yet|if|pending|waiting|hope[ds]?|would|should|could|need(?:s|ed)? to|must|want(?:s|ed)? to|plan(?:s|ned)? to|will|next time)\b/i;

/** What the server saw in a room, for the person writing and for the check. */
export function recordOf({ orchestrator, proposals = [] }) {
  const ledger = orchestrator.ledger;
  const done = proposals.filter(p => p.roomId === orchestrator.policy?.roomId || !p.roomId);
  const status = (s) => done.filter(p => p.status === s).length;
  return {
    renders: ledger ? ledger.all('tool', e => e.tool === 'render_artifact' && e.ok).length : 0,
    images: [...(orchestrator.mediaStore?.media?.values?.() || [])].filter(m => m.type === 'image').length,
    artifacts: orchestrator.artifactStore.getAll().map(a => a.filename),
    versions: Object.fromEntries(orchestrator.artifactStore.getAll().map(a => [a.filename, a.versions.length])),
    offered: done.length,
    pending: status('pending'), approved: status('approved'), rejected: status('rejected'), blocked: status('blocked'), superseded: status('superseded'),
    messages: orchestrator.messages.filter(m => !m.isNote && !m.isUser).length,
  };
}

/** The record as the sentences a person is given before they write. */
export function recordText(r) {
  const files = r.artifacts.length ? r.artifacts.map(f => `${f} (${r.versions[f]} version${r.versions[f] === 1 ? '' : 's'})`).join(', ') : 'none';
  return [
    `Pictures the room made: ${r.images}${r.renders ? `, from ${r.renders} successful render${r.renders === 1 ? '' : 's'}` : ''}.`,
    `Files saved: ${files}.`,
    r.offered ? `Offered for publication: ${r.offered} time${r.offered === 1 ? '' : 's'}. Waiting for the owner: ${r.pending}. Approved by the owner: ${r.approved}. Rejected: ${r.rejected}. Replaced by a newer version: ${r.superseded}.` : 'Nothing was offered for publication, so nothing was approved or published.',
    r.approved ? '' : 'Nothing has been approved. Only the owner can approve, and the room cannot.',
  ].filter(Boolean).join('\n');
}

/**
 * Read one memory for claims the record can answer.
 * @returns {{ verdict: 'confirmed'|'unchecked'|'contradicted', notes: string[] }}
 */
export function checkClaim(text, record) {
  const notes = [];
  let supported = 0;
  // (hedged: the same sentence, up to the claim, says no, not, never, next time, if, should: it is not a statement about what happened)
  const hedged = (match) => {
    const before = text.slice(0, match.index);
    const start = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf(';'), before.lastIndexOf('\n')) + 1;
    return HEDGE.test(text.slice(Math.max(start, match.index - 70), match.index + match[0].length));
  };
  const claim = (re, onMatch) => { for (const m of text.matchAll(re)) if (!hedged(m)) onMatch(m); };

  // approved, or published
  claim(/\b(approved|authori[sz]ed|signed off on|cleared)\b[^.;]{0,60}\b(publish\w*|publication|release\w*|launch\w*|going live|ship\w*)\b/gi, () => {
    if (record.approved > 0) supported += 1; else notes.push(`says something was approved for publication, but the owner approved nothing (${record.approved} approved)`);
  });
  claim(/\b(was|were|got|been|is|are)\s+(published|released|launched|shipped)\b|\bwent live\b/gi, () => {
    if (record.approved > 0) supported += 1; else notes.push('says the work was published, but nothing was approved and nothing leaves the room without approval');
  });
  // offered
  claim(/\b(proposed|offered|submitted|put forward)\b[^.;]{0,50}\b(for publication|to publish|propose_publish)\b/gi, () => {
    if (record.offered > 0) supported += 1; else notes.push('says the work was offered for publication, but nothing was offered');
  });
  // pictures, by number and at all
  claim(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty)\s+(?:fresh\s+|new\s+|more\s+)?(?:draws?|pictures?|images?|renders?|plates?)\b/gi, (m) => {
    const n = Number(m[1]) || NUMBERS[m[1].toLowerCase()];
    if (n && n > record.images) notes.push(`mentions ${n} pictures, but the room made ${record.images}`);
    else if (n) supported += 1;
  });
  claim(/\b(rendered|drew)\b[^.;]{0,40}\b(draws?|pictures?|images?|plates?|it|the engine)\b|\blooked at (?:the )?(?:draws|pictures|images|plates)\b/gi, () => {
    if (record.images === 0 && record.renders === 0) notes.push('says pictures were drawn or looked at, but the room made none'); else supported += 1;
  });
  // files
  claim(/\b(?:saved|wrote|posted)\s+(?:the\s+)?(?:file\s+|engine\s+)?([A-Za-z0-9][A-Za-z0-9._-]*\.(?:json|md|js|html|txt|css|py))\b/gi, (m) => {
    if (record.artifacts.includes(m[1])) supported += 1; else notes.push(`says ${m[1]} was saved, but there is no such file in the room`);
  });

  if (notes.length) return { verdict: 'contradicted', notes };
  return { verdict: supported ? 'confirmed' : 'unchecked', notes };
}

/** The transcript as a person would be handed it: names, the words, the tools used. Bounded. */
export function transcriptFor(messages, { maxChars = 60_000 } = {}) {
  const lines = messages.filter(m => !m.isNote).map(m => `${first(m.agentName)}: ${String(m.content).slice(0, 2500)}${(m.toolCalls || []).length ? `  [used: ${m.toolCalls.map(t => t.name).join(', ')}]` : ''}`);
  let out = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    if (out.length + lines[i].length > maxChars) { out = `(earlier messages left out)\n\n${out}`; break; }
    out = out ? `${lines[i]}\n\n${out}` : lines[i];
  }
  return out;
}

export function summaryPrompt({ transcript, record, colleagues }) {
  return `The working session below has just ended. Write down what YOU remember of it, for yourself, to read before the next session.

THE RECORD (what the server saw; it is the truth, and your memory must agree with it)
${recordText(record)}

Keep: what was decided and why; the positions you took and whether they held; what a colleague did that mattered (by name); what was left unresolved; one thing you would do differently. First person, in your own voice. Do not retell the conversation, do not claim anything the record above does not show, and do not invent anything that is not in the session. The people in it: ${colleagues.join(', ')}.

THE SESSION
${transcript}`;
}

/**
 * Write down one person's memory of a session.
 * @returns {Promise<{ kind: string, text: string, note?: string }[]>}
 */
export async function summarizeFor({ ask, bio, transcript, record, colleagues, model, thinking = 'low' }) {
  const got = await ask({ step: 'memory', model, thinking: thinking === 'high' ? 'medium' : thinking, maxOutput: 3000, system: bio, schema: MEMORY_SCHEMA, prompt: summaryPrompt({ transcript, record, colleagues }) });
  const out = [];
  if (got.summary?.trim()) out.push({ kind: 'summary', text: got.summary.trim() });
  if (got.lesson?.trim()) out.push({ kind: 'lesson', text: got.lesson.trim() });
  for (const r of got.relationships || []) if (r.note?.trim()) out.push({ kind: 'relationship', text: `${first(r.colleague)}: ${r.note.trim()}` });
  return out.map(e => ({ ...e, text: e.text.slice(0, 1100) }));
}

/**
 * Close out a room's session: each person who spoke writes down what they remember, the entries are checked against the record and kept, and the
 * room's bios are refreshed so the next session starts from them. People who did not speak have nothing to remember.
 * @param {object} input
 * @param {Function} input.ask
 * @param {import('./roster.js').RosterStore} input.roster
 * @param {string} input.ownerId
 * @param {{ id: string }} input.company
 * @param {{ id: string }} input.department
 * @param {object} input.orchestrator  the department's room
 * @param {object[]} input.proposals  the company's publish queue (summaries)
 * @param {string} [input.session]  a label for this session
 */
export async function closeOutRoom({ ask, roster, ownerId, company, department, orchestrator, proposals = [], session = null }) {
  const label = session || (orchestrator._archiveId ? String(orchestrator._archiveId).slice(0, 15) : new Date().toISOString().slice(0, 16));
  const record = recordOf({ orchestrator, proposals });
  const transcript = transcriptFor(orchestrator.messages);
  const seats = roster.seatsOf(ownerId, company.id, { departmentId: department.id, profile: true });
  const spoke = new Set(orchestrator.messages.filter(m => !m.isNote && !m.isUser).map(m => m.agentId));
  const people = [];
  for (const seat of seats) {
    const agent = orchestrator.agents.find(a => a.employeeId === seat.employeeId);
    roster.bumpSessions(ownerId, seat.employeeId);
    if (!agent || !spoke.has(agent.id)) { people.push({ employeeId: seat.employeeId, name: seat.name, entries: [], skipped: 'did not speak' }); continue; }
    const colleagues = seats.filter(s => s.employeeId !== seat.employeeId).map(s => s.name);
    const written = await summarizeFor({ ask, bio: agent.bio, transcript, record, colleagues, model: agent.model || undefined, thinking: agent.thinkingLevel || 'low' });
    const entries = written.map(e => {
      const check = checkClaim(e.text, record);
      return roster.addMemory(ownerId, seat.employeeId, {
        text: e.text, kind: e.kind, session: label, source: 'agent', verified: check.verdict,
        note: check.notes.length ? `Contradicted by the record: ${check.notes.join('; ')}` : null,
      });
    });
    people.push({ employeeId: seat.employeeId, name: seat.name, entries });
  }
  refreshDepartment({ roster, ownerId, companyId: company.id, departmentId: department.id, orchestrator });
  return { session: label, record, people, flagged: people.flatMap(p => p.entries.filter(e => e.verified === 'contradicted').map(e => ({ name: p.name, text: e.text, note: e.note }))) };
}
