/**
 * chain-bridge.js — Glitcher V2 UI bridge
 * Drives the v2.html layout via EffectChainManager + EffectFactory.
 * Forces Studio mode on; no classic-mode fallback.
 */

import { completeEffectCatalog } from './effect-catalog.js';

const modernWorkspace = document.body.classList.contains('light-workspace');
const CATS = [
  {
    id: 'movement', label: 'Movement', color: '#c97d68', icon: '↔',
    effects: [
      { id: 'direction-movement', name: 'Direction Shift', desc: 'Pixel displacement along direction vector' },
      { id: 'spiral-distortion', name: 'Spiral Warp', desc: 'Rotating spiral distortion field' },
    ]
  },
  {
    id: 'sorting', label: 'Sorting', color: '#c4a06a', icon: '▤',
    effects: [
      { id: 'pixel-sort', name: 'Pixel Sort', desc: 'Sort pixels by luminance threshold' },
    ]
  },
  {
    id: 'slicing', label: 'Slicing', color: '#bdb268', icon: '⫿',
    effects: [
      { id: 'slice-glitch', name: 'Slice Glitch', desc: 'Horizontal slice displacement' },
    ]
  },
  {
    id: 'color', label: 'Color', color: '#9e7ab8', icon: '◑',
    effects: [
      { id: 'chromatic-aberration', name: 'Chromatic Aberration', desc: 'RGB channel offset' },
      { id: 'hue-shift', name: 'Hue Shift', desc: 'Rotate hue across spectrum' },
      { id: 'saturation-boost', name: 'Saturation', desc: 'Boost or crush color saturation' },
      { id: 'color-invert', name: 'Invert', desc: 'Invert all color channels' },
      { id: 'vintage', name: 'Vintage', desc: 'Warm tone sepia color grade' },
      { id: 'color-noise', name: 'Color Noise', desc: 'Random color channel noise' },
    ]
  },
  {
    id: 'filters', label: 'Filters', color: '#6aaab5', icon: '⬡',
    effects: [
      { id: 'pop-art-filter', name: 'Pop Art', desc: 'High-contrast Andy Warhol style' },
      { id: 'vintage-filter', name: 'Vintage Filter', desc: 'Film grain and vignette' },
      { id: 'emboss-filter', name: 'Emboss', desc: 'Raised surface relief effect' },
      { id: 'edge-detect-filter', name: 'Edge Detect', desc: 'Sobel edge detection overlay' },
      { id: 'motion-blur-filter', name: 'Motion Blur', desc: 'Directional motion smear' },
      { id: 'vignette-filter', name: 'Vignette', desc: 'Dark edge border falloff' },
      { id: 'halftone-filter', name: 'Halftone', desc: 'Dot-matrix halftone screen' },
    ]
  },
  {
    id: 'artistic', label: 'Artistic', color: '#7aad80', icon: '✦',
    effects: [
      { id: 'artistic-oil_painting', name: 'Oil Painting', desc: 'Smeared brush stroke render' },
      { id: 'artistic-watercolor', name: 'Watercolor', desc: 'Soft bleed watercolor style' },
      { id: 'artistic-pencil_sketch', name: 'Pencil Sketch', desc: 'Pencil line drawing effect' },
      { id: 'artistic-mosaic', name: 'Mosaic', desc: 'Chunky pixel tile mosaic' },
      { id: 'artistic-comic_book', name: 'Comic Book', desc: 'Bold outline comic style' },
      { id: 'artistic-pointillism', name: 'Pointillism', desc: 'Dot paint stipple effect' },
    ]
  },
  {
    id: 'cyberpunk', label: 'Cyberpunk', color: '#7a8ec0', icon: '⟁',
    effects: [
      { id: 'cyberpunk-neon', name: 'Neon Glow', desc: 'Electric neon halo bloom' },
      { id: 'cyberpunk-matrix', name: 'Matrix', desc: 'Green cascading data rain' },
      { id: 'cyberpunk-synthwave', name: 'Synthwave', desc: 'Retro grid horizon gradient' },
      { id: 'cyberpunk-hologram', name: 'Hologram', desc: 'Translucent scan-line overlay' },
      { id: 'cyberpunk-glitch_scan', name: 'Glitch Scan', desc: 'Horizontal scan bar glitch' },
    ]
  },
  {
    id: 'atmospheric', label: 'Atmospheric', color: '#6ab5aa', icon: '~',
    effects: [
      { id: 'atmospheric-fog', name: 'Fog', desc: 'Layered mist density field' },
      { id: 'atmospheric-rain', name: 'Rain', desc: 'Streaked rainfall overlay' },
      { id: 'atmospheric-snow', name: 'Snow', desc: 'Drifting particle snowfall' },
      { id: 'atmospheric-aurora', name: 'Aurora', desc: 'Northern lights ribbon sweep' },
      { id: 'atmospheric-underwater', name: 'Underwater', desc: 'Caustic light ripple filter' },
      { id: 'atmospheric-lightning', name: 'Lightning', desc: 'Branching arc discharge' },
    ]
  },
  {
    id: 'experimental', label: 'Experimental', color: '#b87aa8', icon: '∿',
    effects: [
      { id: 'experimental-kaleidoscope', name: 'Kaleidoscope', desc: 'Radial mirror tile symmetry' },
      { id: 'experimental-fractal', name: 'Fractal', desc: 'Self-similar recursive pattern' },
      { id: 'experimental-data_bend', name: 'Databend', desc: 'Raw byte manipulation glitch' },
      { id: 'experimental-mirror_world', name: 'Mirror World', desc: 'Multi-axis reflection fold' },
      { id: 'experimental-warp', name: 'Warp', desc: 'Mesh displacement warp grid' },
      { id: 'experimental-reality_glitch', name: 'Reality Glitch', desc: 'Compound multi-effect chaos' },
    ]
  },
];

