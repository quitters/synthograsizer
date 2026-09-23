ctx.save();

const W = frame.width;
const H = frame.height;
const targetSeedCount = 38;

// Persistent preallocated state
room.state.seeds ??= [];
room.state.polyA ??= Array.from({ length: 64 }, () => ({ x: 0, y: 0 }));
room.state.polyB ??= Array.from({ length: 64 }, () => ({ x: 0, y: 0 }));
room.state.joints ??= [];

const seeds = room.state.seeds;
const polyA = room.state.polyA;
const polyB = room.state.polyB;

// Knob parameters
const leadWidth = getVar('lead_width') ?? 8;
const driftSpeed = getVar('drift_speed') ?? 0.8;
const relaxStrength = (getVar('relaxation') ?? 0.5) * 0.04;
const paletteName = getVar('glass_style') ?? 'cathedral';
const lightMode = getVar('light_source') ?? 'slanting_sun';

// Seed population & synchronisation with room.people
const people = room.people && room.people.length > 0 ? room.people : [];
while (seeds.length < targetSeedCount) {
  const idx = seeds.length;
  const person = people[idx % (people.length || 1)];
  const h = person ? person.hue : (idx * 137.5) % 360;
  seeds.push({
    x: (0.1 + 0.8 * Math.random()) * W,
    y: (0.1 + 0.8 * Math.random()) * H,
    vx: (Math.random() - 0.5) * 20,
    vy: (Math.random() - 0.5) * 20,
    hue: h,
    id: person ? person.id : null
  });
}
if (seeds.length > targetSeedCount && people.length < seeds.length) {
  seeds.length = Math.max(targetSeedCount, people.length);
}

// Update people hues if assigned
for (let i = 0; i < people.length && i < seeds.length; i++) {
  seeds[i].id = people[i].id;
  seeds[i].hue = people[i].hue;
}

// Physics: drift + gentle bounce + music excitation
const bassBump = (audio?.bass ?? 0) * 45;
const trebleShimmer = (audio?.treble ?? 0);
const dt = Math.min(frame.dt || 0.016, 0.05);
const effectiveSpeed = driftSpeed * (1 + (audio?.level ?? 0) * 0.8);

for (let i = 0; i < seeds.length; i++) {
  const s = seeds[i];
  const wander = frame.t * 0.8 + i * 1.7;
  s.vx += Math.cos(wander) * 12 * dt * effectiveSpeed;
  s.vy += Math.sin(wander) * 12 * dt * effectiveSpeed;
  s.vx *= 0.96;
  s.vy *= 0.96;
  s.x += s.vx * dt * 8;
  s.y += s.vy * dt * 8;

  // Soft boundary reflection
  const pad = 30;
  if (s.x < pad) { s.x = pad; s.vx = Math.abs(s.vx); }
  if (s.x > W - pad) { s.x = W - pad; s.vx = -Math.abs(s.vx); }
  if (s.y < pad) { s.y = pad; s.vy = Math.abs(s.vy); }
  if (s.y > H - pad) { s.y = H - pad; s.vy = -Math.abs(s.vy); }
}

// Light position calculation
let lx = W * 0.5, ly = H * 0.3;
if (lightMode === 'slanting_sun') {
  lx = W * (0.3 + 0.4 * Math.cos(frame.t * 0.15));
  ly = H * 0.1;
} else if (lightMode === 'drifting_prism') {
  lx = W * (0.5 + 0.4 * Math.sin(frame.t * 0.4));
  ly = H * (0.5 + 0.35 * Math.cos(frame.t * 0.3));
}

// Background fill (cathedral interior gloom)
ctx.fillStyle = '#08080c';
ctx.fillRect(0, 0, W, H);

// Pre-clear solder joints buffer
const joints = room.state.joints;
joints.length = 0;

// Half-plane polygon clipper (Sutherland-Hodgman)
function clipPoly(inPoly, inCount, outPoly, nx, ny, mx, my) {
  let outCount = 0;
  if (inCount === 0) return 0;
  let prev = inPoly[inCount - 1];
  let prevDot = (prev.x - mx) * nx + (prev.y - my) * ny;

  for (let k = 0; k < inCount; k++) {
    const curr = inPoly[k];
    const currDot = (curr.x - mx) * nx + (curr.y - my) * ny;
    if (currDot <= 0) {
      if (prevDot > 0) {
        const t = prevDot / (prevDot - currDot);
        outPoly[outCount].x = prev.x + (curr.x - prev.x) * t;
        outPoly[outCount].y = prev.y + (curr.y - prev.y) * t;
        outCount++;
      }
      outPoly[outCount].x = curr.x;
      outPoly[outCount].y = curr.y;
      outCount++;
    } else if (prevDot <= 0) {
      const t = prevDot / (prevDot - currDot);
      outPoly[outCount].x = prev.x + (curr.x - prev.x) * t;
      outPoly[outCount].y = prev.y + (curr.y - prev.y) * t;
      outCount++;
    }
    prev = curr;
    prevDot = currDot;
  }
  return outCount;
}

