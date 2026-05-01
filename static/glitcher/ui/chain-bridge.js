/**
 * chain-bridge.js — Glitcher V2 UI bridge
 * Drives the v2.html layout via EffectChainManager + EffectFactory.
 * Forces Studio mode on; no classic-mode fallback.
 */

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
  ecm.on('effectSelected', ({ effect }) => {
    if (effect) showProperties(effect);
  });

  // Wire header transport
  wireHeader();

  // Wire toolbar
  wireToolbar();

  // Wire right panel search
  wireSearch();

  // Wire chain strip header
  wireChainHeader();

  // Initial render
  showCategoryGrid();
  renderChainStrip();
  startHudUpdater();
}

// ─── Effect helpers ──────────────────────────────────────────────────────────

function addEffect(effectId) {
  try {
    const effect = ef.createEffect(effectId);
    if (!effect) {
      console.warn('[chain-bridge] createEffect returned null for:', effectId);
      return;
    }
    ecm.addEffect(effect);
  } catch (e) {
    console.warn('[chain-bridge] Failed to add effect:', effectId, e);
  }
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
  rpTitle('EFFECTS');
  const el = document.getElementById('rp-content');
  if (!el) return;

  el.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'cat-grid';
  CATS.forEach(cat => {
    const tile = document.createElement('button');
    tile.className = 'cat-tile';
    tile.style.setProperty('--cat-color', cat.color);
    tile.innerHTML = `<span class="cat-icon">${cat.icon}</span><span class="cat-name">${cat.label}</span><span class="cat-count">${cat.effects.length}</span>`;
    tile.addEventListener('click', () => showEffectList(cat));
    grid.appendChild(tile);
  });
  el.appendChild(grid);
}

function showEffectList(cat) {
  currentView = 'list';
  currentCat = cat;
  rpTitle(cat.label.toUpperCase(), true);
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
  rpTitle((meta ? meta.effect.name : effect.name || effect.id).toUpperCase(), true);

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
    label.textContent = schema.label || key;

    if (schema.type === 'range') {
      const val = params[key] ?? schema.default ?? schema.min ?? 0;
      const valueDisplay = document.createElement('span');
      valueDisplay.className = 'prop-value';
      valueDisplay.textContent = formatValue(val, schema);

      const input = document.createElement('input');
      input.type = 'range';
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
      select.className = 'prop-select';
      (schema.options || []).forEach(opt => {
        const option = document.createElement('option');
        if (typeof opt === 'object') {
          option.value = opt.value;
          option.textContent = opt.label;
        } else {
          option.value = opt;
          option.textContent = opt;
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

function formatValue(v, schema) {
  const rounded = schema.step && schema.step < 1 ? v.toFixed(2) : Math.round(v);
  return schema.unit ? `${rounded}${schema.unit}` : String(rounded);
}

function showSearchResults(query) {
  currentView = 'search';
  rpTitle('SEARCH', true);
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
    empty.textContent = 'No effects — add from library →';
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

    tile.innerHTML = `
      <div class="node-top">
        <button class="node-bypass" title="Bypass" data-id="${node.id}" data-enabled="${node.enabled}">
          <span class="bypass-dot ${node.enabled ? 'on' : 'off'}"></span>
        </button>
        <button class="node-solo ${isSoloed ? 'active' : ''}" title="Solo" data-id="${node.id}">S</button>
      </div>
      <div class="node-label">${displayName}</div>
      <button class="node-delete" title="Remove" data-id="${node.id}">×</button>
    `;

    // Click tile to select (show properties)
    tile.addEventListener('click', (e) => {
      if (e.target.closest('.node-bypass, .node-solo, .node-delete')) return;
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
        ecm.moveEffect(dragSrcId, index);
      }
    });

    container.appendChild(tile);
  });
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
    });
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
      recBtn.classList.toggle('recording');
    });
  }
}

function updateSpeedDisplay(btn) {
  const s = SPEEDS[speedIndex];
  btn.textContent = s === 1 ? '1×' : s < 1 ? `${s}×` : `${s}×`;
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

const TOOLS = [
  { id: 'auto', label: 'Auto', icon: '✦' },
  { id: 'rect', label: 'Rect', icon: '▭' },
  { id: 'brush', label: 'Brush', icon: '⊙' },
  { id: 'wand', label: 'Wand', icon: '⋆' },
  { id: 'lasso', label: 'Lasso', icon: '∮' },
];

function wireToolbar() {
  TOOLS.forEach(tool => {
    const btn = document.getElementById(`v2-tool-${tool.id}`);
    if (!btn) return;
    btn.addEventListener('click', () => selectTool(tool.id));
  });

  // Clear selection
  const clearBtn = document.getElementById('v2-clear-sel');
  const hiddenClear = document.getElementById('clear-selections');
  if (clearBtn && hiddenClear) {
    clearBtn.addEventListener('click', () => hiddenClear.click());
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
    if (btn) btn.classList.toggle('active', t.id === toolId);
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
  if (toolLabel && toolObj) toolLabel.textContent = toolObj.label.toUpperCase();
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
    if (canvas && hudDims) {
      const w = canvas.width || 0;
      const h = canvas.height || 0;
      if (w && h) hudDims.textContent = `${w}×${h}`;
    }
    if (hudState) {
      const paused = app && app.isPaused;
      hudState.textContent = paused ? 'PAUSED' : 'RUNNING';
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
      playBtn.textContent = isPaused ? '▶' : '⏸';
      update();
    });
    obs.observe(hiddenPlayBtn, { characterData: true, childList: true, subtree: true, attributes: true });
  }

  setInterval(update, 500);
  update();
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
  wireCanvasDrop();
  waitForApp();
});

