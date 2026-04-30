/**
 * Story Engine — Generates sequential prompts from a story-augmented template.
 *
 * Supports TWO story shapes:
 *
 * 1. **Bespoke beats** (new) — each beat has its own `prompt` with {{anchor}}
 *    and {{character_id}} placeholders.  story.beats[] is an array of objects.
 *    story.acts[].beats is an array of beat-ID integers.
 *
 * 2. **Legacy acts-with-counts** — story.acts[].beats is an integer count,
 *    and a single promptTemplate + variables produce all prompts.
 *
 * The engine auto-detects the shape and dispatches to the correct path.
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

    // Detect bespoke-beat shape
    const beatsArray = this.story.beats;
    this.isBespoke = Array.isArray(beatsArray) && beatsArray.length > 0
                     && typeof beatsArray[0] === 'object' && 'prompt' in beatsArray[0];

    // Precompute total beats
    this.totalBeats = this._computeTotalBeats();
  }

  // ─── Public API ───────────────────────────────────────────────

  /**
   * Generate all prompts for the full story sequence.
   * @param {Object} [options]
   * @param {string} [options.characterId] - Which character to feature (legacy path)
   * @param {Function} [options.getWeightedRandomIndex] - Weighted random picker from app
   * @param {Object} [options.knobValues] - Pre-resolved knob-twist variable values (bespoke path)
   * @returns {Array<{beat: number, act: string, text: string, variables: Object, shot?: string, purpose?: string, characters?: string[]}>}
   */
  generateSequence(options = {}) {
    if (this.isBespoke) {
      return this._generateBespokeSequence(options);
    }
    return this._generateLegacySequence(options);
  }

  /**
   * Get a summary of the story structure for display.
   * @returns {Object}
   */
  getSummary() {
    const summary = {
      title: this.story.title || 'Untitled Story',
      logline: this.story.logline || '',
      totalBeats: this.totalBeats,
      duration_seconds: this.story.duration_seconds || null,
      beat_duration_seconds: this.story.beat_duration_seconds || null,
      anchors: this.story.anchors || {},
      acts: [],
      characters: (this.story.characters || []).map(c => ({
        id: c.id,
        name: c.name,
        anchors: c.anchors
      })),
      progressions: (this.story.progressions || []).map(p => ({
        variable: p.variable,
        steps: p.arc ? p.arc.length : 0
      })),
      isBespoke: this.isBespoke
    };

    if (this.isBespoke) {
      summary.acts = (this.story.acts || []).map(a => ({
        name: a.name || 'Unnamed Act',
        beatIds: a.beats || [],
        beats: Array.isArray(a.beats) ? a.beats.length : 0
      }));
    } else {
      summary.acts = (this.story.acts || []).map(a => ({
        name: a.name || 'Unnamed Act',
        beats: a.beats || 1,
        locks: Object.keys(a.locks || {}),
        biases: Object.keys(a.biases || {})
      }));
    }

    return summary;
  }

  /**
   * Validate the story block against the template's variables.
   * @returns {{ valid: boolean, warnings: string[] }}
   */
  validate() {
    const warnings = [];

    if (this.isBespoke) {
      // Bespoke validation
      const beats = this.story.beats || [];
      if (beats.length === 0) {
        return { valid: false, warnings: ['Story has no beats defined'] };
      }
      const acts = this.story.acts || [];
      if (acts.length === 0) {
        warnings.push('Story has no acts defined — beats will display ungrouped');
      }
      // Check for missing anchors
      if (!this.story.anchors || !this.story.anchors.style) {
        warnings.push('Story has no "style" anchor defined');
      }
      if (!this.story.anchors || !this.story.anchors.world) {
        warnings.push('Story has no "world" anchor defined');
      }
      return { valid: true, warnings };
    }

    // Legacy validation
    const varNames = new Set(this.variables.map(v => v.name));

    if (!this.story.acts || this.story.acts.length === 0) {
      return { valid: false, warnings: ['Story has no acts defined'] };
    }

    for (const act of this.story.acts) {
      if (!act.beats || act.beats < 1) {
        warnings.push(`Act "${act.name}" has no beats`);
      }
      for (const varName of Object.keys(act.locks || {})) {
        if (!varNames.has(varName) && varName !== 'character') {
          warnings.push(`Act "${act.name}" locks unknown variable "${varName}"`);
        }
      }
      for (const varName of Object.keys(act.biases || {})) {
        if (!varNames.has(varName)) {
          warnings.push(`Act "${act.name}" biases unknown variable "${varName}"`);
        }
      }
    }

    for (const prog of (this.story.progressions || [])) {
      if (!varNames.has(prog.variable)) {
        warnings.push(`Progression references unknown variable "${prog.variable}"`);
      }
      if (!prog.arc || prog.arc.length < 2) {
        warnings.push(`Progression for "${prog.variable}" needs at least 2 arc steps`);
      }
    }

    if (this.promptTemplate.includes('{{character}}') && (!this.story.characters || this.story.characters.length === 0)) {
      warnings.push('Template uses {{character}} but no characters are defined');
    }

    return { valid: true, warnings };
  }

  // ─── Bespoke-Beat Path ────────────────────────────────────────

  /**
   * Generate the full sequence from bespoke beats.
   * Each beat has its own prose prompt; we expand {{anchor}} and {{character_id}} placeholders.
   */
  _generateBespokeSequence(options = {}) {
    const { knobValues } = options;
    const beats = this.story.beats || [];
    const acts = this.story.acts || [];

    // Build a beatId → act mapping
    const beatActMap = {};
    for (const act of acts) {
      const ids = act.beats || [];
      for (const id of ids) {
        beatActMap[id] = act.name || 'Unnamed Act';
      }
    }

    // Resolve knob-twist variables once (if any)
    const resolvedKnobs = knobValues || this._resolveKnobValues(options);

    const entries = [];
    for (const beat of beats) {
      const expandedPrompt = this._expandBeatPrompt(beat, resolvedKnobs);
      entries.push({
        beat: beat.id,
        act: beatActMap[beat.id] || 'Unassigned',
        text: expandedPrompt,
        variables: { ...resolvedKnobs },
        shot: beat.shot || '',
        purpose: beat.purpose || '',
        characters: beat.characters || [],
        rawPrompt: beat.prompt || ''
      });
    }

    return entries;
  }

  /**
   * Expand a single beat's prompt by substituting anchors, characters, and knob values.
   * Substitution priority:
   *   1. {{anchor_key}} → story.anchors[key]
   *   2. {{character_id}} → characterMap[id].anchors
   *   3. {{variable_name}} → knobValues[name]
   */
  _expandBeatPrompt(beat, knobValues = {}) {
    let text = beat.prompt || '';
    const anchors = this.story.anchors || {};

    // 1. Anchor substitution
    for (const [key, value] of Object.entries(anchors)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      text = text.replace(regex, value);
    }

    // 2. Character substitution
    for (const [id, char] of Object.entries(this._characterMap)) {
      const regex = new RegExp(`\\{\\{${id}\\}\\}`, 'g');
      text = text.replace(regex, char.anchors || char.name || id);
    }

    // 3. Knob-twist variable substitution
    for (const [name, value] of Object.entries(knobValues)) {
      const regex = new RegExp(`\\{\\{${name}\\}\\}`, 'g');
      text = text.replace(regex, value);
    }

    return text;
  }

  /**
   * Resolve knob-twist variable values (the optional cross-beat tuning layer).
   * Uses weighted random from the variables array.
   */
  _resolveKnobValues(options = {}) {
    const { getWeightedRandomIndex } = options;
    const weightedRandom = getWeightedRandomIndex || this._defaultWeightedRandom;
    const values = {};

    for (const variable of this.variables) {
      // Skip the synthetic __beat__ placeholder variable
      if (variable.name === '__beat__') continue;

      const weights = getWeightsArray(variable);
      const idx = weightedRandom(weights);
      values[variable.name] = getValueText(variable.values[idx]);
    }

    return values;
  }

  // ─── Legacy Path ──────────────────────────────────────────────

  /**
   * Generate sequence using the legacy acts-with-counts shape.
   * This is the original StoryEngine logic, preserved for backward compat.
   */
  _generateLegacySequence(options = {}) {
    const { characterId, getWeightedRandomIndex } = options;
    const weightedRandom = getWeightedRandomIndex || this._defaultWeightedRandom;

    const acts = this.story.acts || [];
    const entries = [];
    let globalBeatIndex = 0;
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

        for (const [key, val] of Object.entries(values)) {
          previousValues[key] = val;
        }

        globalBeatIndex++;
      }
    }

    return entries;
  }

  // ─── Internal ─────────────────────────────────────────────────

  _computeTotalBeats() {
    if (this.isBespoke) {
      return (this.story.beats || []).length;
    }
    return (this.story.acts || []).reduce((sum, act) => sum + (act.beats || 1), 0);
  }

  /**
   * Resolve the value for every variable at a given beat (legacy path).
   * Priority: locks > progressions > biases > weighted random from full values
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
   * Resolve character anchor text (legacy path).
   */
  _resolveCharacter(characterId, act) {
    if (act.locks && 'character' in act.locks) {
      const lockId = act.locks['character'];
      if (this._characterMap[lockId]) {
        return this._characterMap[lockId].anchors;
      }
      return lockId;
    }

    if (characterId && this._characterMap[characterId]) {
      return this._characterMap[characterId].anchors;
    }

    const chars = this.story.characters || [];
    if (chars.length > 0) {
      return chars[0].anchors;
    }

    return 'a figure';
  }

  /**
   * Pick a value along a progression arc based on 0-1 progress.
   */
  _interpolateProgression(variableName, progress) {
    const arc = this._progressionMap[variableName];
    if (!arc || arc.length === 0) return '';
    if (arc.length === 1) return arc[0];

    const floatIndex = progress * (arc.length - 1);
    const index = Math.round(floatIndex);
    return arc[Math.min(index, arc.length - 1)];
  }

  /**
   * Expand the prompt template by substituting all {{variable}} placeholders (legacy path).
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
 * Returns true for BOTH bespoke-beat and legacy act-count shapes.
 * @param {Object} template
 * @returns {boolean}
 */
