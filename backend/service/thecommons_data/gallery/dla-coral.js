const GW = 300;
const GH = 300;
const CX = 150;
const CY = 150;
const MAX_WALKERS = 240;
const OFFSETS = [-301, -300, -299, -1, 1, 299, 300, 301];
const WDX = [-1, 0, 1, -1, 1, -1, 0, 1];
const WDY = [-1, -1, -1, 0, 0, 1, 1, 1];

room.state.grid ??= new Uint8Array(GW * GH);
room.state.canvas ??= new OffscreenCanvas(600, 600);
room.state.ctx ??= room.state.canvas.getContext('2d');
room.state.wx ??= new Float32Array(MAX_WALKERS);
room.state.wy ??= new Float32Array(MAX_WALKERS);
room.state.whue ??= new Float32Array(MAX_WALKERS);
room.state.shockwaves ??= [];
room.state.maxR ??= 4;
room.state.stuckCount ??= 0;
room.state.initialized ??= false;

const paletteKey = getVar('palette') ?? 'chromatic_flow';
const branchStyle = getVar('branch_density') ?? 'feathery';
const symmetry = getVar('symmetry') ?? 'organic';
const growthRate = getVar('sim_speed') ?? 20;
const glow = getVar('glow_intensity') ?? 0.6;

const densityMap = {
  feathery: 0.95,
  dense_coral: 0.22,
  crystalline: 0.65
};
const stickProb = densityMap[branchStyle] ?? 0.95;

function getBaseHue(count, time) {
  if (paletteKey === 'bioluminescent') return 160 + Math.sin(count * 0.02 + time) * 35;
  if (paletteKey === 'solar_corona') return 15 + (Math.sin(count * 0.015) + 1) * 22;
  if (paletteKey === 'electric_amethyst') return 265 + Math.sin(count * 0.025) * 45;
  if (paletteKey === 'room_echo' && room.people && room.people.length > 0) {
    return room.people[count % room.people.length].hue;
  }
  return (count * 0.35 + time * 12) % 360;
}

function spawnWalker(i, customHue) {
  const r = room.state.maxR + 3 + Math.random() * 8;
  const angle = Math.random() * 6.2831853;
  const x = Math.round(CX + Math.cos(angle) * r);
  const y = Math.round(CY + Math.sin(angle) * r);
  room.state.wx[i] = Math.max(3, Math.min(GW - 4, x));
  room.state.wy[i] = Math.max(3, Math.min(GH - 4, y));
  room.state.whue[i] = (customHue !== undefined) ? customHue : getBaseHue(room.state.stuckCount, frame.t);
}

function resetSimulation() {
  room.state.grid.fill(0);
  const octx = room.state.ctx;
  octx.clearRect(0, 0, 600, 600);
  room.state.grid[CY * GW + CX] = 1;
  room.state.maxR = 4;
  room.state.stuckCount = 1;
  octx.fillStyle = '#ffffff';
  octx.beginPath();
  octx.arc(CX * 2, CY * 2, 2.5, 0, Math.PI * 2);
  octx.fill();
  for (let i = 0; i < MAX_WALKERS; i++) spawnWalker(i);
}

if (!room.state.initialized) {
  resetSimulation();
  room.state.initialized = true;
}

for (const e of room.events) {
  if (e.name === 'reseed') {
    resetSimulation();
  } else if (e.name === 'burst') {
    const person = room.people ? room.people.find(p => p.id === e.participantId) : null;
    const bHue = person ? person.hue : Math.floor(Math.random() * 360);
    const burstCount = 45;
    for (let i = 0; i < burstCount; i++) {
      const slot = (i * 5) % MAX_WALKERS;
      spawnWalker(slot, bHue);
    }
    room.state.shockwaves.push({ r: room.state.maxR, maxR: room.state.maxR + 40, hue: bHue, alpha: 1.0 });
    if (room.state.shockwaves.length > 12) room.state.shockwaves.shift();
  }
}

if (audio.beat) {
  const activeCount = 8;
  for (let b = 0; b < activeCount; b++) {
    spawnWalker((Math.random() * MAX_WALKERS) | 0, (frame.t * 60 + b * 25) % 360);
  }
}

function stickPoint(px, py, pnx, pny, h) {
  if (px < 2 || px >= GW - 2 || py < 2 || py >= GH - 2) return;
  const idx = py * GW + px;
  if (room.state.grid[idx] === 1) return;
  room.state.grid[idx] = 1;
  const octx = room.state.ctx;
  octx.strokeStyle = `hsl(${h | 0}, 85%, 62%)`;
  octx.lineWidth = 1.4;
  octx.beginPath();
  octx.moveTo(pnx * 2, pny * 2);
  octx.lineTo(px * 2, py * 2);
  octx.stroke();
  octx.fillStyle = `hsl(${h | 0}, 95%, 85%)`;
  octx.fillRect(px * 2 - 1, py * 2 - 1, 2, 2);
}

const stepsPerFrame = Math.min(35, Math.max(8, growthRate + Math.floor(audio.bass * 15)));
const killR = Math.min(138, room.state.maxR + 22);
const grid = room.state.grid;
const wx = room.state.wx;
const wy = room.state.wy;
const whue = room.state.whue;

