ctx.save();

const paletteChoice = getVar('palette') ?? 'cyber_cyan';
const wallStyle = getVar('wall_style') ?? 'neon_wire';
const densityChoice = getVar('cell_density') ?? 'medium';
const glowVal = getVar('glow_intensity') ?? 3;

const palettes = {
  cyber_cyan:    { wall: '#092338', head: '#00ffff', flood: '#0088ff', path: '#ffffff', bg: '#03080e', hue: 190 },
  amber_crt:     { wall: '#2d1804', head: '#ffbb33', flood: '#ff6600', path: '#fff0cc', bg: '#0b0602', hue: 35 },
  laser_magenta: { wall: '#2b0724', head: '#ff2ad4', flood: '#9900ff', path: '#ffe6fb', bg: '#0a0209', hue: 310 },
  emerald_matrix:{ wall: '#052410', head: '#00ff66', flood: '#00aa33', path: '#e6ffea', bg: '#020b04', hue: 140 }
};
const pal = palettes[paletteChoice] ?? palettes.cyber_cyan;

const densities = {
  coarse: { cols: 31, rows: 17 },
  medium: { cols: 45, rows: 25 },
  dense:  { cols: 61, rows: 33 }
};
const targetDim = densities[densityChoice] ?? densities.medium;

// Initialize persistent state
const s = room.state;
s.phase ??= 0; // 0: Carve, 1: BFS Flood, 2: Solution Trace, 3: Pause/Reset
s.timer ??= 0;
s.cols ??= targetDim.cols;
s.rows ??= targetDim.rows;

const totalCells = s.cols * s.rows;
if (!s.grid || s.grid.length !== totalCells || s.cols !== targetDim.cols || s.rows !== targetDim.rows) {
  s.cols = targetDim.cols;
  s.rows = targetDim.rows;
  s.grid = new Uint8Array(s.cols * s.rows); // 0: wall, 1: open, 2: flood, 3: solution
  s.parent = new Int32Array(s.cols * s.rows);
  s.dist = new Int32Array(s.cols * s.rows);
  s.stack = new Int32Array(s.cols * s.rows);
  s.queue = new Int32Array(s.cols * s.rows);
  s.stackLen = 0;
  s.qHead = 0;
  s.qTail = 0;
  s.phase = 0;
  s.headIdx = 1 * s.cols + 1;
  s.grid[s.headIdx] = 1;
  s.stack[0] = s.headIdx;
  s.stackLen = 1;
}

const cols = s.cols;
const rows = s.rows;
const grid = s.grid;
const parent = s.parent;
const dist = s.dist;
const stack = s.stack;
const queue = s.queue;

// Step simulation based on audio and phase
const baseSpeed = 1 + Math.floor(audio.bass * 4) + (audio.beat ? 3 : 0);

