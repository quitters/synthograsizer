/**
 * Agent Profile → the bio an agent is given.
 *
 * Pure: no DOM, no storage, no globals. The Composer's page module (agent-profiles.js), scripts, and the chat room's server (a company's
 * roster renders a person's sheet when it admits them to a room) all use this one function, so a profile reads the same everywhere. It used
 * to live inside the page module, which touches `window` and `localStorage` when it loads; scripts had to stub both to borrow it.
 *
 * A profile (the canonical v5 shape, see agent-profiles.js):
 *   bioTemplate  text with {{placeholders}}
 *   anchors      { name: 'text' }  fixed substitutions
 *   variables    [{ name, valueIdx, values: [{ text, weight }] }]  one value is picked for each
 *
 * How a variable's value is chosen, first match wins:
 *   1. the session's override for this agent       sessionConfig.agents[].overrides[name]   (a text)
 *   2. a knob the person has set in the UI         uiVariableStates[name].index             (a position)
 *   3. the profile's own valueIdx                  (set by the editor's knobs; this is what a stored profile uses)
 *   4. a weighted random pick that avoids repeating the previous pick (up to 3 re-rolls), using `pickMemory`
 * Anchors are filled first (extra anchors, then the session's shared ones, then the profile's own: the most specific wins); any
 * placeholder still unfilled afterwards is dropped so it never reaches a model.
 */
import { normalizeVariable } from './template-normalizer.js';

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const placeholder = (name) => new RegExp(`{{\\s*${escapeRegExp(name)}\\s*}}`, 'gi');

/**
 * @param {object} profile
 * @param {object} [options]
 * @param {object} [options.sessionConfig]     { sharedAnchors?, agents?: [{ profileId, overrides }] }
 * @param {object} [options.uiVariableStates]  { [variable]: { index?, weights? } }
 * @param {{ anchors?: object, variables?: object[] }} [options.extra]  a fallback pool (the Composer passes the active taste profile); the profile's own anchors and variables shadow it
 * @param {object} [options.pickMemory]        { [variable]: lastChosenText }, updated in place by random picks
 * @param {() => number} [options.random]      a number in [0, 1); Math.random by default (pass a seeded one to get a repeatable bio)
 * @returns {string}
 */
export function renderBio(profile, { sessionConfig = {}, uiVariableStates = {}, extra = {}, pickMemory = {}, random = Math.random } = {}) {
  if (!profile || !profile.bioTemplate) return profile?.bio || '';

  let bio = profile.bioTemplate;

  // 1. Anchors
  const anchors = { ...(extra.anchors || {}), ...(sessionConfig.sharedAnchors || {}), ...(profile.anchors || {}) };
  for (const [key, value] of Object.entries(anchors)) bio = bio.replace(placeholder(key), () => String(value));

  // 2. Variables (the extra pool fills in names the profile does not have)
  const own = profile.variables || [];
  const ownNames = new Set(own.map(v => v?.name).filter(Boolean));
  const allVars = [...own, ...(extra.variables || []).filter(v => !ownNames.has(v.name))];

  for (const rawVar of allVars) {
    const variable = normalizeVariable(JSON.parse(JSON.stringify(rawVar)));
    const name = variable.name;
    let chosen = '';

    const override = sessionConfig.agents?.find(a => a.profileId === profile.id)?.overrides?.[name];
    if (override) {
      chosen = override;
    } else if (variable.values && variable.values.length > 0) {
      const knob = uiVariableStates[name];
      const values = variable.values;
      if (knob && typeof knob.index === 'number' && values[knob.index]) {
        chosen = values[knob.index].text;
      } else if (typeof rawVar.valueIdx === 'number' && values[rawVar.valueIdx]) {
        chosen = values[rawVar.valueIdx].text;
      } else {
        let total = 0;
        const weighted = values.map((v, i) => {
          const weight = knob?.weights?.[i] !== undefined ? knob.weights[i] : (v.weight ?? 1);
          total += weight;
          return { text: v.text, weight };
        });
        const MAX_REROLLS = 3;
        const previous = pickMemory[name];
        for (let attempt = 0; attempt <= MAX_REROLLS; attempt++) {
          if (total > 0) {
            let r = random() * total;
            for (const v of weighted) {
              r -= v.weight;
              if (r <= 0) { chosen = v.text; break; }
            }
          } else {
            chosen = values[Math.floor(random() * values.length)].text;
          }
          if (chosen !== previous || values.length <= 1 || attempt === MAX_REROLLS) break;
        }
        pickMemory[name] = chosen;
      }
    }
    bio = bio.replace(placeholder(name), () => String(chosen));
  }

  // 3. Whatever is still unfilled never reaches the model
  return bio.replace(/{{[^}]+}}/g, '').trim();
}
