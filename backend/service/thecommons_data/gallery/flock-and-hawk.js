const W = frame.width;
const H = frame.height;
const S = room.state;

// Palettes
const palettes = {
  dusk: { bg: [18, 12, 28], bird: [255, 180, 140], accent: [255, 90, 60], hawk: [255, 220, 90], seed: [255, 230, 110] },
  starling: { bg: [10, 16, 22], bird: [140, 200, 215], accent: [70, 130, 180], hawk: [255, 70, 70], seed: [240, 210, 120] },
  aurora: { bg: [6, 12, 18], bird: [100, 255, 190], accent: [180, 100, 255], hawk: [255, 60, 120], seed: [120, 255, 255] },
  ink_wash: { bg: [235, 230, 220], bird: [30, 30, 35], accent: [80, 75, 70], hawk: [180, 20, 20], seed: [160, 120, 60] }
};
const palName = getVar('palette_theme') ?? 'dusk';
const pal = palettes[palName] ?? palettes.dusk;
const isLight = palName === 'ink_wash';

// Motion parameters
const agilities = {
  graceful: { maxSpeed: 2.8, maxForce: 0.08, sepDist: 26, alignDist: 55, cohDist: 65 },
  agile:    { maxSpeed: 4.0, maxForce: 0.14, sepDist: 32, alignDist: 70, cohDist: 80 },
  frantic:  { maxSpeed: 5.4, maxForce: 0.22, sepDist: 40, alignDist: 90, cohDist: 95 }
};
const agility = agilities[getVar('agility_level')] ?? agilities.graceful;
const targetCount = Math.floor(getVar('flock_count') ?? 275);

// Init persistent state
S.birds ??= [];
S.hawks ??= [];
S.seeds ??= [];
S.lastT ??= frame.t;

// Process interactive triggers
if (room.events) {
  for (const ev of room.events) {
    if (ev.name === 'release_hawk') {
      const edge = Math.floor(Math.random() * 4);
      let hx = 0, hy = 0;
      if (edge === 0) { hx = Math.random() * W; hy = -40; }
      else if (edge === 1) { hx = W + 40; hy = Math.random() * H; }
      else if (edge === 2) { hx = Math.random() * W; hy = H + 40; }
      else { hx = -40; hy = Math.random() * H; }
      const toCenterX = W * 0.5 - hx;
      const toCenterY = H * 0.5 - hy;
      const len = Math.hypot(toCenterX, toCenterY) || 1;
      S.hawks.push({
        x: hx,
        y: hy,
        vx: (toCenterX / len) * 4,
        vy: (toCenterY / len) * 4,
        life: 14.0,
        swoopTimer: 0,
        targetIdx: -1
      });
      if (S.hawks.length > 3) S.hawks.shift();
    }
    if (ev.name === 'scatter_seed') {
      const margin = 0.18;
      const sx = W * (margin + Math.random() * (1 - margin * 2));
      const sy = H * (margin + Math.random() * (1 - margin * 2));
      const seedCount = 14;
      for (let i = 0; i < seedCount; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 38;
        S.seeds.push({
          x: sx + Math.cos(a) * r,
          y: sy + Math.sin(a) * r,
          life: 8.0,
          energy: 1.0
        });
      }
      if (S.seeds.length > 70) S.seeds.splice(0, S.seeds.length - 70);
    }
  }
}

// Maintain bird count
while (S.birds.length < targetCount) {
  const ang = Math.random() * Math.PI * 2;
  const spd = 1.5 + Math.random() * 2;
  S.birds.push({
    x: W * 0.3 + Math.random() * W * 0.4,
    y: H * 0.3 + Math.random() * H * 0.4,
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd,
    wing: Math.random() * 10,
    size: 2.5 + Math.random() * 2
  });
}
if (S.birds.length > targetCount) {
  S.birds.length = targetCount;
}

// Trail backdrop with subtle persistence
ctx.save();
const fadeAlpha = isLight ? 0.22 : 0.18;
ctx.fillStyle = `rgba(${pal.bg[0]}, ${pal.bg[1]}, ${pal.bg[2]}, ${fadeAlpha})`;
ctx.fillRect(0, 0, W, H);
ctx.restore();

