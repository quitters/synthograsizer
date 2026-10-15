const S = room.state;
const densities = { roomy: 68, standard: 52, dense: 38 };
const cellSize = densities[getVar('grid_density')] ?? 52;
const flipTempo = getVar('flip_tempo') ?? 3.5;
const lineProfile = getVar('line_profile') ?? 'neon_tube';
const paletteStyle = getVar('palette_style') ?? 'cyber_neon';

const cols = Math.ceil(frame.width / cellSize) + 1;
const rows = Math.ceil(frame.height / cellSize) + 1;
const totalTiles = cols * rows;
const totalArcs = totalTiles * 2;

// Init or resize persistent state
if (S.cols !== cols || S.rows !== rows || !S.tiles || S.tiles.length !== totalTiles) {
  S.cols = cols;
  S.rows = rows;
  S.tiles = new Uint8Array(totalTiles);
  S.flipAnim = new Float32Array(totalTiles);
  S.parent = new Int32Array(totalArcs);
  S.colorId = new Int32Array(totalArcs);
  S.nextFlip = 0;
  for (let i = 0; i < totalTiles; i++) {
    S.tiles[i] = (Math.random() > 0.5) ? 1 : 0;
  }
}

// Trigger flips based on tempo and audio pulse
const flipsToRun = Math.floor((frame.dt * flipTempo * (1 + audio.bass * 2.5)) + (audio.beat ? 1.8 : 0));
S.flipAcc = (S.flipAcc || 0) + (frame.dt * flipTempo * (1 + audio.bass * 2.2));
const doFlip = audio.beat || S.flipAcc >= 1.0;
if (doFlip) {
  const count = audio.beat ? 3 : Math.min(4, Math.floor(S.flipAcc));
  S.flipAcc = Math.max(0, S.flipAcc - count);
  for (let k = 0; k < count; k++) {
    const idx = Math.floor(Math.random() * totalTiles);
    S.tiles[idx] ^= 1;
    S.flipAnim[idx] = 1.0;
  }
}

// Decay flip highlights
for (let i = 0; i < totalTiles; i++) {
  if (S.flipAnim[i] > 0.001) S.flipAnim[i] *= 0.88;
  else S.flipAnim[i] = 0;
}

// Disjoint Set Union to compute connected meandering paths
// Arc indexing for tile at (x,y): idx = y * cols + x. Arc 0 = idx*2, Arc 1 = idx*2 + 1.
// Orientation 0: Arc 0 joins Top(0)-Left(3); Arc 1 joins Right(1)-Bottom(2)
// Orientation 1: Arc 0 joins Top(0)-Right(1); Arc 1 joins Bottom(2)-Left(3)
const parent = S.parent;
for (let i = 0; i < totalArcs; i++) parent[i] = i;
function find(i) {
  let root = i;
  while (root !== parent[root]) root = parent[root];
  let curr = i;
  while (curr !== root) {
    const nxt = parent[curr];
    parent[curr] = root;
    curr = nxt;
  }
  return root;
}
function union(a, b) {
  const ra = find(a);
  const rb = find(b);
  if (ra !== rb) parent[rb] = ra;
}

for (let y = 0; y < rows; y++) {
  const rowOffset = y * cols;
  for (let x = 0; x < cols; x++) {
    const idx = rowOffset + x;
    const t0 = S.tiles[idx];
    const arcTop = idx * 2 + 0;
    const arcBottom = idx * 2 + 1;
    const arcRight = (t0 === 0) ? arcBottom : arcTop;
    const arcDown = (t0 === 0) ? arcBottom : arcBottom;

    // Connect horizontal neighbor (Right -> Left of x+1)
    if (x + 1 < cols) {
      const rightIdx = idx + 1;
      const tRight = S.tiles[rightIdx];
      const arcLeftNeighbor = (tRight === 0) ? rightIdx * 2 + 0 : rightIdx * 2 + 1;
      union(arcRight, arcLeftNeighbor);
    }
    // Connect vertical neighbor (Bottom -> Top of y+1)
    if (y + 1 < rows) {
      const downIdx = idx + cols;
      const arcTopNeighbor = downIdx * 2 + 0;
      union(arcDown, arcTopNeighbor);
    }
  }
}

// Resolve canonical color IDs
const colorId = S.colorId;
for (let i = 0; i < totalArcs; i++) {
  colorId[i] = find(i);
}

// Palettes
const palettes = {
  cyber_neon: (id, l) => `hsl(${(id * 137.5 + frame.t * 15) % 360}, 95%, ${l}%)`,
  acid_sunset: (id, l) => `hsl(${(id * 53 + 320 + Math.sin(frame.t * 0.5) * 20) % 360}, 90%, ${l}%)`,
  nordic_frost: (id, l) => `hsl(${(185 + (id % 8) * 12 + audio.mid * 20) % 360}, 80%, ${l}%)`,
  arcade_glow: (id, l) => `hsl(${((id * 79 + 40)) % 360}, 100%, ${l}%)`
};
const getColor = palettes[paletteStyle] ?? palettes.cyber_neon;