if (s.phase === 0) {
  // CARVE (Recursive Backtracker)
  const steps = 3 + baseSpeed * 3;
  for (let step = 0; step < steps; step++) {
    if (s.stackLen <= 0) {
      s.phase = 1;
      s.qHead = 0;
      s.qTail = 0;
      dist.fill(-1);
      parent.fill(-1);
      const startIdx = 1 * cols + 1;
      queue[s.qTail++] = startIdx;
      dist[startIdx] = 0;
      grid[startIdx] = 2;
      break;
    }

    const curr = stack[s.stackLen - 1];
    const cx = curr % cols;
    const cy = (curr / cols) | 0;
    s.headIdx = curr;

    let unvisitedCount = 0;
    const dirs = [0, 0, 0, 0];
    // Check 4 cardinal neighbors 2 steps away
    if (cy >= 3 && grid[(cy - 2) * cols + cx] === 0) dirs[unvisitedCount++] = 0; // Up
    if (cx < cols - 3 && grid[cy * cols + (cx + 2)] === 0) dirs[unvisitedCount++] = 1; // Right
    if (cy < rows - 3 && grid[(cy + 2) * cols + cx] === 0) dirs[unvisitedCount++] = 2; // Down
    if (cx >= 3 && grid[cy * cols + (cx - 2)] === 0) dirs[unvisitedCount++] = 3; // Left

    if (unvisitedCount > 0) {
      const pick = dirs[(Math.random() * unvisitedCount) | 0];
      let nx = cx, ny = cy;
      let mx = cx, my = cy;
      if (pick === 0) { ny -= 2; my -= 1; }
      else if (pick === 1) { nx += 2; mx += 1; }
      else if (pick === 2) { ny += 2; my += 1; }
      else if (pick === 3) { nx -= 2; mx -= 1; }

      const midIdx = my * cols + mx;
      const nextIdx = ny * cols + nx;
      grid[midIdx] = 1;
      grid[nextIdx] = 1;
      stack[s.stackLen++] = nextIdx;
    } else {
      s.stackLen--;
    }
  }
} else if (s.phase === 1) {
  // BFS SOLVE
  const targetIdx = (rows - 2) * cols + (cols - 2);
  const steps = 4 + baseSpeed * 4;
  for (let step = 0; step < steps; step++) {
    if (s.qHead >= s.qTail) {
      s.phase = 2;
      s.solveWalk = targetIdx;
      break;
    }
    const curr = queue[s.qHead++];
    if (curr === targetIdx) {
      s.phase = 2;
      s.solveWalk = targetIdx;
      break;
    }
    const cx = curr % cols;
    const cy = (curr / cols) | 0;
    const curDist = dist[curr];

    const neighbors = [curr - cols, curr + 1, curr + cols, curr - 1];
    for (let i = 0; i < 4; i++) {
      const ni = neighbors[i];
      if (ni >= 0 && ni < totalCells && grid[ni] === 1) {
        grid[ni] = 2; // flood marked
        dist[ni] = curDist + 1;
        parent[ni] = curr;
        queue[s.qTail++] = ni;
      }
    }
  }
} else if (s.phase === 2) {
  // SOLUTION TRACE BACK
  const steps = 2 + (audio.beat ? 4 : 2);
  for (let step = 0; step < steps; step++) {
    if (s.solveWalk >= 0 && parent[s.solveWalk] !== -1) {
      grid[s.solveWalk] = 3;
      s.solveWalk = parent[s.solveWalk];
    } else {
      if (s.solveWalk >= 0) grid[s.solveWalk] = 3;
      s.phase = 3;
      s.timer = 0;
      break;
    }
  }
} else if (s.phase === 3) {
  // DWELL & DISSOLVE RESET
  s.timer += frame.dt + audio.level * 0.05;
  if (s.timer > 3.0 || (s.timer > 1.2 && audio.beat)) {
    grid.fill(0);
    s.phase = 0;
    s.headIdx = 1 * cols + 1;
    grid[s.headIdx] = 1;
    stack[0] = s.headIdx;
    s.stackLen = 1;
    s.timer = 0;
  }
}

// Render pass
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, frame.width, frame.height);

const margin = Math.min(frame.width, frame.height) * 0.05;
const playW = frame.width - margin * 2;
const playH = frame.height - margin * 2;
const cellW = playW / cols;
const cellH = playH / rows;
const ox = margin;
const oy = margin;

// Background grid dots / circuit lines
ctx.lineWidth = 1;
ctx.strokeStyle = `hsla(${pal.hue}, 40%, 15%, 0.3)`;
ctx.beginPath();
for (let y = 0; y <= rows; y += 4) {
  ctx.moveTo(ox, oy + y * cellH);
  ctx.lineTo(ox + cols * cellW, oy + y * cellH);
}
for (let x = 0; x <= cols; x += 4) {
  ctx.moveTo(ox + x * cellW, oy);
  ctx.lineTo(ox + x * cellW, oy + rows * cellH);
}
ctx.stroke();

const beatPulse = audio.beat ? 1.4 : 1.0;
const glowAlpha = Math.min(1.0, (glowVal * 0.18 + audio.mid * 0.3) * beatPulse);

