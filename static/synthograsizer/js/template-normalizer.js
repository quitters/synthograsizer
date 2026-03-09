/**
 * Template Normalizer — converts old parallel-array schema to nested value-weight objects.
 *
 * Old format (parallel arrays):
 *   { values: ["a", "b"], weights: [3, 2] }
 *
 * New format (nested objects):
 *   { values: [{ text: "a", weight: 3 }, { text: "b", weight: 2 }] }
 *
 * If weight is omitted on a value object, runtime defaults to 1.
 * This normalizer is safe to call on already-normalized templates (no-op).
 */

/**
 * Normalize a full template object in-place and return it.
 * @param {Object} template - Template with promptTemplate and variables[]
 * @returns {Object} The normalized template
 */
export function normalizeTemplate(template) {
  if (!template || !Array.isArray(template.variables)) {
    return template;
  }

  template.variables = template.variables.map(normalizeVariable);
  return template;
}

/**
 * Normalize a single variable's values from flat arrays to nested objects.
 * @param {Object} variable - A variable object
 * @returns {Object} The normalized variable (same reference, mutated)
 */
export function normalizeVariable(variable) {
  if (!variable || !Array.isArray(variable.values) || variable.values.length === 0) {
    return variable;
  }

  const firstVal = variable.values[0];

  // Already in new nested format
  if (typeof firstVal === 'object' && firstVal !== null && 'text' in firstVal) {
    // Clean up any leftover parallel weights array
    delete variable.weights;
    return variable;
  }

  // Old flat-array format — convert
  if (typeof firstVal === 'string') {
    const weights = variable.weights || [];
    variable.values = variable.values.map((val, i) => {
      const entry = { text: val };
      if (weights.length > i && weights[i] !== undefined) {
        entry.weight = weights[i];
      }
      return entry;
    });
    // Remove the now-redundant parallel weights array
    delete variable.weights;
  }

  return variable;
}

/**
 * Extract the text string from a value entry (handles both old and new formats).
 * @param {string|Object} value - Either a plain string or { text, weight }
 * @returns {string}
 */
export function getValueText(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'text' in value) return value.text;
  return String(value);
}

/**
 * Extract the weight from a value entry (defaults to 1 if not specified).
 * @param {string|Object} value - Either a plain string or { text, weight }
 * @returns {number}
 */
export function getValueWeight(value) {
  if (typeof value === 'object' && value !== null && 'weight' in value) return value.weight;
  return 1; // Default weight
}

/**
 * Get an array of all weight values from a variable's values array.
 * Works with both old and new formats.
 * @param {Object} variable - A variable with values[]
 * @returns {number[]}
 */
export function getWeightsArray(variable) {
  if (!variable || !Array.isArray(variable.values)) return [];
  return variable.values.map(getValueWeight);
}

// ═══════════════════════════════════════════════════════════════
// Tags & Provenance Utilities
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a unique tag ID with the given prefix.
 * @param {string} prefix - 'tag' or 'rmx'
 * @returns {string} e.g. "tag_3f8a21cb" or "rmx_c7e9b4a2"
 */
export function generateTagId(prefix = 'tag') {
  const chars = '0123456789abcdef';
  let id = prefix + '_';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * 16)];
  }
  return id;
}

/**
 * Compute a deterministic fingerprint of a template for lineage tracking.
 * Based on promptTemplate + variable names and values (ignoring weights).
 * Returns an 8-character hex string.
 * @param {Object} template
 * @returns {string} e.g. "3f8a21cb"
 */
export function computeTemplateFingerprint(template) {
  const payload = JSON.stringify({
    promptTemplate: template.promptTemplate || '',
    variables: (template.variables || []).map(v => ({
      name: v.name,
      values: (v.values || []).map(val => getValueText(val))
    }))
  });
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const chr = payload.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
