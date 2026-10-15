const paletteChoice = getVar('palette') ?? 'incandescent';
const projStyle = getVar('projection_style') ?? 'kinetic_trio';
const speedMult = getVar('rotation_speed') ?? 1.0;
const beamSpread = getVar('beam_spread') ?? 1.2;
const lensFlare = getVar('lens_flare') ?? true;

const palettes = {
  incandescent: { base: [38, 85, 55], hot: [50, 100, 92], beam: 'rgba(255, 210, 150, ', dark: 'rgba(10, 6, 2, ' },
  cobalt_zero: { base: [215, 85, 50], hot: [195, 90, 88], beam: 'rgba(160, 210, 255, ', dark: 'rgba(2, 6, 14, ' },
  fire_ballet: { base: [12, 95, 50], hot: [42, 100, 75], beam: 'rgba(255, 140, 80, ', dark: 'rgba(15, 2, 2, ' },
  prismatic: { base: [280, 80, 55], hot: [60, 100, 85], beam: 'rgba(240, 230, 255, ', dark: 'rgba(8, 4, 12, ' }
};
const pal = palettes[paletteChoice] ?? palettes.incandescent;

const N_POINTS = 1800;
if (!room.state.init) {
  room.state.init = true;
  room.state.ptsX = new Float32Array(N_POINTS);
  room.state.ptsY = new Float32Array(N_POINTS);
  room.state.ptsZ = new Float32Array(N_POINTS);
  room.state.ptsR = new Float32Array(N_POINTS);
  room.state.ptsDrum = new Uint8Array(N_POINTS);
  
  for (let i = 0; i < N_POINTS; i++) {
    const drum = i % 3;
    room.state.ptsDrum[i] = drum;
    room.state.ptsR[i] = 0.8 + Math.random() * 2.2;
    if (drum === 0) {
      const u = (Math.random() * 2 - 1);
      const theta = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      room.state.ptsX[i] = r * Math.cos(theta);
      room.state.ptsY[i] = u;
      room.state.ptsZ[i] = r * Math.sin(theta);
    } else if (drum === 1) {
      const phi = Math.random() * Math.PI * 2;
      const h = (Math.random() * 2 - 1) * 1.4;
      room.state.ptsX[i] = Math.cos(phi);
      room.state.ptsY[i] = h;
      room.state.ptsZ[i] = Math.sin(phi);
    } else {
      const u = (Math.random() * 2 - 1);
      const theta = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u) * 1.2;
      room.state.ptsX[i] = r * Math.cos(theta);
      room.state.ptsY[i] = u * 0.7;
      room.state.ptsZ[i] = r * Math.sin(theta);
    }
  }
  room.state.rotA = 0;
  room.state.rotB = 0;
  room.state.rotC = 0;
}

const dt = Math.min(frame.dt || 0.016, 0.05);
const bassBoost = (audio.bass || 0) * 1.8;
const trebleBoost = (audio.treble || 0) * 1.2;
const beatImpulse = audio.beat ? 0.35 : 0.0;
const level = (audio.level || 0);

room.state.rotA += dt * (0.35 * speedMult + bassBoost * 0.4);
room.state.rotB -= dt * (0.28 * speedMult + trebleBoost * 0.3);
room.state.rotC += dt * (0.19 * speedMult + level * 0.5);

ctx.save();
ctx.fillStyle = 'rgba(2, 3, 5, 0.22)';
ctx.fillRect(0, 0, frame.width, frame.height);

const cx = frame.width * 0.5;
const cy = frame.height * 0.52;
const baseDim = Math.min(frame.width, frame.height);
const wallRadius = baseDim * (1.1 + beamSpread * 0.6 + bassBoost * 0.15);

const rA = room.state.rotA;
const rB = room.state.rotB;
const rC = room.state.rotC;
const cosA = Math.cos(rA), sinA = Math.sin(rA);
const cosB = Math.cos(rB), sinB = Math.sin(rB);
const cosC = Math.cos(rC), sinC = Math.sin(rC);
const tilt = 0.45;
const cosT = Math.cos(tilt), sinT = Math.sin(tilt);

