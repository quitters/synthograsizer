ctx.save();

const COLS = 80;
const ROWS = 25;
const TOTAL = COLS * ROWS;

// Persistent buffers & pre-computed mesh geometry
room.state.chars ??= new Uint8Array(TOTAL);
room.state.fg ??= new Uint8Array(TOTAL);
room.state.bg ??= new Uint8Array(TOTAL);
room.state.zbuf ??= new Float32Array(TOTAL);
room.state.scrollX ??= 0;
room.state.lastGreeting ??= '';

const chars = room.state.chars;
const fg = room.state.fg;
const bg = room.state.bg;
const zbuf = room.state.zbuf;

// Shading ramps
const RAMP = ' .,:-=+*#%@';
const RAMP_LEN = RAMP.length;

// Palettes
const PALETTES = {
  'Classic CGA': [
    '#000000', '#0000aa', '#00aa00', '#00aaaa',
    '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa',
    '#555555', '#5555ff', '#55ff55', '#55ffff',
    '#ff5555', '#ff55ff', '#ffff55', '#ffffff'
  ],
  'Cyberpunk Neon': [
    '#05020a', '#1a0826', '#2b003b', '#5c007a',
    '#800080', '#b30086', '#e60067', '#ff007f',
    '#002b36', '#005f73', '#0a9396', '#94d2bd',
    '#e9d8a6', '#ee9b00', '#ca6702', '#00f0ff'
  ],
  'Amber Phosphor': [
    '#080400', '#150900', '#261200', '#3a1e00',
    '#522d00', '#6e3e00', '#8c5200', '#ad6900',
    '#cc8200', '#e09800', '#f2ad00', '#ffc21a',
    '#ffd44d', '#ffe280', '#fff0b3', '#fffde6'
  ],
  'Green Phosphor': [
    '#000802', '#001405', '#002409', '#003810',
    '#004f17', '#006920', '#00852a', '#00a335',
    '#00c240', '#12d64f', '#32e667', '#5cf084',
    '#8af5a5', '#b3fbc5', '#d4fde0', '#f0fff4'
  ]
};

const palMode = getVar('palette_mode') ?? 'Classic CGA';
const pal = PALETTES[palMode] ?? PALETTES['Classic CGA'];
const pSpeed = getVar('plasma_speed') ?? 1.0;
const crtMode = getVar('scanline_glow') ?? 'Arcade CRT';
const shapeMode = getVar('shape_type') ?? 'Hypercube';

const time = frame.t * pSpeed;
const bass = audio.bass || 0;
const treble = audio.treble || 0;
const level = audio.level || 0;

// 1. Compute plasma background into buffers
let idx = 0;
for (let y = 0; y < ROWS; y++) {
  const ny = (y / ROWS) * 4.0;
  for (let x = 0; x < COLS; x++) {
    const nx = (x / COLS) * 8.0;
    const v1 = Math.sin(nx * 0.75 + time);
    const v2 = Math.sin(ny * 1.25 - time * 1.3);
    const v3 = Math.sin((nx + ny + time) * 0.9);
    const dist = Math.sqrt((nx - 4) * (nx - 4) + (ny - 2) * (ny - 2));
    const v4 = Math.sin(dist * 2.2 - time * 2.0);
    let val = (v1 + v2 + v3 + v4 + 4) * 0.125; // 0..1
    val += bass * 0.25;
    if (val > 1) val = 1;
    if (val < 0) val = 0;

    const cIndex = Math.floor(val * (RAMP_LEN - 1));
    chars[idx] = cIndex;
    fg[idx] = Math.floor(val * 14) + 1;
    bg[idx] = 0;
    zbuf[idx] = -9999;
    idx++;
  }
}

// 2. Render 3D Shape vertices & wireframe/points
const rotX = frame.t * 0.8 + bass * 0.4;
const rotY = frame.t * 1.2;
const rotZ = frame.t * 0.5;

const cx = Math.cos(rotX), sx = Math.sin(rotX);
const cy = Math.cos(rotY), sy = Math.sin(rotY);
const cz = Math.cos(rotZ), sz = Math.sin(rotZ);

