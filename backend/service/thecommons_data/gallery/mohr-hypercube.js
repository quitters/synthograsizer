const bgPalette = {
  gallery_white: { bg: '#f5f4ef', ink: '#0a0a0c', ghost: 'rgba(10,10,12,0.12)', accent: '#c4332b' },
  aged_vellum:   { bg: '#eae2cf', ink: '#1c1b18', ghost: 'rgba(28,27,24,0.14)', accent: '#b55a30' },
  inverted_void: { bg: '#08080a', ink: '#f0ede6', ghost: 'rgba(240,237,230,0.15)', accent: '#ff4d36' }
};
const pal = bgPalette[getVar('paper_tone')] ?? bgPalette.gallery_white;
const projMode = getVar('projection') ?? 'axonometric';
const subsetMode = getVar('sign_subset') ?? 'algorithmic';
const baseWeight = getVar('line_weight') ?? 6;
const speedMult = getVar('rotation_speed') ?? 0.6;

// 1. One-time setup of static geometry buffers in room.state
if (!room.state.init) {
  room.state.init = true;
  // 16 vertices of a 4D hypercube [-1, 1]
  const rawVerts = new Float32Array(16 * 4);
  for (let i = 0; i < 16; i++) {
    rawVerts[i * 4 + 0] = (i & 1) ? 1 : -1;
    rawVerts[i * 4 + 1] = (i & 2) ? 1 : -1;
    rawVerts[i * 4 + 2] = (i & 4) ? 1 : -1;
    rawVerts[i * 4 + 3] = (i & 8) ? 1 : -1;
  }
  room.state.rawVerts = rawVerts;

  // 32 edges: connect vertices with Hamming distance == 1
  const edgeList = [];
  for (let i = 0; i < 16; i++) {
    for (let bit = 0; bit < 4; bit++) {
      const j = i ^ (1 << bit);
      if (i < j) edgeList.push(i, j);
    }
  }
  room.state.edges = new Uint8Array(edgeList); // 32 * 2 = 64 elements
  room.state.proj2D = new Float32Array(16 * 2);
  room.state.edgeOpacities = new Float32Array(32);
  room.state.edgeTargets = new Float32Array(32);
  for (let e = 0; e < 32; e++) room.state.edgeOpacities[e] = (e % 2 === 0) ? 1 : 0;
  room.state.signTimer = 0;
  room.state.signSeed = 1337;
  room.state.angleXW = 0;
  room.state.angleYZ = 0;
  room.state.angleZW = 0;
}

// 2. Audio-reactive sign evolution
const dt = Math.min(frame.dt || 0.016, 0.05);
room.state.signTimer += dt * (1 + audio.mid * 1.5);
const beatTrigger = audio.beat || room.state.signTimer > 2.8;

if (beatTrigger) {
  room.state.signTimer = 0;
  room.state.signSeed = (room.state.signSeed * 1664525 + 1013904223) >>> 0;
  const seed = room.state.signSeed;

  for (let e = 0; e < 32; e++) {
    let active = 0;
    if (subsetMode === 'sparse_glyphs') {
      // High pruning: strictly 7 to 11 sharp structural edges
      active = (((seed ^ (e * 2654435761)) >>> 27) < 9) ? 1 : 0;
    } else if (subsetMode === 'diagonal_paths') {
      // Select edges along Hamiltonian walks or coordinate parity
      const u = room.state.edges[e * 2];
      const v = room.state.edges[e * 2 + 1];
      const parity = (u ^ v ^ (seed >>> (e % 16))) & 3;
      active = (parity === 1 || parity === 2) ? 1 : 0;
    } else if (subsetMode === 'dense_polyhedron') {
      // Most edges visible, sporadic omissions
      active = (((seed ^ (e * 31)) >>> 28) > 2) ? 1 : 0;
    } else {
      // Mohr's classic algorithmic subset: balanced graph skeleton
      const bit = Math.log2(room.state.edges[e * 2] ^ room.state.edges[e * 2 + 1]);
      const mask = (seed >> (bit * 4)) & 7;
      active = (mask > 2) ? 1 : 0;
    }
    room.state.edgeTargets[e] = active;
  }
}

// Smoothly interpolate edge weights towards active set
for (let e = 0; e < 32; e++) {
  const diff = room.state.edgeTargets[e] - room.state.edgeOpacities[e];
  room.state.edgeOpacities[e] += diff * Math.min(1, dt * 8.0);
}

// 3. 4D Rotations (continuous crawl + audio impulse)
const sp = dt * speedMult;
room.state.angleXW += sp * 0.72 + (audio.bass * 0.04);
room.state.angleYZ += sp * 0.45;
room.state.angleZW += sp * 0.58 + (audio.treble * 0.03);

const cXW = Math.cos(room.state.angleXW), sXW = Math.sin(room.state.angleXW);
const cYZ = Math.cos(room.state.angleYZ), sYZ = Math.sin(room.state.angleYZ);
const cZW = Math.cos(room.state.angleZW), sZW = Math.sin(room.state.angleZW);