// Palette remapping helper
function getCellColor(baseHue, cx, cy) {
  let h = baseHue;
  let s = 82;
  let l = 42;
  if (paletteName === 'chartres_blue') {
    h = 205 + ((baseHue % 50) - 25);
    s = 85;
    l = 38;
  } else if (paletteName === 'amber_glow') {
    h = 28 + ((baseHue % 40) - 20);
    s = 92;
    l = 48;
  } else if (paletteName === 'rose_window') {
    const radialAngle = Math.atan2(cy - H * 0.5, cx - W * 0.5);
    h = ((radialAngle * 180 / Math.PI) + 360 + frame.t * 5) % 360;
    s = 88;
    l = 44;
  }
  return { h, s, l };
}

// Draw each Voronoi cell
for (let i = 0; i < seeds.length; i++) {
  const si = seeds[i];

  // Initial cell boundary: viewport with padding
  polyA[0].x = 0;   polyA[0].y = 0;
  polyA[1].x = W;   polyA[1].y = 0;
  polyA[2].x = W;   polyA[2].y = H;
  polyA[3].x = 0;   polyA[3].y = H;
  let count = 4;
  let currentSource = polyA;
  let currentTarget = polyB;

  for (let j = 0; j < seeds.length; j++) {
    if (i === j) continue;
    const sj = seeds[j];
    const mx = (si.x + sj.x) * 0.5;
    const my = (si.y + sj.y) * 0.5;
    const nx = sj.x - si.x;
    const ny = sj.y - si.y;

    count = clipPoly(currentSource, count, currentTarget, nx, ny, mx, my);
    const tmp = currentSource;
    currentSource = currentTarget;
    currentTarget = tmp;
    if (count < 3) break;
  }

  if (count < 3) continue;

  // Calculate centroid & area for Lloyd relaxation
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < count; k++) {
    const p1 = currentSource[k];
    const p2 = currentSource[(k + 1) % count];
    const cross = (p1.x * p2.y - p2.x * p1.y);
    area2 += cross;
    cx += (p1.x + p2.x) * cross;
    cy += (p1.y + p2.y) * cross;
  }

  if (Math.abs(area2) > 0.001) {
    cx /= (3 * area2);
    cy /= (3 * area2);
    // Lloyd relaxation step towards centroid
    if (relaxStrength > 0) {
      si.x += (cx - si.x) * relaxStrength;
      si.y += (cy - si.y) * relaxStrength;
    }
  } else {
    cx = si.x;
    cy = si.y;
  }

  // Build path
  ctx.beginPath();
  ctx.moveTo(currentSource[0].x, currentSource[0].y);
  for (let k = 1; k < count; k++) {
    ctx.lineTo(currentSource[k].x, currentSource[k].y);
    if (joints.length < 240 && (k % 2 === 0)) {
      joints.push(currentSource[k].x, currentSource[k].y);
    }
  }
  ctx.closePath();

  // Jewel glass fill with illumination gradient
  const col = getCellColor(si.hue, cx, cy);
  const distToLight = Math.hypot(cx - lx, cy - ly);
  const lightFactor = Math.max(0.3, 1.2 - (distToLight / Math.max(W, H)));
  const pulse = Math.sin(frame.t * 2 + i) * 0.08 + bassBump * 0.006;
  const lFinal = Math.min(85, Math.max(12, col.l * lightFactor + pulse * 20));

  // Layer 1: Core color
  ctx.fillStyle = `hsl(${col.h}, ${col.s}%, ${lFinal}%)`;
  ctx.fill();

  // Layer 2: Faceted glass bevel & inner luminance
  const grad = ctx.createRadialGradient(si.x, si.y, 4, cx, cy, Math.max(40, Math.sqrt(Math.abs(area2) * 0.5)));
  const brightA = 0.45 + trebleShimmer * 0.4;
  grad.addColorStop(0, `hsla(${col.h}, 95%, ${Math.min(96, lFinal + 30)}%, ${brightA})`);
  grad.addColorStop(0.6, `hsla(${col.h}, ${col.s}%, ${lFinal}%, 0.15)`);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Layer 3: Audio ripple shimmer
  if (audio?.beat) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fill();
  }

  // Heavy lead came (outer dark outline)
  ctx.lineWidth = leadWidth;
  ctx.strokeStyle = '#121316';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Metallic ridge along lead center
  ctx.lineWidth = Math.max(1, leadWidth * 0.28);
  ctx.strokeStyle = 'rgba(180, 190, 210, 0.35)';
  ctx.stroke();
}

// Solder joints at polygon corners
ctx.fillStyle = '#22252a';
const jointRad = leadWidth * 0.7;
for (let j = 0; j < joints.length; j += 2) {
  ctx.beginPath();
  ctx.arc(joints[j], joints[j + 1], jointRad, 0, 6.283);
  ctx.fill();
}

// Outer Gothic stone window frame border
const borderW = 16;
ctx.lineWidth = borderW;
ctx.strokeStyle = '#050608';
ctx.strokeRect(borderW * 0.5, borderW * 0.5, W - borderW, H - borderW);

ctx.restore();