const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;
const minDim = Math.min(W, H);

// --- State Initialization (persistent, fixed allocations) ---
room.state.tPhase ??= 0;
room.state.beatPulse ??= 0;
room.state.bassSmooth ??= 0;
room.state.bars ??= new Float32Array(32);
room.state.ripples ??= Array.from({ length: 8 }, () => ({ r: 0, life: 0, color: '#fff', w: 2 }));

const dt = Math.min(frame.dt || 0.016, 0.1);

// Cadence mapping
const cadenceRates = { allegro: 1.6, staccato: 2.5, rubato: 0.9 };
const rate = cadenceRates[getVar('cadence')] ?? cadenceRates.allegro;

// Musical tracking & beat hit
const bassTarget = audio.bass || 0;
room.state.bassSmooth += (bassTarget - room.state.bassSmooth) * Math.min(1, dt * 14);
if (audio.beat) {
  room.state.beatPulse = 1.0;
} else {
  room.state.beatPulse = Math.max(0, room.state.beatPulse - dt * 2.8);
}

room.state.tPhase += dt * rate * (1.0 + (audio.level || 0) * 0.9);
const phase = room.state.tPhase;
const pulse = room.state.beatPulse;
const bass = room.state.bassSmooth;
const mid = audio.mid || 0;
const treb = audio.treble || 0;

// Palette definitions (bold, saturated, vintage Fischinger gouache/technicolor)
const palettes = {
  optical_poem: ['#f43f24', '#ffcc00', '#0099ff', '#ffffff', '#ff66aa'],
  radio_dynamics: ['#e6005c', '#00f0b4', '#ffe600', '#7b2cbf', '#ffffff'],
  composition_blue: ['#0055ff', '#ff3366', '#ffaa00', '#33ddff', '#fff3e0']
};
const pal = palettes[getVar('palette')] ?? palettes.optical_poem;

// Glow settings
const glows = { crisp_film: 0, halation: 14, phosphor: 28 };
const blurPx = glows[getVar('glow_intensity')] ?? glows.halation;

// Background handling (film persistence vs sharp black)
const trails = getVar('echo_trails') ?? true;
ctx.save();
if (trails) {
  ctx.fillStyle = 'rgba(5, 5, 8, 0.22)';
  ctx.fillRect(0, 0, W, H);
} else {
  ctx.fillStyle = '#040407';
  ctx.fillRect(0, 0, W, H);
}

// Spawn ripple on strong beat
if (audio.beat) {
  for (let i = 0; i < room.state.ripples.length; i++) {
    const rip = room.state.ripples[i];
    if (rip.life <= 0) {
      rip.life = 1.0;
      rip.r = minDim * 0.08;
      rip.color = pal[Math.floor(Math.random() * pal.length)];
      rip.w = 3 + bass * 8;
      break;
    }
  }
}