const pX = room.state.ptsX;
const pY = room.state.ptsY;
const pZ = room.state.ptsZ;
const pR = room.state.ptsR;
const pDrum = room.state.ptsDrum;

ctx.globalCompositeOperation = 'screen';

const nPeers = room.people ? room.people.length : 0;
const peerHueShift = nPeers > 0 ? (room.people[0].hue % 40) - 20 : 0;

for (let i = 0; i < N_POINTS; i++) {
  const d = pDrum[i];
  if (projStyle === 'cylinder_drum' && d !== 1) continue;
  if (projStyle === 'dual_spheres' && d === 1) continue;

  let x = pX[i];
  let y = pY[i];
  let z = pZ[i];

  if (d === 0) {
    const nx = x * cosA - z * sinA;
    const nz = x * sinA + z * cosA;
    const ny = y * cosT - nz * sinT;
    z = y * sinT + nz * cosT;
    x = nx; y = ny;
  } else if (d === 1) {
    const nx = x * cosB - z * sinB;
    const nz = x * sinB + z * cosB;
    x = nx;
    z = nz;
  } else {
    const ny = y * cosC - z * sinC;
    const nz = y * sinC + z * cosC;
    const nx = x * cosA - nz * sinA;
    z = x * sinA + nz * cosA;
    x = nx; y = ny;
  }

  const lightDist = 2.4;
  const fov = lightDist / (lightDist - z * 0.75);
  if (fov <= 0) continue;

  const px = cx + x * fov * wallRadius * 0.52;
  const py = cy + y * fov * wallRadius * 0.42;

  if (px < -60 || px > frame.width + 60 || py < -60 || py > frame.height + 60) continue;

  const depthAlpha = Math.max(0.1, Math.min(1.0, (z + 1.2) * 0.45 + beatImpulse));
  const dotSize = pR[i] * fov * (1.0 + (d === 0 ? bassBoost * 0.6 : trebleBoost * 0.5));
  const spotAlpha = (0.28 + 0.5 * depthAlpha) * (0.8 + level * 0.5);

  let h = pal.base[0] + peerHueShift;
  if (paletteChoice === 'prismatic') {
    h = (h + Math.atan2(y, x) * 57.3 + frame.t * 15) % 360;
  } else if (d === 2) {
    h = pal.hot[0];
  }

  ctx.fillStyle = `hsla(${h}, ${pal.base[1]}%, ${pal.base[2] + depthAlpha * 25}%, ${spotAlpha})`;
  ctx.beginPath();
  ctx.arc(px, py, Math.max(0.6, dotSize), 0, 6.2832);
  ctx.fill();

  if (dotSize > 2.2 && depthAlpha > 0.65) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.45 * depthAlpha})`;
    ctx.beginPath();
    ctx.arc(px, py, dotSize * 0.35, 0, 6.2832);
    ctx.fill();
  }
}

if (lensFlare) {
  const flareAlpha = 0.08 + bassBoost * 0.12 + beatImpulse * 0.1;
  const coreGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, baseDim * 0.48);
  coreGrad.addColorStop(0, pal.beam + (flareAlpha * 1.6) + ')');
  coreGrad.addColorStop(0.15, pal.beam + (flareAlpha * 0.7) + ')');
  coreGrad.addColorStop(0.6, pal.beam + '0.01)');
  coreGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = coreGrad;
  ctx.fillRect(cx - baseDim * 0.5, cy - baseDim * 0.5, baseDim, baseDim);

  const barWidth = baseDim * (0.7 + level * 0.6);
  const barHeight = 2.5 + bassBoost * 3;
  ctx.fillStyle = pal.beam + (0.12 + beatImpulse * 0.25) + ')';
  ctx.fillRect(cx - barWidth * 0.5, cy - barHeight * 0.5, barWidth, barHeight);
}

ctx.restore();