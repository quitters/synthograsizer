ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;

// 1. Controls & Palettes
const palKey = getVar('palette') ?? 'amber_dusk';
const moonKey = getVar('moon_phase') ?? 'crescent';
const speedMult = getVar('parallax_speed') ?? 0.7;
const glowMult = getVar('light_intensity') ?? 1.3;
const mistAmount = getVar('mist_density') ?? 0.4;
const useShadows = getVar('paper_shadows') ?? true;

const PALETTES = {
  amber_dusk: {
    skyTop: '#09030e', skyBot: '#3b1625',
    lightCore: [255, 225, 160], lightGlow: [235, 115, 36],
    rim: 'rgba(255, 238, 195, 0.45)',
    layers: ['#220d24', '#2d112b', '#3a1329', '#300f21', '#240a18', '#16050e', '#070104']
  },
  amethyst_night: {
    skyTop: '#04020a', skyBot: '#1f1338',
    lightCore: [220, 230, 255], lightGlow: [130, 75, 220],
    rim: 'rgba(215, 225, 255, 0.45)',
    layers: ['#16122b', '#1e163b', '#241743', '#1d1136', '#140b26', '#0d061a', '#04020a']
  },
  emerald_mist: {
    skyTop: '#020908', skyBot: '#0f2923',
    lightCore: [225, 255, 230], lightGlow: [45, 185, 130],
    rim: 'rgba(210, 255, 230, 0.4)',
    layers: ['#0d221e', '#112b25', '#13352c', '#0f2b23', '#0a1d17', '#06130f', '#020806']
  },
  crimson_veil: {
    skyTop: '#0d0104', skyBot: '#3b0811',
    lightCore: [255, 240, 210], lightGlow: [220, 45, 60],
    rim: 'rgba(255, 210, 180, 0.45)',
    layers: ['#240910', '#300a14', '#3d0c18', '#310812', '#24050b', '#170206', '#080002']
  }
};
const theme = PALETTES[palKey] ?? PALETTES.amber_dusk;

// 2. Persistent Geometry Cache in room.state
if (!room.state.init) {
  room.state.init = true;
  const N = 128;
  room.state.N = N;
  room.state.hills = [];
  for (let l = 0; l < 5; l++) {
    const arr = new Float32Array(N);
    const f1 = 1 + l * 0.7;
    const f2 = 2.4 + l * 1.1;
    for (let i = 0; i < N; i++) {
      const u = i / N;
      arr[i] = Math.sin(u * Math.PI * 2 * f1) * 0.55 +
               Math.sin(u * Math.PI * 2 * f2 + l * 1.5) * 0.3 +
               Math.cos(u * Math.PI * 4 * f1 + l) * 0.15;
    }
    const treeCount = 6 + l * 4;
    const trees = [];
    for (let j = 0; j < treeCount; j++) {
      trees.push({
        u: (j + 0.35 + Math.sin(j * 3.7 + l) * 0.25) / treeCount,
        h: 24 + l * 10 + ((j * 17) % 20),
        w: 10 + l * 4 + ((j * 11) % 8)
      });
    }
    room.state.hills.push({ profile: arr, trees });
  }
  room.state.sparks = [];
  for (let s = 0; s < 45; s++) {
    room.state.sparks.push({
      x: Math.random(),
      y: Math.random() * 0.75,
      size: 1 + Math.random() * 2,
      layer: Math.floor(Math.random() * 5)
    });
  }
}

// 3. Audio Modulation
const bassPulse = audio.bass * 0.45 + (audio.beat ? 0.3 : 0.0);
const glowAmp = (glowMult + bassPulse) * (1.0 + audio.level * 0.3);
const lightX = W * 0.65;
const lightY = H * 0.32;

// 4. Sky and Core Glow
const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
skyGrad.addColorStop(0, theme.skyTop);
skyGrad.addColorStop(0.65, theme.skyBot);
skyGrad.addColorStop(1, '#000000');
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, H);