ctx.save();
// Background fill
ctx.fillStyle = '#06070c';
ctx.fillRect(0, 0, frame.width, frame.height);

// Tile grid background matrix points
ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
for (let y = 0; y <= rows; y++) {
  for (let x = 0; x <= cols; x++) {
    ctx.fillRect(x * cellSize - 1, y * cellSize - 1, 2, 2);
  }
}

const r = cellSize * 0.5;
const pi2 = Math.PI * 2;
const halfPi = Math.PI * 0.5;
const isRibbon = lineProfile === 'ribbon';
const isLaser = lineProfile === 'laser_wire';
const baseWidth = isRibbon ? cellSize * 0.38 : (isLaser ? 2.5 : cellSize * 0.16);
const beatPulse = 1 + audio.bass * 0.45;
const glowBlur = isLaser ? 4 : (isRibbon ? 8 : 14);

ctx.lineCap = 'round';
ctx.shadowBlur = glowBlur * (0.8 + audio.mid * 0.8);

// Render quarter-circle Truchet paths
for (let y = 0; y < rows; y++) {
  const py = y * cellSize;
  const rowOffset = y * cols;
  for (let x = 0; x < cols; x++) {
    const px = x * cellSize;
    const idx = rowOffset + x;
    const orient = S.tiles[idx];
    const flip = S.flipAnim[idx];
    const arc0 = idx * 2;
    const arc1 = idx * 2 + 1;
    const id0 = colorId[arc0];
    const id1 = colorId[arc1];

    const col0 = getColor(id0, 58 + flip * 30);
    const col1 = getColor(id1, 58 + flip * 30);
    const w = (baseWidth + flip * 6) * beatPulse;

    ctx.lineWidth = Math.max(1.5, w);

    if (orient === 0) {
      // Arc 0: Top-Left (around 0,0, connecting Top to Left)
      ctx.strokeStyle = col0;
      ctx.shadowColor = col0;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, halfPi);
      ctx.stroke();

      // Arc 1: Bottom-Right (around px+cellSize, py+cellSize, connecting Right to Bottom)
      ctx.strokeStyle = col1;
      ctx.shadowColor = col1;
      ctx.beginPath();
      ctx.arc(px + cellSize, py + cellSize, r, Math.PI, Math.PI + halfPi);
      ctx.stroke();
    } else {
      // Arc 0: Top-Right (around px+cellSize, py, connecting Top to Right)
      ctx.strokeStyle = col0;
      ctx.shadowColor = col0;
      ctx.beginPath();
      ctx.arc(px + cellSize, py, r, halfPi, Math.PI);
      ctx.stroke();

      // Arc 1: Bottom-Left (around px, py+cellSize, connecting Bottom to Left)
      ctx.strokeStyle = col1;
      ctx.shadowColor = col1;
      ctx.beginPath();
      ctx.arc(px, py + cellSize, r, Math.PI + halfPi, pi2);
      ctx.stroke();
    }

    // Visual accent on recently flipped tiles
    if (flip > 0.05) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flip * 0.28})`;
      ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
    }
  }
}

// Secondary bright core stroke for neon tube feel
if (!isLaser) {
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1, baseWidth * 0.28);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  for (let y = 0; y < rows; y++) {
    const py = y * cellSize;
    const rowOffset = y * cols;
    for (let x = 0; x < cols; x++) {
      const px = x * cellSize;
      const orient = S.tiles[rowOffset + x];
      if (orient === 0) {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, halfPi);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px + cellSize, py + cellSize, r, Math.PI, Math.PI + halfPi);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(px + cellSize, py, r, halfPi, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py + cellSize, r, Math.PI + halfPi, pi2);
        ctx.stroke();
      }
    }
  }
}

// Connected attendee particles wandering the edges
if (room.people && room.people.length > 0) {
  const plen = room.people.length;
  for (let p = 0; p < plen; p++) {
    const person = room.people[p];
    const pOffset = (p * 7 + frame.t * 1.5) % totalTiles;
    const tIdx = Math.floor(pOffset);
    const tx = (tIdx % cols) * cellSize + cellSize * 0.5;
    const ty = Math.floor(tIdx / cols) * cellSize + cellSize * 0.5;
    ctx.fillStyle = `hsl(${person.hue}, 100%, 70%)`;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(tx, ty, 4 + audio.treble * 4, 0, pi2);
    ctx.fill();
  }
}

ctx.restore();