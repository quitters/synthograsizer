const themeName = getVar('theme') ?? 'amber_crt';
const resName = getVar('render_res') ?? 'chunky';
const moveSpeed = getVar('move_speed') ?? 1.2;
const fovDeg = getVar('fov') ?? 65;
const fogDepth = getVar('fog_depth') ?? 8;

const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);

const stripWidths = { crisp: 2, chunky: 3, retro_chunky: 4 };
const stripW = stripWidths[resName] ?? 3;
const numRays = Math.ceil(W / stripW);

// Palette definitions
const palettes = {
  amber_crt: {
    ceil: [14, 8, 2],
    floor: [20, 10, 3],
    wallX: [255, 170, 30],
    wallY: [190, 110, 15],
    glow: [255, 220, 100],
    grid: [60, 35, 10]
  },
  neon_cyber: {
    ceil: [8, 4, 18],
    floor: [12, 5, 26],
    wallX: [0, 235, 255],
    wallY: [255, 20, 147],
    glow: [200, 120, 255],
    grid: [30, 20, 70]
  },
  dungeon_stone: {
    ceil: [10, 12, 16],
    floor: [18, 16, 14],
    wallX: [130, 140, 150],
    wallY: [90, 100, 110],
    glow: [220, 180, 110],
    grid: [40, 42, 45]
  },
  acid_green: {
    ceil: [3, 14, 4],
    floor: [5, 22, 6],
    wallX: [70, 255, 90],
    wallY: [35, 180, 50],
    glow: [180, 255, 120],
    grid: [15, 60, 20]
  }
};
const pal = palettes[themeName] ?? palettes.amber_crt;

// Initialise persistent state
if (!room.state.init) {
  room.state.init = true;
  const S = 24;
  room.state.size = S;
  const map = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (x === 0 || y === 0 || x === S - 1 || y === S - 1) {
        map[y * S + x] = 1;
      } else if (x % 2 === 0 && y % 2 === 0) {
        map[y * S + x] = 1;
      } else {
        map[y * S + x] = 0;
      }
    }
  }
  // Carve a connected labyrinth with guaranteed loops
  const dirs = [[1,0], [-1,0], [0,1], [0,-1]];
  for (let y = 2; y < S - 2; y += 2) {
    for (let x = 2; x < S - 2; x += 2) {
      const d = dirs[((x * 37 + y * 17) % dirs.length)];
      map[(y + d[1]) * S + (x + d[0])] = 1;
    }
  }
  // Punch passages to ensure long connected corridors
  for (let i = 1; i < S - 1; i++) {
    map[1 * S + i] = 0;
    map[(S - 2) * S + i] = 0;
    map[i * S + 1] = 0;
    map[i * S + (S - 2)] = 0;
    if (i % 3 === 0) {
      map[(S >> 1) * S + i] = 0;
      map[i * S + (S >> 1)] = 0;
    }
  }
  room.state.map = map;
  room.state.posX = 1.5;
  room.state.posY = 1.5;
  room.state.angle = 0;
  room.state.targetAngle = 0;
  room.state.turnCooldown = 0;
  room.state.distBuffer = new Float32Array(numRays);
}

const map = room.state.map;
const S = room.state.size;

// Reallocate ray buffer only if resolution changes
if (!room.state.distBuffer || room.state.distBuffer.length !== numRays) {
  room.state.distBuffer = new Float32Array(numRays);
}
const distBuffer = room.state.distBuffer;

// Autonomous camera pilot
let px = room.state.posX;
let py = room.state.posY;
let ang = room.state.angle;
let tgtAng = room.state.targetAngle;
let cd = room.state.turnCooldown - dt;

const curSpeed = moveSpeed * (1.0 + (audio.bass || 0) * 0.4);
const moveDist = curSpeed * dt;
let forwardX = Math.cos(ang);
let forwardY = Math.sin(ang);

// Look-ahead probe to detect upcoming walls and choose open turn
const probeDist = 1.1;
const checkX = Math.floor(px + forwardX * probeDist);
const checkY = Math.floor(py + forwardY * probeDist);
const wallAhead = (checkX < 0 || checkX >= S || checkY < 0 || checkY >= S || map[checkY * S + checkX] > 0);

if (wallAhead && cd <= 0) {
  const leftAng = ang - Math.PI * 0.5;
  const rightAng = ang + Math.PI * 0.5;
  const lx = Math.floor(px + Math.cos(leftAng) * 1.2);
  const ly = Math.floor(py + Math.sin(leftAng) * 1.2);
  const rx = Math.floor(px + Math.cos(rightAng) * 1.2);
  const ry = Math.floor(py + Math.sin(rightAng) * 1.2);
  const leftClear = (lx >= 0 && lx < S && ly >= 0 && ly < S && map[ly * S + lx] === 0);
  const rightClear = (rx >= 0 && rx < S && ry >= 0 && ry < S && map[ry * S + rx] === 0);

  if (leftClear && !rightClear) {
    tgtAng = ang - Math.PI * 0.5;
  } else if (rightClear && !leftClear) {
    tgtAng = ang + Math.PI * 0.5;
  } else if (leftClear && rightClear) {
    tgtAng = ang + (Math.sin(t * 1.5) > 0 ? 0.5 : -0.5) * Math.PI;
  } else {
    tgtAng = ang + Math.PI;
  }
  cd = 0.55;
}