// Build flat lookup: effectId → {cat, effect}
const EFFECT_LOOKUP = new Map();
CATS.forEach(cat => cat.effects.forEach(fx => EFFECT_LOOKUP.set(fx.id, { cat, effect: fx })));

// Build category-slug → color lookup (chain summary returns type = category slug)
const CAT_COLOR = new Map();
CATS.forEach(cat => CAT_COLOR.set(cat.id, cat.color));
// Also map common category name variants returned by EffectModule
CAT_COLOR.set('filter', '#6aaab5');    // "filter" → Filters
CAT_COLOR.set('artistic', '#7aad80');
CAT_COLOR.set('cyberpunk', '#7a8ec0');
CAT_COLOR.set('atmospheric', '#6ab5aa');
CAT_COLOR.set('experimental', '#b87aa8');

// State
let app = null;
let ecm = null;
let ef = null;
let currentView = 'grid'; // 'grid' | 'list' | 'props'
let currentCat = null;
let currentEffectId = null; // which chain node is selected for props
let activeTool = 'auto';
let dragSrcId = null;
let dragOverIndex = -1;

// ─── Init ────────────────────────────────────────────────────────────────────

function waitForApp() {
  const check = setInterval(() => {
    const g = window.glitcherApp;
    if (g && g.effectChainManager && g.effectFactory) {
      clearInterval(check);
      boot(g);
    }
  }, 100);
}

function boot(glitcherApp) {
  app = glitcherApp;
  ecm = app.effectChainManager;
  ef = app.effectFactory;
  completeEffectCatalog(CATS, ef.getAvailableEffects());
  CATS.forEach(cat => {
    CAT_COLOR.set(cat.id, cat.color);
    cat.effects.forEach(effect => EFFECT_LOOKUP.set(effect.id, { cat, effect }));
  });

  // Force studio mode so render loop uses processChain
  app.studioMode = true;

  // Subscribe to chain events
  ecm.on('chainUpdated', renderChainStrip);
  ecm.on('effectAdded', renderChainStrip);
  ecm.on('effectRemoved', renderChainStrip);
  ecm.on('effectMoved', renderChainStrip);
  ecm.on('chainCleared', renderChainStrip);
  ecm.on('effectEnabledChanged', renderChainStrip);
  ecm.on('soloChanged', renderChainStrip);
  // EffectChainManager emits the effect itself, or null when the selection is
  // cleared by a removal; older call sites passed { effect }.
  ecm.on('effectSelected', payload => {
    const effect = payload && (payload.effect || payload);
    if (effect && effect.id) showProperties(effect);
  });

  // Wire header transport
  wireHeader();

  // Wire toolbar
  wireToolbar();

  // Wire right panel search
  wireSearch();

  // Wire chain strip header
  wireChainHeader();

  // Wire animation / clump controls
  wireAnimationControls();

  // Initial render
  showCategoryGrid();
  renderChainStrip();
  startHudUpdater();

  if (modernWorkspace) window.dispatchEvent(new CustomEvent('glitcher:workspace-ready', { detail: app }));
}

// ─── Effect helpers ──────────────────────────────────────────────────────────

function addEffect(effectId) {
  try {
    if (modernWorkspace && ecm.getEffect(effectId)) {
      currentEffectId = effectId;
      ecm.selectEffect(effectId);
      renderChainStrip();
      return;
    }
    const effect = ef.createEffect(effectId);
    if (!effect) {
      console.warn('[chain-bridge] createEffect returned null for:', effectId);
      return;
    }
    ecm.addEffect(effect);
    if (modernWorkspace) {
      currentEffectId = effect.id;
      ecm.selectEffect(effect.id);
      renderChainStrip();
    }
  } catch (e) {
    console.warn('[chain-bridge] Failed to add effect:', effectId, e);
  }
}

// Announce to the modern workspace's live region; a no-op elsewhere.
function announce(message) {
  if (!modernWorkspace) return;
  window.dispatchEvent(new CustomEvent('glitcher:workspace-status', { detail: message }));
}

