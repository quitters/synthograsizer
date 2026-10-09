/**
 * From a seat in the roster to an agent in a room.
 * ─────────────────────────────────────────────────
 * The room's add-agent call takes a name, a bio, a model, a thinking level and a tool tier, so until now a person's profile never reached the
 * server: the room held a flat copy of the text, and a restarted server forgot even that. Now the roster keeps the profile, the seat and the
 * memory; this renders them into what the room takes, and puts the person back into their room whenever it is made again.
 *
 *   render   the sheet (the profile's template with the person's settings for the session), then what they remember of earlier sessions here
 *   admit    through the room's own add-agent call, so every rule of admission applies as it always did: the cap, the clean name and sheet,
 *            the tool tier the company was granted. A row in the roster cannot get a person past a ceiling.
 *   restore  when a department's room is created, everyone seated in it is admitted again
 */
import { renderBio } from '../profileBio.js';
import { isPolicyError } from '../errors.js';

export const MEMORY_HEADING = 'WHAT YOU REMEMBER FROM EARLIER SESSIONS AT THIS COMPANY (your own notes; the owner can read and correct them)';

/** The settings the profile's knobs have for this person: { tempo: 1 } becomes the shape the renderer takes. */
export const knobStates = (knobs = {}) => Object.fromEntries(Object.entries(knobs).filter(([, i]) => Number.isInteger(i) && i >= 0).map(([name, index]) => [name, { index }]));

/**
 * @param {{ name: string, profile: object, knobs?: object, tier: string, model?: string|null, thinking?: string|null, employeeId: string }} seat  from RosterStore.seatsOf(..., { profile: true })
 * @param {{ text: string, session?: string|null }[]} [memory]  from RosterStore.memoryForBio
 * @returns {{ name: string, bio: string, model: string|null, thinkingLevel: string|null, tools: string, employeeId: string }}
 */
export function renderSeat(seat, memory = []) {
  const sheet = renderBio(seat.profile, { uiVariableStates: knobStates(seat.knobs) });
  const notes = memory.length ? `\n\n${MEMORY_HEADING}\n${memory.map(m => `- ${m.session ? `(${m.session}) ` : ''}${m.text.replace(/\s+/g, ' ').trim()}`).join('\n')}` : '';
  return { name: seat.name, bio: `${sheet}${notes}`, model: seat.model || null, thinkingLevel: seat.thinking || null, tools: seat.tier, employeeId: seat.employeeId };
}

/** Admit one rendered seat through the room's add-agent call. Throws the PolicyError the room's rules throw. */
export function admitSeat(orchestrator, rendered) {
  // A seat cast on a model the operator no longer allows is seated on the nearest allowed one: the people are the owner's, the models are the operator's
  const model = rendered.model && orchestrator.policy ? orchestrator.policy.modelFor(rendered.model, { name: rendered.name }) : rendered.model;
  return orchestrator.addAgent(rendered.name, rendered.bio, { model, thinkingLevel: rendered.thinkingLevel, tools: rendered.tools, employeeId: rendered.employeeId });
}

/**
 * Put everyone seated in a department's room into it. A person the room's rules refuse is skipped and reported, never forced.
 * @returns {{ admitted: string[], refused: { name: string, why: string }[] }}
 */
export function admitDepartment({ roster, ownerId, companyId, departmentId, orchestrator }) {
  const admitted = [];
  const refused = [];
  const present = new Set(orchestrator.agents.map(a => a.employeeId).filter(Boolean));
  for (const seat of roster.seatsOf(ownerId, companyId, { departmentId, profile: true })) {
    if (present.has(seat.employeeId)) continue;
    try {
      admitSeat(orchestrator, renderSeat(seat, roster.memoryForBio(ownerId, seat.employeeId)));
      admitted.push(seat.name);
    } catch (err) {
      if (!isPolicyError(err)) throw err;
      refused.push({ name: seat.name, why: err.message });
    }
  }
  return { admitted, refused };
}

/**
 * Hand a room the bios its people would be given now (after a session added memories, or a sheet was edited), without taking them out of the
 * conversation. People in the room who are not in the roster (added by hand) are left alone.
 * @returns {string[]} the names refreshed
 */
export function refreshDepartment({ roster, ownerId, companyId, departmentId, orchestrator }) {
  const done = [];
  for (const seat of roster.seatsOf(ownerId, companyId, { departmentId, profile: true })) {
    const agent = orchestrator.agents.find(a => a.employeeId === seat.employeeId);
    if (!agent) continue;
    const r = renderSeat(seat, roster.memoryForBio(ownerId, seat.employeeId));
    orchestrator.updateAgent(agent.id, { bio: r.bio });
    done.push(seat.name);
  }
  return done;
}