// Draw grid content
for (let y = 0; y < rows; y++) {
  const rowOff = y * cols;
  const py = oy + y * cellH;
  for (let x = 0; x < cols; x++) {
    const val = grid[rowOff + x];
    const px = ox + x * cellW;

    if (val === 0) {
      // WALL
      if (wallStyle === 'solid_blocks') {
        ctx.fillStyle = pal.wall;
        ctx.fillRect(px + 0.5, py + 0.5, cellW - 0.5, cellH - 0.5);
      } else if (wallStyle === 'circuit_path') {
        ctx.fillStyle = pal.wall;
        ctx.fillRect(px + cellW * 0.2, py + cellH * 0.2, cellW * 0.6, cellH * 0.6);
      }
    } else if (val === 1) {
      // CARVED CORRIDOR
      ctx.fillStyle = `hsla(${pal.hue}, 30%, 12%, 0.9)`;
      ctx.fillRect(px, py, cellW, cellH);
    } else if (val === 2) {
      // FLOOD BFS
      const d = dist[rowOff + x];
      const wave = Math.sin(d * 0.2 - frame.t * 6) * 0.5 + 0.5;
      const l = 25 + wave * 30 + audio.bass * 25;
      ctx.fillStyle = `hsla(${(pal.hue + d * 1.5) % 360}, 90%, ${l}%, 0.8)`;
      ctx.fillRect(px + 0.5, py + 0.5, cellW - 0.5, cellH - 0.5);
    } else if (val === 3) {
      // SOLVED PATH
      const pathPulse = Math.sin(frame.t * 8 + (x + y) * 0.4) * 0.3 + 0.7;
      ctx.fillStyle = `hsla(${(pal.hue + 140) % 360}, 100%, ${65 * pathPulse + audio.treble * 25}%, 0.95)`;
      ctx.fillRect(px, py, cellW, cellH);
    }
  }
}

// Wall wireframe rendering if neon_wire
if (wallStyle === 'neon_wire') {
  ctx.strokeStyle = pal.wall;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y * cols + x] === 0) {
        ctx.rect(ox + x * cellW + 1, oy + y * cellH + 1, cellW - 2, cellH - 2);
      }
    }
  }
  ctx.stroke();
}

// Glow overlay on solved shortest path & carver head
ctx.shadowBlur = glowVal * 6 * (1 + audio.bass);
ctx.shadowColor = pal.head;

if (s.phase === 0) {
  // CARVER HEAD & SPARKS
  const hx = ox + (s.headIdx % cols) * cellW + cellW * 0.5;
  const hy = oy + Math.floor(s.headIdx / cols) * cellH + cellH * 0.5;
  const r = Math.max(cellW, cellH) * (0.8 + audio.bass * 0.8);

  ctx.fillStyle = pal.head;
  ctx.beginPath();
  ctx.arc(hx, hy, r * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Spark discharge on carve
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let a = 0; a < 4; a++) {
    const ang = frame.t * 12 + a * (Math.PI / 2);
    const len = r * (1.2 + audio.mid * 1.5);
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + Math.cos(ang) * len, hy + Math.sin(ang) * len);
  }
  ctx.stroke();
} else if (s.phase >= 2) {
  // Glowing runner along solved path
  const targetX = ox + (cols - 2) * cellW + cellW * 0.5;
  const targetY = oy + (rows - 2) * cellH + cellH * 0.5;
  ctx.fillStyle = pal.path;
  ctx.shadowColor = pal.path;
  ctx.beginPath();
  ctx.arc(targetX, targetY, Math.min(cellW, cellH) * (0.8 + audio.treble), 0, Math.PI * 2);
  ctx.fill();
}

// Room presence: Render connected guests as nodes traversing the grid perimeter
if (room.people && room.people.length > 0) {
  ctx.shadowBlur = 4;
  for (let i = 0; i < room.people.length; i++) {
    const p = room.people[i];
    const speed = 0.05 + (i % 3) * 0.03;
    const perimeterT = (frame.t * speed + i / room.people.length) % 1.0;
    const perim = 2 * (playW + playH);
    let distTravel = perimeterT * perim;
    let px = ox, py = oy;

    if (distTravel < playW) {
      px += distTravel;
    } else if (distTravel < playW + playH) {
      px += playW;
      py += distTravel - playW;
    } else if (distTravel < 2 * playW + playH) {
      px += playW - (distTravel - (playW + playH));
      py += playH;
    } else {
      py += playH - (distTravel - (2 * playW + playH));
    }

    ctx.shadowColor = `hsl(${p.hue}, 100%, 70%)`;
    ctx.fillStyle = `hsl(${p.hue}, 90%, 65%)`;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(3, cellW * 0.35 + audio.mid * 2), 0, Math.PI * 2);
    ctx.fill();
  }
}

// Frame border neon bracket
ctx.shadowBlur = 8 * glowAlpha;
ctx.shadowColor = pal.head;
ctx.strokeStyle = pal.head;
ctx.lineWidth = 2.5;
ctx.strokeRect(ox - 2, oy - 2, playW + 4, playH + 4);

ctx.restore();