// node can provide { id (effectId), type (category slug or effectId) }
function catColorFor(effectIdOrCatSlug) {
  // Try direct effect ID match first
  const byEffect = EFFECT_LOOKUP.get(effectIdOrCatSlug);
  if (byEffect) return byEffect.cat.color;
  // Try category slug (what getChainSummary() returns as "type")
  const byCat = CAT_COLOR.get(effectIdOrCatSlug);
  if (byCat) return byCat;
  return '#7a7570'; // neutral fallback
}

function catFor(effectId) {
  const entry = EFFECT_LOOKUP.get(effectId);
  return entry ? entry.cat : null;
}

// ─── Right Panel ─────────────────────────────────────────────────────────────

function rpTitle(text, showBack = false) {
  const title = document.getElementById('rp-title');
  if (!title) return;
  title.textContent = text;
  const back = document.getElementById('rp-back');
  if (back) back.style.display = showBack ? 'flex' : 'none';
}

function showCategoryGrid() {
  currentView = 'grid';
  currentCat = null;
  rpTitle(modernWorkspace ? 'Explore effects' : 'EFFECTS');
  const el = document.getElementById('rp-content');
  if (!el) return;

  el.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'cat-grid';
  CATS.forEach(cat => {
    const tile = document.createElement('button');
    tile.className = 'cat-tile';
    tile.style.setProperty('--cat-color', cat.color);
    tile.setAttribute('aria-label', `${cat.label}, ${cat.effects.length} effects`);
    tile.innerHTML = `<span class="cat-icon">${cat.icon}</span><span class="cat-name">${cat.label}</span><span class="cat-count">${cat.effects.length}</span>`;
    tile.addEventListener('click', () => showEffectList(cat));
    grid.appendChild(tile);
  });
  el.appendChild(grid);
}

function showEffectList(cat) {
  currentView = 'list';
  currentCat = cat;
  rpTitle(modernWorkspace ? cat.label : cat.label.toUpperCase(), true);
  const el = document.getElementById('rp-content');
  if (!el) return;

  el.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'fx-list';
  cat.effects.forEach(fx => {
    const row = document.createElement('div');
    row.className = 'fx-row';
    row.innerHTML = `
      <div class="fx-info">
        <span class="fx-name">${fx.name}</span>
        <span class="fx-desc">${fx.desc}</span>
      </div>
      <button class="fx-add-btn" data-id="${fx.id}" style="--cat-color:${cat.color}">+</button>
    `;
    row.querySelector('.fx-add-btn').setAttribute('aria-label', `Add ${fx.name}`);
    row.querySelector('.fx-add-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      addEffect(fx.id);
      // Visual feedback
      const btn = e.currentTarget;
      btn.textContent = '✓';
      btn.classList.add('added');
      setTimeout(() => { btn.textContent = '+'; btn.classList.remove('added'); }, 800);
    });
    list.appendChild(row);
  });
  el.appendChild(list);
}

function showProperties(effect) {
  currentView = 'props';
  currentEffectId = effect.id;

  const meta = EFFECT_LOOKUP.get(effect.id);
  const effectTitle = meta ? meta.effect.name : effect.name || effect.id;
  rpTitle(modernWorkspace ? effectTitle : effectTitle.toUpperCase(), true);

  const el = document.getElementById('rp-content');
  if (!el) return;

  const config = effect.parameterConfig || {};
  const params = effect.parameters || {};

  el.innerHTML = '';

  if (!Object.keys(config).length) {
    const empty = document.createElement('div');
    empty.className = 'props-empty';
    empty.textContent = 'No adjustable parameters';
    el.appendChild(empty);
    return;
  }

  const form = document.createElement('div');
  form.className = 'props-form';

  Object.entries(config).forEach(([key, schema]) => {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const label = document.createElement('label');
    label.className = 'prop-label';
    label.textContent = schema.label || (modernWorkspace ? humanize(key) : key);
    const controlId = `prop-${effect.id}-${key}`;
    label.htmlFor = controlId;

    if (schema.type === 'range') {
      const val = params[key] ?? schema.default ?? schema.min ?? 0;
      const valueDisplay = document.createElement('span');
      valueDisplay.className = 'prop-value';
      valueDisplay.textContent = formatValue(val, schema);

      const input = document.createElement('input');
      input.type = 'range';
      input.id = controlId;
      input.setAttribute('aria-label', schema.label || key);
      input.className = 'prop-slider';
      input.min = schema.min ?? 0;
      input.max = schema.max ?? 100;
      input.step = schema.step ?? 1;
      input.value = val;
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        effect.parameters[key] = v;
        valueDisplay.textContent = formatValue(v, schema);
        if (app.requestRender) app.requestRender();
      });

      const header = document.createElement('div');
      header.className = 'prop-header';
      header.appendChild(label);
      header.appendChild(valueDisplay);
      row.appendChild(header);
      row.appendChild(input);

    } else if (schema.type === 'select') {
      const val = params[key] ?? schema.default ?? (schema.options?.[0]?.value ?? schema.options?.[0]);
      const select = document.createElement('select');
      select.id = controlId;
      select.className = 'prop-select';
      select.setAttribute('aria-label', schema.label || key);
      (schema.options || []).forEach(opt => {
        const option = document.createElement('option');
        if (typeof opt === 'object') {
          option.value = opt.value;
          option.textContent = opt.label;
        } else {
          option.value = opt;
          // Several effects list raw identifiers; show them as words.
          option.textContent = modernWorkspace ? humanize(opt) : opt;
        }
        if (option.value == val) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener('change', () => {
        effect.parameters[key] = select.value;
        if (app.requestRender) app.requestRender();
      });

      const header = document.createElement('div');
      header.className = 'prop-header';
      header.appendChild(label);
      row.appendChild(header);
      row.appendChild(select);

    } else if (schema.type === 'checkbox') {
      const val = params[key] ?? schema.default ?? false;
      const wrapper = document.createElement('div');
      wrapper.className = 'prop-check-row';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.id = controlId;
      chk.setAttribute('aria-label', schema.label || key);
      chk.className = 'prop-check';
      chk.checked = !!val;
      chk.addEventListener('change', () => {
        effect.parameters[key] = chk.checked;
        if (app.requestRender) app.requestRender();
      });
      wrapper.appendChild(label);
      wrapper.appendChild(chk);
      row.appendChild(wrapper);
    }

    form.appendChild(row);
  });

  el.appendChild(form);
}