// --- Layer 1: Concentric Rhythmic Ripples ---
ctx.lineWidth = 2;
for (let i = 0; i < room.state.ripples.length; i++) {
  const rip = room.state.ripples[i];
  if (rip.life > 0) {
    rip.r += dt * minDim * (0.6 + bass * 0.6);
    rip.life -= dt * 1.2;
    if (rip.life > 0) {
      ctx.save();
      ctx.strokeStyle = rip.color;
      ctx.globalAlpha = Math.min(1, rip.life * 1.5);
      ctx.lineWidth = rip.w * rip.life;
      ctx.beginPath();
      ctx.arc(cx, cy, rip.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// Setup global composition glow
if (blurPx > 0) {
  ctx.shadowBlur = blurPx;
}

// --- Layer 2: Geometric Stacks & Ribbons (Staff bars) ---
const barCount = Math.floor(getVar('bar_density') ?? 12);
const mode = getVar('geometry_mode') ?? 'polyphony';
const barSpacing = W / (barCount + 1);

// Update bar values smoothly
for (let i = 0; i < barCount; i++) {
  const target = Math.sin(phase * 1.8 + i * 0.45) * 0.5 + 0.5;
  room.state.bars[i] += (target - room.state.bars[i]) * Math.min(1, dt * 10);
}

if (mode === 'polyphony' || mode === 'fugue_stacks') {
  ctx.save();
  for (let i = 0; i < barCount; i++) {
    const norm = (i + 1) / (barCount + 1);
    const bx = barSpacing * (i + 1);
    const barHeight = minDim * (0.15 + 0.5 * room.state.bars[i] + (i % 2 === 0 ? mid : bass) * 0.35);
    const barWidth = Math.max(4, barSpacing * 0.28 * (0.8 + pulse * 0.4));
    const color = pal[i % pal.length];
    const yOffset = Math.cos(phase * 1.2 + i * 0.7) * (H * 0.15);

    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.92;

    if (mode === 'fugue_stacks') {
      // Fischinger horizontal slashes and sliding wedges
      const hx = ((phase * 160 + i * (W / barCount)) % (W + 200)) - 100;
      const hy = H * 0.18 + (i / barCount) * (H * 0.64);
      const wLen = minDim * (0.1 + room.state.bars[i] * 0.25 + treb * 0.2);
      const skew = Math.sin(phase + i) * 30;
      
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + wLen, hy);
      ctx.lineTo(hx + wLen + skew, hy + 14 + bass * 12);
      ctx.lineTo(hx + skew, hy + 14 + bass * 12);
      ctx.closePath();
      ctx.fill();
    } else {
      // Vertical animated chord columns with diamond caps
      const topY = cy - barHeight * 0.5 + yOffset;
      ctx.fillRect(bx - barWidth * 0.5, topY, barWidth, barHeight);

      // Diamond cap
      ctx.beginPath();
      ctx.moveTo(bx, topY - barWidth);
      ctx.lineTo(bx + barWidth * 0.8, topY);
      ctx.lineTo(bx, topY + barWidth);
      ctx.lineTo(bx - barWidth * 0.8, topY);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

// --- Layer 3: Central Fischinger Crescents & Kreise (Rings) ---
ctx.save();
ctx.translate(cx, cy);

const mainOrbitRadius = minDim * 0.26 * (1.0 + bass * 0.35);
const crescentCount = mode === 'kreise' ? 8 : 5;

for (let i = 0; i < crescentCount; i++) {
  const f = i / crescentCount;
  const theta = phase * 0.8 + f * Math.PI * 2;
  const rad = mainOrbitRadius * (0.4 + 0.7 * Math.sin(phase * 0.6 + i * 1.3));
  const px = Math.cos(theta) * rad;
  const py = Math.sin(theta) * rad;
  const cRadius = minDim * (0.045 + 0.08 * ((i + 1) % 3) + pulse * 0.03);
  const color = pal[(i + 1) % pal.length];

  ctx.shadowColor = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.88;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(theta + phase * (i % 2 === 0 ? 1.2 : -1.2));

  if (mode === 'kreise') {
    // Concentric nesting circles with missing sectors (optical discs)
    ctx.strokeStyle = color;
    ctx.lineWidth = 4 + (i % 3) * 3 + bass * 6;
    ctx.beginPath();
    ctx.arc(0, 0, cRadius * 1.3, phase * 0.5 + i, phase * 0.5 + i + Math.PI * 1.5);
    ctx.stroke();

    // Solid counter-disk
    ctx.beginPath();
    ctx.arc(cRadius * 0.3, 0, cRadius * 0.45, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Elegant crescent moon motif via carved circular difference
    ctx.beginPath();
    ctx.arc(0, 0, cRadius, 0, Math.PI * 2);
    ctx.fill();

    // Masked inner bite to form pure crescent
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    const biteOffset = cRadius * (0.42 + 0.25 * Math.sin(phase + i));
    ctx.arc(biteOffset, 0, cRadius * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

// --- Layer 4: Central Focal Rhythm Ring ---
const coreRad = minDim * (0.08 + bass * 0.08 + pulse * 0.05);
ctx.lineWidth = 5 + bass * 10;
ctx.strokeStyle = pal[0];
ctx.shadowColor = pal[0];
ctx.beginPath();
ctx.arc(0, 0, coreRad, 0, Math.PI * 2);
ctx.stroke();

// Satellite staccato ticks triggered by trebles
const tickCount = 16;
ctx.lineWidth = 3;
ctx.strokeStyle = pal[3 % pal.length];
for (let j = 0; j < tickCount; j++) {
  const ang = (j / tickCount) * Math.PI * 2 - phase * 0.5;
  const r1 = coreRad + 10 + treb * 30;
  const r2 = r1 + 8 + (j % 2 === 0 ? 12 : 4) + treb * 24;
  ctx.beginPath();
  ctx.moveTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
  ctx.lineTo(Math.cos(ang) * r2, Math.sin(ang) * r2);
  ctx.stroke();
}

ctx.restore(); // Central transform restore

// --- Layer 5: Connected Room Presence (Audience Chords) ---
if (room.people && room.people.length > 0) {
  const ppl = room.people;
  const pCount = ppl.length;
  ctx.save();
  for (let k = 0; k < pCount; k++) {
    const p = ppl[k];
    const pAngle = (k / pCount) * Math.PI * 2 + phase * 0.25;
    const orbitDist = minDim * (0.38 + 0.06 * Math.sin(phase * 1.5 + k));
    const x = cx + Math.cos(pAngle) * orbitDist;
    const y = cy + Math.sin(pAngle) * orbitDist;

    const pHue = Number.isFinite(p.hue) ? p.hue : 45;
    ctx.fillStyle = `hsl(${pHue}, 95%, 65%)`;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;

    // Little geometric note-heads orbiting along screen periphery
    const sz = 7 + (k % 3) * 3 + pulse * 5;
    ctx.beginPath();
    ctx.arc(x, y, sz, 0, Math.PI * 2);
    ctx.fill();

    // Fine musical beam connecting to center on high energy
    if (bass > 0.45) {
      ctx.strokeStyle = `hsla(${pHue}, 90%, 65%, ${bass * 0.35})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

ctx.restore(); // Final base restore