for (let w = 0; w < MAX_WALKERS; w++) {
  let x = wx[w] | 0;
  let y = wy[w] | 0;
  const h = whue[w];

  for (let s = 0; s < stepsPerFrame; s++) {
    const dir = (Math.random() * 8) | 0;
    x += WDX[dir];
    y += WDY[dir];

    if (x < 2 || x >= GW - 2 || y < 2 || y >= GH - 2) {
      spawnWalker(w);
      x = wx[w] | 0;
      y = wy[w] | 0;
      break;
    }

    const dx = x - CX;
    const dy = y - CY;
    if (dx * dx + dy * dy > killR * killR) {
      spawnWalker(w);
      x = wx[w] | 0;
      y = wy[w] | 0;
      break;
    }

    const idx = y * GW + x;
    let neighbor = -1;
    for (let k = 0; k < 8; k++) {
      if (grid[idx + OFFSETS[k]] === 1) {
        neighbor = idx + OFFSETS[k];
        break;
      }
    }

    if (neighbor !== -1) {
      if (Math.random() < stickProb) {
        const nx = neighbor % GW;
        const ny = (neighbor / GW) | 0;

        if (symmetry === 'bilateral') {
          stickPoint(x, y, nx, ny, h);
          stickPoint(2 * CX - x, y, 2 * CX - nx, ny, h);
        } else if (symmetry === 'radial_quad') {
          const cdx = x - CX, cdy = y - CY;
          const cndx = nx - CX, cndy = ny - CY;
          stickPoint(CX + cdx, CY + cdy, CX + cndx, CY + cndy, h);
          stickPoint(CX - cdy, CY + cdx, CX - cndy, CY + cndx, h);
          stickPoint(CX - cdx, CY - cdy, CX - cndx, CY - cndy, h);
          stickPoint(CX + cdy, CY - cdx, CX + cndy, CY - cndx, h);
        } else {
          stickPoint(x, y, nx, ny, h);
        }

        room.state.stuckCount++;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > room.state.maxR) room.state.maxR = Math.min(136, d);
        spawnWalker(w);
      }
      break;
    }
  }
  wx[w] = x;
  wy[w] = y;
}

if (room.state.maxR >= 135) {
  resetSimulation();
}

ctx.save();
const scrCX = frame.width * 0.5;
const scrCY = frame.height * 0.5;
const baseScale = Math.min(frame.width, frame.height) * 0.88 / 600;
const coralScale = baseScale * (1 + audio.bass * 0.035);

const bgGrad = ctx.createRadialGradient(scrCX, scrCY, 10, scrCX, scrCY, Math.max(frame.width, frame.height) * 0.7);
bgGrad.addColorStop(0, '#0d111d');
bgGrad.addColorStop(0.55, '#060810');
bgGrad.addColorStop(1, '#020306');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, frame.width, frame.height);

ctx.strokeStyle = `rgba(80, 120, 180, ${0.08 + audio.mid * 0.12})`;
ctx.lineWidth = 1;
ctx.beginPath();
ctx.arc(scrCX, scrCY, room.state.maxR * 2 * coralScale, 0, Math.PI * 2);
ctx.stroke();

ctx.save();
ctx.globalCompositeOperation = 'lighter';
const glowAlpha = Math.min(1, glow * (0.35 + audio.bass * 0.35));
ctx.globalAlpha = glowAlpha;
const glowScale = coralScale * (1.02 + audio.level * 0.02);
ctx.drawImage(room.state.canvas, scrCX - 300 * glowScale, scrCY - 300 * glowScale, 600 * glowScale, 600 * glowScale);
ctx.globalAlpha = 1.0;
ctx.drawImage(room.state.canvas, scrCX - 300 * coralScale, scrCY - 300 * coralScale, 600 * coralScale, 600 * coralScale);
ctx.restore();

const wSize = 1.5 + audio.treble * 2;
for (let w = 0; w < MAX_WALKERS; w++) {
  const swx = scrCX + (wx[w] - CX) * 2 * coralScale;
  const swy = scrCY + (wy[w] - CY) * 2 * coralScale;
  ctx.fillStyle = `hsl(${whue[w] | 0}, 90%, 75%)`;
  ctx.fillRect(swx - wSize * 0.5, swy - wSize * 0.5, wSize, wSize);
}

for (let i = room.state.shockwaves.length - 1; i >= 0; i--) {
  const sw = room.state.shockwaves[i];
  sw.r += frame.dt * 45;
  sw.alpha -= frame.dt * 0.8;
  if (sw.alpha <= 0) {
    room.state.shockwaves.splice(i, 1);
    continue;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `hsla(${sw.hue}, 90%, 65%, ${sw.alpha})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(scrCX, scrCY, sw.r * 2 * coralScale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

if (room.people && room.people.length > 0) {
  const pR = (room.state.maxR + 18) * 2 * coralScale;
  const stepAng = (Math.PI * 2) / room.people.length;
  for (let i = 0; i < room.people.length; i++) {
    const p = room.people[i];
    const ang = i * stepAng + frame.t * 0.1;
    const px = scrCX + Math.cos(ang) * pR;
    const py = scrCY + Math.sin(ang) * pR;
    ctx.fillStyle = `hsl(${p.hue}, 90%, 60%)`;
    ctx.beginPath();
    ctx.arc(px, py, 3 + audio.mid * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

ctx.restore();