// "columnBrightness" / "edge_detect" -> "Column brightness" / "Edge detect"
function humanize(value) {
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, c => c.toUpperCase());
}

function formatValue(v, schema) {
  const rounded = schema.step && schema.step < 1 ? v.toFixed(2) : Math.round(v);
  return schema.unit ? `${rounded}${schema.unit}` : String(rounded);
}

function showSearchResults(query) {
  currentView = 'search';
  rpTitle(modernWorkspace ? 'Search results' : 'SEARCH', true);
  const el = document.getElementById('rp-content');
  if (!el) return;

  const q = query.toLowerCase();
  const matches = [];
  CATS.forEach(cat => {
    cat.effects.forEach(fx => {
      if (fx.name.toLowerCase().includes(q) || fx.desc.toLowerCase().includes(q) || cat.label.toLowerCase().includes(q)) {
        matches.push({ fx, cat });
      }
    });
  });

  el.innerHTML = '';
  if (!matches.length) {
    const empty = document.createElement('div');
    empty.className = 'props-empty';
    empty.textContent = 'No effects match';
    el.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'fx-list';
  matches.forEach(({ fx, cat }) => {
    const row = document.createElement('div');
    row.className = 'fx-row';
    row.innerHTML = `
      <div class="fx-info">
        <span class="fx-name">${fx.name}</span>
        <span class="fx-desc cat-badge" style="color:${cat.color}">${cat.label}</span>
      </div>
      <button class="fx-add-btn" data-id="${fx.id}" style="--cat-color:${cat.color}">+</button>
    `;
    row.querySelector('.fx-add-btn').setAttribute('aria-label', `Add ${fx.name}`);
    row.querySelector('.fx-add-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      addEffect(fx.id);
      const btn = e.currentTarget;
      btn.textContent = '✓';
      btn.classList.add('added');
      setTimeout(() => { btn.textContent = '+'; btn.classList.remove('added'); }, 800);
    });
    list.appendChild(row);
  });
  el.appendChild(list);
}

// ─── Chain Strip ─────────────────────────────────────────────────────────────

