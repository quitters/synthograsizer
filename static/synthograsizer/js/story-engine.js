/**
 * Story Engine — Generates sequential prompts from a story-augmented template.
 *
 * A story template extends a regular Synthograsizer template with:
 *   - characters: named entities with fixed visual "anchor" descriptions
 *   - acts: sequence structure with beat counts, locks, and biases
 *   - progressions: variables that evolve across the full sequence
 *
 * The engine walks the act/beat structure and produces one prompt per beat,
 * respecting locks (forced values), biases (weighted subsets), progressions
 * (interpolated arcs), and character anchors.
 *
 * Schema:
 * {
 *   "promptTemplate": "A {{shot_type}} of {{character}} in {{environment}}...",
 *   "variables": [ ...standard Synthograsizer variables... ],
 *   "story": {
 *     "title": "The Knight's Tournament",
 *     "acts": [
 *       {
 *         "name": "Act 1 - Arrival",
 *         "beats": 4,
 *         "locks": { "lighting": "golden hour dawn" },
 *         "biases": { "environment": ["castle gates", "tournament grounds"] }
 *       }
 *     ],
 *     "characters": [
 *       { "id": "protagonist", "name": "The Green Knight",
 *         "anchors": "young knight in emerald armor, dark skin, determined eyes" }
 *     ],
 *     "progressions": [
 *       { "variable": "lighting", "arc": ["golden dawn", "harsh midday", "golden sunset"] }
 *     ]
 *   }
 * }
 */

import { getValueText, getWeightsArray } from './template-normalizer.js';

export class StoryEngine {
  /**
   * @param {Object} template - A full story template (promptTemplate + variables + story)
   */
  constructor(template) {
    this.template = template;
    this.story = template.story || {};
    this.variables = template.variables || [];
    this.promptTemplate = template.promptTemplate || '';

    // Precompute total beats
    this.totalBeats = this._computeTotalBeats();

    // Build lookup maps
    this._variableMap = {};
    for (const v of this.variables) {
      this._variableMap[v.name] = v;
    }

    this._characterMap = {};
    for (const c of (this.story.characters || [])) {
      this._characterMap[c.id] = c;
    }

    this._progressionMap = {};
    for (const p of (this.story.progressions || [])) {
      this._progressionMap[p.variable] = p.arc;
    }
  }

  // ─── Public API ───────────────────────────────────────────────

  /**
   * Generate all prompts for the full story sequence.
   * @param {Object} [options]
   * @param {string} [options.characterId] - Which character to feature (if template has {{character}})
   * @param {Function} [options.getWeightedRandomIndex] - Weighted random picker from app
   * @returns {Array<{beat: number, act: string, text: string, variables: Object}>}
   */
  generateSequence(options = {}) {
    const { characterId, getWeightedRandomIndex } = options;
    const weightedRandom = getWeightedRandomIndex || this._defaultWeightedRandom;

    const acts = this.story.acts || [];
    const entries = [];
    let globalBeatIndex = 0;

    // Track the previous beat's values per variable for no-repeat logic
    const previousValues = {};

    for (const act of acts) {
      const beatCount = act.beats || 1;

      for (let localBeat = 0; localBeat < beatCount; localBeat++) {
        const progress = this.totalBeats > 1
          ? globalBeatIndex / (this.totalBeats - 1)
          : 0;

        const values = this._resolveValues(act, progress, characterId, weightedRandom, previousValues);
        const text = this._expandTemplate(values);

        entries.push({
          beat: globalBeatIndex + 1,
          act: act.name || `Act ${acts.indexOf(act) + 1}`,
          text,
          variables: { ...values }
        });

        // Update previous values for next beat's no-repeat check
        for (const [key, val] of Object.entries(values)) {
          previousValues[key] = val;
        }

        globalBeatIndex++;
      }
    }

    return entries;
  }