// Smooth angle interpolation
ang += (tgtAng - ang) * Math.min(1.0, dt * 6.5);
forwardX = Math.cos(ang);
forwardY = Math.sin(ang);

// Step with simple slide collision
const nextX = px + forwardX * moveDist;
const nextY = py + forwardY * moveDist;
const pad = 0.25;
const cellNextX = Math.floor(nextX + Math.sign(forwardX) * pad);
const cellCurY = Math.floor(py);
if (cellNextX >= 0 && cellNextX < S && map[cellCurY * S + cellNextX] === 0) {
  px = nextX;
}
const cellCurX = Math.floor(px);
const cellNextY = Math.floor(nextY + Math.sign(forwardY) * pad);
if (cellNextY >= 0 && cellNextY < S && map[cellNextY * S + cellCurX] === 0) {
  py = nextY;
}

room.state.posX = px;
room.state.posY = py;
room.state.angle = ang;
room.state.targetAngle = tgtAng;
room.state.turnCooldown = cd;

// Visual bob and horizon
const bobSpeed = 9.0 * moveSpeed;
const bobAmp = 12.0 * (1.0 + (audio.bass || 0) * 0.8);
const bob = Math.sin(t * bobSpeed) * bobAmp;
const horizon = Math.floor(H * 0.5 + bob);

ctx.save();

// 1. Floor & Ceiling background gradients
const cGrad = ctx.createLinearGradient(0, 0, 0, horizon);
cGrad.addColorStop(0, `rgb(${pal.ceil[0]}, ${pal.ceil[1]}, ${pal.ceil[2]})`);
cGrad.addColorStop(1, '#000000');
ctx.fillStyle = cGrad;
ctx.fillRect(0, 0, W, horizon);

const fGrad = ctx.createLinearGradient(0, horizon, 0, H);
fGrad.addColorStop(0, '#000000');
fGrad.addColorStop(1, `rgb(${pal.floor[0]}, ${pal.floor[1]}, ${pal.floor[2]})`);
ctx.fillStyle = fGrad;
ctx.fillRect(0, horizon, W, H - horizon);

// Floor grid lines with audio reactivity
const gridStep = 24;
ctx.lineWidth = 1;
ctx.strokeStyle = `rgba(${pal.grid[0]}, ${pal.grid[1]}, ${pal.grid[2]}, 0.35)`;
ctx.beginPath();
for (let y = horizon + 8; y < H; y += gridStep) {
  const k = (y - horizon) / (H - horizon);
  if (k > 0.05) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
}
ctx.stroke();

// 2. DDA Raycaster
const fovRad = (fovDeg * Math.PI) / 180.0;
const halfFov = fovRad * 0.5;
const beatBoost = audio.beat ? 1.4 : 1.0;
const bassBoost = (audio.bass || 0) * 0.5;
const glowFactor = 1.0 + bassBoost;

