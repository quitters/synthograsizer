/* Vector Flight 1984 - Demoscene CRT wireframe renderer */
const phosphors = {
  p1_green: { core: '#caffda', beam: '#39ff7a', glow: '#15803d', dark: '#021807' },
  amber: { core: '#fff2ce', beam: '#ffaa00', glow: '#b45309', dark: '#1f0d02' },
  cyan_vector: { core: '#e0ffff', beam: '#00f0ff', glow: '#0369a1', dark: '#011627' },
  ice_white: { core: '#ffffff', beam: '#d6e2ea', glow: '#64748b', dark: '#0c0f12' }
};
const col = phosphors[getVar('phosphor_color')] ?? phosphors.p1_green;
const shipType = getVar('ship_type') ?? 'trader_mk3';
const scannerMode = getVar('scanner_mode') ?? 'classic_3d';
const glowLevel = getVar('glow_intensity') ?? 3;
const detailLvl = getVar('vector_detail') ?? 2;
const speedMult = getVar('turn_speed') ?? 1.0;

// Persistent state & fixed geometry buffers (zero hot-loop allocations)
const st = room.state;
st.init ??= false;
if (!st.init) {
  st.init = true;
  st.px = new Float32Array(128);
  st.py = new Float32Array(128);
  st.pz = new Float32Array(128);
  st.sx = new Float32Array(128);
  st.sy = new Float32Array(128);
  st.rotShip = 0;
  st.rotStation = 0;
  st.pingR = 0;

  // Models defined once with vertices and outward-wound faces for hidden-line culling
  st.models = {
    trader_mk3: {
      verts: [
        [0, -12, 140],     // 0: nose tip
        [0, -32, -40],     // 1: cabin top ridge
        [-120, 10, -90],   // 2: port wingtip
        [120, 10, -90],    // 3: stbd wingtip
        [-45, -18, -100],  // 4: port upper engine
        [45, -18, -100],   // 5: stbd upper engine
        [-55, 18, -100],   // 6: port lower engine
        [55, 18, -100],    // 7: stbd lower engine
        [0, 24, -30],      // 8: ventral keel
        [0, 8, 120]        // 9: ventral nose
      ],
      faces: [
        [0, 1, 4, 2],       // top port hull
        [0, 3, 5, 1],       // top stbd hull
        [1, 5, 4],          // top center deck
        [0, 2, 8],          // lower port hull
        [0, 8, 3],          // lower stbd hull
        [2, 6, 8],          // underwing port
        [3, 8, 7],          // underwing stbd
        [4, 5, 7, 6],       // aft transom
        [0, 9, 8]           // forward keel wedge
      ]
    },
    viper_interceptor: {
      verts: [
        [0, -4, 160],      // 0: nose needle
        [0, -28, 20],      // 1: cockpit peak
        [-80, 8, -110],    // 2: port wing
        [80, 8, -110],     // 3: stbd wing
        [0, 18, 10],       // 4: ventral ridge
        [-25, -14, -120],  // 5: engine port top
        [25, -14, -120],   // 6: engine stbd top
        [0, 22, -120]      // 7: engine ventral
      ],
      faces: [
        [0, 1, 5, 2], [0, 3, 6, 1], [0, 2, 4], [0, 4, 3],
        [1, 6, 7, 5], [2, 5, 7, 4], [3, 4, 7, 6]
      ]
    },
    courier: {
      verts: [
        [0, 0, 150],       // 0: nose
        [0, -38, -10],     // 1: dorsal spine
        [-100, -8, -60],   // 2: swept port
        [100, -8, -60],    // 3: swept stbd
        [-70, 22, -100],   // 4: aft port fin
        [70, 22, -100],    // 5: aft stbd fin
        [0, 18, -40]       // 6: lower hull center
      ],
      faces: [
        [0, 1, 2], [0, 3, 1], [0, 2, 6], [0, 6, 3],
        [1, 3, 5], [1, 4, 2], [2, 4, 6], [3, 6, 5], [4, 5, 6]
      ]
    },
    // Coriolis space station (cuboctahedron with docking slit)
    coriolis: {
      verts: [
        [-50,-25,-50], [50,-25,-50], [50,25,-50], [-50,25,-50],
        [-50,-50,-25], [50,-50,-25], [50,50,-25], [-50,50,-25],
        [-25,-50,-50], [25,-50,-50], [-25,50,-50], [25,50,-50],
        [-50,-25,50],  [50,-25,50],  [50,25,50],  [-50,25,50],
        [-18,-6,50],   [18,-6,50],   [18,6,50],   [-18,6,50] // docking portal (16-19)
      ],
      faces: [
        [0, 1, 2, 3],       // back
        [12, 15, 14, 13],   // front face around slot
        [0, 4, 5, 1], [3, 2, 6, 7], [0, 3, 7, 4], [1, 5, 6, 2],
        [12, 13, 1], [13, 14, 2], [14, 15, 3], [15, 12, 0]
      ],
      slit: [16, 17, 18, 19]
    }
  };
}

