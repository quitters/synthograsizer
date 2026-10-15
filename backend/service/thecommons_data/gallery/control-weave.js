ctx.save();

const bundleCount = Math.round(getVar('bundle_count') ?? 2);
const strandCount = Math.round(getVar('strands_per_braid') ?? 4);
const weaveStyle = getVar('weave_pattern') ?? 'sinusoidal';
const palName = getVar('palette') ?? 'aurora';
const glowLevel = getVar('glow') ?? 3;
const speedVar = getVar('speed') ?? 0.8;
const trailMode = getVar('trail') ?? 'silk';

const trailAlpha = {
  crystal: 0.35,
  silk: 0.14,
  ghosting: 0.05
}[trailMode] ?? 0.14;

// Backdrop persistence
ctx.fillStyle = `rgba(5, 7, 14, ${trailAlpha})`;
ctx.fillRect(0, 0, frame.width, frame.height);

// Audio driving speed and density dynamics
const musicEnergy = audio.level * 0.9 + audio.bass * 1.4;
const effectiveSpeed = speedVar * (1 + musicEnergy * 1.5);

room.state.phase ??= 0;
room.state.phase += frame.dt * effectiveSpeed * 1.6;
const phase = room.state.phase;

room.state.sparks ??= [];

// Color lookup helper
function getBaseColor(strandIdx, totalStrands, progress, bundleIdx) {
  let h = 180;
  let s = 90;
  let l = 60;
  const mix = (strandIdx / totalStrands) + progress * 0.4 + bundleIdx * 0.25;

  if (palName === 'aurora') {
    h = 130 + Math.sin(mix * Math.PI * 2) * 55 + (audio.treble * 40);
    s = 85;
    l = 55 + Math.cos(mix * 3) * 15;
  } else if (palName === 'bioluminescent') {
    h = 185 + Math.sin(mix * 3.5) * 35;
    s = 95;
    l = 50 + Math.sin(progress * 5) * 20;
  } else if (palName === 'solar_flame') {
    h = (15 + Math.sin(mix * 2.5) * 35 + 360) % 360;
    s = 100;
    l = 52 + audio.bass * 20;
  } else if (palName === 'midnight_neon') {
    h = (280 + Math.sin(mix * 4) * 80 + 360) % 360;
    s = 95;
    l = 60;
  } else { // prismatic
    h = (mix * 360 + phase * 20) % 360;
    s = 90;
    l = 60;
  }

  // Integrate room attendees' colors if present
  if (room.people && room.people.length > 0) {
    const person = room.people[(strandIdx + bundleIdx) % room.people.length];
    if (person && person.hue !== undefined) {
      h = (h * 0.7 + person.hue * 0.3) % 360;
    }
  }

  return { h, s, l };
}

// Weave displacement formula producing depth (z) and vertical offset (dy)
function getWeaveOffsets(s, k, total, style, bundleOffset) {
  const strandAngle = (k / total) * Math.PI * 2;
  const waveFreq = 3.5 + bundleOffset * 0.5;
  const tProg = s * waveFreq - phase * 1.5 + strandAngle;

  let dy = 0;
  let dz = 0;

  if (style === 'double_helix') {
    const sign = k % 2 === 0 ? 1 : -1;
    const pairAngle = (Math.floor(k / 2) / Math.ceil(total / 2)) * Math.PI;
    const ang = s * waveFreq * 1.2 - phase * 2.0 + pairAngle;
    dy = Math.sin(ang) * sign;
    dz = Math.cos(ang) * sign;
  } else if (style === 'celtic_wave') {
    const harmonic = Math.sin(tProg) + 0.35 * Math.sin(tProg * 3);
    dy = harmonic;
    dz = Math.cos(tProg) - 0.25 * Math.cos(tProg * 3);
  } else if (style === 'chaotic_loom') {
    dy = Math.sin(tProg) * 0.8 + Math.cos(tProg * 1.618) * 0.4;
    dz = Math.cos(tProg * 1.2) * 0.8 + Math.sin(tProg * 0.7) * 0.4;
  } else {
    // sinusoidal classic braid
    dy = Math.sin(tProg);
    dz = Math.cos(tProg);
  }

  return { dy, dz };
}

// Spawn beat sparks along threads
if (audio.beat || (audio.bass > 0.65 && Math.random() < 0.35)) {
  for (let b = 0; b < bundleCount; b++) {
    const sparkK = Math.floor(Math.random() * strandCount);
    room.state.sparks.push({
      bundle: b,
      strand: sparkK,
      progress: Math.random() * 0.3,
      speed: 0.8 + Math.random() * 0.7 + audio.bass,
      life: 1.0,
      hue: getBaseColor(sparkK, strandCount, 0.5, b).h
    });
  }
}

ctx.lineCap = 'round';
ctx.lineJoin = 'round';

