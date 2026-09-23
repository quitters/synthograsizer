ctx.save();

const GW = 320;
const GH = 180;
const TOTAL = GW * GH;

// 1. Initialise persistent demoscene buffers in room.state
if (!room.state.init) {
  room.state.init = true;
  room.state.cur = new Uint8Array(TOTAL);
  room.state.nxt = new Uint8Array(TOTAL);
  room.state.hue = new Uint16Array(TOTAL); // cell color hue 0..359
  room.state.trail = new Uint8Array(TOTAL); // trail phosphor level 0..255
  room.state.offscreen = new OffscreenCanvas(GW, GH);
  room.state.offCtx = room.state.offscreen.getContext('2d');
  room.state.imgData = room.state.offCtx.createImageData(GW, GH);
  room.state.u32 = new Uint32Array(room.state.imgData.data.buffer);
  room.state.lastTick = 0;
  room.state.popCount = 0;
  room.state.gliderIdx = 0;
}

const cur = room.state.cur;
const nxt = room.state.nxt;
const hue = room.state.hue;
const trail = room.state.trail;
const u32 = room.state.u32;

// Helper to write a cell
function setCell(x, y, v, h) {
  const gx = (x % GW + GW) % GW;
  const gy = (y % GH + GH) % GH;
  const idx = gy * GW + gx;
  cur[idx] = v ? 1 : 0;
  if (v) {
    hue[idx] = h % 360;
    trail[idx] = 255;
  }
}

function stampGlider(cx, cy, dir, h) {
  const patterns = [
    [[0,1],[1,2],[2,0],[2,1],[2,2]], // southeast
    [[0,1],[1,0],[2,0],[2,1],[2,2]], // southwest
    [[0,0],[0,1],[0,2],[1,2],[2,1]], // northeast
    [[0,0],[0,1],[0,2],[1,0],[2,1]]  // northwest
  ];
  const pts = patterns[dir % 4];
  for (let i = 0; i < pts.length; i++) {
    setCell(cx + pts[i][0], cy + pts[i][1], 1, h);
  }
}

function stampGosper(ox, oy, h) {
  const gun = [
    [24,0],[22,1],[24,1],[12,2],[13,2],[20,2],[21,2],[34,2],[35,2],
    [11,3],[15,3],[20,3],[21,3],[34,3],[35,3],[0,4],[1,4],[10,4],
    [16,4],[20,4],[21,4],[0,5],[1,5],[10,5],[14,5],[16,5],[17,5],
    [22,5],[24,5],[10,6],[16,6],[24,6],[11,7],[15,7],[12,8],[13,8]
  ];
  for (let i = 0; i < gun.length; i++) {
    setCell(ox + gun[i][0], oy + gun[i][1], 1, h);
  }
}

function stampPulsar(cx, cy, h) {
  const pat = [1,2,3, 7,8,9];
  for (const dx of pat) {
    for (const dy of [0, 5, 7, 12]) {
      setCell(cx + dx - 5, cy + dy - 6, 1, h);
      setCell(cx + dy - 6, cy + dx - 5, 1, h);
    }
  }
}

function reseedAll() {
  cur.fill(0);
  trail.fill(0);
  stampGosper(20, 30, 160);
  stampGosper(180, 90, 290);
  stampPulsar(80, 110, 45);
  stampPulsar(250, 40, 200);
  for (let k = 0; k < 12; k++) {
    stampGlider(30 + k * 22, 10 + (k % 4) * 35, k % 4, (k * 30) % 360);
  }
}

// First boot auto-seed
if (room.state.popCount === 0) {
  reseedAll();
  room.state.popCount = 100;
}

// 2. Handle room triggers
if (room.events) {
  for (let i = 0; i < room.events.length; i++) {
    const ev = room.events[i];
    if (ev.name === 'reseed') {
      reseedAll();
    } else if (ev.name === 'spawn_glider') {
      const p = room.people ? room.people.find(person => person.id === ev.participantId) : null;
      const h = p ? p.hue : ((Math.random() * 360) | 0);
      const gx = ((Math.random() * (GW - 20)) | 0) + 10;
      const gy = ((Math.random() * (GH - 20)) | 0) + 10;
      stampGlider(gx, gy, (room.state.gliderIdx++) % 4, h);
    }
  }
}

// 3. Variables & Knobs
const targetRate = getVar('sim_rate') ?? 30;
const tickInterval = 1.0 / Math.max(1, targetRate);
const decayMode = getVar('trail_persistence') ?? 'long_glow';
const decayDec = decayMode === 'brisk' ? 14 : (decayMode === 'long_glow' ? 6 : 2);
const mutMode = getVar('audio_mutation') ?? 'subtle';

// 4. Music reaction & mutation
if (audio && audio.beat) {
  const mutCount = mutMode === 'cosmic_chaos' ? 24 : (mutMode === 'pulse_sparks' ? 10 : 3);
  const bh = (frame.t * 60 + audio.bass * 180) % 360;
  for (let m = 0; m < mutCount; m++) {
    const rx = (Math.random() * GW) | 0;
    const ry = (Math.random() * GH) | 0;
    stampGlider(rx, ry, m % 4, (bh + m * 25) % 360);
  }
}

