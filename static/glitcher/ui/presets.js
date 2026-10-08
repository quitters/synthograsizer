/**
 * Preset logic for the Glitcher: load a ready-made effect stack, check one against the effect registry, turn a stack into a
 * preset. Plain functions with no DOM access, so the same code runs in the page and in a Node test
 * (static/glitcher/tests/presets.test.mjs).
 *
 * A preset is { name, description, selection?, chain: [{ type: <effect id>, mode, enabled, parameters, selection? }] }.
 * "selection": "all" (on the preset or on one effect) makes the effect cover the whole image; without it, effects only act inside
 * the small wandering regions the automatic selection spawns.
 */
import { PRESET_PACKS } from './preset-data.js';

export { PRESET_PACKS };

export function allPresets(packs = PRESET_PACKS) {
  return packs.flatMap(pack => pack.presets.map(preset => ({ ...preset, pack: pack.id })));
}

/**
 * What is wrong with a preset, as a list of strings (empty means it loads cleanly): an effect id the registry does not know, a
 * parameter the effect does not have, a select value outside its options, a number outside its range, a second copy of an effect
 * (the stack identifies effects by id, so two copies cannot be told apart).
 */
export function presetProblems(preset, factory) {
  const problems = [];
  if (!preset || typeof preset.name !== 'string' || !preset.name) problems.push('no name');
  if (!Array.isArray(preset?.chain) || !preset.chain.length) {
    problems.push('empty chain');
    return problems;
  }
  const seen = new Set();
  for (const cfg of preset.chain) {
    const id = cfg.type || cfg.id;
    const config = factory.effectRegistry.get(id);
    if (!config) { problems.push(`unknown effect "${id}"`); continue; }
    if (seen.has(id)) problems.push(`"${id}" appears twice`);
    seen.add(id);
    if (cfg.mode && !['destructive', 'non-destructive'].includes(cfg.mode)) problems.push(`${id}: bad mode "${cfg.mode}"`);
    for (const [key, value] of Object.entries(cfg.parameters || {})) {
      if (!(key in config.defaultParameters)) { problems.push(`${id}: no parameter "${key}"`); continue; }
      const spec = config.parameterConfig?.[key];
      if (!spec) continue;
      if (spec.type === 'select' && Array.isArray(spec.options)) {
        const options = spec.options.map(o => (o && typeof o === 'object' ? o.value : o));
        if (!options.includes(value)) problems.push(`${id}.${key}: "${value}" is not one of ${options.join(', ')}`);
      } else if (spec.type === 'range') {
        if (typeof value !== 'number' || Number.isNaN(value)) problems.push(`${id}.${key}: ${value} is not a number`);
        else if ((spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max)) problems.push(`${id}.${key}: ${value} is outside ${spec.min} to ${spec.max}`);
      } else if (spec.type === 'checkbox' && typeof value !== 'boolean') {
        problems.push(`${id}.${key}: ${value} is not true or false`);
      }
    }
  }
  return problems;
}

/** Replace the stack with a preset. Returns { loaded, failed } where failed lists the effect ids that could not be built. */
export function applyPreset(preset, chainManager, factory) {
  chainManager.clearChain();
  const failed = [];
  let loaded = 0;
  const wholeImage = preset.selection === 'all';
  for (const cfg of preset.chain || []) {
    const id = cfg.type || cfg.id;
    try {
      const effect = factory.createEffect(id);
      if (cfg.mode) effect.mode = cfg.mode;
      effect.enabled = cfg.enabled !== false;
      Object.assign(effect.parameters, cfg.parameters);
      effect.wholeImage = wholeImage || cfg.selection === 'all' || cfg.wholeImage === true;
      chainManager.addEffect(effect);
      loaded++;
    } catch (error) {
      failed.push(id);
      console.warn(`[presets] could not load "${id}" from "${preset.name}"`, error);
    }
  }
  return { loaded, failed };
}

/** A stack as a preset (what is stored under "Your looks"). Keeps the effect id as `type`, which is what applyPreset reads. */
export function presetFromChain(name, effects, options = {}) {
  const all = effects.length > 0 && effects.every(effect => effect.wholeImage);
  return {
    name,
    description: options.description || '',
    ...(all ? { selection: 'all' } : {}),
    chain: effects.map(effect => ({
      type: effect.id,
      mode: effect.mode,
      enabled: effect.enabled,
      parameters: { ...effect.parameters },
      ...(!all && effect.wholeImage ? { selection: 'all' } : {})
    }))
  };
}