// Draw braid bundles
for (let b = 0; b < bundleCount; b++) {
  const bundleY = frame.height * ((b + 1) / (bundleCount + 1));
  const braidAmp = (35 + audio.bass * 60 + audio.level * 40) * (frame.height / 800);
  const bundleSweep = Math.sin(phase * 0.5 + b * 1.7) * (frame.height * 0.12);

  // Render multi-strand segments
  const steps = Math.min(180, Math.floor(80 + musicEnergy * 100));
  const strandPaths = [];

  for (let k = 0; k < strandCount; k++) {
    strandPaths[k] = [];
  }

  for (let i = 0; i <= steps; i++) {
    const norm = i / steps;
    const x = norm * (frame.width + 120) - 60;
    const spineY = bundleY + bundleSweep * Math.sin(norm * Math.PI * 2 + phase * 0.3) +
      Math.sin(norm * 4 - phase + b) * (15 + audio.mid * 25);

    for (let k = 0; k < strandCount; k++) {
      const { dy, dz } = getWeaveOffsets(norm * Math.PI * 2, k, strandCount, weaveStyle, b);
      const y = spineY + dy * braidAmp;
      strandPaths[k].push({ x, y, z: dz, norm });
    }
  }

  // Collect all segments across strands to depth-sort them for authentic 3D interweaving
  const renderSegments = [];
  for (let k = 0; k < strandCount; k++) {
    const pts = strandPaths[k];
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const avgZ = (p1.z + p2.z) * 0.5;
      renderSegments.push({
        k,
        b,
        p1,
        p2,
        z: avgZ,
        norm: (p1.norm + p2.norm) * 0.5
      });
    }
  }

  // Sort segments so under-threads draw before over-threads
  renderSegments.sort((a, bSeg) => a.z - bSeg.z);

  // Draw segments in two passes: base body, then luminous light highlight
  ctx.globalCompositeOperation = 'lighter';

  for (let sIdx = 0; sIdx < renderSegments.length; sIdx++) {
    const seg = renderSegments[sIdx];
    const color = getBaseColor(seg.k, strandCount, seg.norm, b);
    const depthNorm = (seg.z + 1) * 0.5; // 0 (deep behind) to 1 (foremost)
    const strandWidth = (1.5 + depthNorm * 3.5 + audio.bass * 2.5) * (glowLevel * 0.45);
    const segAlpha = Math.min(1.0, 0.2 + depthNorm * 0.65 + audio.treble * 0.25);

    // Outer soft aura
    ctx.strokeStyle = `hsla(${color.h}, ${color.s}%, ${color.l}%, ${segAlpha * 0.4})`;
    ctx.lineWidth = strandWidth * 2.8;
    ctx.beginPath();
    ctx.moveTo(seg.p1.x, seg.p1.y);
    ctx.lineTo(seg.p2.x, seg.p2.y);
    ctx.stroke();

    // Core hot laser thread
    ctx.strokeStyle = `hsla(${color.h}, 100%, ${Math.min(95, color.l + 30)}%, ${segAlpha})`;
    ctx.lineWidth = Math.max(1, strandWidth * 0.8);
    ctx.beginPath();
    ctx.moveTo(seg.p1.x, seg.p1.y);
    ctx.lineTo(seg.p2.x, seg.p2.y);
    ctx.stroke();
  }
}

// Update & draw dynamic sparks sliding through braids
const sparks = room.state.sparks;
for (let i = sparks.length - 1; i >= 0; i--) {
  const sp = sparks[i];
  sp.progress += frame.dt * sp.speed * 0.7;
  sp.life -= frame.dt * 0.6;

  if (sp.progress >= 1.0 || sp.life <= 0) {
    sparks.splice(i, 1);
    continue;
  }

  const b = sp.bundle % bundleCount;
  const bundleY = frame.height * ((b + 1) / (bundleCount + 1));
  const bundleSweep = Math.sin(phase * 0.5 + b * 1.7) * (frame.height * 0.12);
  const braidAmp = (35 + audio.bass * 60 + audio.level * 40) * (frame.height / 800);
  const norm = sp.progress;
  const x = norm * (frame.width + 120) - 60;
  const spineY = bundleY + bundleSweep * Math.sin(norm * Math.PI * 2 + phase * 0.3) +
    Math.sin(norm * 4 - phase + b) * (15 + audio.mid * 25);
  const { dy } = getWeaveOffsets(norm * Math.PI * 2, sp.strand, strandCount, weaveStyle, b);
  const y = spineY + dy * braidAmp;

  const sparkRad = (4 + audio.treble * 8) * sp.life;
  ctx.fillStyle = `hsla(${sp.hue}, 100%, 85%, ${sp.life})`;
  ctx.beginPath();
  ctx.arc(x, y, sparkRad, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `rgba(255, 255, 255, ${sp.life * 0.9})`;
  ctx.beginPath();
  ctx.arc(x, y, sparkRad * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

// Bound spark list
if (sparks.length > 160) {
  sparks.splice(0, sparks.length - 160);
}

ctx.restore();