// 4. Project 16 4D vertices into 2D display coordinates
const cx = frame.width * 0.5;
const cy = frame.height * 0.5;
const minDim = Math.min(frame.width, frame.height);
const baseScale = minDim * 0.28 * (1 + audio.bass * 0.12);

const raw = room.state.rawVerts;
const p2D = room.state.proj2D;

for (let i = 0; i < 16; i++) {
  const off = i * 4;
  let x = raw[off];
  let y = raw[off + 1];
  let z = raw[off + 2];
  let w = raw[off + 3];

  // Rotate in XW plane
  const rx = x * cXW - w * sXW;
  const rw = x * sXW + w * cXW;
  x = rx; w = rw;

  // Rotate in YZ plane
  const ry = y * cYZ - z * sYZ;
  const rz = y * sYZ + z * cYZ;
  y = ry; z = rz;

  // Rotate in ZW plane
  const rz2 = z * cZW - w * sZW;
  const rw2 = z * sZW + w * cZW;
  z = rz2; w = rw2;

  let sx, sy;
  if (projMode === 'perspective') {
    const d4 = 3.2;
    const p4 = d4 / (d4 - w);
    const d3 = 3.6;
    const p3 = d3 / (d3 - z * p4);
    sx = cx + x * p4 * p3 * baseScale;
    sy = cy + y * p4 * p3 * baseScale;
  } else if (projMode === 'stereographic') {
    const denom = 3.0 - w;
    const inv = denom > 0.1 ? 2.4 / denom : 2.4;
    sx = cx + (x * inv + z * 0.25) * baseScale;
    sy = cy + (y * inv - z * 0.25) * baseScale;
  } else {
    // Axonometric affine projection preserving parallel alignments (pure Mohr style)
    sx = cx + (x * 0.95 + z * 0.42 - w * 0.35) * baseScale;
    sy = cy + (y * 0.95 - z * 0.38 - w * 0.32) * baseScale;
  }

  p2D[i * 2 + 0] = sx;
  p2D[i * 2 + 1] = sy;
}

// 5. Draw
ctx.save();
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, frame.width, frame.height);

// Mohr catalog framing / registration ticks
ctx.lineWidth = 1;
ctx.strokeStyle = pal.ghost;
const pad = 36;
ctx.strokeRect(pad, pad, frame.width - pad * 2, frame.height - pad * 2);

// Coordinate origin crosshair
ctx.beginPath();
ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy);
ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy + 16);
ctx.stroke();

// Pass 1: Draw the full ghost skeleton faintly to anchor the 4D structure
const edges = room.state.edges;
ctx.strokeStyle = pal.ghost;
ctx.lineWidth = 1.2;
ctx.lineCap = 'butt';
ctx.beginPath();
for (let e = 0; e < 32; e++) {
  const u = edges[e * 2];
  const v = edges[e * 2 + 1];
  ctx.moveTo(p2D[u * 2], p2D[u * 2 + 1]);
  ctx.lineTo(p2D[v * 2], p2D[v * 2 + 1]);
}
ctx.stroke();

// Pass 2: Draw the selected constructivist sign with bold, weighted strokes
ctx.lineCap = 'square';
ctx.lineJoin = 'miter';
for (let e = 0; e < 32; e++) {
  const op = room.state.edgeOpacities[e];
  if (op < 0.02) continue;
  const u = edges[e * 2];
  const v = edges[e * 2 + 1];

  ctx.beginPath();
  ctx.moveTo(p2D[u * 2], p2D[u * 2 + 1]);
  ctx.lineTo(p2D[v * 2], p2D[v * 2 + 1]);
  ctx.lineWidth = baseWeight * (0.4 + op * 0.9) * (1 + audio.bass * 0.4);
  ctx.globalAlpha = Math.min(1, op * 1.1);
  ctx.strokeStyle = pal.ink;
  ctx.stroke();
}
ctx.globalAlpha = 1.0;

// Highlight active nodes (vertices connected to at least one prominent edge)
ctx.fillStyle = pal.accent;
for (let i = 0; i < 16; i++) {
  let connectedWeight = 0;
  for (let e = 0; e < 32; e++) {
    if (edges[e * 2] === i || edges[e * 2 + 1] === i) {
      connectedWeight += room.state.edgeOpacities[e];
    }
  }
  if (connectedWeight > 0.8) {
    const r = Math.min(6, 2 + connectedWeight * 0.8 + audio.mid * 2.5);
    ctx.fillRect(p2D[i * 2] - r * 0.5, p2D[i * 2 + 1] - r * 0.5, r, r);
  }
}

// Presence integration: active room participants modulate subtle index marks
if (room.people && room.people.length > 0) {
  const count = Math.min(room.people.length, 16);
  const barY = frame.height - pad - 12;
  for (let p = 0; p < count; p++) {
    const person = room.people[p];
    const px = pad + 24 + p * 20;
    const targetEdge = p % 32;
    const isLive = room.state.edgeOpacities[targetEdge] > 0.5;
    ctx.fillStyle = isLive ? `hsl(${person.hue}, 70%, 45%)` : pal.ghost;
    ctx.fillRect(px, barY, 10, isLive ? 6 : 2);
  }
}

ctx.restore();