// Update & cull seeds
for (let i = S.seeds.length - 1; i >= 0; i--) {
  const s = S.seeds[i];
  s.life -= frame.dt;
  if (s.life <= 0) {
    S.seeds.splice(i, 1);
  } else {
    const alpha = Math.min(1, s.life / 2.0);
    ctx.save();
    ctx.fillStyle = `rgba(${pal.seed[0]}, ${pal.seed[1]}, ${pal.seed[2]}, ${alpha * 0.8})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2.5 + (audio.bass || 0) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Update & draw hawks
for (let h = S.hawks.length - 1; h >= 0; h--) {
  const hawk = S.hawks[h];
  hawk.life -= frame.dt;
  hawk.swoopTimer += frame.dt;
  if (hawk.life <= 0) {
    S.hawks.splice(h, 1);
    continue;
  }

  // Hawk targets bird cluster center or single bird
  let tx = W * 0.5;
  let ty = H * 0.5;
  if (S.birds.length > 0) {
    if (hawk.targetIdx < 0 || hawk.targetIdx >= S.birds.length || Math.random() < 0.02) {
      hawk.targetIdx = Math.floor(Math.random() * S.birds.length);
    }
    const tb = S.birds[hawk.targetIdx];
    if (tb) { tx = tb.x; ty = tb.y; }
  }

  const dx = tx - hawk.x;
  const dy = ty - hawk.y;
  const d = Math.hypot(dx, dy) || 1;
  const hSpeed = 5.2 + Math.sin(hawk.swoopTimer * 2) * 1.5 + (audio.bass || 0) * 2;
  const ax = (dx / d) * 0.25;
  const ay = (dy / d) * 0.25;
  hawk.vx = (hawk.vx + ax) * 0.98;
  hawk.vy = (hawk.vy + ay) * 0.98;
  const curSpd = Math.hypot(hawk.vx, hawk.vy) || 1;
  hawk.vx = (hawk.vx / curSpd) * hSpeed;
  hawk.vy = (hawk.vy / curSpd) * hSpeed;
  hawk.x += hawk.vx;
  hawk.y += hawk.vy;

  // Draw hawk
  ctx.save();
  ctx.translate(hawk.x, hawk.y);
  ctx.rotate(Math.atan2(hawk.vy, hawk.vx));
  const wingSpan = 22 + Math.sin(frame.t * 12) * 6;
  ctx.strokeStyle = `rgb(${pal.hawk[0]}, ${pal.hawk[1]}, ${pal.hawk[2]})`;
  ctx.fillStyle = `rgba(${pal.hawk[0]}, ${pal.hawk[1]}, ${pal.hawk[2]}, 0.25)`;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.quadraticCurveTo(-2, -wingSpan, -8, -wingSpan * 0.9);
  ctx.quadraticCurveTo(-4, -4, -12, 0);
  ctx.quadraticCurveTo(-4, 4, -8, wingSpan * 0.9);
  ctx.quadraticCurveTo(-2, wingSpan, 14, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Threat aura pulse on beat
  if (audio.beat) {
    ctx.strokeStyle = `rgba(${pal.hawk[0]}, ${pal.hawk[1]}, ${pal.hawk[2]}, 0.4)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 45, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Fast spatial hashing for flock neighbors
const cellSize = 70;
const gridCols = Math.max(1, Math.ceil(W / cellSize));
const gridRows = Math.max(1, Math.ceil(H / cellSize));
const grid = [];
for (let i = 0; i < gridCols * gridRows; i++) grid[i] = [];
for (let i = 0; i < S.birds.length; i++) {
  const b = S.birds[i];
  const cx = Math.max(0, Math.min(gridCols - 1, Math.floor(b.x / cellSize)));
  const cy = Math.max(0, Math.min(gridRows - 1, Math.floor(b.y / cellSize)));
  grid[cy * gridCols + cx].push(i);
}

// Boid physics pass
const maxSpd = agility.maxSpeed * (1 + (audio.level || 0) * 0.4);
const maxFrc = agility.maxForce;
const sepDistSq = agility.sepDist * agility.sepDist;
const alignDistSq = agility.alignDist * agility.alignDist;
const cohDistSq = agility.cohDist * agility.cohDist;

for (let i = 0; i < S.birds.length; i++) {
  const b = S.birds[i];
  let sepX = 0, sepY = 0, sepCount = 0;
  let aliX = 0, aliY = 0, aliCount = 0;
  let cohX = 0, cohY = 0, cohCount = 0;

  const cx = Math.max(0, Math.min(gridCols - 1, Math.floor(b.x / cellSize)));
  const cy = Math.max(0, Math.min(gridRows - 1, Math.floor(b.y / cellSize)));

  // Check 3x3 neighboring cells
  for (let ny = Math.max(0, cy - 1); ny <= Math.min(gridRows - 1, cy + 1); ny++) {
    for (let nx = Math.max(0, cx - 1); nx <= Math.min(gridCols - 1, cx + 1); nx++) {
      const cell = grid[ny * gridCols + nx];
      for (let k = 0; k < cell.length; k++) {
        const oi = cell[k];
        if (oi === i) continue;
        const other = S.birds[oi];
        const dx = b.x - other.x;
        const dy = b.y - other.y;
        const dsq = dx * dx + dy * dy;
        if (dsq < sepDistSq && dsq > 0.001) {
          const inv = 1 / Math.sqrt(dsq);
          sepX += dx * inv;
          sepY += dy * inv;
          sepCount++;
        }
        if (dsq < alignDistSq) {
          aliX += other.vx;
          aliY += other.vy;
          aliCount++;
        }
        if (dsq < cohDistSq) {
          cohX += other.x;
          cohY += other.y;
          cohCount++;
        }
      }
    }
  }

  let fx = 0, fy = 0;
  if (sepCount > 0) {
    fx += (sepX / sepCount) * 1.6;
    fy += (sepY / sepCount) * 1.6;
  }
  if (aliCount > 0) {
    aliX /= aliCount;
    aliY /= aliCount;
    const d = Math.hypot(aliX, aliY) || 1;
    fx += ((aliX / d) * maxSpd - b.vx) * 0.45;
    fy += ((aliY / d) * maxSpd - b.vy) * 0.45;
  }
  if (cohCount > 0) {
    cohX = (cohX / cohCount) - b.x;
    cohY = (cohY / cohCount) - b.y;
    const d = Math.hypot(cohX, cohY) || 1;
    fx += ((cohX / d) * maxSpd - b.vx) * 0.3;
    fy += ((cohY / d) * maxSpd - b.vy) * 0.3;
  }

  // Evade hawks strongly
  for (let h = 0; h < S.hawks.length; h++) {
    const hawk = S.hawks[h];
    const hdx = b.x - hawk.x;
    const hdy = b.y - hawk.y;
    const hdsq = hdx * hdx + hdy * hdy;
    if (hdsq < 26000 && hdsq > 0.1) {
      const hd = Math.sqrt(hdsq);
      const panic = (1 - hd / 160) * 3.8;
      // Swirl tangential evasion
      const perpX = -hdy / hd;
      const perpY =  hdx / hd;
      fx += (hdx / hd) * panic * 2.2 + perpX * panic * 1.2;
      fy += (hdy / hd) * panic * 2.2 + perpY * panic * 1.2;
    }
  }

  // Attract to seeds
  if (S.seeds.length > 0) {
    let closestSeed = null;
    let closestDistSq = 20000;
    for (let s = 0; s < S.seeds.length; s++) {
      const seed = S.seeds[s];
      const sdx = seed.x - b.x;
      const sdy = seed.y - b.y;
      const sdsq = sdx * sdx + sdy * sdy;
      if (sdsq < closestDistSq) {
        closestDistSq = sdsq;
        closestSeed = seed;
      }
    }
    if (closestSeed) {
      const sd = Math.sqrt(closestDistSq) || 1;
      fx += ((closestSeed.x - b.x) / sd) * 1.8;
      fy += ((closestSeed.y - b.y) / sd) * 1.8;
    }
  }

  // Soft boundary repulsion
  const pad = 60;
  if (b.x < pad) fx += (pad - b.x) * 0.05;
  if (b.x > W - pad) fx -= (b.x - (W - pad)) * 0.05;
  if (b.y < pad) fy += (pad - b.y) * 0.05;
  if (b.y > H - pad) fy -= (b.y - (H - pad)) * 0.05;

  // Clamp acceleration
  const fLen = Math.hypot(fx, fy);
  if (fLen > maxFrc) {
    fx = (fx / fLen) * maxFrc;
    fy = (fy / fLen) * maxFrc;
  }

  b.vx += fx;
  b.vy += fy;
  const spd = Math.hypot(b.vx, b.vy) || 1;
  if (spd > maxSpd) {
    b.vx = (b.vx / spd) * maxSpd;
    b.vy = (b.vy / spd) * maxSpd;
  } else if (spd < 1.0) {
    b.vx = (b.vx / spd) * 1.0;
    b.vy = (b.vy / spd) * 1.0;
  }

  b.x += b.vx;
  b.y += b.vy;
  b.wing += 0.2 + spd * 0.06;

  // Screen wrap fallback
  if (b.x < -20) b.x = W + 20;
  if (b.x > W + 20) b.x = -20;
  if (b.y < -20) b.y = H + 20;
  if (b.y > H + 20) b.y = -20;
}

// Render flock
ctx.save();
for (let i = 0; i < S.birds.length; i++) {
  const b = S.birds[i];
  const heading = Math.atan2(b.vy, b.vx);
  const flap = Math.sin(b.wing) * 4;
  const sz = b.size;

  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(heading);

  // Subtle depth color shift based on speed/altitude
  const spdFactor = Math.min(1, Math.hypot(b.vx, b.vy) / maxSpd);
  const r = Math.round(pal.bird[0] * (1 - spdFactor * 0.3) + pal.accent[0] * spdFactor * 0.3);
  const g = Math.round(pal.bird[1] * (1 - spdFactor * 0.3) + pal.accent[1] * spdFactor * 0.3);
  const bl = Math.round(pal.bird[2] * (1 - spdFactor * 0.3) + pal.accent[2] * spdFactor * 0.3);
  ctx.strokeStyle = `rgb(${r}, ${g}, ${bl})`;
  ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, 0.75)`;
  ctx.lineWidth = 1.4;

  // Bird silhouette: body + articulated wings
  ctx.beginPath();
  ctx.moveTo(sz * 1.6, 0);
  ctx.lineTo(-sz * 0.8, -sz * 0.6 - flap);
  ctx.lineTo(-sz * 0.3, 0);
  ctx.lineTo(-sz * 0.8, sz * 0.6 + flap);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
ctx.restore();

// Ambient flock counter / hud dot row for connected people
if (room.people && room.people.length > 0) {
  ctx.save();
  for (let p = 0; p < room.people.length; p++) {
    const person = room.people[p];
    const px = 20 + p * 14;
    const py = H - 18;
    ctx.fillStyle = `hsl(${person.hue}, 80%, 65%)`;
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}