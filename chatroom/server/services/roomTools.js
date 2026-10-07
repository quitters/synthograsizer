/**
 * Things a room can do beyond talking: score an image with an independent critic, show the room a picture, render what an agent just
 * wrote. This file is the pure part (parsing the tags agents write, picking sample values, building the critic's question,
 * checking pictures people send); the orchestrator does the acting.
 *
 * Why these exist (docs in the atelier, notes/wave2.md):
 *  - A critic inside the conversation drifts toward agreeing with it: a supervisor said MATCH to a frame that a judge alone scored
 *    2 out of 10. A critic that sees only the pictures, and scores 1 to 10 instead of ticking a checklist, does not.
 *  - Crews that could SEE what their code drew fixed a pond made of moire, a stained glass of flat primaries and a chain that was
 *    confetti; the same crews without a picture shipped them. Numbers cannot see taste.
 */

export const MAX_SHOWN_IMAGES = 6;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

// ── pictures people send ─────────────────────────────────────────────────────

/**
 * One picture from a request body: { data: <base64> | dataUrl: "data:image/png;base64,...", mimeType? }.
 * @returns {{ data: string, mimeType: string, label: string } | { error: string }}
 */
export function readShownImage(item) {
  if (!item || typeof item !== 'object') return { error: 'an image must be an object with data or dataUrl' };
  let data = typeof item.data === 'string' ? item.data : null;
  let mimeType = typeof item.mimeType === 'string' ? item.mimeType : null;
  if (typeof item.dataUrl === 'string') {
    const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(item.dataUrl);
    if (!m) return { error: 'dataUrl must be a base64 data: URL' };
    mimeType = mimeType || m[1].toLowerCase();
    data = m[2];
  }
  if (!data) return { error: 'an image needs data (base64) or dataUrl' };
  if (!/^[A-Za-z0-9+/=\s]+$/.test(data.slice(0, 4096))) return { error: 'image data is not base64' };
  if (!IMAGE_TYPES.has(mimeType || 'image/png')) return { error: `unsupported image type ${mimeType}` };
  data = data.replace(/\s+/g, '');
  if (data.length * 0.75 > MAX_IMAGE_BYTES) return { error: `image is larger than ${Math.round(MAX_IMAGE_BYTES / 1048576)} MB` };
  return { data, mimeType: mimeType || 'image/png', label: String(item.label || '').slice(0, 200) };
}

// ── the critic ───────────────────────────────────────────────────────────────

export const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 1, maximum: 10, description: '10 = certainly the same subject in the same kind of picture, 1 = clearly not' },
    differs: { type: 'string', description: 'One line naming what differs, or "nothing".' },
  },
  required: ['score', 'differs'],
};

/**
 * The question the independent critic is asked. It sees the pictures and this, never the conversation.
 * With a reference it scores sameness; without one it scores how well the candidate matches a description.
 */
export function buildCriticPrompt({ hasReference, criteria = '' }) {
  const stance = 'You are an independent critic. You can see the pictures below and nothing else: you have not seen any conversation, you do not know what anyone hopes to hear, and you owe nobody agreement. Be strict and specific; never score high to be agreeable.';
  if (!hasReference) {
    return `${stance}\n\nThe picture is a CANDIDATE. Rate 1 to 10 how well it matches this description (10 = exactly, 1 = not at all):\n${criteria}\n\nName in one line what does not match, or "nothing".`;
  }
  const hold = criteria
    ? `What must hold constant between the two: ${criteria}`
    : 'Judge identity (for a person: face, age, bone structure), rendering medium (photograph versus painting versus illustration), and distinctive costume items and accessories.';
  return `${stance}\n\nThe first picture is the REFERENCE. The second is the CANDIDATE, which is meant to show the same subject as the reference in a new picture.\n${hold}\nIgnore anything that is out of frame, hidden by pose, or changed by lighting or weather.\nRate 1 to 10 how sure you are that the candidate is the same subject in the same kind of picture (10 = certainly, 1 = clearly not). Name in one line what differs, or "nothing".`;
}

/** What the room is told about a score. */
export function describeScore({ score, differs }, { minScore = 6 } = {}) {
  const below = score < minScore;
  const reasons = differs && differs.toLowerCase() !== 'nothing' ? ` ${differs}` : '';
  return `${score}/10.${reasons}${below ? ` That is below the bar of ${minScore}: do not accept this as matching.` : ''}`;
}

