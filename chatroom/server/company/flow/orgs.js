/**
 * Org charts: departments, positions and headcount, scaled to the size the owner picks.
 * ───────────────────────────────────────────────────────────────────────────────────────
 * The plan asks for a structure modelled on how large studios and software companies organise departments, roles and headcount per function.
 * These are our own simplified models of those ways of organising, kept as data so they can be argued with and edited; they are not claims about
 * any company's real structure or numbers. Names and links only, as the plan asks:
 *
 *   studio       small teams led by a producer and a director, each with its own makers, a skeptic and an engineer (the way a console maker's
 *                game teams are described: Nintendo)
 *   product      a trio of lead, engineer and designer per product, with a researcher and a quality voice beside it (Microsoft, Google)
 *   functional   departments by function, each with a lead, whatever the product (Apple)
 *   live         a running service: content, art, engineering, quality and a community voice (Jagex)
 *
 * What every layout keeps: at most 8 people in a room (the operator's default ceiling), exactly one lead a room, and a reviewer (someone whose job
 * is to object) in any room of three or more. The owner can replace the plan wholesale: anything they specify is locked, and the planner only
 * fills in what they left open.
 */

/** @typedef {{ title: string, archetype: string, lead?: boolean, reviewer?: boolean }} Position */

const P = (title, archetype, extra = {}) => ({ title, archetype, ...extra });

/** The core of one room: one of each of the six jobs the pilot's desk did. */
const DESK = [
  P('Producer', 'steward', { lead: true }), P('Worldbuilder', 'storyteller'), P('Image director', 'craftsman'),
  P('Researcher', 'archivist'), P('Skeptic', 'contrarian', { reviewer: true }), P('Template engineer', 'machinist'),
];

/**
 * The layouts by size: a list of departments, each with its purpose and positions.
 */
const RAW_SIZES = {
  desk: {
    label: 'A desk: one room, six people',
    departments: [{ name: 'Studio Desk', purpose: 'One small team that does the whole job, from idea to checked file.', positions: DESK }],
  },
  small: {
    label: 'A small studio: two rooms, about twelve people',
    departments: [
      { name: 'Concept Desk', purpose: 'Decides what to make and invents the world, the characters and the rules of it.', positions: [
        P('Producer', 'steward', { lead: true }), P('Worldbuilder', 'storyteller'), P('Writer', 'storyteller'), P('Researcher', 'archivist'), P('Trend scout', 'scout'), P('Skeptic', 'contrarian', { reviewer: true }),
      ] },
      { name: 'Production Desk', purpose: 'Turns the concept into checked files and pictures, and tries to break them.', positions: [
        P('Creative director', 'director', { lead: true }), P('Image director', 'craftsman'), P('Art director', 'craftsman'), P('Template engineer', 'machinist'), P('Editor', 'editor', { reviewer: true }), P('Analyst', 'analyst'),
      ] },
    ],
  },
  medium: {
    label: 'A studio: four rooms, about twenty people',
    departments: [
      { name: 'Direction', purpose: 'Decides what we make, in what order, and when it is done.', positions: [P('Producer', 'steward', { lead: true }), P('Creative director', 'director'), P('Facilitator', 'facilitator'), P('Skeptic', 'contrarian', { reviewer: true })] },
      { name: 'Concept', purpose: 'Invents the worlds, characters and stories the work is made of.', positions: [P('Head of story', 'storyteller', { lead: true }), P('Worldbuilder', 'storyteller'), P('Writer', 'storyteller'), P('Writer', 'storyteller'), P('Editor', 'editor', { reviewer: true })] },
      { name: 'Visual', purpose: 'Decides how the work looks and checks what the image models do with it.', positions: [P('Image director', 'craftsman', { lead: true }), P('Art director', 'craftsman'), P('Art director', 'craftsman'), P('Trend scout', 'scout'), P('Reviewer', 'contrarian', { reviewer: true })] },
      { name: 'Archive and Tools', purpose: 'Finds and files what we need to know; builds and verifies the files the work runs on.', positions: [P('Head of research', 'archivist', { lead: true }), P('Researcher', 'archivist'), P('Template engineer', 'machinist'), P('Template engineer', 'machinist'), P('Analyst', 'analyst', { reviewer: true })] },
    ],
  },
  large: {
    label: 'A company: six rooms, about thirty people',
    departments: [
      { name: 'Direction', purpose: 'Decides what we make, in what order, and when it is done.', positions: [P('Producer', 'steward', { lead: true }), P('Creative director', 'director'), P('Producer', 'steward'), P('Facilitator', 'facilitator'), P('Skeptic', 'contrarian', { reviewer: true })] },
      { name: 'Story', purpose: 'Invents the worlds, characters and stories the work is made of.', positions: [P('Head of story', 'storyteller', { lead: true }), P('Worldbuilder', 'storyteller'), P('Writer', 'storyteller'), P('Writer', 'storyteller'), P('Writer', 'storyteller'), P('Editor', 'editor', { reviewer: true })] },
      { name: 'Image', purpose: 'Decides how the work looks and checks what the image models do with it.', positions: [P('Image director', 'craftsman', { lead: true }), P('Art director', 'craftsman'), P('Art director', 'craftsman'), P('Art director', 'craftsman'), P('Reviewer', 'contrarian', { reviewer: true })] },
      { name: 'Archive', purpose: 'Finds, checks and files what we need to know.', positions: [P('Head of research', 'archivist', { lead: true }), P('Researcher', 'archivist'), P('Researcher', 'archivist'), P('Trend scout', 'scout'), P('Audience researcher', 'scout'), P('Reviewer', 'contrarian', { reviewer: true })] },
      { name: 'Tools', purpose: 'Builds and verifies the files and pipelines the work runs on.', positions: [P('Lead engineer', 'machinist', { lead: true }), P('Template engineer', 'machinist'), P('Template engineer', 'machinist'), P('Analyst', 'analyst'), P('Reviewer', 'contrarian', { reviewer: true })] },
      { name: 'Quality', purpose: 'Tries to break the work before anyone else does, and keeps the standards.', positions: [P('Quality lead', 'analyst', { lead: true }), P('Skeptic', 'contrarian', { reviewer: true }), P('Skeptic', 'contrarian', { reviewer: true }), P('Editor', 'editor'), P('Mentor', 'facilitator')] },
    ],
  },
};

