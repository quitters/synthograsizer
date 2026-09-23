const paletteChoice = getVar('palette') ?? 'electric_neon';
const scaleChoice = getVar('tile_scale') ?? 'medium';
const flipTempo = getVar('motion_tempo') ?? 'steady';
const pathWidth = getVar('line_weight') ?? 6;

const sizes = { compact: 40, medium: 60, broad: 90 };
const tileSize = sizes[scaleChoice] ?? 60;
const cols = Math.ceil(frame.width / tileSize) + 1;
const rows = Math.ceil(frame.height / tileSize) + 1;
const totalTiles = cols * rows;

// Preallocate buffers once in room.state
const s = room.state;
s.cols = cols;
s.rows = rows;

if (!s.tiles || s.tiles.length !== totalTiles) {
  s.tiles = new Uint8Array(totalTiles);
  s.rotAnim = new Float32Array(totalTiles);
  s.flash = new Float32Array(totalTiles);
  for (let i = 0; i < totalTiles; i++) {
    s.tiles[i] = (Math.sin(i * 997.3) > 0 ? 1 : 0);
    s.rotAnim[i] = s.tiles[i] * 0.5 * Math.PI;
  }
  s.flipTimer = 0;
  s.totalArcs = totalTiles * 2;
  s.parent = new Int32Array(s.totalArcs);
  s.compHue = new Float32Array(s.totalArcs);
  for (let i = 0; i < s.totalArcs; i++) {
    s.compHue[i] = (i * 137.508) % 360;
  }
}

// Flip cadence
const flipRates = { calm: 6, steady: 16, hyper: 40 };
const baseRate = flipRates[flipTempo] ?? 16;
const rate = baseRate * (1 + audio.mid * 2 + (audio.beat ? 4 : 0));
s.flipTimer = (s.flipTimer ?? 0) + frame.dt * rate;

while (s.flipTimer >= 1) {
  s.flipTimer -= 1;
  const idx = Math.floor(Math.random() * totalTiles);
  s.tiles[idx] ^= 1;
  s.flash[idx] = 1.0;
}

// Animate rotations & flashes
for (let i = 0; i < totalTiles; i++) {
  const target = s.tiles[i] * (0.5 * Math.PI);
  let diff = target - s.rotAnim[i];
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  s.rotAnim[i] += diff * Math.min(1, frame.dt * 18);
  if (s.flash[i] > 0) {
    s.flash[i] = Math.max(0, s.flash[i] - frame.dt * 2.8);
  }
}

// Fast Disjoint-Set Union for connected path coloring
const N = s.totalArcs;
const parent = s.parent;
for (let i = 0; i < N; i++) parent[i] = i;

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
  if (ra !== rb) parent[ra] = rb;
}

// Connect ports between neighboring tiles based on current state (s.tiles)
for (let y = 0; y < rows; y++) {
  const yOff = y * cols;
  for (let x = 0; x < cols; x++) {
    const idx = yOff + x;
    const t0 = idx * 2;
    const t1 = t0 + 1;
    const type = s.tiles[idx];
    const rightIdx = idx + 1;
    const downIdx = idx + cols;

    if (x + 1 < cols) {
      const rType = s.tiles[rightIdx];
      const r0 = rightIdx * 2;
      const r1 = r0 + 1;
      const myRightArc = (type === 0 ? t1 : t0);
      const theirLeftArc = (rType === 0 ? r0 : r1);
      union(myRightArc, theirLeftArc);
    }
    if (y + 1 < rows) {
      const dType = s.tiles[downIdx];
      const d0 = downIdx * 2;
      const d1 = d0 + 1;
      const myBottomArc = (type === 0 ? t1 : t1);
      const theirTopArc = (dType === 0 ? d0 : d0);
      union(myBottomArc, theirTopArc);
    }
  }
}

// Drawing
ctx.save();
ctx.fillStyle = '#06070a';
ctx.fillRect(0, 0, frame.width, frame.height);

const half = tileSize * 0.5;
const bassBump = audio.bass * 2.5;
const actualWidth = pathWidth + bassBump;

// Subtle grid dot backdrop
ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
for (let y = 0; y <= rows; y++) {
  const py = y * tileSize;
  for (let x = 0; x <= cols; x++) {
    ctx.fillRect(x * tileSize - 1, py - 1, 2, 2);
  }
}

ctx.lineCap = 'round';
ctx.lineWidth = actualWidth;

// Palette map helpers
function getPathColor(root, flashVal) {
  if (paletteChoice === 'amber_crt') {
    const lum = 40 + ((root * 19) % 40) + flashVal * 50;
    return `hsl(38, 100%, ${Math.min(95, lum)}%)`;
  } else if (paletteChoice === 'cyan_blueprint') {
    const lum = 45 + ((root * 23) % 35) + flashVal * 45;
    return `hsl(190, 95%, ${Math.min(95, lum)}%)`;
  } else if (paletteChoice === 'spectral_void') {
    const hue = (s.compHue[root] + frame.t * 12) % 360;
    const sat = 70 + (audio.mid * 30);
    const light = 50 + flashVal * 40;
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  } else {
    // electric_neon
    const hue = (s.compHue[root] + (audio.bass * 60)) % 360;
    const light = 55 + flashVal * 35;
    return `hsl(${hue}, 100%, ${light}%)`;
  }
}

// Draw arcs tile by tile
for (let y = 0; y < rows; y++) {
  const yOff = y * cols;
  const cy = y * tileSize + half;
  for (let x = 0; x < cols; x++) {
    const idx = yOff + x;
    const cx = x * tileSize + half;
    const arc0 = idx * 2;
    const arc1 = arc0 + 1;
    const root0 = find(arc0);
    const root1 = find(arc1);
    const flashVal = s.flash[idx];
    const rot = s.rotAnim[idx];

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    // Arc 0 (top-left in canonical tile space: center at (-half, -half))
    ctx.strokeStyle = getPathColor(root0, flashVal);
    ctx.beginPath();
    ctx.arc(-half, -half, half, 0, Math.PI * 0.5);
    ctx.stroke();

    // Arc 1 (bottom-right in canonical tile space: center at (half, half))
    ctx.strokeStyle = getPathColor(root1, flashVal);
    ctx.beginPath();
    ctx.arc(half, half, half, Math.PI, Math.PI * 1.5);
    ctx.stroke();

    // Flip flash accent on active nodes
    if (flashVal > 0.05) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flashVal * 0.4})`;
      ctx.fillRect(-half + 1, -half + 1, tileSize - 2, tileSize - 2);
    }

    ctx.restore();
  }
}

// Audience nodes: connected room users pulse along the perimeter
if (room.people && room.people.length > 0) {
  const pCount = room.people.length;
  ctx.lineWidth = 2;
  for (let i = 0; i < pCount; i++) {
    const person = room.people[i];
    const angle = (i / pCount) * Math.PI * 2 + frame.t * 0.1;
    const borderX = (Math.cos(angle) * 0.45 + 0.5) * frame.width;
    const borderY = (Math.sin(angle) * 0.45 + 0.5) * frame.height;
    ctx.fillStyle = `hsl(${person.hue}, 90%, 65%)`;
    ctx.beginPath();
    ctx.arc(borderX, borderY, 4 + audio.treble * 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

ctx.restore();