// ── tags agents write ────────────────────────────────────────────────────────

/** "a | b=c | d" -> { positional: ['a','d'], named: { b: 'c' } } */
function splitArgs(body) {
  const positional = [];
  const named = {};
  for (const part of String(body).split('|').map(s => s.trim()).filter(Boolean)) {
    const m = /^([a-z_]+)\s*=\s*([\s\S]+)$/i.exec(part);
    if (m) named[m[1].toLowerCase()] = m[2].trim();
    else positional.push(part);
  }
  return { positional, named };
}

/**
 * [CRITIC: <image id> | reference=<image id> | criteria=what must stay the same]
 * [RENDER: <artifact file name> | draws=3]
 * Returns requests in the order written; stripRoomTags removes the tags from the text shown to the room.
 */
export function parseRoomRequests(text) {
  const requests = [];
  for (const m of String(text || '').matchAll(/\[CRITIC:\s*([\s\S]+?)\]/gi)) {
    const { positional, named } = splitArgs(m[1]);
    const imageId = positional[0] || named.image || named.id;
    if (imageId) requests.push({ type: 'critic', fullMatch: m[0], imageId, referenceId: named.reference || named.against || null, criteria: named.criteria || '' });
  }
  for (const m of String(text || '').matchAll(/\[RENDER:\s*([\s\S]+?)\]/gi)) {
    const { positional, named } = splitArgs(m[1]);
    const artifact = positional[0] || named.artifact || named.file;
    if (artifact) requests.push({ type: 'render', fullMatch: m[0], artifact, draws: named.draws ? Number(named.draws) : undefined });
  }
  return requests;
}

export function stripRoomTags(text) {
  return String(text || '').replace(/\[(?:CRITIC|RENDER):\s*[\s\S]+?\]/gi, '').replace(/\n{3,}/g, '\n\n').trim();
}

// ── sample values for a render ───────────────────────────────────────────────

const valueText = (v) => (v && typeof v === 'object' ? v.text : v);
const valueWeight = (v) => (v && typeof v === 'object' && Number.isFinite(v.weight) && v.weight > 0 ? v.weight : 1);

/** One value per variable, drawn by weight: { name: 'text' }. */
export function drawValues(variables, rng = Math.random) {
  const out = {};
  for (const variable of variables || []) {
    const values = (variable.values || []).filter(v => valueText(v) !== undefined);
    if (!values.length) continue;
    const total = values.reduce((n, v) => n + valueWeight(v), 0);
    let r = rng() * total;
    let pick = values[values.length - 1];
    for (const v of values) { r -= valueWeight(v); if (r <= 0) { pick = v; break; } }
    out[variable.name] = String(valueText(pick));
  }
  return out;
}

/** Fill {{placeholders}} in a prompt template. */
export function fillTemplate(promptTemplate, values) {
  return String(promptTemplate || '').replace(/\{\{\s*([\w-]+)\s*\}\}/g, (m, name) => (name in values ? values[name] : m));
}

/**
 * What a render needs to know about an artifact: engine (an image prompt), instrument (p5 sketch in a template), page (html or js),
 * or nothing renderable.
 * @returns {{ kind: 'prompt-template'|'p5-template'|'page', template?: object } | { error: string }}
 */
export function classifyArtifact(artifact) {
  const name = artifact.filename || '';
  const text = String(artifact.content || '');
  if (/\.json$/i.test(name)) {
    let t;
    try { t = JSON.parse(text); } catch (e) { return { error: `${name} is not valid JSON (${e.message.slice(0, 60)})` }; }
    if (t && typeof t === 'object' && typeof t.p5Code === 'string' && t.p5Code.trim()) return { kind: 'p5-template', template: t };
    if (t && typeof t === 'object' && typeof t.promptTemplate === 'string' && Array.isArray(t.variables)) return { kind: 'prompt-template', template: t };
    return { error: `${name} is JSON but not a template (it needs promptTemplate and variables, and p5Code for an instrument)` };
  }
  if (/\.(html?|js|svg)$/i.test(name)) return { kind: 'page' };
  return { error: `${name} is not something that can be rendered (use .json for a template, .html or .js for a page)` };
}