ctx.save();

// CRT backdrop: deep black with faint phosphor persistence
ctx.fillStyle = '#010302';
ctx.fillRect(0, 0, frame.width, frame.height);

// Vector beam setup helper
const setBeam = (brightness = 1.0, width = 1.4) => {
  ctx.strokeStyle = brightness > 0.8 ? col.beam : col.glow;
  ctx.lineWidth = width;
  if (glowLevel > 1) {
    ctx.shadowColor = col.beam;
    ctx.shadowBlur = glowLevel * 3 * brightness;
  } else {
    ctx.shadowBlur = 0;
  }
};

// Draw background vector starfield (deterministic grid-hash, reactive shimmer)
const starCount = 64;
setBeam(0.4, 1.0);
for (let i = 0; i < starCount; i++) {
  const sx = (Math.sin(i * 991.1) * 0.5 + 0.5) * frame.width;
  const sy = (Math.cos(i * 647.3) * 0.5 + 0.5) * (frame.height * 0.72);
  const twinkle = 0.5 + 0.5 * Math.sin(frame.t * 2 + i);
  if (twinkle > 0.2) {
    ctx.fillStyle = col.glow;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }
}

// 3D Projection Engine
st.rotShip += frame.dt * 0.65 * speedMult;
st.rotStation += frame.dt * 0.28 * speedMult;
const pitch = Math.sin(frame.t * 0.4) * 0.28 + (audio.bass * 0.08);
const roll = Math.cos(frame.t * 0.35) * 0.15;
const yaw = st.rotShip;

// Rotation matrix components for main ship
const cy = Math.cos(yaw), sy = Math.sin(yaw);
const cp = Math.cos(pitch), sp = Math.sin(pitch);
const cr = Math.cos(roll), sr = Math.sin(roll);

// Transform and project arbitrary model
function projectModel(model, cx, cy_center, cz, scale, yawAngle, pitchAngle, rollAngle) {
  const verts = model.verts;
  const my = Math.cos(yawAngle), ny = Math.sin(yawAngle);
  const mp = Math.cos(pitchAngle), np = Math.sin(pitchAngle);
  const mr = Math.cos(rollAngle), nr = Math.sin(rollAngle);
  const fov = 480;

  for (let i = 0; i < verts.length; i++) {
    const v = verts[i];
    let x = v[0] * scale;
    let y = v[1] * scale;
    let z = v[2] * scale;

    // Yaw (Y)
    let x1 = x * my + z * ny;
    let z1 = -x * ny + z * my;
    // Pitch (X)
    let y2 = y * mp - z1 * np;
    let z2 = y * np + z1 * mp;
    // Roll (Z)
    let x3 = x1 * mr - y2 * nr;
    let y3 = x1 * nr + y2 * mr;

    x3 += cx;
    y3 += cy_center;
    z2 += cz;

    st.px[i] = x3;
    st.py[i] = y3;
    st.pz[i] = z2;

    const factor = fov / Math.max(z2, 40);
    st.sx[i] = frame.width * 0.5 + x3 * factor;
    st.sy[i] = frame.height * 0.40 + y3 * factor;
  }
}

// Render space station in top background
const stationModel = st.models.coriolis;
const statDist = 820;
const statX = Math.cos(st.rotStation * 0.4) * 160 + frame.width * 0.22 - frame.width * 0.5;
const statY = -120;
projectModel(stationModel, statX, statY, statDist, 0.75, st.rotStation, 0.4, st.rotStation * 0.5);