export const SIZES = Object.freeze(Object.fromEntries(Object.entries(RAW_SIZES).map(([id, layout]) => [id, { ...layout, people: layout.departments.reduce((n, d) => n + d.positions.length, 0) }])));

export const SIZE_IDS = Object.freeze(Object.keys(SIZES));

export const ORG_STYLES = Object.freeze({
  studio: 'Small teams led by a producer and a director, each with makers, a skeptic and an engineer.',
  product: 'A lead, an engineer and a designer per product, with a researcher and a quality voice beside them.',
  functional: 'Departments by function, each with a lead, whatever the product.',
  live: 'A running service: content, art, engineering, quality and a community voice.',
});

/**
 * The layout for a size, copied so it can be edited. `people` (a headcount) trims or extends the plan: it never goes past eight a room.
 * @returns {{ size: string, style: string, departments: { name: string, purpose: string, positions: Position[] }[] }}
 */
export function planOrg({ size = 'desk', style = 'studio' } = {}) {
  const layout = SIZES[size];
  if (!layout) throw new Error(`size must be one of ${SIZE_IDS.join(', ')}`);
  return {
    size, style: ORG_STYLES[style] ? style : 'studio',
    departments: layout.departments.map(d => ({ name: d.name, purpose: d.purpose, positions: d.positions.map(p => ({ ...p })) })),
  };
}

export const headcount = (plan) => plan.departments.reduce((n, d) => n + d.positions.length, 0);

/**
 * What every plan must keep, whoever wrote it. Returns the problems in words (empty when the plan is sound).
 * @param {{ departments: { name: string, positions: Position[] }[] }} plan
 */
export function checkOrg(plan, { maxPerRoom = 8 } = {}) {
  const problems = [];
  if (!plan.departments?.length) problems.push('A company needs at least one department.');
  for (const d of plan.departments || []) {
    const n = d.positions?.length || 0;
    if (n === 0) problems.push(`${d.name} has no positions.`);
    if (n > maxPerRoom) problems.push(`${d.name} has ${n} positions; a room holds at most ${maxPerRoom}.`);
    const leads = (d.positions || []).filter(p => p.lead).length;
    if (n > 0 && leads !== 1) problems.push(`${d.name} needs exactly one lead (it has ${leads}).`);
    if (n >= 3 && !(d.positions || []).some(p => p.reviewer)) problems.push(`${d.name} has ${n} people and nobody whose job is to object.`);
  }
  return problems;
}