function projectAndPlot(px, py, pz, colorOffset, symbolIdx) {
  // 3D rotation
  let x1 = px * cy + pz * sy;
  let z1 = -px * sy + pz * cy;
  let y1 = py * cx - z1 * sx;
  let z2 = py * sx + z1 * cx;
  let x2 = x1 * cz - y1 * sz;
  let y2 = x1 * sz + y1 * cz;

  const camZ = 3.5;
  const tz = z2 + camZ;
  if (tz <= 0.2) return;

  const aspect = 2.1; // monospace font height vs width correction
  const scrX = Math.round(40 + (x2 / tz) * 44 * aspect);
  const scrY = Math.round(11 + (y2 / tz) * 22);

  if (scrX >= 0 && scrX < COLS && scrY >= 0 && scrY < ROWS - 2) {
    const bufIdx = scrY * COLS + scrX;
    if (z2 > zbuf[bufIdx]) {
      zbuf[bufIdx] = z2;
      chars[bufIdx] = symbolIdx;
      fg[bufIdx] = colorOffset;
      bg[bufIdx] = 1;
    }
  }
}

function drawLine3D(x0, y0, z0, x1, y1, z1, col) {
  const steps = 18;
  for (let s = 0; s <= steps; s++) {
    const u = s / steps;
    const px = x0 + (x1 - x0) * u;
    const py = y0 + (y1 - y0) * u;
    const pz = z0 + (z1 - z0) * u;
    projectAndPlot(px, py, pz, col, Math.min(RAMP_LEN - 1, 6 + Math.floor(treble * 5)));
  }
}

const scale = 1.1 + bass * 0.35;

if (shapeMode === 'Hypercube') {
  // Tesseract / nested cube
  const b = 0.9 * scale;
  const s = 0.45 * scale;
  const cornersB = [
    [-b,-b,-b], [b,-b,-b], [b,b,-b], [-b,b,-b],
    [-b,-b,b],  [b,-b,b],  [b,b,b],  [-b,b,b]
  ];
  const cornersS = cornersB.map(v => [v[0] * (s / b), v[1] * (s / b), v[2] * (s / b)]);
  const edges = [
    [0,1],[1,2],[2,3],[3,0],
    [4,5],[5,6],[6,7],[7,4],
    [0,4],[1,5],[2,6],[3,7]
  ];
  const col1 = 11 + Math.floor(bass * 4) % 5;
  const col2 = 14;
  for (let i = 0; i < edges.length; i++) {
    const [i1, i2] = edges[i];
    drawLine3D(cornersB[i1][0], cornersB[i1][1], cornersB[i1][2], cornersB[i2][0], cornersB[i2][1], cornersB[i2][2], col1);
    drawLine3D(cornersS[i1][0], cornersS[i1][1], cornersS[i1][2], cornersS[i2][0], cornersS[i2][1], cornersS[i2][2], col2);
    drawLine3D(cornersB[i1][0], cornersB[i1][1], cornersB[i1][2], cornersS[i1][0], cornersS[i1][1], cornersS[i1][2], 13);
  }
} else if (shapeMode === 'Octahedron') {
  const r = 1.35 * scale;
  const verts = [
    [ r, 0, 0], [-r, 0, 0],
    [0,  r, 0], [0, -r, 0],
    [0, 0,  r], [0, 0, -r]
  ];
  const edges = [
    [0,2],[2,1],[1,3],[3,0],
    [0,4],[1,4],[2,4],[3,4],
    [0,5],[1,5],[2,5],[3,5]
  ];
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i];
    drawLine3D(verts[a][0], verts[a][1], verts[a][2], verts[b][0], verts[b][1], verts[b][2], 10 + (i % 5));
  }
} else {
  // Torus ring
  const majorR = 1.1 * scale;
  const minorR = 0.42 * scale;
  const rings = 16;
  const segments = 16;
  for (let i = 0; i < rings; i++) {
    const u = (i / rings) * Math.PI * 2;
    for (let j = 0; j < segments; j++) {
      const v = (j / segments) * Math.PI * 2;
      const px = (majorR + minorR * Math.cos(v)) * Math.cos(u);
      const py = (majorR + minorR * Math.cos(v)) * Math.sin(u);
      const pz = minorR * Math.sin(v);
      projectAndPlot(px, py, pz, 9 + ((i + j) % 7), RAMP_LEN - 1);
    }
  }
}