// Reseed if population has collapsed
if (room.state.popCount < 30) {
  reseedAll();
}

// 5. Simulation Tick
if (frame.t - room.state.lastTick >= tickInterval) {
  room.state.lastTick = frame.t;
  let liveCount = 0;

  for (let y = 0; y < GH; y++) {
    const yUp = ((y - 1 + GH) % GH) * GW;
    const yCur = y * GW;
    const yDn = ((y + 1) % GH) * GW;

    for (let x = 0; x < GW; x++) {
      const xL = (x - 1 + GW) % GW;
      const xR = (x + 1) % GW;
      const idx = yCur + x;

      const neighbors =
        cur[yUp + xL] + cur[yUp + x] + cur[yUp + xR] +
        cur[yCur + xL]               + cur[yCur + xR] +
        cur[yDn + xL] + cur[yDn + x] + cur[yDn + xR];

      const alive = cur[idx];
      let nextAlive = 0;
      if (alive) {
        if (neighbors === 2 || neighbors === 3) {
          nextAlive = 1;
        }
      } else {
        if (neighbors === 3) {
          nextAlive = 1;
          // Inherit dominant hue from neighborhood
          const src = cur[yCur + xL] ? (yCur + xL) : (cur[yCur + xR] ? (yCur + xR) : (yUp + x));
          hue[idx] = hue[src];
        }
      }

      nxt[idx] = nextAlive;
      if (nextAlive) {
        trail[idx] = 255;
        liveCount++;
      } else if (trail[idx] > 0) {
        trail[idx] = trail[idx] > decayDec ? (trail[idx] - decayDec) : 0;
      }
    }
  }

  cur.set(nxt);
  room.state.popCount = liveCount;
}

// 6. Blit Cellular Automata & Phosphor Trails to Uint32 ImageData
const palChoice = getVar('palette') ?? 'cyber_green';
let baseR = 10, baseG = 255, baseB = 80;
if (palChoice === 'amber_crt') {
  baseR = 255; baseG = 150; baseB = 20;
} else if (palChoice === 'biolum_cyan') {
  baseR = 20; baseG = 230; baseB = 255;
} else if (palChoice === 'synth_magenta') {
  baseR = 255; baseG = 30; baseB = 180;
}

const audioBoost = audio ? (audio.mid * 50) : 0;
for (let i = 0; i < TOTAL; i++) {
  const al = cur[i];
  const tr = trail[i];
  if (al) {
    // Alive cell: bright core tinted with cell hue
    const hRad = (hue[i] * Math.PI) / 180;
    const r = Math.min(255, (160 + Math.cos(hRad) * 95 + audioBoost) | 0);
    const g = Math.min(255, (160 + Math.cos(hRad - 2.09) * 95 + audioBoost) | 0);
    const b = Math.min(255, (160 + Math.cos(hRad + 2.09) * 95 + audioBoost) | 0);
    // 0xAABBGGRR in little-endian
    u32[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
  } else if (tr > 4) {
    // Fading phosphor trail
    const factor = tr / 255;
    const r = (baseR * factor) | 0;
    const g = (baseG * factor) | 0;
    const b = (baseB * factor) | 0;
    u32[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
  } else {
    // Deep CRT background tint
    u32[i] = 0xFF040608;
  }
}

room.state.offCtx.putImageData(room.state.imgData, 0, 0);

// 7. Render scaled output to main canvas with scanlines & glow
ctx.fillStyle = '#05070a';
ctx.fillRect(0, 0, frame.width, frame.height);

ctx.imageSmoothingEnabled = false;
ctx.drawImage(room.state.offscreen, 0, 0, frame.width, frame.height);

// Demoscene CRT scanline overlay
ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
const lineSpacing = 4;
for (let sy = 0; sy < frame.height; sy += lineSpacing) {
  ctx.fillRect(0, sy, frame.width, 1.5);
}

// Vignette shadow
const vig = ctx.createRadialGradient(
  frame.width * 0.5, frame.height * 0.5, frame.height * 0.4,
  frame.width * 0.5, frame.height * 0.5, frame.width * 0.75
);
vig.addColorStop(0, 'rgba(0,0,0,0)');
vig.addColorStop(1, 'rgba(0,0,0,0.65)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, frame.width, frame.height);

// Display colony stats in clean monospace demoscene HUD
ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
ctx.font = '12px monospace';
ctx.fillText(`LIFE 2D // POPULATION: ${room.state.popCount} // RATE: ${targetRate} TPS`, 24, 30);

// Participant presence indicators at screen bottom
if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 32);
  for (let p = 0; p < pCount; p++) {
    const person = room.people[p];
    ctx.fillStyle = `hsl(${person.hue}, 90%, 65%)`;
    ctx.beginPath();
    ctx.arc(30 + p * 16, frame.height - 24, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

ctx.restore();