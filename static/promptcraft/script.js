/**
 * PromptCraft Sequencer — VST-Inspired Interactive Prototype
 * Kontakt/Serum-style UI with skeuomorphic knobs, LED displays,
 * XY pad, waveform viz, tabbed panels, and modulation matrix.
 */

// ─── Theme: apply early to prevent flash ───
(function initTheme() {
  const saved = localStorage.getItem('promptcraft-theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else if (!saved && window.matchMedia('(prefers-color-scheme: light)').matches) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

class PromptCraft {
  constructor() {
    this.bpm = 120;
    this.step = 0;
    this.steps = 16;
    this.playing = false;
    this.interval = null;
    this.direction = 1;
    this.adsr = { a: 15, d: 30, s: 70, r: 40 };

    this.vars = {
      style:    { values: ['cyberpunk','art nouveau','brutalist','vaporwave'], abbr: ['CYB','ART','BRT','VPW'], color: '#ff6b9d' },
      subject:  { values: ['cityscape','portrait','landscape','abstract'],    abbr: ['CTY','PRT','LND','ABS'], color: '#4ecdc4' },
      lighting: { values: ['neon','golden hour','moonlit','overcast'],        abbr: ['NEO','GLD','MON','OVC'], color: '#ffe66d' },
      mood:     { values: ['dystopian','ethereal','serene','chaotic'],        abbr: ['DYS','ETH','SER','CHA'], color: '#a78bfa' },
      color:    { values: ['magenta & teal','monochrome','warm sunset','acid green'], abbr: ['M&T','MON','SUN','ACD'], color: '#38bdf8' },
    };

    this.seqData = {};
    this.weightData = [];
    this.denoiseData = [];

    this.waveformCtx = null;
    this.waveformData = [];
    this._saveTimeout = null;
    this.promptTemplate = '{{style}} {{subject}} with {{lighting}}, {{color}}, {{mood}} atmosphere';
    this.colorPalette = ['#ff6b9d','#4ecdc4','#ffe66d','#a78bfa','#38bdf8','#f97316','#4ade80'];

    this.init();
  }

  init() {
    this.buildStepDots();
    this.buildSequencer();
    this.initWaveform();
    this.drawADSR();
    this.drawXYPad();
    this.bindTabs();
    this.bindTransport();
    this.bindBPM();
    this.bindModals();
    this.bindScope();
    this.bindChips();
    this.bindLocks();
    this.bindXYPad();
    this.bindFxPower();
    this.bindGlitchKnobs();
    this.bindMIDI();
    this.bindSwing();
    this.bindDeadControls();
    this.bindKnobDrag();
    this.addTooltips();
    this.bindImportExport();
    this.bindTemplateGen();
    this.bindThemeToggle();
    this.updateMacroKnobs();
    this.loadState();
  }

  // ─── Step Dots ───
  buildStepDots() {
    const container = document.getElementById('stepDots');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < this.steps; i++) {
      const dot = document.createElement('span');
      dot.className = 'sdot' + (i % 4 === 0 ? ' beat' : '');
      if (i === this.step) dot.classList.add('active');
      container.appendChild(dot);
    }
  }

  // ─── Build Sequencer Grid ───
  buildSequencer() {
    const headerCells = document.getElementById('stepHeaders');
    if (headerCells) {
      headerCells.innerHTML = '';
      for (let i = 0; i < this.steps; i++) {
        const h = document.createElement('div');
        h.className = 'step-hdr' + (i % 4 === 0 ? ' beat' : '');
        h.textContent = i + 1;
        headerCells.appendChild(h);
      }
    }

    const patterns = {
      style:    [0,0,1,1,2,2,3,3,0,-1,1,1,3,3,0,0],
      subject:  [0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3],
      lighting: [0,0,0,1,1,1,2,2,2,3,3,3,0,0,0,0],
      mood:     [0,0,1,1,1,2,2,3,3,3,0,0,0,1,1,2],
      color:    [0,0,0,0,0,0,1,1,1,1,2,2,2,3,3,3],
    };

    for (const [varName, varDef] of Object.entries(this.vars)) {
      const lane = document.getElementById(`lane-${varName}`);
      if (!lane) continue;
      lane.innerHTML = '';

      if (!this.seqData[varName] || this.seqData[varName].length !== this.steps) {
        const pattern = patterns[varName];
        this.seqData[varName] = new Array(this.steps).fill(-1).map((_, i) =>
          pattern ? (pattern[i % pattern.length] ?? -1) : -1
        );
      }

      for (let i = 0; i < this.steps; i++) {
        const cell = document.createElement('div');
        const valIdx = this.seqData[varName][i];
        cell.className = 'seq-cell' + (valIdx >= 0 ? ' on' : '');
        cell.textContent = valIdx >= 0 ? varDef.abbr[valIdx] : '\u2014';
        cell.dataset.step = i;
        cell.dataset.var = varName;
        cell.dataset.valIdx = valIdx;

        cell.addEventListener('click', () => this.toggleCell(cell, varName));
        cell.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.cycleCell(cell, varName);
        });

        lane.appendChild(cell);
      }
    }

    if (this.weightData.length !== this.steps) {
      const defaults = [0.8,0.9,1.0,0.7,0.5,0.6,0.8,1.0,0.9,0.7,0.5,0.6,0.8,1.0,0.9,0.7];
      this.weightData = new Array(this.steps).fill(0).map((_, i) => defaults[i % defaults.length]);
    }
    this.buildVelocityLane('lane-weight', this.weightData, 'weight');

    if (this.denoiseData.length !== this.steps) {
      const defaults = [0.6,0.6,0.7,0.7,0.8,0.8,0.5,0.5,0.9,0.9,0.6,0.6,0.7,0.7,0.8,0.8];
      this.denoiseData = new Array(this.steps).fill(0).map((_, i) => defaults[i % defaults.length]);
    }
    this.buildVelocityLane('lane-denoise', this.denoiseData, 'denoise');
  }

  buildVelocityLane(laneId, data, type) {
    const lane = document.getElementById(laneId);
    if (!lane) return;
    lane.innerHTML = '';
    for (let i = 0; i < this.steps; i++) {
      const cell = document.createElement('div');
      cell.className = 'seq-cell';
      cell.dataset.step = i;

      const bar = document.createElement('div');
      bar.className = `vel-bar ${type}`;
      bar.style.height = `${data[i] * 100}%`;
      cell.appendChild(bar);

      const adjust = (e) => {
        const rect = cell.getBoundingClientRect();
        const y = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        data[i] = y;
        bar.style.height = `${y * 100}%`;
      };
      cell.addEventListener('mousedown', (e) => {
        adjust(e);
        const move = (e2) => adjust(e2);
        const up = () => {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          this.debounceSave();
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });

      lane.appendChild(cell);
    }
  }

  rebuildVelocityBars(laneId, data) {
    const lane = document.getElementById(laneId);
    if (!lane) return;
    const cells = lane.children;
    for (let i = 0; i < cells.length && i < data.length; i++) {
      const bar = cells[i].querySelector('.vel-bar');
      if (bar) bar.style.height = `${data[i] * 100}%`;
    }
  }

  toggleCell(cell, varName) {
    if (this.isLocked(varName)) return;
    const step = parseInt(cell.dataset.step);
    const idx = parseInt(cell.dataset.valIdx);
    if (idx >= 0) {
      this.seqData[varName][step] = -1;
      cell.dataset.valIdx = -1;
      cell.classList.remove('on');
      cell.textContent = '\u2014';
    } else {
      this.seqData[varName][step] = 0;
      cell.dataset.valIdx = 0;
      cell.classList.add('on');
      cell.textContent = this.vars[varName].abbr[0];
    }
    cell.classList.add('flash');
    setTimeout(() => cell.classList.remove('flash'), 200);
    this.debounceSave();
  }

  cycleCell(cell, varName) {
    if (this.isLocked(varName)) return;
    const step = parseInt(cell.dataset.step);
    const varDef = this.vars[varName];
    let idx = parseInt(cell.dataset.valIdx);
    idx = (idx + 1) % varDef.values.length;
    this.seqData[varName][step] = idx;
    cell.dataset.valIdx = idx;
    cell.classList.add('on');
    cell.textContent = varDef.abbr[idx];
    cell.classList.add('flash');
    setTimeout(() => cell.classList.remove('flash'), 200);
    this.debounceSave();
  }

  // ─── Transport ───
  bindTransport() {
    document.getElementById('btnPlay').addEventListener('click', () => this.togglePlay());
    document.getElementById('btnStop').addEventListener('click', () => {
      this.stop();
      const btn = document.getElementById('btnStop');
      btn.classList.add('stop-flash');
      setTimeout(() => btn.classList.remove('stop-flash'), 300);
    });
    document.getElementById('btnRecord')?.addEventListener('click', () => {
      document.getElementById('btnRecord').classList.toggle('armed');
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.target.matches('input, textarea, select')) {
        e.preventDefault();
        this.togglePlay();
      }
    });
  }

  togglePlay() {
    this.playing ? this.pause() : this.play();
  }

  play() {
    this.playing = true;
    this.direction = 1;
    document.getElementById('btnPlay').classList.add('active');
    const ms = (60000 / this.bpm) / 4;
    this.interval = setInterval(() => this.advance(), ms);
  }

  pause() {
    this.playing = false;
    document.getElementById('btnPlay').classList.remove('active');
    clearInterval(this.interval);
  }

  stop() {
    this.pause();
    this.step = 0;
    this.direction = 1;
    this.updatePlayhead();
  }

  advance() {
    const loopMode = document.getElementById('loopMode').value;

    if (loopMode === 'pingpong') {
      this.step += this.direction;
      if (this.step >= this.steps - 1) {
        this.step = this.steps - 1;
        this.direction = -1;
      } else if (this.step <= 0) {
        this.step = 0;
        this.direction = 1;
      }
    } else {
      this.step = this.step + 1;
      if (this.step >= this.steps) {
        if (loopMode === 'oneshot') {
          this.stop();
          return;
        }
        this.step = 0;
      }
    }

    this.updatePlayhead();
    this.updateLivePrompt();
    this.pushWaveformSample();
  }

  updatePlayhead() {
    document.querySelectorAll('.seq-cell.playhead').forEach(c => c.classList.remove('playhead'));
    document.querySelectorAll('.seq-cells').forEach(lane => {
      const cells = lane.children;
      if (cells[this.step]) cells[this.step].classList.add('playhead');
    });

    document.querySelectorAll('.step-hdr.playhead-on').forEach(h => h.classList.remove('playhead-on'));
    const headers = document.querySelectorAll('#stepHeaders .step-hdr');
    if (headers[this.step]) headers[this.step].classList.add('playhead-on');

    document.querySelectorAll('.sdot.active').forEach(d => d.classList.remove('active'));
    const dots = document.querySelectorAll('.sdot');
    if (dots[this.step]) dots[this.step].classList.add('active');

    document.getElementById('stepLED').textContent = String(this.step + 1).padStart(2, '0');
    const ms = (this.step * (60000 / this.bpm) / 4) / 1000;
    const m = Math.floor(ms / 60).toString().padStart(2, '0');
    const s = (ms % 60).toFixed(0).padStart(2, '0');
    document.getElementById('timeLED').textContent = `${m}:${s}`;
  }

  updateLivePrompt() {
    for (const [varName, varDef] of Object.entries(this.vars)) {
      if (this.isLocked(varName)) continue;
      const idx = this.seqData[varName]?.[this.step];
      if (idx >= 0) {
        const el = document.querySelector(`.pvar[data-var="${varName}"]`);
        if (el) {
          const newText = varDef.values[idx];
          if (el.textContent !== newText) {
            el.textContent = newText;
            el.style.transition = 'none';
            el.style.filter = 'brightness(1.8)';
            requestAnimationFrame(() => {
              el.style.transition = 'filter 0.4s';
              el.style.filter = 'brightness(1)';
            });
          }
        }
      }
    }
  }

  // ─── Waveform Visualization ───
  initWaveform() {
    const canvas = document.getElementById('promptWaveform');
    if (!canvas) return;
    this.waveformCtx = canvas.getContext('2d');
    // Idle noise pattern instead of flat zeros
    this.waveformData = [];
    for (let i = 0; i < canvas.width; i++) {
      this.waveformData.push(0.45 + Math.sin(i * 0.05) * 0.05 + Math.random() * 0.03);
    }
    this.drawWaveform();
  }

  pushWaveformSample() {
    const weight = this.weightData[this.step] || 0.5;
    this.waveformData.push(weight);
    if (this.waveformData.length > 260) this.waveformData.shift();
    this.drawWaveform();
  }

  drawWaveform() {
    const ctx = this.waveformCtx;
    if (!ctx) return;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = this._getThemeColor('--b1');
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const purple = this._getThemeColor('--purple');
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, this._hexToRgba(purple, 0.2));
    grad.addColorStop(1, this._hexToRgba(purple, 0.8));
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < this.waveformData.length; i++) {
      const x = i;
      const y = h - (this.waveformData[i] * h * 0.8 + h * 0.1);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    const fillGrad = ctx.createLinearGradient(0, 0, 0, h);
    fillGrad.addColorStop(0, this._hexToRgba(purple, 0.1));
    fillGrad.addColorStop(1, this._hexToRgba(purple, 0.02));
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fillStyle = fillGrad;
    ctx.fill();
  }

  // ─── ADSR ───
  drawADSR() {
    const canvas = document.getElementById('adsrCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const pad = 16;

    ctx.clearRect(0, 0, w, h);

    const green = this._getThemeColor('--green');
    const yellow = this._getThemeColor('--yellow');
    const cyan = this._getThemeColor('--cyan');
    const pink = this._getThemeColor('--pink');

    ctx.strokeStyle = this._getThemeColor('--s3');
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 6; i++) {
      const y = pad + (i * (h - 2 * pad) / 5);
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
    }

    const { a, d, s, r } = this.adsr;
    const total = a + d + 40 + r;
    const uw = w - 2 * pad, uh = h - 2 * pad;
    const aw = (a / total) * uw, dw = (d / total) * uw, sw = (40 / total) * uw, rw = (r / total) * uw;
    const sl = 1 - (s / 100);

    const pts = [
      [pad, h - pad],
      [pad + aw, pad],
      [pad + aw + dw, pad + sl * uh],
      [pad + aw + dw + sw, pad + sl * uh],
      [pad + aw + dw + sw + rw, h - pad],
    ];

    const fg = ctx.createLinearGradient(0, 0, w, 0);
    fg.addColorStop(0, this._hexToRgba(green, 0.15));
    fg.addColorStop(0.3, this._hexToRgba(yellow, 0.15));
    fg.addColorStop(0.6, this._hexToRgba(cyan, 0.15));
    fg.addColorStop(1, this._hexToRgba(pink, 0.15));
    ctx.fillStyle = fg;
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(...p) : ctx.lineTo(...p));
    ctx.lineTo(w - pad, h - pad);
    ctx.lineTo(pad, h - pad);
    ctx.closePath();
    ctx.fill();

    const segColors = [green, yellow, cyan, pink];
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = segColors[i];
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(...pts[i]);
      ctx.lineTo(...pts[i + 1]);
      ctx.stroke();
    }

    const dotColors = [green, green, yellow, cyan, pink];
    pts.forEach((p, i) => {
      ctx.fillStyle = dotColors[i];
      ctx.beginPath();
      ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = this._isLightMode() ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    const labels = [
      { t: 'ATTACK', x: pad + aw / 2, c: green },
      { t: 'DECAY', x: pad + aw + dw / 2, c: yellow },
      { t: 'SUSTAIN', x: pad + aw + dw + sw / 2, c: cyan },
      { t: 'RELEASE', x: pad + aw + dw + sw + rw / 2, c: pink },
    ];
    labels.forEach(l => {
      ctx.fillStyle = l.c;
      ctx.globalAlpha = 0.5;
      ctx.fillText(l.t, l.x, h - 4);
      ctx.globalAlpha = 1;
    });
  }

  // ─── XY Pad ───
  drawXYPad() {
    const canvas = document.getElementById('xyCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = this._getThemeColor('--s3');
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 6; i++) {
      const p = (i / 6) * w;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke();
    }

    ctx.strokeStyle = this._getThemeColor('--b2');
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.setLineDash([]);

    const purple = this._getThemeColor('--purple');
    const grd = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, this._hexToRgba(purple, 0.06));
    grd.addColorStop(1, this._hexToRgba(purple, 0));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }

  bindXYPad() {
    const pad = document.getElementById('xyPad');
    const cursor = document.getElementById('xyCursor');
    if (!pad || !cursor) return;

    let dragging = false;
    const move = (e) => {
      const rect = pad.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      cursor.style.left = `${x * 100}%`;
      cursor.style.top = `${y * 100}%`;
    };

    pad.addEventListener('mousedown', (e) => { dragging = true; move(e); });
    document.addEventListener('mousemove', (e) => { if (dragging) move(e); });
    document.addEventListener('mouseup', () => { dragging = false; });
  }

  // ─── Tabs ───
  bindTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const target = document.getElementById(`tab-${tab.dataset.tab}`);
        if (target) target.classList.add('active');

        if (tab.dataset.tab === 'envelope') this.drawADSR();
        if (tab.dataset.tab === 'modmatrix') this.drawXYPad();

        this.debounceSave();
      });
    });
  }

  // ─── BPM ───
  bindBPM() {
    const led = document.querySelector('#bpmLED .led-value');
    const set = (v) => {
      this.bpm = Math.max(20, Math.min(300, v));
      led.textContent = this.bpm;
      if (this.playing) {
        clearInterval(this.interval);
        this.interval = setInterval(() => this.advance(), (60000 / this.bpm) / 4);
      }
      this.debounceSave();
    };
    document.getElementById('bpmDown').addEventListener('click', () => set(this.bpm - 1));
    document.getElementById('bpmUp').addEventListener('click', () => set(this.bpm + 1));
  }

  // ─── Modals ───
  bindModals() {
    const modal = document.getElementById('settingsModal');
    document.getElementById('btnSettings').addEventListener('click', () => modal.classList.remove('hidden'));
    document.getElementById('btnCloseSettings').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
  }

  // ─── Scope Connection ───
  bindScope() {
    document.getElementById('btnConnectScope').addEventListener('click', () => {
      const dot = document.querySelector('#scopeConn .conn-dot');
      const btn = document.getElementById('btnConnectScope');
      if (dot.classList.contains('offline')) {
        dot.classList.replace('offline', 'online');
        btn.textContent = 'DISCONNECT';
      } else {
        dot.classList.replace('online', 'offline');
        btn.textContent = 'CONNECT';
      }
    });
  }

  // ─── Variable Chips ───
  bindChips() {
    document.querySelectorAll('.var-strip').forEach(strip => {
      const chips = strip.querySelectorAll('.chip');
      chips.forEach(chip => {
        chip.addEventListener('click', () => {
          chips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          const varName = strip.dataset.var;
          const el = document.querySelector(`.pvar[data-var="${varName}"]`);
          if (el) el.textContent = chip.textContent;
        });
      });
    });
  }

  // ─── Variable Locks ───
  isLocked(varName) {
    return this.vars[varName]?.locked || false;
  }

  bindLocks() {
    document.querySelectorAll('.vs-lock').forEach(btn => {
      btn.addEventListener('click', () => {
        const varName = btn.dataset.var;
        const varDef = this.vars[varName];
        if (!varDef) return;

        varDef.locked = !varDef.locked;
        btn.classList.toggle('locked', varDef.locked);
        btn.innerHTML = varDef.locked ? '&#x1F512;' : '&#x1F513;';
        btn.title = varDef.locked ? 'Unlock variable' : 'Lock variable';

        // Toggle locked class on the strip
        const strip = btn.closest('.var-strip');
        if (strip) strip.classList.toggle('locked', varDef.locked);

        // Toggle locked class on corresponding sequencer row
        const seqRow = document.querySelector(`.seq-row[data-var="${varName}"]`);
        if (seqRow) seqRow.classList.toggle('locked', varDef.locked);

        this.debounceSave();
      });
    });
  }

  // ─── FX Power toggles ───
  bindFxPower() {
    document.querySelectorAll('.fxm-power').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('on');
        btn.closest('.fx-module').classList.toggle('on');
      });
    });
  }

  // ─── Glitch Engine ───
  static GLITCH_STYLES = [
    { name: 'ZALGO', desc: 'Combining diacritical chaos' },
    { name: 'SUPPORTIVE', desc: 'Encouraging messages inserted' },
    { name: 'FOOTNOTES', desc: 'Unicode superscript conversion' },
    { name: 'STUTTER', desc: 'Repetitive syllable glitch' },
    { name: 'REDACTED', desc: 'Censored block characters' },
    { name: 'AESTHETIC', desc: 'Fullwidth spaced unicode' },
    { name: 'VOID', desc: 'Nihilistic token injection' },
    { name: 'WHISPER', desc: 'Soft parenthetical murmurs' },
    { name: 'ECHO', desc: 'Decaying word repetition' },
    { name: 'CORRUPT', desc: 'Homoglyph character swap' }
  ];

  static COMBINING_MARKS = [
    '\u0300','\u0301','\u0302','\u0303','\u0304','\u0305','\u0306','\u0307',
    '\u0308','\u030A','\u030B','\u030C','\u030D','\u030E','\u030F','\u0310',
    '\u0311','\u0312','\u0313','\u0314','\u0315','\u031A','\u031B','\u0320',
    '\u0321','\u0322','\u0323','\u0324','\u0325','\u0326','\u0327','\u0328',
    '\u0329','\u032A','\u032B','\u032C','\u032D','\u032E','\u032F','\u0330',
    '\u0331','\u0332','\u0333','\u0334','\u0335','\u0336','\u0337','\u0338',
    '\u0339','\u033A','\u033B','\u033C','\u033D','\u033E','\u033F','\u0340',
    '\u0341','\u0342','\u0343','\u0344','\u0345','\u0346','\u0347','\u0348',
    '\u0349','\u034A','\u034B','\u034C','\u034D','\u034E','\u034F','\u0350',
    '\u0351','\u0352','\u0353','\u0354','\u0355','\u0356','\u0357','\u0358',
    '\u0359','\u035A','\u035B','\u035C','\u035D','\u035E','\u035F','\u0360',
    '\u0361','\u0362'
  ];

  static SUPERSCRIPT_MAP = {
    'a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ',
    'i':'ⁱ','j':'ʲ','k':'ᵏ','l':'ˡ','m':'ᵐ','n':'ⁿ','o':'ᵒ','p':'ᵖ',
    'r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ','x':'ˣ','y':'ʸ',
    'z':'ᶻ',' ':' '
  };

  static HOMOGLYPHS = {
    'a':'α','b':'Ь','c':'с','d':'ԁ','e':'е','g':'ɡ','h':'һ','i':'і',
    'j':'ј','k':'κ','l':'ӏ','m':'м','n':'ո','o':'о','p':'р','q':'ԛ',
    'r':'г','s':'ѕ','t':'τ','u':'υ','v':'ν','w':'ω','x':'х','y':'у','z':'ᴢ'
  };

  static SUPPORT_MSGS = [
    'you are enough', 'keep going', 'you matter', 'breathe deeply',
    'this is beautiful', 'you belong here', 'trust the process',
    'be gentle with yourself', 'you are creating something wonderful',
    'rest if you need to', 'your art matters', 'embrace the chaos',
    'you are not alone', 'it will be okay', 'take your time',
    'progress not perfection', 'you are worthy', 'stay curious'
  ];

  static VOID_TOKENS = [
    'void', 'null', 'entropy', 'static', 'nothing', 'absence',
    'emptiness', 'dissolution', 'decay', 'silence', 'forgotten',
    'erased', 'lost signal', 'end of transmission', '---',
    '...', '???', '[REDACTED]', '[DATA LOST]', '[CORRUPTED]'
  ];

  static WHISPER_WRAPS = [
    'softly', 'gently', 'barely visible', 'fading', 'almost gone',
    'dissolving', 'whispered', 'half-remembered', 'dreaming of',
    'echoes of', 'traces of', 'remnants of', 'ghost of'
  ];

  getGlitchStyleIndex() {
    const knob = document.getElementById('glitchStyleKnob');
    if (!knob) return 0;
    const val = parseFloat(knob.dataset.value) || 0;
    return Math.round(val * (PromptCraft.GLITCH_STYLES.length - 1));
  }

  getGlitchEffect() {
    const knob = document.getElementById('glitchEffectKnob');
    if (!knob) return 0;
    return parseFloat(knob.dataset.value) || 0;
  }

  updateGlitchStyleDisplay() {
    const idx = this.getGlitchStyleIndex();
    const style = PromptCraft.GLITCH_STYLES[idx];
    const nameEl = document.getElementById('glitchStyleName');
    if (nameEl) nameEl.textContent = style.name;

    const preview = document.getElementById('glitchPreview');
    if (preview) {
      const effect = this.getGlitchEffect();
      if (effect < 0.01) {
        preview.textContent = '';
      } else {
        const sample = 'cyberpunk cityscape';
        preview.textContent = this.applyGlitchStyle(sample, idx, effect);
      }
    }
  }

  applyGlitchStyle(text, styleIdx, effect) {
    if (effect < 0.01) return text;
    switch (styleIdx) {
      case 0: return this._glitchZalgo(text, effect);
      case 1: return this._glitchSupportive(text, effect);
      case 2: return this._glitchFootnotes(text, effect);
      case 3: return this._glitchStutter(text, effect);
      case 4: return this._glitchRedacted(text, effect);
      case 5: return this._glitchAesthetic(text, effect);
      case 6: return this._glitchVoid(text, effect);
      case 7: return this._glitchWhisper(text, effect);
      case 8: return this._glitchEcho(text, effect);
      case 9: return this._glitchCorrupt(text, effect);
      default: return text;
    }
  }

  _glitchZalgo(text, effect) {
    const marks = PromptCraft.COMBINING_MARKS;
    const maxMarks = Math.ceil(effect * 6);
    return [...text].map(ch => {
      if (ch === ' ' || Math.random() > effect) return ch;
      const n = 1 + Math.floor(Math.random() * maxMarks);
      let out = ch;
      for (let i = 0; i < n; i++) out += marks[Math.floor(Math.random() * marks.length)];
      return out;
    }).join('');
  }

  _glitchSupportive(text, effect) {
    const msgs = PromptCraft.SUPPORT_MSGS;
    const words = text.split(/\s+/);
    const result = [];
    for (const w of words) {
      result.push(w);
      if (Math.random() < effect * 0.6) {
        const msg = msgs[Math.floor(Math.random() * msgs.length)];
        result.push(`(${msg})`);
      }
    }
    return result.join(' ');
  }

  _glitchFootnotes(text, effect) {
    const map = PromptCraft.SUPERSCRIPT_MAP;
    return [...text].map(ch => {
      if (Math.random() > effect) return ch;
      return map[ch.toLowerCase()] || ch;
    }).join('');
  }

  _glitchStutter(text, effect) {
    return text.split(/\s+/).map(word => {
      if (word.length < 3 || Math.random() > effect) return word;
      const stLen = Math.min(3, Math.ceil(word.length * 0.4));
      const prefix = word.substring(0, stLen);
      const reps = 1 + Math.floor(effect * 3);
      return (prefix + '-').repeat(reps) + word;
    }).join(' ');
  }

  _glitchRedacted(text, effect) {
    const blocks = ['█', '▓', '▒', '░', '■', '▮'];
    return [...text].map(ch => {
      if (ch === ' ') return ' ';
      if (Math.random() < effect * 0.7) return blocks[Math.floor(Math.random() * blocks.length)];
      return ch;
    }).join('');
  }

  _glitchAesthetic(text, effect) {
    const words = text.split(/\s+/);
    return words.map(word => {
      if (Math.random() > effect) return word;
      return [...word].map(ch => {
        const code = ch.charCodeAt(0);
        if (code >= 33 && code <= 126) return String.fromCharCode(code + 0xFEE0);
        return ch;
      }).join(effect > 0.5 ? ' ' : '');
    }).join(effect > 0.5 ? '  ' : ' ');
  }

  _glitchVoid(text, effect) {
    const tokens = PromptCraft.VOID_TOKENS;
    const words = text.split(/\s+/);
    const result = [];
    for (const w of words) {
      if (Math.random() < effect * 0.4) {
        result.push(tokens[Math.floor(Math.random() * tokens.length)]);
      }
      if (Math.random() > effect * 0.3) {
        result.push(w);
      } else {
        result.push(tokens[Math.floor(Math.random() * tokens.length)]);
      }
    }
    return result.join(' ');
  }

  _glitchWhisper(text, effect) {
    const wraps = PromptCraft.WHISPER_WRAPS;
    const words = text.split(/\s+/);
    return words.map(word => {
      if (Math.random() > effect) return word;
      const wrapper = wraps[Math.floor(Math.random() * wraps.length)];
      if (Math.random() > 0.5) return `(${wrapper} ${word})`;
      return `(${word}, ${wrapper})`;
    }).join(' ');
  }

  _glitchEcho(text, effect) {
    const words = text.split(/\s+/);
    const result = [];
    for (const word of words) {
      result.push(word);
      if (Math.random() < effect * 0.6) {
        const echoes = 1 + Math.floor(effect * 2);
        for (let i = 0; i < echoes; i++) {
          if (Math.random() > 0.5) {
            result.push(word.toLowerCase());
          } else {
            result.push([...word.toLowerCase()].join(' '));
          }
        }
      }
    }
    return result.join(' ');
  }

  _glitchCorrupt(text, effect) {
    const homo = PromptCraft.HOMOGLYPHS;
    return [...text].map(ch => {
      if (ch === ' ') return ' ';
      if (Math.random() > effect * 0.8) return ch;
      return homo[ch.toLowerCase()] || ch;
    }).join('');
  }

  bindGlitchKnobs() {
    const styleKnob = document.getElementById('glitchStyleKnob');
    const effectKnob = document.getElementById('glitchEffectKnob');
    if (styleKnob) {
      const obs = new MutationObserver(() => this.updateGlitchStyleDisplay());
      obs.observe(styleKnob, { attributes: true, attributeFilter: ['data-value'] });
    }
    if (effectKnob) {
      const obs = new MutationObserver(() => this.updateGlitchStyleDisplay());
      obs.observe(effectKnob, { attributes: true, attributeFilter: ['data-value'] });
    }
    this.updateGlitchStyleDisplay();
  }

  // ─── Swing display ───
  bindSwing() {
    const slider = document.getElementById('swingSlider');
    const val = document.getElementById('swingVal');
    if (slider && val) {
      slider.addEventListener('input', () => {
        val.textContent = `${slider.value}%`;
      });
    }
  }

  // ─── Dead Controls ───
  bindDeadControls() {
    const btnRand = document.getElementById('btnRandomize');
    if (btnRand) btnRand.addEventListener('click', () => this.randomize());

    const btnClear = document.getElementById('btnClear');
    if (btnClear) btnClear.addEventListener('click', () => this.clearAll());

    const seqSteps = document.getElementById('seqSteps');
    if (seqSteps) {
      seqSteps.addEventListener('change', (e) => {
        this.steps = parseInt(e.target.value);
        this.step = 0;
        for (const varName of Object.keys(this.seqData)) {
          this.seqData[varName] = null;
        }
        this.weightData = [];
        this.denoiseData = [];
        this.buildStepDots();
        this.buildSequencer();
        this.updatePlayhead();
        this.debounceSave();
      });
    }

    const btnAdd = document.getElementById('btnAddVar');
    if (btnAdd) btnAdd.addEventListener('click', () => this.addVariable());
  }

  randomize() {
    for (const [varName, varDef] of Object.entries(this.vars)) {
      if (this.isLocked(varName)) continue;
      const lane = document.getElementById(`lane-${varName}`);
      if (!lane) continue;
      const cells = lane.children;
      for (let i = 0; i < cells.length; i++) {
        const roll = Math.random();
        if (roll < 0.12) {
          this.seqData[varName][i] = -1;
          cells[i].dataset.valIdx = -1;
          cells[i].classList.remove('on');
          cells[i].textContent = '\u2014';
        } else {
          const idx = Math.floor(Math.random() * varDef.values.length);
          this.seqData[varName][i] = idx;
          cells[i].dataset.valIdx = idx;
          cells[i].classList.add('on');
          cells[i].textContent = varDef.abbr[idx];
        }
        cells[i].classList.add('flash');
        setTimeout(() => cells[i].classList.remove('flash'), 200);
      }
    }

    for (let i = 0; i < this.weightData.length; i++) {
      this.weightData[i] = 0.3 + Math.random() * 0.7;
    }
    this.rebuildVelocityBars('lane-weight', this.weightData);

    for (let i = 0; i < this.denoiseData.length; i++) {
      this.denoiseData[i] = 0.2 + Math.random() * 0.8;
    }
    this.rebuildVelocityBars('lane-denoise', this.denoiseData);
    this.debounceSave();
  }

  clearAll() {
    for (const [varName] of Object.entries(this.vars)) {
      if (this.isLocked(varName)) continue;
      const lane = document.getElementById(`lane-${varName}`);
      if (!lane) continue;
      const cells = lane.children;
      for (let i = 0; i < cells.length; i++) {
        this.seqData[varName][i] = -1;
        cells[i].dataset.valIdx = -1;
        cells[i].classList.remove('on');
        cells[i].textContent = '\u2014';
        cells[i].classList.add('flash');
        setTimeout(() => cells[i].classList.remove('flash'), 200);
      }
    }
    for (let i = 0; i < this.weightData.length; i++) this.weightData[i] = 0.5;
    this.rebuildVelocityBars('lane-weight', this.weightData);
    for (let i = 0; i < this.denoiseData.length; i++) this.denoiseData[i] = 0.5;
    this.rebuildVelocityBars('lane-denoise', this.denoiseData);
    this.debounceSave();
  }

  addVariable() {
    const name = prompt('Variable name:');
    if (!name || !name.trim()) return;
    const key = name.trim().toLowerCase().replace(/\s+/g, '_');
    if (this.vars[key]) return;

    const colors = ['#ff6b9d','#4ecdc4','#ffe66d','#a78bfa','#38bdf8','#f97316','#4ade80'];
    const color = colors[Object.keys(this.vars).length % colors.length];

    this.vars[key] = {
      values: ['option A','option B','option C','option D'],
      abbr: ['A','B','C','D'],
      color: color
    };

    const seqWrap = document.querySelector('.sequencer-wrap');
    const firstVelocity = seqWrap.querySelector('.velocity-row');

    const row = document.createElement('div');
    row.className = 'seq-row';
    row.dataset.var = key;
    row.dataset.color = color;
    row.innerHTML = `<div class="seq-label"><span class="sl-dot" style="--c:${color}"></span>${name.trim()}</div><div class="seq-cells" id="lane-${key}"></div>`;
    seqWrap.insertBefore(row, firstVelocity);

    this.seqData[key] = new Array(this.steps).fill(-1);
    const lane = document.getElementById(`lane-${key}`);
    for (let i = 0; i < this.steps; i++) {
      const cell = document.createElement('div');
      cell.className = 'seq-cell';
      cell.textContent = '\u2014';
      cell.dataset.step = i;
      cell.dataset.var = key;
      cell.dataset.valIdx = -1;
      cell.addEventListener('click', () => this.toggleCell(cell, key));
      cell.addEventListener('contextmenu', (e) => { e.preventDefault(); this.cycleCell(cell, key); });
      lane.appendChild(cell);
    }

    const varBanks = document.getElementById('varBanksSection');
    const strip = document.createElement('div');
    strip.className = 'var-strip';
    strip.dataset.var = key;
    strip.innerHTML = `
      <div class="vs-header">
        <span class="vs-dot" style="--c:${color}"></span>
        <span class="vs-name">${name.trim()}</span>
        <div class="mini-knob" data-value="0.5" data-color="${color}">
          <svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" class="mnk-track"/><circle cx="14" cy="14" r="11" class="mnk-fill"/></svg>
        </div>
      </div>
      <div class="vs-chips">
        <button class="chip active">option A</button>
        <button class="chip">option B</button>
        <button class="chip">option C</button>
        <button class="chip">option D</button>
      </div>`;
    varBanks.appendChild(strip);

    this.bindChips();
    this.updateMacroKnobs();
  }

  // ─── Template Import / Export ───
  bindImportExport() {
    const fileInput = document.getElementById('templateFileInput');

    document.getElementById('btnImport')?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target.result);
          this.importTemplate(data);
        } catch (err) {
          alert('Invalid template file.');
        }
      };
      reader.readAsText(file);
      fileInput.value = '';
    });

    document.getElementById('btnExport')?.addEventListener('click', () => {
      this.exportTemplate();
    });
  }

  importTemplate(templateData) {
    // Normalize: handle both old flat-string and new {text,weight} formats
    const normalized = this._normalizeTemplate(JSON.parse(JSON.stringify(templateData)));

    this.promptTemplate = normalized.promptTemplate || '';
    this.vars = {};
    this.seqData = {};

    (normalized.variables || []).forEach((v, i) => {
      const key = v.name;
      const values = v.values.map(val => typeof val === 'object' ? val.text : String(val));
      const abbrs = values.map(val => this._generateAbbr(val));
      const color = this.colorPalette[i % this.colorPalette.length];

      this.vars[key] = {
        values: values,
        abbr: abbrs,
        color: color,
        featureName: v.feature_name || v.name
      };
    });

    // If template has PromptCraft sequencer state, restore it
    if (templateData._promptcraft) {
      const pc = templateData._promptcraft;
      if (pc.steps) { this.steps = pc.steps; document.getElementById('seqSteps').value = pc.steps; }
      if (pc.bpm) { this.bpm = pc.bpm; document.querySelector('#bpmLED .led-value').textContent = pc.bpm; }
      if (pc.seqData) this.seqData = pc.seqData;
      if (pc.weightData) this.weightData = pc.weightData;
      if (pc.denoiseData) this.denoiseData = pc.denoiseData;
      if (pc.adsr) this.adsr = pc.adsr;
    }

    this.weightData = [];
    this.denoiseData = [];

    this._rebuildSequencerHTML();
    this._rebuildSidebarStrips();
    this.buildStepDots();
    this.buildSequencer();
    this.renderPromptTemplate();
    this.bindChips();
    this.bindKnobDrag();
    this.addTooltips();
    this.updateMacroKnobs();
    this.updatePlayhead();

    // Update preset name
    const presetName = document.querySelector('.preset-name');
    if (presetName) {
      const name = this.promptTemplate.substring(0, 30) || 'Imported Template';
      presetName.textContent = name + (this.promptTemplate.length > 30 ? '...' : '');
    }

    this.debounceSave();
  }

  exportTemplate() {
    const template = {
      promptTemplate: this.promptTemplate || this._buildDefaultPromptTemplate(),
      variables: Object.entries(this.vars).map(([name, varDef]) => ({
        name: name,
        feature_name: varDef.featureName || name,
        values: varDef.values.map(text => ({ text: text, weight: 1 }))
      })),
      _promptcraft: {
        steps: this.steps,
        bpm: this.bpm,
        seqData: this.seqData,
        weightData: this.weightData,
        denoiseData: this.denoiseData,
        adsr: this.adsr
      }
    };

    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'promptcraft-template.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  renderPromptTemplate() {
    const display = document.getElementById('livePromptDisplay');
    if (!display || !this.promptTemplate) return;

    const parts = this.promptTemplate.split(/(\{\{[^}]+\}\})/g);
    let html = '';
    for (const part of parts) {
      const match = part.match(/^\{\{([^}]+)\}\}$/);
      if (match) {
        const varName = match[1];
        const varDef = this.vars[varName];
        const currentVal = varDef ? varDef.values[0] : varName;
        html += `<span class="pvar" data-var="${varName}" style="color:${varDef?.color || 'var(--t1)'};background:${varDef ? varDef.color + '1f' : 'transparent'}">${currentVal}</span>`;
      } else {
        html += part;
      }
    }
    display.innerHTML = html;
  }

  _rebuildSequencerHTML() {
    const seqWrap = document.querySelector('.sequencer-wrap');
    if (!seqWrap) return;

    // Remove existing variable lanes (keep header + velocity rows)
    seqWrap.querySelectorAll('.seq-row:not(.header-row):not(.velocity-row)').forEach(r => r.remove());

    const firstVelocity = seqWrap.querySelector('.velocity-row');

    for (const [varName, varDef] of Object.entries(this.vars)) {
      const row = document.createElement('div');
      row.className = 'seq-row' + (varDef.locked ? ' locked' : '');
      row.dataset.var = varName;
      row.dataset.color = varDef.color;
      const displayName = varDef.featureName || varName;
      row.innerHTML = `<div class="seq-label"><span class="sl-dot" style="--c:${varDef.color}"></span>${displayName}</div><div class="seq-cells" id="lane-${varName}"></div>`;
      seqWrap.insertBefore(row, firstVelocity);
    }
  }

  _rebuildSidebarStrips() {
    const varBanks = document.getElementById('varBanksSection');
    if (!varBanks) return;

    varBanks.querySelectorAll('.var-strip').forEach(s => s.remove());

    let ccIndex = 1;
    for (const [varName, varDef] of Object.entries(this.vars)) {
      const strip = document.createElement('div');
      strip.className = 'var-strip';
      strip.dataset.var = varName;

      const chipsHtml = varDef.values.map((v, i) =>
        `<button class="chip${i === 0 ? ' active' : ''}">${v}</button>`
      ).join('');

      const displayName = varDef.featureName || varName;
      const isLocked = varDef.locked || false;
      strip.innerHTML = `
        <div class="vs-header">
          <span class="vs-dot" style="--c:${varDef.color}"></span>
          <span class="vs-name">${displayName}</span>
          <button class="vs-lock${isLocked ? ' locked' : ''}" data-var="${varName}" title="${isLocked ? 'Unlock variable' : 'Lock variable'}">${isLocked ? '&#x1F512;' : '&#x1F513;'}</button>
          <span class="vs-midi">CC${ccIndex++}</span>
          <div class="mini-knob" data-value="0.75" data-color="${varDef.color}">
            <svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" class="mnk-track"/><circle cx="14" cy="14" r="11" class="mnk-fill"/></svg>
          </div>
        </div>
        <div class="vs-chips">${chipsHtml}</div>`;
      if (isLocked) strip.classList.add('locked');
      varBanks.appendChild(strip);
    }
  }

  _normalizeTemplate(template) {
    // ── Synthograsizer-mini export detection ─────────────────────────────────
    // Format: { "template": "...", "variables": { "name": { "value": "...", "index": N }, ... } }
    // The mini export only stores the currently-selected value per variable (not the full list).
    if (
      template &&
      typeof template.template === 'string' &&
      !template.promptTemplate &&
      template.variables &&
      !Array.isArray(template.variables) &&
      typeof template.variables === 'object'
    ) {
      template = {
        promptTemplate: template.template,
        variables: Object.entries(template.variables).map(([name, varDef]) => {
          const raw = (typeof varDef === 'object' && varDef !== null) ? varDef : { value: String(varDef) };
          // New mini exports include the full values[] list; old ones only have the selected value
          const fullValues = Array.isArray(raw.values) && raw.values.length > 0
            ? raw.values.map(v => ({ text: String(v), weight: 1 }))
            : [{ text: String(raw.value ?? raw), weight: 1 }];
          // Rotate so the originally-selected value appears first (as the active chip)
          const idx = typeof raw.index === 'number' && raw.index > 0 && raw.index < fullValues.length
            ? raw.index : 0;
          const rotated = [...fullValues.slice(idx), ...fullValues.slice(0, idx)];
          return { name, feature_name: name, values: rotated };
        })
      };
    }
    // ── Synthograsizer full template detection ───────────────────────────────
    // Format: { "promptTemplate": "...", "variables": [ { "name": ..., "values": ["str",...] } ] }
    // (values as flat strings are handled below — this branch is just a passthrough)

    if (!template || !Array.isArray(template.variables)) return template;
    template.variables = template.variables.map(v => {
      if (!v || !Array.isArray(v.values) || v.values.length === 0) return v;
      const firstVal = v.values[0];
      if (typeof firstVal === 'object' && firstVal !== null && 'text' in firstVal) {
        delete v.weights;
        return v;
      }
      if (typeof firstVal === 'string') {
        const weights = v.weights || [];
        v.values = v.values.map((val, i) => {
          const entry = { text: val };
          if (weights.length > i && weights[i] !== undefined) entry.weight = weights[i];
          return entry;
        });
        delete v.weights;
      }
      return v;
    });
    return template;
  }

  _generateAbbr(text) {
    const words = text.trim().split(/\s+/).filter(w => w.length > 1);
    if (words.length === 0) return text.substring(0, 3).toUpperCase();
    const first = words[0].replace(/[^a-zA-Z0-9]/g, '');
    return first.substring(0, 3).toUpperCase() || text.substring(0, 3).toUpperCase();
  }

  _buildDefaultPromptTemplate() {
    return Object.keys(this.vars).map(v => `{{${v}}}`).join(' ');
  }

  // ─── Knob Drag ───
  bindKnobDrag() {
    document.querySelectorAll('.macro-knob .mk-cap').forEach(cap => {
      this._bindDraggableKnob(cap, (val) => {
        const knob = cap.closest('.macro-knob');
        const fill = knob.querySelector('.mk-fill');
        const label = knob.querySelector('.mk-value');
        const indicator = cap.querySelector('.mk-indicator');
        fill.dataset.value = val.toFixed(2);
        label.textContent = `${Math.round(val * 100)}%`;
        if (indicator) indicator.style.transform = `translateX(-50%) rotate(${-135 + val * 270}deg)`;
        this.updateMacroKnobs();
      });
    });

    document.querySelectorAll('.env-knob .mk-cap').forEach(cap => {
      this._bindDraggableKnob(cap, (val) => {
        const knob = cap.closest('.env-knob');
        const fill = knob.querySelector('.mk-fill');
        const param = knob.dataset.param;
        const indicator = cap.querySelector('.mk-indicator');
        fill.dataset.value = val.toFixed(2);
        if (indicator) indicator.style.transform = `translateX(-50%) rotate(${-135 + val * 270}deg)`;

        if (param === 'sustain') {
          this.adsr.s = Math.round(val * 100);
          knob.querySelector('.ek-value').textContent = `${this.adsr.s}%`;
        } else {
          const ms = Math.round(val * 100);
          this.adsr[param[0]] = ms;
          knob.querySelector('.ek-value').textContent = `${ms}ms`;
        }
        this.updateMacroKnobs();
        this.drawADSR();
      });
    });

    document.querySelectorAll('.mini-knob').forEach(knob => {
      this._bindDraggableMiniKnob(knob);
    });
  }

  _bindDraggableKnob(cap, onChange) {
    let startY, startVal;
    cap.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      const knob = cap.closest('.macro-knob, .env-knob');
      const fill = knob.querySelector('.mk-fill');
      startVal = parseFloat(fill.dataset.value) || 0;

      const tooltip = document.createElement('div');
      tooltip.className = 'knob-tooltip';
      tooltip.id = 'knobTooltip';
      document.body.appendChild(tooltip);

      const onMove = (e2) => {
        const delta = (startY - e2.clientY) / 150;
        const val = Math.max(0, Math.min(1, startVal + delta));
        onChange(val);
        tooltip.textContent = `${Math.round(val * 100)}%`;
        tooltip.style.left = `${e2.clientX + 14}px`;
        tooltip.style.top = `${e2.clientY - 14}px`;
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const tt = document.getElementById('knobTooltip');
        if (tt) tt.remove();
        this.debounceSave();
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  _bindDraggableMiniKnob(knob) {
    let startY, startVal;
    knob.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      startVal = parseFloat(knob.dataset.value) || 0;

      const onMove = (e2) => {
        const delta = (startY - e2.clientY) / 150;
        const val = Math.max(0, Math.min(1, startVal + delta));
        knob.dataset.value = val.toFixed(2);
        this.updateMacroKnobs();
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ─── Macro Knobs (visual update) ───
  updateMacroKnobs() {
    document.querySelectorAll('.mk-fill').forEach(circle => {
      const val = parseFloat(circle.dataset.value) || 0;
      const offset = 170 - (val * 128);
      circle.style.strokeDashoffset = offset;
    });

    document.querySelectorAll('.mnk-fill').forEach(circle => {
      const knob = circle.closest('.mini-knob');
      const val = parseFloat(knob?.dataset.value) || 0;
      const offset = 55 - (val * 41);
      circle.style.strokeDashoffset = offset;
      const color = knob?.dataset.color || '#a78bfa';
      circle.style.stroke = color;
    });

    // Update indicator rotation for macro knobs
    document.querySelectorAll('.macro-knob').forEach(knob => {
      const fill = knob.querySelector('.mk-fill');
      const indicator = knob.querySelector('.mk-indicator');
      if (fill && indicator) {
        const val = parseFloat(fill.dataset.value) || 0;
        indicator.style.transform = `translateX(-50%) rotate(${-135 + val * 270}deg)`;
      }
    });

    // Update indicator rotation for envelope knobs
    document.querySelectorAll('.env-knob').forEach(knob => {
      const fill = knob.querySelector('.mk-fill');
      const indicator = knob.querySelector('.mk-indicator');
      if (fill && indicator) {
        const val = parseFloat(fill.dataset.value) || 0;
        indicator.style.transform = `translateX(-50%) rotate(${-135 + val * 270}deg)`;
      }
    });
  }

  // ─── Tooltips ───
  addTooltips() {
    document.querySelectorAll('.seq-row:not(.velocity-row):not(.header-row) .seq-cells').forEach(lane => {
      Array.from(lane.children).forEach(c => {
        c.title = 'Click: toggle \u00b7 Right-click: cycle value';
      });
    });
    document.querySelectorAll('.velocity-row .seq-cell').forEach(c => {
      c.title = 'Drag up/down to adjust';
    });
    document.querySelectorAll('.macro-knob .mk-cap').forEach(c => {
      c.title = 'Drag up/down to adjust';
    });
    document.querySelectorAll('.env-knob .mk-cap').forEach(c => {
      c.title = 'Drag up/down to adjust';
    });
    const xyPad = document.getElementById('xyPad');
    if (xyPad) xyPad.title = 'Click & drag to morph';
    document.querySelectorAll('.fxm-power').forEach(b => {
      b.title = 'Toggle effect on/off';
    });
    document.querySelectorAll('.mini-knob').forEach(k => {
      k.title = 'Drag up/down to adjust';
    });
  }

  // ─── Theme Helpers ───
  _getThemeColor(cssVar) {
    return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  }

  _isLightMode() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  _hexToRgba(hex, alpha) {
    // Handle both #abc and #aabbcc, and also named/computed colors
    if (!hex || hex.startsWith('rgb')) return hex; // pass through rgb()
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ─── Theme Toggle ───
  bindThemeToggle() {
    const btn = document.getElementById('btnThemeToggle');
    if (!btn) return;

    const sunSVG = '<circle cx="8" cy="8" r="3.5"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1"/>';
    const moonSVG = '<path d="M13.4 10.6A6 6 0 0 1 5.4 2.6 6 6 0 1 0 13.4 10.6Z"/>';

    const updateIcon = () => {
      const icon = document.getElementById('themeIcon');
      if (!icon) return;
      const isLight = this._isLightMode();
      icon.innerHTML = isLight ? moonSVG : sunSVG;
      btn.title = isLight ? 'Switch to dark mode' : 'Switch to light mode';
    };

    updateIcon();

    btn.addEventListener('click', () => {
      const isLight = this._isLightMode();
      if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('promptcraft-theme', '');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('promptcraft-theme', 'light');
      }
      updateIcon();
      this.drawWaveform();
      this.drawADSR();
      this.drawXYPad();
    });

    // Follow OS preference if user hasn't set one manually
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
      const saved = localStorage.getItem('promptcraft-theme');
      if (!saved) {
        if (e.matches) {
          document.documentElement.setAttribute('data-theme', 'light');
        } else {
          document.documentElement.removeAttribute('data-theme');
        }
        updateIcon();
        this.drawWaveform();
        this.drawADSR();
        this.drawXYPad();
      }
    });
  }

  // ─── Web MIDI ───
  bindMIDI() {
    if (!navigator.requestMIDIAccess) return;
    navigator.requestMIDIAccess().then(access => {
      const select = document.getElementById('midiDeviceSelect');
      const dot = document.getElementById('midiDot');

      access.inputs.forEach(input => {
        const opt = document.createElement('option');
        opt.value = input.id;
        opt.textContent = input.name;
        select.appendChild(opt);
      });

      select.addEventListener('change', () => {
        access.inputs.forEach(i => { i.onmidimessage = null; });
        if (select.value) {
          const input = access.inputs.get(select.value);
          if (input) {
            input.onmidimessage = (msg) => this.handleMIDI(msg);
            dot.classList.replace('offline', 'online');
          }
        } else {
          dot.classList.replace('online', 'offline');
        }
      });
    }).catch(() => {});
  }

  handleMIDI(msg) {
    const [status, cc, value] = msg.data;
    const vuMidi = document.getElementById('vuMidi');
    if (vuMidi) vuMidi.style.width = `${(value / 127) * 100}%`;
  }

  // ─── localStorage Persistence ───
  debounceSave() {
    clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => this.saveState(), 500);
  }

  saveState() {
    const state = {
      bpm: this.bpm,
      steps: this.steps,
      seqData: this.seqData,
      weightData: this.weightData,
      denoiseData: this.denoiseData,
      adsr: this.adsr,
      promptTemplate: this.promptTemplate,
      vars: this.vars,
      activeTab: document.querySelector('.tab.active')?.dataset.tab || 'sequencer',
      macros: {}
    };

    document.querySelectorAll('.macro-knob').forEach(k => {
      const param = k.dataset.param;
      const val = k.querySelector('.mk-fill')?.dataset.value;
      if (param && val) state.macros[param] = parseFloat(val);
    });

    try {
      localStorage.setItem('promptcraft-state', JSON.stringify(state));
    } catch (e) { /* quota exceeded */ }
  }

  loadState() {
    try {
      const raw = localStorage.getItem('promptcraft-state');
      if (!raw) return;
      const state = JSON.parse(raw);

      if (state.bpm) {
        this.bpm = state.bpm;
        const led = document.querySelector('#bpmLED .led-value');
        if (led) led.textContent = this.bpm;
      }

      if (state.steps && state.steps !== this.steps) {
        this.steps = state.steps;
        const sel = document.getElementById('seqSteps');
        if (sel) sel.value = state.steps;
        this.buildStepDots();
      }

      // Restore imported template if present
      if (state.vars && state.promptTemplate) {
        this.vars = state.vars;
        this.promptTemplate = state.promptTemplate;
        this._rebuildSequencerHTML();
        this._rebuildSidebarStrips();
        this.renderPromptTemplate();
        this.bindChips();
        this.bindLocks();
      }

      if (state.seqData) this.seqData = state.seqData;
      if (state.weightData) this.weightData = state.weightData;
      if (state.denoiseData) this.denoiseData = state.denoiseData;

      // Rebuild sequencer with loaded data
      this.buildSequencer();

      if (state.adsr) {
        this.adsr = state.adsr;
        const av = document.getElementById('envAVal');
        const dv = document.getElementById('envDVal');
        const sv = document.getElementById('envSVal');
        const rv = document.getElementById('envRVal');
        if (av) av.textContent = `${this.adsr.a}ms`;
        if (dv) dv.textContent = `${this.adsr.d}ms`;
        if (sv) sv.textContent = `${this.adsr.s}%`;
        if (rv) rv.textContent = `${this.adsr.r}ms`;

        document.querySelectorAll('.env-knob').forEach(k => {
          const param = k.dataset.param;
          const fill = k.querySelector('.mk-fill');
          if (!fill) return;
          if (param === 'attack') fill.dataset.value = (this.adsr.a / 100).toFixed(2);
          if (param === 'decay') fill.dataset.value = (this.adsr.d / 100).toFixed(2);
          if (param === 'sustain') fill.dataset.value = (this.adsr.s / 100).toFixed(2);
          if (param === 'release') fill.dataset.value = (this.adsr.r / 100).toFixed(2);
        });
        this.drawADSR();
      }

      if (state.macros) {
        document.querySelectorAll('.macro-knob').forEach(k => {
          const param = k.dataset.param;
          if (state.macros[param] !== undefined) {
            const fill = k.querySelector('.mk-fill');
            const label = k.querySelector('.mk-value');
            if (fill) fill.dataset.value = state.macros[param].toFixed(2);
            if (label) label.textContent = `${Math.round(state.macros[param] * 100)}%`;
          }
        });
      }

      if (state.activeTab) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const tab = document.querySelector(`.tab[data-tab="${state.activeTab}"]`);
        const content = document.getElementById(`tab-${state.activeTab}`);
        if (tab) tab.classList.add('active');
        if (content) content.classList.add('active');
      }

      this.updateMacroKnobs();
      this.updatePlayhead();
    } catch (e) { /* corrupted state */ }
  }

  // ─── Template Generator ───
  bindTemplateGen() {
    const modal = document.getElementById('templateGenModal');
    const btnOpen = document.getElementById('btnTemplateGen');
    const btnClose = document.getElementById('btnCloseTgen');
    const btnGenerate = document.getElementById('btnTgenGenerate');
    if (!modal || !btnOpen) return;

    this._tgenMode = 'text';
    this._tgenImages = [];        // base64 strings
    this._tgenGenerating = false;

    // Open / close
    btnOpen.addEventListener('click', () => {
      modal.classList.remove('hidden');
      this._tgenUpdateUI();
    });
    btnClose?.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    // Mode buttons
    modal.querySelectorAll('.tgen-mode').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.tgen-mode').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._tgenMode = btn.dataset.mode;
        this._tgenImages = [];
        this._tgenUpdateUI();
      });
    });

    // Single image drop zone
    const dropSingle = document.getElementById('tgenDropSingle');
    const imgInput = document.getElementById('tgenImageInput');
    if (dropSingle && imgInput) {
      dropSingle.addEventListener('click', () => imgInput.click());
      dropSingle.addEventListener('dragover', (e) => { e.preventDefault(); dropSingle.classList.add('dragover'); });
      dropSingle.addEventListener('dragleave', () => dropSingle.classList.remove('dragover'));
      dropSingle.addEventListener('drop', (e) => {
        e.preventDefault();
        dropSingle.classList.remove('dragover');
        if (e.dataTransfer.files.length) this._tgenReadImage(e.dataTransfer.files[0], 'single');
      });
      imgInput.addEventListener('change', (e) => {
        if (e.target.files[0]) this._tgenReadImage(e.target.files[0], 'single');
        imgInput.value = '';
      });
    }

    // Multi-image drop zone
    const dropMulti = document.getElementById('tgenDropMulti');
    const multiInput = document.getElementById('tgenMultiImageInput');
    if (dropMulti && multiInput) {
      dropMulti.addEventListener('click', () => multiInput.click());
      dropMulti.addEventListener('dragover', (e) => { e.preventDefault(); dropMulti.classList.add('dragover'); });
      dropMulti.addEventListener('dragleave', () => dropMulti.classList.remove('dragover'));
      dropMulti.addEventListener('drop', (e) => {
        e.preventDefault();
        dropMulti.classList.remove('dragover');
        Array.from(e.dataTransfer.files).forEach(f => this._tgenReadImage(f, 'multi'));
      });
      multiInput.addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(f => this._tgenReadImage(f, 'multi'));
        multiInput.value = '';
      });
    }

    // Generate
    btnGenerate?.addEventListener('click', () => this._tgenGenerate());
  }

  _tgenUpdateUI() {
    const descs = {
      'text': 'Describe the kind of prompts you want to generate.',
      'image': 'Upload a reference image to extract a template from its visual style.',
      'hybrid': 'Combine a reference image with text directions for variable structure.',
      'multi-image': 'Upload 2+ images to discover shared patterns and differences.',
      'remix': 'Evolve the current template with new instructions.'
    };
    const desc = document.getElementById('tgenDesc');
    if (desc) desc.textContent = descs[this._tgenMode] || '';

    const textGroup = document.getElementById('tgenTextGroup');
    const imgGroup = document.getElementById('tgenImageGroup');
    const multiGroup = document.getElementById('tgenMultiImageGroup');
    const remixGroup = document.getElementById('tgenRemixGroup');
    const error = document.getElementById('tgenError');
    const status = document.getElementById('tgenStatus');

    // Hide all optional groups
    [textGroup, imgGroup, multiGroup, remixGroup].forEach(g => g?.classList.add('hidden'));
    error?.classList.add('hidden');
    status?.classList.add('hidden');

    // Show relevant groups per mode
    switch (this._tgenMode) {
      case 'text':
        textGroup?.classList.remove('hidden');
        break;
      case 'image':
        imgGroup?.classList.remove('hidden');
        break;
      case 'hybrid':
        textGroup?.classList.remove('hidden');
        imgGroup?.classList.remove('hidden');
        break;
      case 'multi-image':
        multiGroup?.classList.remove('hidden');
        break;
      case 'remix':
        textGroup?.classList.remove('hidden');
        remixGroup?.classList.remove('hidden');
        break;
    }

    // Reset image previews
    const previewSingle = document.getElementById('tgenPreviewSingle');
    if (previewSingle) { previewSingle.classList.add('hidden'); previewSingle.src = ''; }
    const thumbs = document.getElementById('tgenThumbs');
    if (thumbs) thumbs.innerHTML = '';
    const dropText = document.querySelector('#tgenDropSingle .tgen-drop-text');
    if (dropText) dropText.style.display = '';
  }

  _tgenReadImage(file, target) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1]; // strip data:image/...;base64,
      if (target === 'single') {
        this._tgenImages = [base64];
        const preview = document.getElementById('tgenPreviewSingle');
        if (preview) {
          preview.src = e.target.result;
          preview.classList.remove('hidden');
        }
        const dropText = document.querySelector('#tgenDropSingle .tgen-drop-text');
        if (dropText) dropText.style.display = 'none';
      } else {
        this._tgenImages.push(base64);
        const thumbs = document.getElementById('tgenThumbs');
        if (thumbs) {
          const img = document.createElement('img');
          img.className = 'tgen-thumb';
          img.src = e.target.result;
          thumbs.appendChild(img);
        }
      }
    };
    reader.readAsDataURL(file);
  }

  async _tgenGenerate() {
    if (this._tgenGenerating) return;
    const prompt = document.getElementById('tgenPrompt')?.value.trim() || '';
    const mode = this._tgenMode;
    const error = document.getElementById('tgenError');
    const status = document.getElementById('tgenStatus');
    const btn = document.getElementById('btnTgenGenerate');

    // Validation
    if ((mode === 'text' || mode === 'remix') && !prompt) {
      this._tgenShowError('Please enter a text prompt.'); return;
    }
    if ((mode === 'image' || mode === 'hybrid') && this._tgenImages.length === 0) {
      this._tgenShowError('Please add a reference image.'); return;
    }
    if (mode === 'multi-image' && this._tgenImages.length < 2) {
      this._tgenShowError('Please add at least 2 images.'); return;
    }

    // Build request body
    const body = { mode };
    if (prompt) body.prompt = prompt;
    if (this._tgenImages.length > 0) body.images = this._tgenImages;
    if (mode === 'remix') {
      body.current_template = this.exportTemplateData();
    }

    // UI state: loading
    this._tgenGenerating = true;
    error?.classList.add('hidden');
    status?.classList.remove('hidden');
    if (btn) btn.disabled = true;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const res = await fetch('http://localhost:8000/api/generate/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      const template = data.template;
      if (!template || !template.promptTemplate) {
        throw new Error('Invalid template response from server.');
      }

      // Success — import the generated template
      document.getElementById('templateGenModal')?.classList.add('hidden');
      this.importTemplate(template);

    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Request timed out. Is the backend running on port 8000?' : err.message;
      this._tgenShowError(msg);
    } finally {
      this._tgenGenerating = false;
      status?.classList.add('hidden');
      if (btn) btn.disabled = false;
    }
  }

  _tgenShowError(msg) {
    const error = document.getElementById('tgenError');
    if (error) { error.textContent = msg; error.classList.remove('hidden'); }
  }

  exportTemplateData() {
    return {
      promptTemplate: this.promptTemplate || this._buildDefaultPromptTemplate(),
      variables: Object.entries(this.vars).map(([name, varDef]) => ({
        name: name,
        feature_name: varDef.featureName || name,
        values: varDef.values.map(text => ({ text: text, weight: 1 }))
      }))
    };
  }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  window.promptCraft = new PromptCraft();
});