  /**
   * Get a summary of the story structure for display.
   * @returns {Object} { title, totalBeats, acts: [{name, beats}], characters: [{id, name}] }
   */
  getSummary() {
    return {
      title: this.story.title || 'Untitled Story',
      totalBeats: this.totalBeats,
      acts: (this.story.acts || []).map(a => ({
        name: a.name || 'Unnamed Act',
        beats: a.beats || 1,
        locks: Object.keys(a.locks || {}),
        biases: Object.keys(a.biases || {})
      })),
      characters: (this.story.characters || []).map(c => ({
        id: c.id,
        name: c.name
      })),
      progressions: (this.story.progressions || []).map(p => ({
        variable: p.variable,
        steps: p.arc ? p.arc.length : 0
      }))
    };
  }

  /**
   * Validate the story block against the template's variables.
   * @returns {{ valid: boolean, warnings: string[] }}
   */
  validate() {
    const warnings = [];
    const varNames = new Set(this.variables.map(v => v.name));

    // Check acts
    if (!this.story.acts || this.story.acts.length === 0) {
      return { valid: false, warnings: ['Story has no acts defined'] };
    }

    for (const act of this.story.acts) {
      if (!act.beats || act.beats < 1) {
        warnings.push(`Act "${act.name}" has no beats`);
      }

      // Check locks reference real variables
      for (const varName of Object.keys(act.locks || {})) {
        if (!varNames.has(varName) && varName !== 'character') {
          warnings.push(`Act "${act.name}" locks unknown variable "${varName}"`);
        }
      }

      // Check biases reference real variables
      for (const varName of Object.keys(act.biases || {})) {
        if (!varNames.has(varName)) {
          warnings.push(`Act "${act.name}" biases unknown variable "${varName}"`);
        }
      }
    }

    // Check progressions reference real variables
    for (const prog of (this.story.progressions || [])) {
      if (!varNames.has(prog.variable)) {
        warnings.push(`Progression references unknown variable "${prog.variable}"`);
      }
      if (!prog.arc || prog.arc.length < 2) {
        warnings.push(`Progression for "${prog.variable}" needs at least 2 arc steps`);
      }
    }

    // Check character placeholders
    if (this.promptTemplate.includes('{{character}}') && (!this.story.characters || this.story.characters.length === 0)) {
      warnings.push('Template uses {{character}} but no characters are defined');
    }

    return { valid: true, warnings };
  }

  // ─── Internal ─────────────────────────────────────────────────

  _computeTotalBeats() {
    return (this.story.acts || []).reduce((sum, act) => sum + (act.beats || 1), 0);
  }

  /**
   * Resolve the value for every variable at a given beat.
   * Priority: locks > progressions > biases > weighted random from full values
   *
   * No-repeat heuristic: for biased and random selections, avoids picking the
   * same value as the previous beat (re-rolls up to 3 times). Only applies when
   * the pool has more than 1 option to pick from. Locked values and progressions
   * are exempt — they're deterministic by design.
   *
   * @param {Object} act - Current act definition
   * @param {number} progress - Global progress 0→1
   * @param {string|null} characterId - Selected character ID
   * @param {Function} weightedRandom - Weighted random index picker
   * @param {Object} previousValues - Map of variable_name → value from the previous beat
   */
  _resolveValues(act, progress, characterId, weightedRandom, previousValues = {}) {
    const values = {};
    const MAX_REROLLS = 3;

    for (const variable of this.variables) {
      const name = variable.name;
      const prevValue = previousValues[name];

      // 1. Character injection
      if (name === 'character') {
        values[name] = this._resolveCharacter(characterId, act);
        continue;
      }

      // 2. Act lock — forced to a specific value (no-repeat exempt)
      if (act.locks && name in act.locks) {
        values[name] = act.locks[name];
        continue;
      }

      // 3. Progression — interpolate along the arc (no-repeat exempt)
      if (name in this._progressionMap) {
        values[name] = this._interpolateProgression(name, progress);
        continue;
      }

      // 4. Act bias — pick from a subset of values (with no-repeat)
      if (act.biases && name in act.biases) {
        const biasedValues = act.biases[name];
        if (Array.isArray(biasedValues) && biasedValues.length > 0) {
          let picked = biasedValues[Math.floor(Math.random() * biasedValues.length)];

          // No-repeat: re-roll if same as previous, but only if pool > 1
          if (biasedValues.length > 1 && prevValue !== undefined) {
            let attempts = 0;
            while (picked === prevValue && attempts < MAX_REROLLS) {
              picked = biasedValues[Math.floor(Math.random() * biasedValues.length)];
              attempts++;
            }
          }

          values[name] = picked;
          continue;
        }
      }

      // 5. Default — weighted random from full variable values (with no-repeat)
      const weights = getWeightsArray(variable);
      let idx = weightedRandom(weights);
      let picked = getValueText(variable.values[idx]);

      // No-repeat: re-roll if same as previous, but only if pool > 1
      if (variable.values.length > 1 && prevValue !== undefined) {
        let attempts = 0;
        while (picked === prevValue && attempts < MAX_REROLLS) {
          idx = weightedRandom(weights);
          picked = getValueText(variable.values[idx]);
          attempts++;
        }
      }

      values[name] = picked;
    }

    return values;
  }

