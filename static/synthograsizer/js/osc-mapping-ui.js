/* ──────────────────────────────────────────────────────────────────────
 * AV Inspector Drawer + OSC Mapping editor
 *
 * Mounts a right-side drawer that shows the selected knob's overrides:
 *   label · color · group · source-tag · OSC address (with Resolume
 *   preset autocomplete) · range · curve · send type.
 *
 * Edits are saved live into AVProfileStoreSingleton; the app re-renders
 * knobs via the store's subscribe() callback.
 * ──────────────────────────────────────────────────────────────────── */

(function (global) {
  'use strict';

  const SOURCE_OPTIONS = [
    { value: 'code', label: 'Code',  hint: 'OSC out only (no prompt)' },
    { value: 'ai',   label: 'AI',    hint: 'Prompt only (no OSC)' },
    { value: 'both', label: 'Both',  hint: 'Prompt AND OSC' },
  ];

  const CURVE_OPTIONS = [
    { value: 'linear', label: 'Linear' },
    { value: 'exp',    label: 'Exp (x²)' },
    { value: 'log',    label: 'Log (√x)' },
    { value: 'sCurve', label: 'S-curve' },
  ];

  const SEND_OPTIONS = [
    { value: 'float',   label: 'Float'   },
    { value: 'int',     label: 'Integer' },
    { value: 'trigger', label: 'Trigger' },
    { value: 'string',  label: 'String'  },
  ];

  class AVInspector {
    constructor({ store, app }) {
      this.store = store;
      this.app = app;
      this.selectedVar = null;
      this._build();
      this.store.subscribe(() => this._refresh());
    }

    _build() {
      const drawer = document.createElement('aside');
      drawer.id = 'av-inspector';
      drawer.className = 'av-inspector collapsed';
      drawer.innerHTML = `
        <div class="av-inspector-header">
          <span class="av-inspector-title">Inspector</span>
          <button id="av-inspector-collapse" class="av-btn-icon" title="Hide inspector">−</button>
        </div>

        <div class="av-inspector-section">
          <div class="av-section-label">OSC Target</div>
          <div class="av-row">
            <label>Host</label>
            <input type="text" id="av-osc-host" placeholder="127.0.0.1">
          </div>
          <div class="av-row">
            <label>Port</label>
            <input type="number" id="av-osc-port" placeholder="7000" min="1" max="65535">
          </div>
          <div class="av-row">
            <label>Enable OSC</label>
            <input type="checkbox" id="av-osc-enable">
          </div>
          <div class="av-row av-row-status">
            <span id="av-osc-status">—</span>
          </div>
        </div>

        <div class="av-inspector-section av-inspector-control" id="av-inspector-control" style="display:none;">
          <div class="av-section-label" id="av-selected-name">No control selected</div>

          <div class="av-row">
            <label>Label</label>
            <input type="text" id="av-edit-label" placeholder="(default)">
          </div>

          <div class="av-row">
            <label>Color</label>
            <input type="color" id="av-edit-color">
            <button class="av-btn-mini" id="av-edit-color-clear" title="Use palette default">×</button>
          </div>

          <div class="av-row">
            <label>Group</label>
            <input type="text" id="av-edit-group" placeholder="(none)">
          </div>

          <div class="av-row">
            <label>Source</label>
            <select id="av-edit-source">
              ${SOURCE_OPTIONS.map(o => `<option value="${o.value}" title="${o.hint}">${o.label}</option>`).join('')}
            </select>
          </div>

          <div class="av-section-label av-section-sub">OSC Mapping</div>

          <div class="av-row">
            <label>Preset</label>
            <select id="av-preset-pick">
              <option value="">— pick preset —</option>
            </select>
          </div>

          <div class="av-row av-row-preset-args" id="av-row-preset-N" style="display:none;">
            <label>Layer / N</label>
            <input type="number" id="av-preset-N" min="1" value="1">
          </div>
          <div class="av-row av-row-preset-args" id="av-row-preset-M" style="display:none;">
            <label>Clip / M</label>
            <input type="number" id="av-preset-M" min="1" value="1">
          </div>

          <div class="av-row">
            <label>Address</label>
            <input type="text" id="av-edit-address" placeholder="/composition/...">
          </div>

          <div class="av-row av-row-range">
            <label>Range</label>
            <input type="number" id="av-edit-range-min" step="any" placeholder="0">
            <span class="av-range-sep">→</span>
            <input type="number" id="av-edit-range-max" step="any" placeholder="1">
          </div>

          <div class="av-row">
            <label>Curve</label>
            <select id="av-edit-curve">
              ${CURVE_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
            </select>
          </div>

          <div class="av-row">
            <label>Send as</label>
            <select id="av-edit-send">
              ${SEND_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
            </select>
          </div>

          <div class="av-inspector-actions">
            <button id="av-test-send" class="av-btn-mini" title="Send current value to Resolume now">Test Send</button>
            <button id="av-clear-mapping" class="av-btn-mini" title="Remove all overrides for this control">Reset</button>
          </div>
        </div>

        <div class="av-inspector-section">
          <div class="av-section-label">Profile</div>
          <div class="av-row">
            <label>Active</label>
            <select id="av-profile-select"></select>
          </div>
          <div class="av-inspector-actions">
            <button class="av-btn-mini" id="av-profile-new">New</button>
            <button class="av-btn-mini" id="av-profile-export">Export</button>
            <button class="av-btn-mini" id="av-profile-import">Import</button>
            <button class="av-btn-mini" id="av-profile-delete">Delete</button>
          </div>
          <input type="file" id="av-profile-import-file" accept="application/json" style="display:none;">
        </div>
      `;
      document.body.appendChild(drawer);

      // Reopen handle (small tab on the page edge when collapsed)
      const handle = document.createElement('button');
      handle.id = 'av-inspector-handle';
      handle.className = 'av-inspector-handle';
      handle.title = 'Show AV Inspector';
      handle.textContent = 'AV';
      document.body.appendChild(handle);

      this.drawer = drawer;
      this.handle = handle;

      this._wireEvents();
      this._populatePresets();
      this._refresh();
    }

    _wireEvents() {
      const $ = (id) => this.drawer.querySelector('#' + id);

      // Collapse / expand
      $('av-inspector-collapse').onclick = () => this._setCollapsed(true);
      this.handle.onclick = () => this._setCollapsed(false);

      // OSC target
      const hostI = $('av-osc-host');
      const portI = $('av-osc-port');
      const enableI = $('av-osc-enable');
      const status = $('av-osc-status');
      const refreshStatus = () => {
        if (!this.app?.osc) { status.textContent = '—'; return; }
        status.textContent = this.app.osc.enabled
          ? `On → ${this.app.osc.host}:${this.app.osc.port}`
          : 'Off';
      };
      hostI.onchange = () => {
        this.store.setOscTarget(hostI.value, null);
        this.app?.osc?.updateTarget(hostI.value, this.app.osc.port);
        refreshStatus();
      };
      portI.onchange = () => {
        this.store.setOscTarget(null, portI.value);
        this.app?.osc?.updateTarget(this.app.osc.host, portI.value);
        refreshStatus();
      };
      enableI.onchange = () => {
        this.app?.osc?.setEnabled(enableI.checked);
        // also turn on auto-send so prompt-feed for 'both' works
        if (enableI.checked) this.app?.osc?.setAutoSend(true);
        refreshStatus();
      };
      this._refreshOscStatus = refreshStatus;

      // Per-control fields
      const onPatch = (patch) => {
        if (!this.selectedVar) return;
        this.store.updateOverride(this.selectedVar, patch);
      };
      $('av-edit-label').oninput = (e) => onPatch({ label: e.target.value || undefined });
      $('av-edit-color').oninput = (e) => onPatch({ color: e.target.value });
      $('av-edit-color-clear').onclick = () => {
        $('av-edit-color').value = '#666666';
        onPatch({ color: undefined });
      };
      $('av-edit-group').oninput = (e) => onPatch({ group: e.target.value || undefined });
      $('av-edit-source').onchange = (e) => onPatch({ osc: { source: e.target.value } });
      $('av-edit-address').oninput = (e) => onPatch({ osc: { address: e.target.value || undefined } });
      $('av-edit-curve').onchange = (e) => onPatch({ osc: { curve: e.target.value } });
      $('av-edit-send').onchange = (e) => onPatch({ osc: { send: e.target.value } });

      const rangeMin = $('av-edit-range-min');
      const rangeMax = $('av-edit-range-max');
      const onRange = () => {
        const lo = parseFloat(rangeMin.value);
        const hi = parseFloat(rangeMax.value);
        if (Number.isFinite(lo) && Number.isFinite(hi)) onPatch({ osc: { range: [lo, hi] } });
      };
      rangeMin.onchange = onRange;
      rangeMax.onchange = onRange;

      // Preset autocomplete → fills address & range & curve & send
      const presetPick = $('av-preset-pick');
      const presetN = $('av-preset-N');
      const presetM = $('av-preset-M');
      const rowN = $('av-row-preset-N');
      const rowM = $('av-row-preset-M');
      const applyPreset = () => {
        const label = presetPick.value;
        if (!label) return;
        const preset = global.ResolumePresets?.find(label);
        if (!preset) return;
        const hasN = preset.template.includes('{N}');
        const hasM = preset.template.includes('{M}');
        rowN.style.display = hasN ? '' : 'none';
        rowM.style.display = hasM ? '' : 'none';
        const expanded = global.ResolumePresets.expand(preset.template, {
          N: parseInt(presetN.value, 10) || 1,
          M: parseInt(presetM.value, 10) || 1,
        });
        $('av-edit-address').value = expanded;
        rangeMin.value = preset.range[0];
        rangeMax.value = preset.range[1];
        $('av-edit-curve').value = preset.curve;
        $('av-edit-send').value = preset.send;
        onPatch({
          osc: {
            address: expanded,
            range: preset.range.slice(),
            curve: preset.curve,
            send: preset.send,
          },
        });
      };
      presetPick.onchange = applyPreset;
      presetN.onchange = applyPreset;
      presetM.onchange = applyPreset;

      $('av-test-send').onclick = () => this._testSend();
      $('av-clear-mapping').onclick = () => {
        if (this.selectedVar) {
          this.store.clearOverride(this.selectedVar);
          this._refresh();
        }
      };

      // Profile actions
      const profileSel = $('av-profile-select');
      profileSel.onchange = () => this.store.setActive(profileSel.value);
      $('av-profile-new').onclick = () => {
        const name = prompt('New profile name?');
        if (name && this.store.createProfile(name)) this.store.setActive(name);
      };
      $('av-profile-export').onclick = () => {
        const json = this.store.exportProfile();
        if (!json) return;
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${this.store.activeProfile().name}.av-profile.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      };
      const importInput = $('av-profile-import-file');
      $('av-profile-import').onclick = () => importInput.click();
      importInput.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const name = this.store.importProfile(text);
        if (!name) alert('Import failed — see console.');
        importInput.value = '';
      };
      $('av-profile-delete').onclick = () => {
        const name = this.store.activeProfile().name;
        if (confirm(`Delete profile "${name}"?`)) this.store.deleteProfile(name);
      };
    }

    _populatePresets() {
      const sel = this.drawer.querySelector('#av-preset-pick');
      const groups = global.ResolumePresets?.grouped() || {};
      for (const [category, items] of Object.entries(groups)) {
        const og = document.createElement('optgroup');
        og.label = category;
        for (const p of items) {
          const opt = document.createElement('option');
          opt.value = p.label;
          opt.textContent = p.label;
          og.appendChild(opt);
        }
        sel.appendChild(og);
      }
    }

    _setCollapsed(c) {
      this.drawer.classList.toggle('collapsed', c);
      this.handle.style.display = c ? '' : 'none';
    }

    selectVariable(varName) {
      this.selectedVar = varName;
      this._setCollapsed(false);
      this._refresh();
    }

    _refresh() {
      const $ = (id) => this.drawer.querySelector('#' + id);

      // OSC config
      const target = this.store.oscTarget();
      $('av-osc-host').value = target.host;
      $('av-osc-port').value = target.port;
      if (this.app?.osc) $('av-osc-enable').checked = this.app.osc.enabled;
      this._refreshOscStatus?.();

      // Profiles
      const profileSel = $('av-profile-select');
      const names = this.store.listProfiles();
      profileSel.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join('');
      profileSel.value = this.store.activeProfile().name;

      // Selected control
      const ctrl = $('av-inspector-control');
      if (!this.selectedVar) {
        ctrl.style.display = 'none';
        return;
      }
      ctrl.style.display = '';
      const ov = this.store.getOverride(this.selectedVar) || {};
      const osc = ov.osc || {};
      $('av-selected-name').textContent = this.selectedVar;
      $('av-edit-label').value = ov.label || '';
      $('av-edit-color').value = ov.color || '#666666';
      $('av-edit-group').value = ov.group || '';
      $('av-edit-source').value = osc.source || 'both';
      $('av-edit-address').value = osc.address || '';
      $('av-edit-range-min').value = (osc.range?.[0] ?? '');
      $('av-edit-range-max').value = (osc.range?.[1] ?? '');
      $('av-edit-curve').value = osc.curve || 'linear';
      $('av-edit-send').value = osc.send || 'float';
    }

    _testSend() {
      if (!this.selectedVar || !this.app) return;
      const variable = this.app.variables.find(v => v.name === this.selectedVar);
      if (!variable) return;
      const ov = this.store.getOverride(this.selectedVar) || {};
      const osc = ov.osc || variable.osc || {};
      if (!osc.address) { alert('No OSC address set.'); return; }
      const valueIdx = this.app.currentValues[variable.name];
      const total = variable.values.length;
      const norm = total > 1 ? valueIdx / (total - 1) : 0.5;
      const value = global.AVCurves.normToRange(norm, osc.range, osc.curve);
      const sendType = osc.send || 'float';
      if (sendType === 'trigger') {
        this.app.osc?.sendParam(osc.address, 1);
      } else if (sendType === 'int') {
        this.app.osc?.sendParam(osc.address, Math.round(value));
      } else {
        this.app.osc?.sendParam(osc.address, value);
      }
    }
  }

  global.AVInspector = AVInspector;
})(window);