function renderChainStrip() {
  const container = document.getElementById('chain-nodes');
  if (!container) return;

  // Rebuilding the strip drops keyboard focus; remember which control had it.
  const focused = container.contains(document.activeElement) ? document.activeElement : null;
  const focusedNodeId = focused ? focused.closest('.chain-node')?.dataset.id : null;
  const focusedClass = focused ? focused.className.split(' ')[0] : null;
  const focusedDirection = focused ? focused.getAttribute('aria-label') : null;

  const summary = ecm.getChainSummary ? ecm.getChainSummary() : [];
  container.innerHTML = '';

  // Update count badge and status bar
  const countEl = document.getElementById('v2-chain-count');
  if (countEl) countEl.textContent = summary.length;
  const sbChain = document.getElementById('v2-status-chain');
  if (sbChain) sbChain.innerHTML = `Chain: <strong>${summary.length}</strong> effect${summary.length !== 1 ? 's' : ''}`;

  if (!summary.length) {
    const empty = document.createElement('div');
    empty.className = 'chain-empty';
    // CSS pseudo-element renders "+ ADD EFFECT"; child <span> shows the hint text
    empty.innerHTML = modernWorkspace ? '<span>Your next happy accident starts here.<br>Add an effect from the library.</span>' : '<span>pick from library →</span>';
    container.appendChild(empty);
    return;
  }

  summary.forEach((node, index) => {
    // node.id = effectId (e.g. "direction-movement"), node.type = category slug (e.g. "movement")
    const color = catColorFor(node.id) !== '#7a7570' ? catColorFor(node.id) : catColorFor(node.type);
    const isSelected = node.id === currentEffectId;
    const isSoloed = node.solo;
    const isDisabled = !node.enabled;

    const tile = document.createElement('div');
    tile.className = 'chain-node' +
      (isSelected ? ' selected' : '') +
      (isDisabled ? ' disabled' : '') +
      (isSoloed ? ' soloed' : '');
    tile.dataset.id = node.id;
    tile.dataset.index = index;
    tile.style.setProperty('--node-color', color);
    tile.draggable = true;

    // Label — look up by effectId first
    const meta = EFFECT_LOOKUP.get(node.id);
    const displayName = meta ? meta.effect.name : (node.name || node.id);

    // Check for a stored per-effect selection mask
    const effectObj = ecm.getEffect(node.id);
    const hasMask = effectObj && effectObj.selectionMask != null;

    tile.innerHTML = `
      <div class="node-top">
        <button class="node-bypass" title="Bypass" data-id="${node.id}" data-enabled="${node.enabled}">
          <span class="bypass-dot ${node.enabled ? 'on' : 'off'}"></span>
        </button>
        <button class="node-solo ${isSoloed ? 'active' : ''}" title="Solo" data-id="${node.id}">S</button>
      </div>
      <div class="node-label">${displayName}</div>
      ${hasMask ? `<div class="node-mask-dot" title="Has custom selection mask">▣</div>` : ''}
      <button class="node-delete" title="Remove" data-id="${node.id}">×</button>
    `;

    if (modernWorkspace) {
      const label = tile.querySelector('.node-label');
      const select = document.createElement('button');
      select.className = 'node-label';
      select.textContent = displayName;
      select.setAttribute('aria-label', `Adjust ${displayName}`);
      select.setAttribute('aria-pressed', String(isSelected));
      label.replaceWith(select);
      const bypass = tile.querySelector('.node-bypass');
      bypass.append(document.createTextNode(node.enabled ? 'On' : 'Off'));
      bypass.setAttribute('aria-label', `Enable ${displayName}`);
      bypass.setAttribute('aria-pressed', String(node.enabled));
      const solo = tile.querySelector('.node-solo');
      solo.textContent = 'Solo';
      solo.setAttribute('aria-label', `Solo ${displayName}`);
      solo.setAttribute('aria-pressed', String(isSoloed));
      tile.querySelector('.node-delete').setAttribute('aria-label', `Remove ${displayName}`);
      [-1, 1].forEach(direction => {
        const move = document.createElement('button');
        move.className = 'node-move';
        move.textContent = direction < 0 ? '←' : '→';
        move.setAttribute('aria-label', `Move ${displayName} ${direction < 0 ? 'earlier' : 'later'}`);
        move.disabled = direction < 0 ? index === 0 : index === summary.length - 1;
        move.addEventListener('click', event => {
          event.stopPropagation();
          // Manager takes an insertion boundary, including the removed slot.
          ecm.moveEffect(node.id, direction < 0 ? index - 1 : index + 2);
        });
        tile.querySelector('.node-top').appendChild(move);
      });
    }

    // Click tile to select (show properties)
    tile.addEventListener('click', (e) => {
      if (e.target.closest('.node-bypass, .node-solo, .node-delete, .node-move')) return;
      currentEffectId = node.id;
      const effect = ecm.getEffect(node.id);
      if (effect) {
        ecm.selectEffect(node.id);
        showProperties(effect);
      }
      renderChainStrip();
    });

    // Bypass toggle
    tile.querySelector('.node-bypass').addEventListener('click', (e) => {
      e.stopPropagation();
      ecm.setEffectEnabled(node.id, !node.enabled);
    });

    // Solo
    tile.querySelector('.node-solo').addEventListener('click', (e) => {
      e.stopPropagation();
      if (isSoloed) {
        ecm.clearSolo();
      } else {
        ecm.setSolo(node.id);
      }
    });

    // Delete
    tile.querySelector('.node-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentEffectId === node.id) {
        currentEffectId = null;
        showCategoryGrid();
      }
      ecm.removeEffect(node.id);
    });

    // Drag events
    tile.addEventListener('dragstart', (e) => {
      dragSrcId = node.id;
      tile.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', node.id);
    });
    tile.addEventListener('dragend', () => {
      tile.classList.remove('dragging');
      dragSrcId = null;
      dragOverIndex = -1;
      container.querySelectorAll('.chain-node').forEach(n => n.classList.remove('drop-target'));
    });
    tile.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      container.querySelectorAll('.chain-node').forEach(n => n.classList.remove('drop-target'));
      tile.classList.add('drop-target');
      dragOverIndex = index;
    });
    tile.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragSrcId && dragSrcId !== node.id) {
        const sourceIndex = ecm.getEffectPosition(dragSrcId);
        ecm.moveEffect(dragSrcId, modernWorkspace && index > sourceIndex ? index + 1 : index);
      }
    });

    container.appendChild(tile);
  });

  restoreChainFocus(container, focusedNodeId, focusedClass, focusedDirection);
}