for (let i = 0; i < numRays; i++) {
  const rayScreenX = (2 * i) / numRays - 1;
  const rayAng = ang + Math.atan(rayScreenX * Math.tan(halfFov));
  const rayDirX = Math.cos(rayAng);
  const rayDirY = Math.sin(rayAng);

  let mapX = Math.floor(px);
  let mapY = Math.floor(py);

  const deltaDistX = Math.abs(1 / (rayDirX || 1e-6));
  const deltaDistY = Math.abs(1 / (rayDirY || 1e-6));

  let stepX, stepY;
  let sideDistX, sideDistY;

  if (rayDirX < 0) {
    stepX = -1;
    sideDistX = (px - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1.0 - px) * deltaDistX;
  }

  if (rayDirY < 0) {
    stepY = -1;
    sideDistY = (py - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1.0 - py) * deltaDistY;
  }

  let hit = 0;
  let side = 0;
  let steps = 0;
  const maxSteps = 40;

  while (hit === 0 && steps < maxSteps) {
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }
    if (mapX >= 0 && mapX < S && mapY >= 0 && mapY < S) {
      if (map[mapY * S + mapX] > 0) hit = 1;
    } else {
      hit = 2;
    }
    steps++;
  }

  let perpWallDist = 0;
  if (side === 0) {
    perpWallDist = (mapX - px + (1 - stepX) / 2) / rayDirX;
  } else {
    perpWallDist = (mapY - py + (1 - stepY) / 2) / rayDirY;
  }
  perpWallDist = Math.max(0.1, perpWallDist);
  distBuffer[i] = perpWallDist;

  // Wall slice geometry
  const lineHeight = Math.min(H * 2.5, Math.floor(H / (perpWallDist * Math.cos(rayAng - ang))));
  const drawStart = Math.floor(horizon - lineHeight * 0.5);
  const drawX = i * stripW;

  // Distance darkening and shading
  const fog = Math.max(0, Math.min(1, 1 - (perpWallDist / fogDepth)));
  const sideShade = side === 1 ? 0.72 : 1.0;
  const wallColor = side === 1 ? pal.wallY : pal.wallX;

  const r = Math.min(255, Math.floor(wallColor[0] * sideShade * fog * glowFactor * beatBoost));
  const g = Math.min(255, Math.floor(wallColor[1] * sideShade * fog * glowFactor * beatBoost));
  const b = Math.min(255, Math.floor(wallColor[2] * sideShade * fog * glowFactor * beatBoost));

  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(drawX, drawStart, stripW + 1, lineHeight);

  // Wall top edge highlight
  if (fog > 0.25) {
    const glowR = Math.min(255, Math.floor(pal.glow[0] * fog * beatBoost));
    const glowG = Math.min(255, Math.floor(pal.glow[1] * fog * beatBoost));
    const glowB = Math.min(255, Math.floor(pal.glow[2] * fog * beatBoost));
    ctx.fillStyle = `rgb(${glowR}, ${glowG}, ${glowB})`;
    ctx.fillRect(drawX, drawStart, stripW + 1, Math.max(1, Math.floor(3 * fog)));
  }
}

// 3. Room people represented as radar contacts & overhead mini-map
const mapScale = 4;
const mapPad = 24;
const mapPixelSize = S * mapScale;
const mapStartX = W - mapPixelSize - mapPad;
const mapStartY = mapPad;

// Mini-map background frame
ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
ctx.strokeStyle = `rgb(${pal.wallX[0]}, ${pal.wallX[1]}, ${pal.wallX[2]})`;
ctx.lineWidth = 1.5;
ctx.fillRect(mapStartX - 4, mapStartY - 4, mapPixelSize + 8, mapPixelSize + 8);
ctx.strokeRect(mapStartX - 4, mapStartY - 4, mapPixelSize + 8, mapPixelSize + 8);

// Render maze cells on radar
ctx.fillStyle = `rgba(${pal.grid[0] * 2}, ${pal.grid[1] * 2}, ${pal.grid[2] * 2}, 0.8)`;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (map[y * S + x] > 0) {
      ctx.fillRect(mapStartX + x * mapScale, mapStartY + y * mapScale, mapScale, mapScale);
    }
  }
}

// Draw room people as radar nodes inside corridors
if (room.people && room.people.length > 0) {
  const numP = room.people.length;
  for (let idx = 0; idx < numP; idx++) {
    const p = room.people[idx];
    // Derive a fixed corridor cell from index
    const nodeCellX = 1 + ((idx * 5 + 3) % (S - 2));
    const nodeCellY = 1 + ((idx * 7 + 1) % (S - 2));
    if (map[nodeCellY * S + nodeCellX] === 0) {
      const pScreenX = mapStartX + (nodeCellX + 0.5) * mapScale;
      const pScreenY = mapStartY + (nodeCellY + 0.5) * mapScale;
      const pHue = (p.hue !== undefined) ? p.hue : ((idx * 73) % 360);
      ctx.fillStyle = `hsl(${pHue}, 100%, 65%)`;
      ctx.beginPath();
      ctx.arc(pScreenX, pScreenY, 2.5 + (audio.beat ? 1.5 : 0), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Camera blip and view cone on radar
const camScreenX = mapStartX + px * mapScale;
const camScreenY = mapStartY + py * mapScale;
ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.arc(camScreenX, camScreenY, 2.5, 0, Math.PI * 2);
ctx.fill();

ctx.strokeStyle = `rgba(${pal.glow[0]}, ${pal.glow[1]}, ${pal.glow[2]}, 0.8)`;
ctx.beginPath();
ctx.moveTo(camScreenX, camScreenY);
ctx.lineTo(camScreenX + Math.cos(ang - halfFov) * 14, camScreenY + Math.sin(ang - halfFov) * 14);
ctx.moveTo(camScreenX, camScreenY);
ctx.lineTo(camScreenX + Math.cos(ang + halfFov) * 14, camScreenY + Math.sin(ang + halfFov) * 14);
ctx.stroke();

// 4. Subtle scanlines for demoscene CRT flavor
ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
for (let y = 0; y < H; y += 4) {
  ctx.fillRect(0, y, W, 1.5);
}

ctx.restore();