export function isStoryTemplate(template) {
  if (!template || !template.story) return false;
  const story = template.story;
  // Bespoke: story.beats[] is an array of objects with 'prompt'
  const hasBespokeBeats = Array.isArray(story.beats) && story.beats.length > 0
                          && typeof story.beats[0] === 'object' && 'prompt' in story.beats[0];
  // Legacy: story.acts[] with numeric beats counts
  const hasLegacyActs = Array.isArray(story.acts) && story.acts.length > 0
                        && typeof story.acts[0]?.beats === 'number';
  return hasBespokeBeats || hasLegacyActs;
}

/**
 * Check if a story template uses the bespoke-beat shape.
 * @param {Object} template
 * @returns {boolean}
 */
export function isBespokeStoryTemplate(template) {
  if (!template || !template.story) return false;
  const beats = template.story.beats;
  return Array.isArray(beats) && beats.length > 0
         && typeof beats[0] === 'object' && 'prompt' in beats[0];
}

/**
 * Normalize a story template — ensures the story block has valid defaults.
 * Handles both bespoke-beat and legacy shapes.
 * @param {Object} template
 * @returns {Object} The template with a normalized story block
 */
export function normalizeStoryBlock(template) {
  if (!template || !template.story) return template;

  const story = template.story;

  // Ensure title
  if (!story.title) story.title = 'Untitled Story';

  // Ensure anchors (bespoke shape)
  if (!story.anchors) story.anchors = {};

  // Ensure beats array (bespoke shape)
  if (!Array.isArray(story.beats)) story.beats = [];

  // Ensure acts have defaults
  if (Array.isArray(story.acts)) {
    story.acts = story.acts.map((act, i) => {
      const base = {
        name: act.name || `Act ${i + 1}`,
        ...act
      };
      // Legacy shape: ensure beats count has defaults
      if (typeof act.beats === 'number') {
        base.beats = act.beats || 1;
        base.locks = act.locks || {};
        base.biases = act.biases || {};
      }
      return base;
    });
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