const radGlow = ctx.createRadialGradient(lightX, lightY, 10, lightX, lightY, Math.max(W, H) * 0.65);
const [cr, cg, cb] = theme.lightGlow;
const [lr, lg, lb] = theme.lightCore;
radGlow.addColorStop(0, `rgba(${lr}, ${lg}, ${lb}, ${Math.min(1.0, 0.85 * glowAmp)})`);
radGlow.addColorStop(0.25, `rgba(${cr}, ${cg}, ${cb}, ${Math.min(0.9, 0.5 * glowAmp)})`);
radGlow.addColorStop(0.7, `rgba(${cr}, ${cg}, ${cb}, 0.08)`);
radGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = radGlow;
ctx.fillRect(0, 0, W, H);

// 5. Celestial Cutout (Moon / Orb)
ctx.save();
const moonParallax = Math.sin(t * 0.05 * speedMult) * 12;
const mx = lightX + moonParallax;
const my = lightY;
const mr = Math.min(W, H) * 0.11;

ctx.shadowColor = `rgba(${lr}, ${lg}, ${lb}, 0.7)`;
ctx.shadowBlur = 24 * glowAmp;
ctx.fillStyle = `rgb(${lr}, ${lg}, ${lb})`;
ctx.beginPath();

if (moonKey === 'crescent') {
  ctx.arc(mx, my, mr, -Math.PI * 0.45, Math.PI * 0.75, false);
  ctx.arc(mx + mr * 0.42, my - mr * 0.22, mr * 0.88, Math.PI * 0.75, -Math.PI * 0.45, true);
  ctx.closePath();
  ctx.fill();
} else if (moonKey === 'eclipse') {
  ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.skyTop;
  ctx.beginPath();
  ctx.arc(mx + mr * 0.25, my - mr * 0.15, mr * 0.94, 0, Math.PI * 2);
  ctx.fill();
} else {
  ctx.arc(mx, my, mr * 0.85, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// 6. Paper Ridge Profiles
const baseElevations = [0.42, 0.54, 0.65, 0.76, 0.87];
const layerAmplitudes = [65, 55, 45, 38, 30];
const layerSpeeds = [0.03, 0.07, 0.12, 0.18, 0.25];
const N = room.state.N;

for (let l = 0; l < 5; l++) {
  const lData = room.state.hills[l];
  const baseH = H * baseElevations[l];
  const amp = layerAmplitudes[l] * (H / 900);
  const drift = (t * layerSpeeds[l] * speedMult) % 1.0;
  const col = theme.layers[l];

  if (mistAmount > 0.05) {
    const mistGrad = ctx.createLinearGradient(0, baseH - 45, 0, baseH + 30);
    mistGrad.addColorStop(0, 'rgba(0,0,0,0)');
    mistGrad.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, ${0.18 * mistAmount * glowAmp})`);
    mistGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mistGrad;
    ctx.fillRect(0, baseH - 50, W, 80);
  }

  ctx.save();
  if (useShadows) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 10 + l * 3;
    ctx.shadowOffsetY = 6 + l * 2;
  }
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, H);

  const steps = 72;
  for (let s = 0; s <= steps; s++) {
    const u = s / steps;
    const px = u * W;
    const sampleU = (u + drift + 10.0) % 1.0;
    const idx = sampleU * N;
    const i0 = Math.floor(idx) % N;
    const i1 = (i0 + 1) % N;
    const frac = idx - Math.floor(idx);
    const hVal = lData.profile[i0] * (1 - frac) + lData.profile[i1] * frac;
    const py = baseH + hVal * amp;
    if (s === 0) ctx.lineTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = col;
  for (let j = 0; j < lData.trees.length; j++) {
    const tr = lData.trees[j];
    const treeU = (tr.u - drift * 0.8 + 10.0) % 1.0;
    const tx = treeU * W;
    const sampleU = (treeU + drift + 10.0) % 1.0;
    const idx = (sampleU * N) % N;
    const i0 = Math.floor(idx);
    const ty = baseH + lData.profile[i0] * amp;
    const th = tr.h * (H / 800) * (1.0 + (l === 4 ? 0.3 : 0.0));
    const tw = tr.w * (W / 1200);

    ctx.beginPath();
    ctx.moveTo(tx, ty - th);
    ctx.lineTo(tx + tw * 0.4, ty - th * 0.65);
    ctx.lineTo(tx + tw * 0.25, ty - th * 0.65);
    ctx.lineTo(tx + tw * 0.7, ty - th * 0.3);
    ctx.lineTo(tx + tw * 0.45, ty - th * 0.3);
    ctx.lineTo(tx + tw, ty + 2);
    ctx.lineTo(tx - tw, ty + 2);
    ctx.lineTo(tx - tw * 0.45, ty - th * 0.3);
    ctx.lineTo(tx - tw * 0.7, ty - th * 0.3);
    ctx.lineTo(tx - tw * 0.25, ty - th * 0.65);
    ctx.lineTo(tx - tw * 0.4, ty - th * 0.65);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = theme.rim;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let s = 0; s <= steps; s++) {
    const u = s / steps;
    const px = u * W;
    const sampleU = (u + drift + 10.0) % 1.0;
    const idx = sampleU * N;
    const i0 = Math.floor(idx) % N;
    const i1 = (i0 + 1) % N;
    const frac = idx - Math.floor(idx);
    const hVal = lData.profile[i0] * (1 - frac) + lData.profile[i1] * frac;
    const py = baseH + hVal * amp;
    if (s === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  if (l === 3 && room.people && room.people.length > 0) {
    for (let pIdx = 0; pIdx < room.people.length; pIdx++) {
      const p = room.people[pIdx];
      const pu = ((pIdx + 1) / (room.people.length + 1) + t * 0.02) % 1.0;
      const lx = pu * W;
      const ly = baseH - 30 - Math.sin(t * 1.5 + pIdx * 2.1) * 16;
      const pHue = p.hue ?? 40;
      ctx.save();
      ctx.fillStyle = `hsla(${pHue}, 90%, 65%, 0.85)`;
      ctx.shadowColor = `hsla(${pHue}, 95%, 60%, 0.9)`;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// 7. Ambient ember motes
ctx.save();
for (let i = 0; i < room.state.sparks.length; i++) {
  const sp = room.state.sparks[i];
  const sx = ((sp.x + t * 0.03 * (sp.layer + 1)) % 1.0) * W;
  const sy = (sp.y * H) + Math.sin(t * 1.2 + i) * 10;
  const a = (0.25 + 0.45 * Math.sin(t * 2.5 + i * 1.3)) * (1.0 + audio.treble);
  ctx.fillStyle = `rgba(${lr}, ${lg}, ${lb}, ${Math.max(0, Math.min(1, a))})`;
  ctx.fillRect(sx, sy, sp.size, sp.size);
}
ctx.restore();

// 8. Forefront Proscenium Framing
ctx.save();
if (useShadows) {
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
}
ctx.fillStyle = theme.layers[6];

ctx.beginPath();
ctx.moveTo(0, 0);
ctx.lineTo(W * 0.16, 0);
ctx.bezierCurveTo(W * 0.12, H * 0.25, W * 0.2, H * 0.5, W * 0.14, H * 0.75);
ctx.lineTo(W * 0.22, H);
ctx.lineTo(0, H);
ctx.closePath();
ctx.fill();

ctx.beginPath();
ctx.moveTo(W, 0);
ctx.lineTo(W * 0.82, 0);
ctx.bezierCurveTo(W * 0.88, H * 0.28, W * 0.78, H * 0.55, W * 0.86, H * 0.8);
ctx.lineTo(W * 0.76, H);
ctx.lineTo(W, H);
ctx.closePath();
ctx.fill();

ctx.beginPath();
ctx.moveTo(0, 0);
ctx.lineTo(W, 0);
ctx.lineTo(W, H * 0.06);
ctx.bezierCurveTo(W * 0.75, H * 0.14, W * 0.55, H * 0.05, W * 0.45, H * 0.13);
ctx.bezierCurveTo(W * 0.35, H * 0.2, W * 0.15, H * 0.08, 0, H * 0.09);
ctx.closePath();
ctx.fill();

ctx.strokeStyle = '#000000';
ctx.lineWidth = 14;
ctx.strokeRect(0, 0, W, H);
ctx.strokeStyle = theme.rim;
ctx.lineWidth = 1.0;
ctx.strokeRect(7, 7, W - 14, H - 14);

ctx.restore();
ctx.restore();