// Put keyboard focus back on the equivalent control of the re-rendered strip.
// A move button changes place, so match it by its label ("… earlier"/"… later").
function restoreChainFocus(container, nodeId, className, ariaLabel) {
  if (!nodeId || !className) return;
  const tile = container.querySelector(`.chain-node[data-id="${CSS.escape(nodeId)}"]`);
  if (!tile) return;
  let target = null;
  if (className === 'node-move' && ariaLabel) {
    const wanted = / earlier$/.test(ariaLabel) ? ' earlier' : ' later';
    target = [...tile.querySelectorAll('.node-move')]
      .find(b => (b.getAttribute('aria-label') || '').endsWith(wanted));
    if (target && target.disabled) {
      target = [...tile.querySelectorAll('.node-move')].find(b => !b.disabled);
    }
  } else {
    target = tile.querySelector('.' + className);
  }
  if (target && !target.disabled) target.focus();
}

// ─── Header transport ────────────────────────────────────────────────────────

const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3];
let speedIndex = 2; // default 1×

function wireHeader() {
  // Load media
  const loadBtn = document.getElementById('v2-load-btn');
  const imgInput = document.getElementById('image-input');
  if (loadBtn && imgInput) {
    loadBtn.addEventListener('click', () => imgInput.click());
    imgInput.addEventListener('change', () => {
      if (imgInput.files && imgInput.files[0]) {
        const name = imgInput.files[0].name;
        const label = document.getElementById('v2-media-label');
        if (label) {
          label.textContent = name.length > 18 ? name.slice(0, 16) + '…' : name;
        }
      }
    });
  }

  // Play/Pause
  const playBtn = document.getElementById('v2-play-btn');
  const hiddenPlay = document.getElementById('play-pause-btn');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (hiddenPlay) hiddenPlay.click();
      else if (app.togglePlayPause) app.togglePlayPause();
    });
  }

  // Speed cycle
  const speedBtn = document.getElementById('v2-speed-btn');
  const speedInput = document.getElementById('source-speed');
  if (speedBtn) {
    updateSpeedDisplay(speedBtn);
    speedBtn.addEventListener('click', () => {
      speedIndex = (speedIndex + 1) % SPEEDS.length;
      updateSpeedDisplay(speedBtn);
      if (speedInput) {
        speedInput.value = SPEEDS[speedIndex];
        speedInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      applySourceSpeed();
      announce(`Source playback at ${SPEEDS[speedIndex]}×.`);
    });
    // Each new media load builds a fresh FrameTimer at 1×.
    if (modernWorkspace) app.canvasManager.onImageLoad(applySourceSpeed);
  }

  // Snapshot
  const snapBtn = document.getElementById('v2-snapshot-btn');
  const hiddenSnap = document.getElementById('snapshot-btn');
  if (snapBtn && hiddenSnap) {
    snapBtn.addEventListener('click', () => hiddenSnap.click());
  }

  // Record
  const recBtn = document.getElementById('v2-record-btn');
  const hiddenRec = document.getElementById('record-btn');
  if (recBtn && hiddenRec) {
    recBtn.addEventListener('click', () => {
      hiddenRec.click();
      if (!modernWorkspace) recBtn.classList.toggle('recording');
    });
  }
}

// main.js binds #source-speed only when #speed-value exists, which the modern
// workspace deliberately omits, so apply the speed to the frame timer here.
function applySourceSpeed() {
  if (!modernWorkspace || !app) return;
  app.sourcePlaybackSpeed = SPEEDS[speedIndex];
  if (app.frameTimer) app.frameTimer.setSpeed(SPEEDS[speedIndex]);
}

