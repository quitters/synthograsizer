ctx.save();

const palettes = {
  copperplate:   { bg: '#18110c', ink: '#dfc09c', edge: '#f4e0c4', ring: '#8a5c36' },
  cyanotype:     { bg: '#061324', ink: '#9fd4f8', edge: '#e0f3ff', ring: '#245280' },
  ink_and_paper: { bg: '#efebe2', ink: '#1c1917', edge: '#44403c', ring: '#a8a29e' },
  obsidian_gold: { bg: '#0d0c10', ink: '#eec25d', edge: '#fff1bb', ring: '#7d6124' }
};
const palKey = getVar('palette');
const pal = palettes[palKey] ?? palettes.copperplate;

const pattern = getVar('pattern') ?? 'concentric_harmonics';
const engraveStyle = getVar('engrave_style') ?? 'fine_stipple';
const baseScale = getVar('dot_scale') ?? 4.5;
const revealSpeed = getVar('reveal_speed') ?? 3;

// Pre-generate 4200 blue-noise coordinates via Bridson Poisson-disc on initial run
if (!room.state.ptsX) {
  const MAX = 4200;
  const ptsX = new Float32Array(MAX);
  const ptsY = new Float32Array(MAX);
  const r = 0.0135;
  const r2 = r * r;
  const cellSize = r / 1.41421356;
  const gw = Math.ceil(1 / cellSize);
  const gh = Math.ceil(1 / cellSize);
  const grid = new Int32Array(gw * gh).fill(-1);
  const active = [0];
  ptsX[0] = 0.5;
  ptsY[0] = 0.5;
  grid[Math.floor(0.5 / cellSize) + Math.floor(0.5 / cellSize) * gw] = 0;
  let count = 1;

  while (active.length > 0 && count < MAX) {
    const rIdx = Math.floor(Math.random() * active.length);
    const pIdx = active[rIdx];
    const px = ptsX[pIdx];
    const py = ptsY[pIdx];
    let found = false;

    for (let tries = 0; tries < 24; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = r * (1 + Math.random());
      const nx = px + Math.cos(angle) * dist;
      const ny = py + Math.sin(angle) * dist;
      if (nx < 0.02 || nx > 0.98 || ny < 0.02 || ny > 0.98) continue;

      const gx = Math.floor(nx / cellSize);
      const gy = Math.floor(ny / cellSize);
      let ok = true;
      const x0 = Math.max(0, gx - 2), x1 = Math.min(gw - 1, gx + 2);
      const y0 = Math.max(0, gy - 2), y1 = Math.min(gh - 1, gy + 2);

      for (let y = y0; y <= y1 && ok; y++) {
        for (let x = x0; x <= x1; x++) {
          const neighbor = grid[x + y * gw];
          if (neighbor !== -1) {
            const dx = ptsX[neighbor] - nx;
            const dy = ptsY[neighbor] - ny;
            if (dx * dx + dy * dy < r2) { ok = false; break; }
          }
        }
      }

      if (ok) {
        ptsX[count] = nx;
        ptsY[count] = ny;
        grid[gx + gy * gw] = count;
        active.push(count);
        count++;
        found = true;
        break;
      }
    }
    if (!found) {
      active[rIdx] = active[active.length - 1];
      active.pop();
    }
  }

  room.state.ptsX = ptsX;
  room.state.ptsY = ptsY;
  room.state.total = count;
  room.state.spawned = 60;
  room.state.phase = 0;
}

// Advance visible stipple count progressively
const burst = audio.beat ? 45 : revealSpeed * 8;
room.state.spawned = Math.min(room.state.total, room.state.spawned + burst);
const visibleCount = room.state.spawned;

// Update wave centers from time and room.people
const bassKick = audio.bass * 0.4;
room.state.phase += frame.dt * (0.8 + audio.level * 1.5);
const t = room.state.phase;

const people = room.people || [];
const p0Hue = people[0] ? (people[0].hue / 360) : 0.12;
const p1Hue = people[1] ? (people[1].hue / 360) : 0.65;