// 3. Status Bar & Scrolling Greetings Line
const activeTables = new Set();
if (room.people && room.people.length > 0) {
  for (let p = 0; p < room.people.length; p++) {
    if (room.people[p].table) activeTables.add(room.people[p].table);
  }
}
const tableList = activeTables.size > 0 ? Array.from(activeTables).join(' * ') : 'PUBLIC MAINFRAME';
const rawMessage = ` *** DEMO OR DIE *** GREETS FLY TO: [${tableList}] *** LIVE AUDIO BASS:${Math.floor(bass * 99)}% MID:${Math.floor((audio.mid || 0) * 99)}% TREB:${Math.floor(treble * 99)}% *** RENDER BUFFER: 80x25 TEXT *** `;

room.state.scrollX += frame.dt * 14;
const scrollOffset = Math.floor(room.state.scrollX);

// Top status bar (Row 0)
const topBar = ` >> CGA D-MODE | SCENE: ${shapeMode.toUpperCase()} | FPS: 60.0 | AUD: ${Math.floor(level * 100)}% << `;
const topPad = Math.max(0, Math.floor((COLS - topBar.length) / 2));
for (let i = 0; i < COLS; i++) {
  const idxTop = i;
  chars[idxTop] = 0;
  bg[idxTop] = 1; // highlight
  fg[idxTop] = 15;
  if (i >= topPad && i < topPad + topBar.length) {
    chars[idxTop] = topBar.charCodeAt(i - topPad);
  } else {
    chars[idxTop] = 32;
  }
}

// Separator row (Row 23)
for (let i = 0; i < COLS; i++) {
  const idxSep = 23 * COLS + i;
  chars[idxSep] = 45; // '-'
  fg[idxSep] = 7;
  bg[idxSep] = 0;
}

// Bottom scroller row (Row 24)
for (let i = 0; i < COLS; i++) {
  const idxBot = 24 * COLS + i;
  const charCode = rawMessage.charCodeAt((i + scrollOffset) % rawMessage.length);
  chars[idxBot] = charCode;
  fg[idxBot] = 14 + (i % 2); // Yellow / White
  bg[idxBot] = 0;
}

// 4. Render the 80x25 character grid to Canvas
const cellW = frame.width / COLS;
const cellH = frame.height / ROWS;
const fontSize = Math.floor(cellH * 0.95);

ctx.fillStyle = pal[0];
ctx.fillRect(0, 0, frame.width, frame.height);
ctx.font = `bold ${fontSize}px monospace`;
ctx.textBaseline = 'top';
ctx.textAlign = 'center';

const halfCellW = cellW * 0.5;

// Pass 1: Background cell fills (only for non-zero bg to save draw calls)
for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    const bColor = bg[y * COLS + x];
    if (bColor > 0) {
      ctx.fillStyle = pal[bColor % pal.length];
      ctx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
    }
  }
}

// Pass 2: Foreground glyphs
for (let y = 0; y < ROWS; y++) {
  const py = y * cellH;
  for (let x = 0; x < COLS; x++) {
    const bIdx = y * COLS + x;
    const rawCode = chars[bIdx];
    let glyph = ' ';
    if (rawCode < RAMP_LEN) {
      glyph = RAMP[rawCode];
    } else {
      glyph = String.fromCharCode(rawCode);
    }
    if (glyph === ' ') continue;

    const fColor = fg[bIdx] % pal.length;
    ctx.fillStyle = pal[fColor];
    ctx.fillText(glyph, x * cellW + halfCellW, py);
  }
}

// 5. CRT Scanlines, Vignette & Phosphor Glow
if (crtMode === 'Arcade CRT' || crtMode === 'Soft Bloom') {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  const scanStep = Math.max(2, Math.floor(cellH / 3));
  for (let sy = 0; sy < frame.height; sy += scanStep) {
    ctx.fillRect(0, sy, frame.width, 1);
  }

  // Subtle bloom flash on audio beat
  if (audio.beat) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, 0, frame.width, frame.height);
  }

  // Vignette
  const grad = ctx.createRadialGradient(
    frame.width * 0.5, frame.height * 0.5, frame.height * 0.35,
    frame.width * 0.5, frame.height * 0.5, frame.width * 0.65
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, frame.width, frame.height);
}

ctx.restore();