function updateSpeedDisplay(btn) {
  const s = SPEEDS[speedIndex];
  btn.textContent = s === 1 ? '1×' : s < 1 ? `${s}×` : `${s}×`;
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

const TOOLS = [
  { id: 'auto', label: 'Auto', name: 'Automatic', icon: '✦' },
  { id: 'rect', label: 'Rect', name: 'Rectangle', icon: '▭' },
  { id: 'brush', label: 'Brush', name: 'Brush', icon: '⊙' },
  { id: 'wand', label: 'Wand', name: 'Magic wand', icon: '⋆' },
  { id: 'lasso', label: 'Lasso', name: 'Lasso', icon: '∮' },
];

function wireToolbar() {
  TOOLS.forEach(tool => {
    const btn = document.getElementById(`v2-tool-${tool.id}`);
    if (!btn) return;
    btn.addEventListener('click', () => selectTool(tool.id));
  });

  // "All" — assign full-canvas mask to currently selected effect node
  const allBtn = document.getElementById('v2-all-sel');
  if (allBtn) {
    allBtn.addEventListener('click', () => {
      const effect = currentEffectId ? ecm.getEffect(currentEffectId) : null;
      if (!effect) {
        announce('Select an effect card in your stack first, then choose where it applies.');
        return;
      }
      const canvas = document.getElementById('canvas');
      if (!canvas || !canvas.width || !canvas.height) {
        announce('Load an image or video before assigning a selection.');
        return;
      }
      effect.selectionMask = new Uint8ClampedArray(canvas.width * canvas.height).fill(255);
      renderChainStrip(); // update mask indicator
      announce(`${effect.name || effect.id} now covers the whole image.`);
    });
  }

  // Clear selection — clears the selected node's stored mask first; falls back to global clear
  const clearBtn = document.getElementById('v2-clear-sel');
  const hiddenClear = document.getElementById('clear-selections');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      // If a node is selected and has a stored mask, clear just that mask
      if (currentEffectId) {
        const effect = ecm.getEffect(currentEffectId);
        if (effect && effect.selectionMask != null) {
          effect.selectionMask = null;
          renderChainStrip();
          announce(`${effect.name || effect.id} is back to roaming the whole image.`);
          return; // don't also wipe the painted selection
        }
      }
      // Otherwise clear the painted selection as usual
      if (hiddenClear) hiddenClear.click();
      announce('Selection cleared.');
    });
  }

  // Selection preview toggle
  const previewToggle = document.getElementById('v2-preview-toggle');
  const hiddenPreview = document.getElementById('selection-preview-checkbox');
  if (previewToggle && hiddenPreview) {
    previewToggle.addEventListener('click', () => {
      hiddenPreview.checked = !hiddenPreview.checked;
      hiddenPreview.dispatchEvent(new Event('change', { bubbles: true }));
      previewToggle.classList.toggle('active', hiddenPreview.checked);
    });
  }

  // Brush size mirror
  const brushSlider = document.getElementById('v2-brush-size');
  const hiddenBrush = document.getElementById('brush-size');
  if (brushSlider && hiddenBrush) {
    brushSlider.addEventListener('input', () => {
      hiddenBrush.value = brushSlider.value;
      hiddenBrush.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  // Playback controls in toolbar
  const tbPlayBtn = document.getElementById('v2-tb-play');
  const hiddenPlayBtn = document.getElementById('play-pause-btn');
  if (tbPlayBtn && hiddenPlayBtn) {
    tbPlayBtn.addEventListener('click', () => hiddenPlayBtn.click());
  }
}

function selectTool(toolId) {
  activeTool = toolId;
  // Update UI
  TOOLS.forEach(t => {
    const btn = document.getElementById(`v2-tool-${t.id}`);
    if (btn) {
      btn.classList.toggle('active', t.id === toolId);
      if (modernWorkspace) btn.setAttribute('aria-pressed', String(t.id === toolId));
    }
  });

  const isManual = toolId !== 'auto';
  const manualChk = document.getElementById('manual-selection-mode');

  if (toolId === 'auto') {
    if (manualChk) {
      manualChk.checked = false;
      manualChk.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } else {
    if (manualChk) {
      manualChk.checked = true;
      manualChk.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const toolMap = {
      rect: 'select-tool',
      brush: 'brush-tool',
      wand: 'wand-tool',
      lasso: 'lasso-tool',
    };
    const hiddenId = toolMap[toolId];
    if (hiddenId) {
      const hiddenBtn = document.getElementById(hiddenId);
      if (hiddenBtn) hiddenBtn.click();
    }
  }

  // Show/hide key effects section
  const keyFx = document.getElementById('v2-key-effects');
  if (keyFx) keyFx.style.display = isManual ? 'block' : 'none';

  // Show/hide brush size control
  const brushControl = document.getElementById('v2-brush-control');
  if (brushControl) brushControl.style.display = toolId === 'brush' ? 'flex' : 'none';

  // Update status bar tool text
  const toolLabel = document.getElementById('v2-status-tool');
  const toolObj = TOOLS.find(t => t.id === toolId);
  if (toolLabel && toolObj) {
    toolLabel.textContent = modernWorkspace ? toolObj.name : toolObj.label.toUpperCase();
  }
}

// Key effects quick-add buttons
function wireKeyEffects() {
  const dirs = [
    { id: 'direction-movement', label: 'Direction Shift' },
    { id: 'spiral-distortion', label: 'Spiral Warp' },
  ];
  const container = document.getElementById('v2-key-effects-list');
  if (!container) return;
  dirs.forEach(d => {
    const btn = document.createElement('button');
    btn.className = 'key-fx-btn';
    btn.textContent = '+ ' + d.label;
    btn.addEventListener('click', () => addEffect(d.id));
    container.appendChild(btn);
  });
}

// ─── Search ──────────────────────────────────────────────────────────────────

function wireSearch() {
  const input = document.getElementById('rp-search');
  if (!input) return;
  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (!q) {
      showCategoryGrid();
      return;
    }
    debounce = setTimeout(() => showSearchResults(q), 200);
  });
}

// ─── Chain header ─────────────────────────────────────────────────────────────

function wireChainHeader() {
  const clearBtn = document.getElementById('v2-chain-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (ecm.clearChain) {
        ecm.clearChain();
        currentEffectId = null;
        showCategoryGrid();
      }
    });
  }

  // Back button in right panel
  const backBtn = document.getElementById('rp-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (currentView === 'props' || currentView === 'list') {
        showCategoryGrid();
      } else if (currentView === 'search') {
        const input = document.getElementById('rp-search');
        if (input) input.value = '';
        showCategoryGrid();
      }
    });
  }

  wireKeyEffects();
}