let c1x = 0.5 + Math.cos(t * 0.45) * (0.2 + bassKick * 0.1);
let c1y = 0.5 + Math.sin(t * 0.35) * (0.2 + bassKick * 0.1);
let c2x = 0.5 + Math.cos(t * -0.55 + 2.0) * 0.26;
let c2y = 0.5 + Math.sin(t * 0.4 + 1.2) * 0.22;
let c3x = 0.5 + Math.sin(t * 0.2 + p0Hue * 6.28) * 0.32;
let c3y = 0.5 + Math.cos(t * 0.3 + p1Hue * 6.28) * 0.28;

if (pattern === 'binary_orbit') {
  c1x = 0.5 + Math.cos(t * 0.7) * 0.24;
  c1y = 0.5 + Math.sin(t * 0.7) * 0.24;
  c2x = 0.5 - Math.cos(t * 0.7) * 0.24;
  c2y = 0.5 - Math.sin(t * 0.7) * 0.24;
  c3x = 0.5; c3y = 0.5;
} else if (pattern === 'wave_interference') {
  c1x = 0.3; c1y = 0.5 + Math.sin(t * 0.6) * 0.3;
  c2x = 0.7; c2y = 0.5 - Math.sin(t * 0.6) * 0.3;
  c3x = 0.5; c3y = 0.5;
}

// Clear background
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, frame.width, frame.height);

// Soft underlying guide rings to establish copperplate engraving atmosphere
ctx.lineWidth = 1;
ctx.strokeStyle = pal.ring;
ctx.globalAlpha = 0.18 + audio.mid * 0.15;
for (let i = 1; i <= 6; i++) {
  ctx.beginPath();
  ctx.arc(c1x * frame.width, c1y * frame.height, (i * 45 + (t * 22) % 45), 0, Math.PI * 2);
  ctx.stroke();
}

// Render stipples: draw in 2 tone passes for engraving depth
const ptsX = room.state.ptsX;
const ptsY = room.state.ptsY;
const w = frame.width;
const h = frame.height;
const aspect = w / h;
const trebleBoost = 1 + audio.treble * 0.6;

ctx.globalAlpha = 0.95;

for (let pass = 0; pass < 2; pass++) {
  ctx.fillStyle = pass === 0 ? pal.ink : pal.edge;
  ctx.beginPath();

  for (let i = 0; i < visibleCount; i++) {
    const px = ptsX[i];
    const py = ptsY[i];

    // Aspect-corrected distance to circle emitters
    const dx1 = (px - c1x) * aspect, dy1 = py - c1y;
    const dx2 = (px - c2x) * aspect, dy2 = py - c2y;
    const dx3 = (px - c3x) * aspect, dy3 = py - c3y;

    const d1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    const d3 = Math.sqrt(dx3 * dx3 + dy3 * dy3);

    // Harmonic concentric interference pattern
    const f1 = Math.sin(d1 * 26.0 - t * 3.0);
    const f2 = Math.sin(d2 * 22.0 + t * 2.4);
    const f3 = Math.cos(d3 * 18.0 - t * 1.8);

    let val = (f1 + f2 + f3) * 0.333 + 0.5;
    if (val < 0) val = 0; else if (val > 1) val = 1;

    // Tone mapping based on engraving style
    let tone = val;
    if (engraveStyle === 'mezzotint') {
      tone = Math.pow(val, 1.8);
    } else if (engraveStyle === 'bold_woodcut') {
      tone = val > 0.48 ? Math.pow((val - 0.48) / 0.52, 0.6) : 0.05;
    }

    const maxR = baseScale * (0.4 + audio.level * 0.6) * trebleBoost;
    const rad = maxR * tone;
    if (rad < 0.6) continue;

    if (pass === 0) {
      // Base stipple ink mark
      ctx.moveTo(px * w + rad, py * h);
      ctx.arc(px * w, py * h, rad, 0, Math.PI * 2);
    } else if (tone > 0.72) {
      // Engraving highlight core on dense nodes
      const coreR = rad * 0.42;
      ctx.moveTo(px * w + coreR, py * h);
      ctx.arc(px * w, py * h, coreR, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

ctx.restore();