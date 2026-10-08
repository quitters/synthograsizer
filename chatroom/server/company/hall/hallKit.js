/**
 * Shared setup for the Hall's tests: a roster in memory, a company with a few people hired into one department, a controllable clock.
 * Not imported by anything outside the tests.
 */
import { RosterStore } from '../flow/roster.js';
import { Hall } from './hall.js';
import { newId } from '../util.js';

export const DEPT = 'abcd1234';

export const clock = { t: Date.parse('2026-10-08T12:00:00Z'), tick(ms = 60_000) { this.t += ms; return this.t; }, now() { return new Date(this.t); } };

const profile = (name, role) => ({
  id: `p_${name}`, name, icon: '🙂', color: '#336699', category: 'roleplay',
  bioTemplate: '{{agent_name}}, the {{role}}.', variables: [], anchors: { agent_name: name, role }, tags: [],
});

export const PEOPLE = [
  ['rima', 'Rima Haddad-Boudreau', 'producer', { isLead: true }],
  ['kasia', 'Kasia Wójcik-Lindqvist', 'skeptic', { reviewerOf: 'engine.json' }],
  ['zayd', 'Zayd Siddiqui', 'template engineer', { tier: 'builder' }],
  ['tavita', "Tavita Fa'asavalu", 'worldbuilder', {}],
];

/** @returns a hall over an in-memory roster, with `people.<key>` = the seat of each person hired into the company */
export function world({ people = PEOPLE, departments = [{ id: DEPT, name: 'Archive Desk' }], ownerId = newId(), companyId = newId() } = {}) {
  const roster = RosterStore.open({ file: ':memory:', now: () => clock.now() });
  const hall = new Hall({ db: roster.db, roster, now: () => clock.now() });
  const company = { id: companyId, name: 'Parallax Works', departments };
  const seats = {};
  for (const [key, name, role, extra] of people) {
    const c = roster.addCandidate(ownerId, { profile: profile(name, role), casting: { tier: extra.tier || 'none' }, archetype: 'steward', role, status: 'ready' });
    seats[key] = roster.hire(ownerId, { companyId, departmentId: departments[0].id, candidateId: c.id, position: role, ...extra });
  }
  const who = (key) => ({ id: seats[key].employeeId, name: seats[key].name });
  return { roster, hall, ownerId, companyId, company, seats, who };
}