// Draw station facets (backface culling for clean hidden lines)
setBeam(0.7, 1.2);
for (let f = 0; f < stationModel.faces.length; f++) {
  const face = stationModel.faces[f];
  const i0 = face[0], i1 = face[1], i2 = face[2];
  const cross = (st.sx[i1] - st.sx[i0]) * (st.sy[i2] - st.sy[i0]) - (st.sy[i1] - st.sy[i0]) * (st.sx[i2] - st.sx[i0]);
  if (cross < 0) {
    ctx.fillStyle = '#010302';
    ctx.beginPath();
    ctx.moveTo(st.sx[i0], st.sy[i0]);
    for (let k = 1; k < face.length; k++) ctx.lineTo(st.sx[face[k]], st.sy[face[k]]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
// Station docking slot indicator
ctx.beginPath();
const slit = stationModel.slit;
ctx.moveTo(st.sx[slit[0]], st.sy[slit[0]]);
for (let k = 1; k < slit.length; k++) ctx.lineTo(st.sx[slit[k]], st.sy[slit[k]]);
ctx.closePath();
ctx.strokeStyle = col.core;
ctx.lineWidth = 2.0;
ctx.stroke();

// Render player ship center stage
const curShip = st.models[shipType] ?? st.models.trader_mk3;
const shipBob = Math.sin(frame.t * 1.5) * 8;
const shipScale = (Math.min(frame.width, frame.height) / 720) * (1.0 + audio.bass * 0.12);
projectModel(curShip, 0, shipBob, 380, shipScale, yaw, pitch, roll);

// Draw ship faces with hidden-line removal:
// Backface culled facets filled with opaque black then stroked in glowing vector phosphor
setBeam(1.0, 1.8);
for (let f = 0; f < curShip.faces.length; f++) {
  const face = curShip.faces[f];
  const i0 = face[0], i1 = face[1], i2 = face[2];
  const cross = (st.sx[i1] - st.sx[i0]) * (st.sy[i2] - st.sy[i0]) - (st.sy[i1] - st.sy[i0]) * (st.sx[i2] - st.sx[i0]);
  if (cross < 0) {
    ctx.beginPath();
    ctx.moveTo(st.sx[i0], st.sy[i0]);
    for (let k = 1; k < face.length; k++) ctx.lineTo(st.sx[face[k]], st.sy[face[k]]);
    ctx.closePath();
    ctx.fillStyle = '#010302';
    ctx.fill();
    ctx.stroke();
  }
}

// High-brightness vertex accent pass & engine vector exhaust
if (detailLvl >= 2) {
  setBeam(1.0, 1.2);
  ctx.fillStyle = col.core;
  for (let i = 0; i < curShip.verts.length; i++) {
    if (st.pz[i] > 100) {
      ctx.fillRect(st.sx[i] - 1.5, st.sy[i] - 1.5, 3, 3);
    }
  }
}

// Engine thruster vectors
const engPower = 20 + audio.bass * 45 + (audio.beat ? 25 : 0);
const e0 = 4, e1 = 5; // engine anchor indices
if (curShip.verts.length > 5) {
  setBeam(0.9, 2.0);
  ctx.beginPath();
  ctx.moveTo(st.sx[e0], st.sy[e0]);
  ctx.lineTo(st.sx[e0] - Math.sin(yaw) * engPower, st.sy[e0] + Math.cos(pitch) * (engPower * 0.4));
  ctx.moveTo(st.sx[e1], st.sy[e1]);
  ctx.lineTo(st.sx[e1] - Math.sin(yaw) * engPower, st.sy[e1] + Math.cos(pitch) * (engPower * 0.4));
  ctx.stroke();
}

// HUD Targeting Brackets & Crosshair
if (detailLvl >= 3) {
  setBeam(0.6, 1.0);
  const chX = frame.width * 0.5;
  const chY = frame.height * 0.40;
  const gap = 16 + audio.mid * 10;
  ctx.beginPath();
  ctx.moveTo(chX - gap - 12, chY); ctx.lineTo(chX - gap, chY);
  ctx.moveTo(chX + gap, chY); ctx.lineTo(chX + gap + 12, chY);
  ctx.moveTo(chX, chY - gap - 12); ctx.lineTo(chX, chY - gap);
  ctx.moveTo(chX, chY + gap); ctx.lineTo(chX, chY + gap + 12);
  ctx.stroke();
}

// Classic Elliptical 3D Scanner (Elite 1984 style)
const scanW = Math.min(frame.width * 0.72, 680);
const scanH = scanW * 0.32;
const scanX = frame.width * 0.5;
const scanY = frame.height * 0.83;

// Scanner boundary
setBeam(0.85, 1.8);
ctx.beginPath();
ctx.ellipse(scanX, scanY, scanW * 0.5, scanH * 0.5, 0, 0, Math.PI * 2);
ctx.stroke();

// Scanner concentric inner ring & crosshairs
setBeam(0.35, 1.0);
ctx.beginPath();
ctx.ellipse(scanX, scanY, scanW * 0.25, scanH * 0.25, 0, 0, Math.PI * 2);
ctx.moveTo(scanX - scanW * 0.5, scanY);
ctx.lineTo(scanX + scanW * 0.5, scanY);
ctx.moveTo(scanX, scanY - scanH * 0.5);
ctx.lineTo(scanX, scanY + scanH * 0.5);
ctx.stroke();

// Scanner radar sweep ping
st.pingR = (st.pingR + frame.dt * 0.45 + (audio.beat ? 0.08 : 0)) % 1.0;
setBeam(0.5 * (1.0 - st.pingR), 1.0);
ctx.beginPath();
ctx.ellipse(scanX, scanY, (scanW * 0.5) * st.pingR, (scanH * 0.5) * st.pingR, 0, 0, Math.PI * 2);
ctx.stroke();

// Scanner Blips with 3D vertical "lollipop" stalks
function drawScannerContact(normX, normZ, normY, label, blipColor) {
  const bx = scanX + normX * (scanW * 0.46);
  const byGround = scanY + normZ * (scanH * 0.46);
  const byTarget = byGround - normY * 50;

  // Stalk from scanner plane to blip
  setBeam(0.5, 1.0);
  ctx.beginPath();
  ctx.moveTo(bx, byGround);
  ctx.lineTo(bx, byTarget);
  ctx.stroke();

  // Base shadow dot on scanner disc
  ctx.fillStyle = col.dark;
  ctx.fillRect(bx - 1.5, byGround - 1.5, 3, 3);

  // Blip marker
  ctx.fillStyle = blipColor || col.core;
  ctx.shadowColor = blipColor || col.beam;
  ctx.shadowBlur = 6;
  ctx.fillRect(bx - 2.5, byTarget - 2.5, 5, 5);

  if (detailLvl >= 3 && label) {
    ctx.font = '9px monospace';
    ctx.fillStyle = col.beam;
    ctx.fillText(label, bx + 6, byTarget + 3);
  }
}

// Station blip on scanner
const statScanX = Math.cos(st.rotStation * 0.4) * 0.65;
const statScanZ = -0.55;
const statScanY = 0.35;
drawScannerContact(statScanX, statScanZ, statScanY, 'STATION', col.core);

// Scanner room contacts (connected participants represented as radar targets)
const people = room.people ?? [];
const contactCount = Math.min(people.length, 12);
for (let p = 0; p < contactCount; p++) {
  const person = people[p];
  const angle = (p / Math.max(contactCount, 1)) * Math.PI * 2 + frame.t * 0.08;
  const dist = 0.3 + ((person.hue % 50) / 100);
  const nx = Math.cos(angle) * dist;
  const nz = Math.sin(angle) * dist;
  const ny = Math.sin(angle * 2 + frame.t) * 0.35;
  const pCol = `hsl(${person.hue}, 100%, 72%)`;
  drawScannerContact(nx, nz, ny, `T-${person.table ?? p}`, pCol);
}

// Scanner self-trader blip at center
ctx.fillStyle = col.core;
ctx.fillRect(scanX - 3, scanY - 3, 6, 6);

// 1980s Vector OSD Dashboard Readouts
setBeam(0.7, 1.0);
ctx.font = '11px monospace';
ctx.fillStyle = col.beam;
ctx.shadowBlur = 4;
ctx.fillText(`TARGET: ${shipType.toUpperCase()}`, 36, 42);
ctx.fillText(`RADAR RANGE: ${Math.floor(280 + audio.level * 140)} KM`, 36, 60);
ctx.fillText(`WARP DRIVE: READY`, 36, 78);

const rightX = frame.width - 150;
ctx.fillText(`SHIELDS: ${Math.floor(88 + audio.mid * 12)}%`, rightX, 42);
ctx.fillText(`P1 VECTOR TANK`, rightX, 60);
ctx.fillText(`FPS: 60.0 [SYNC]`, rightX, 78);

// Fine phosphor CRT scanlines overlay
ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
for (let y = 0; y < frame.height; y += 4) {
  ctx.fillRect(0, y, frame.width, 1.5);
}

ctx.restore();