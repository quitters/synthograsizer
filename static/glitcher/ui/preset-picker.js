/**
 * Preset picker for the Glitcher workspace: the "Looks" button in the effect-stack header opens a dialog with ready-made stacks in
 * packs (plus the person's own saved looks); choosing one replaces the stack. The logic lives in presets.js; this file is the DOM.
 */
import { PRESET_PACKS, applyPreset } from './presets.js';
import { PresetManager } from './effect-studio/preset-manager.js';

const YOURS = 'yours';

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

/**
 * @param {object} options
 * @param {() => object} options.getApp          the glitcher app (effectChainManager, effectFactory)
 * @param {(summary: {preset, loaded, failed}) => void} options.onLoaded  called after a preset replaced the stack
 * @param {(message: string) => void} options.announce
 */
export function initPresetPicker({ getApp, onLoaded, announce }) {
  const dialog = document.getElementById('workspace-presets-dialog');
  const openBtn = document.getElementById('v2-presets-btn');
  if (!dialog || !openBtn) return null;

  const tabs = dialog.querySelector('.preset-tabs');
  const blurb = dialog.querySelector('.preset-blurb');
  const list = dialog.querySelector('.preset-list');
  const nameInput = dialog.querySelector('#preset-save-name');
  const saveBtn = dialog.querySelector('#preset-save-btn');
  const saveNote = dialog.querySelector('.preset-save-note');
  const manager = new PresetManager();
  let activeTab = PRESET_PACKS[1]?.id || PRESET_PACKS[0].id;

  const effectName = id => getApp()?.effectFactory?.effectRegistry?.get(id)?.name || id;

  function packs() {
    const mine = manager.getUserPresets();
    return [
      ...PRESET_PACKS.map(pack => ({ ...pack, own: false })),
      { id: YOURS, name: 'Yours', own: true, presets: mine, blurb: mine.length
        ? 'Stacks you saved in this browser. They stay here until you delete them.'
        : 'Nothing saved yet. Build a stack, name it below and it will wait here.' }
    ];
  }

  function load(preset) {
    const app = getApp();
    if (!app?.effectChainManager || !app?.effectFactory) return;
    const result = applyPreset(preset, app.effectChainManager, app.effectFactory);
    dialog.close();
    onLoaded({ preset, ...result });
    announce(result.failed.length
      ? `Loaded “${preset.name}” without ${result.failed.length} effect${result.failed.length === 1 ? '' : 's'} this version does not have.`
      : `Loaded “${preset.name}”: ${result.loaded} effect${result.loaded === 1 ? '' : 's'}. Select a card to adjust it.`);
  }

  function render() {
    const all = packs();
    if (!all.some(p => p.id === activeTab)) activeTab = all[0].id;
    tabs.replaceChildren(...all.map(pack => {
      const button = el('button', { type: 'button', role: 'tab', 'data-pack': pack.id, 'aria-selected': String(pack.id === activeTab), text: pack.own ? `${pack.name} (${pack.presets.length})` : pack.name });
      button.addEventListener('click', () => { activeTab = pack.id; render(); });
      return button;
    }));
    const pack = all.find(p => p.id === activeTab);
    blurb.textContent = pack.blurb;
    list.replaceChildren(...pack.presets.map(preset => {
      const chips = el('span', { class: 'preset-fx' });
      for (const cfg of preset.chain) chips.append(el('span', { text: effectName(cfg.type || cfg.id) }));
      const use = el('button', { type: 'button', class: 'preset-use', text: 'Use this look' });
      use.setAttribute('aria-label', `Use the look ${preset.name}`);
      use.addEventListener('click', () => load(preset));
      const actions = el('span', { class: 'preset-actions' }, use);
      if (pack.own) {
        const del = el('button', { type: 'button', class: 'preset-delete', text: 'Delete' });
        del.setAttribute('aria-label', `Delete the look ${preset.name}`);
        del.addEventListener('click', () => { manager.deletePreset(preset.name); render(); });
        actions.append(del);
      }
      return el('li', { 'data-preset': preset.name },
        el('span', { class: 'preset-name', text: preset.name }),
        preset.selection === 'all' ? el('span', { class: 'preset-tag', text: 'whole image' }) : null,
        el('span', { class: 'preset-desc', text: preset.description || '' }),
        chips, actions);
    }));
  }

  function saveCurrent() {
    const app = getApp();
    const name = nameInput.value.trim();
    saveNote.textContent = '';
    if (!app?.effectChainManager?.chain.length) { saveNote.textContent = 'Add an effect to the stack first.'; return; }
    if (!name) { saveNote.textContent = 'Give the look a name.'; nameInput.focus(); return; }
    if (PRESET_PACKS.some(pack => pack.presets.some(p => p.name === name))) { saveNote.textContent = 'A built-in look has that name. Pick another.'; nameInput.focus(); return; }
    manager.savePreset(name, app.effectChainManager.chain);
    nameInput.value = '';
    saveNote.textContent = `Saved “${name}”.`;
    activeTab = YOURS;
    render();
  }

  openBtn.addEventListener('click', () => {
    saveNote.textContent = '';
    render();
    dialog.showModal();
  });
  saveBtn.addEventListener('click', saveCurrent);
  nameInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); saveCurrent(); } });
  return { render, load };
}