  /**
   * Resolve character anchor text.
   */
  _resolveCharacter(characterId, act) {
    // Act lock can force a specific character
    if (act.locks && 'character' in act.locks) {
      const lockId = act.locks['character'];
      if (this._characterMap[lockId]) {
        return this._characterMap[lockId].anchors;
      }
      return lockId; // Treat as raw text if not an ID
    }

    // Use specified character
    if (characterId && this._characterMap[characterId]) {
      return this._characterMap[characterId].anchors;
    }

    // Default to first character
    const chars = this.story.characters || [];
    if (chars.length > 0) {
      return chars[0].anchors;
    }

    return 'a figure';
  }

  /**
   * Pick a value along a progression arc based on 0-1 progress.
   * Maps progress to the closest arc step.
   */
  _interpolateProgression(variableName, progress) {
    const arc = this._progressionMap[variableName];
    if (!arc || arc.length === 0) return '';
    if (arc.length === 1) return arc[0];

    // Map [0, 1] progress to arc index
    const floatIndex = progress * (arc.length - 1);
    const index = Math.round(floatIndex);
    return arc[Math.min(index, arc.length - 1)];
  }

  /**
   * Expand the prompt template by substituting all {{variable}} placeholders.
   */
  _expandTemplate(values) {
    let text = this.promptTemplate;
    for (const [name, value] of Object.entries(values)) {
      const regex = new RegExp(`\\{\\{${name}\\}\\}`, 'g');
      text = text.replace(regex, value);
    }
    return text;
  }

  /**
   * Fallback weighted random if no external one is provided.
   */
  _defaultWeightedRandom(weights) {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }
}

/**
 * Check if a template has a story block.
 * @param {Object} template
 * @returns {boolean}
 */
export function isStoryTemplate(template) {
  return !!(template && template.story && template.story.acts && template.story.acts.length > 0);
}

/**
 * Normalize a story template — ensures the story block has valid defaults.
 * Does NOT modify the base template (promptTemplate + variables) — use normalizeTemplate for that.
 * @param {Object} template
 * @returns {Object} The template with a normalized story block
 */
export function normalizeStoryBlock(template) {
  if (!template || !template.story) return template;

  const story = template.story;

  // Ensure title
  if (!story.title) story.title = 'Untitled Story';

  // Ensure acts have defaults
  if (Array.isArray(story.acts)) {
    story.acts = story.acts.map((act, i) => ({
      name: act.name || `Act ${i + 1}`,
      beats: act.beats || 1,
      locks: act.locks || {},
      biases: act.biases || {},
      ...act
    }));
  } else {
    story.acts = [];
  }

  // Ensure characters have defaults
  if (Array.isArray(story.characters)) {
    story.characters = story.characters.map(c => ({
      id: c.id || c.name?.toLowerCase().replace(/\s+/g, '_') || 'character_1',
      name: c.name || 'Unnamed Character',
      anchors: c.anchors || '',
      ...c
    }));
  } else {
    story.characters = [];
  }

  // Ensure progressions have defaults
  if (!Array.isArray(story.progressions)) {
    story.progressions = [];
  }

  return template;
}