// ─── HUD updater ─────────────────────────────────────────────────────────────

function startHudUpdater() {
  const canvas = document.getElementById('canvas');
  const hudDims = document.getElementById('v2-hud-dims');
  const hudState = document.getElementById('v2-hud-state');

  function update() {
    const hasMedia = app?.canvasManager?.isImageLoaded();
    if (canvas && hudDims) {
      const w = canvas.width || 0;
      const h = canvas.height || 0;
      if (w && h) hudDims.textContent = modernWorkspace && !hasMedia ? 'No media loaded' : `${w}×${h}`;
    }
    if (hudState) {
      const paused = app && app.isPaused;
      hudState.textContent = modernWorkspace ? (!hasMedia ? 'Ready when you are' : paused ? 'Paused' : 'Effects running') : paused ? 'PAUSED' : 'RUNNING';
      hudState.className = 'hud-state' + (paused ? ' paused' : ' running');
    }
  }

  // Update play button icon
  const playBtn = document.getElementById('v2-play-btn');
  const hiddenPlayBtn = document.getElementById('play-pause-btn');
  if (hiddenPlayBtn && playBtn) {
    const obs = new MutationObserver(() => {
      const isPaused = hiddenPlayBtn.textContent.includes('Play') ||
        hiddenPlayBtn.dataset.state === 'paused' ||
        (app && app.isPaused);
      playBtn.textContent = modernWorkspace ? (isPaused ? '▶ Play' : 'Ⅱ Pause') : isPaused ? '▶' : '⏸';
      update();
    });
    obs.observe(hiddenPlayBtn, { characterData: true, childList: true, subtree: true, attributes: true });
  }

  setInterval(update, 500);
  update();
}

// ─── Animation / clump controls ──────────────────────────────────────────────

function wireAnimationControls() {
  // Helper: mirror a v2 control to its hidden counterpart and clear active clumps
  function mirror(v2Id, hiddenId, valueDisplayId, transform) {
    const v2El = document.getElementById(v2Id);
    const hiddenEl = document.getElementById(hiddenId);
    const valEl = valueDisplayId ? document.getElementById(valueDisplayId) : null;
    if (!v2El || !hiddenEl) return;
    v2El.addEventListener('input', () => {
      const val = transform ? transform(v2El.value) : v2El.value;
      hiddenEl.value = val;
      hiddenEl.dispatchEvent(new Event('input', { bubbles: true }));
      if (valEl) valEl.textContent = v2El.value;
      // Reset clumps so new settings take effect immediately
      if (app) app.activeClumps = [];
    });
    v2El.addEventListener('change', () => {
      const val = transform ? transform(v2El.value) : v2El.value;
      hiddenEl.value = val;
      hiddenEl.dispatchEvent(new Event('change', { bubbles: true }));
      if (app) app.activeClumps = [];
    });
  }

  // Selection method
  mirror('v2-sel-method', 'selection-method', null);

  // Intensity (size)
  mirror('v2-intensity', 'intensity-select', null);

  // Concurrent selections
  mirror('v2-concurrent', 'concurrent-selections', 'v2-concurrent-val');

  // Min lifetime
  mirror('v2-minlife', 'min-lifetime', 'v2-minlife-val');

  // Max lifetime
  mirror('v2-maxlife', 'max-lifetime', 'v2-maxlife-val');
}

// ─── Canvas drag-and-drop for media loading ───────────────────────────────────

function wireCanvasDrop() {
  const placeholder = document.getElementById('canvas-placeholder');
  const imgInput = document.getElementById('image-input');
  if (!placeholder || !imgInput) return;

  placeholder.addEventListener('dragover', (e) => {
    e.preventDefault();
    placeholder.classList.add('drag-over');
  });
  placeholder.addEventListener('dragleave', () => placeholder.classList.remove('drag-over'));
  placeholder.addEventListener('drop', (e) => {
    e.preventDefault();
    placeholder.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    imgInput.files = dt.files;
    imgInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
  placeholder.addEventListener('click', () => imgInput.click());
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (!modernWorkspace) wireCanvasDrop();
  waitForApp();
});
