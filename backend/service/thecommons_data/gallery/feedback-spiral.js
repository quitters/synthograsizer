const w = Math.floor(frame.width);
const h = Math.floor(frame.height);
const cx = w * 0.5;
const cy = h * 0.5;

if (!room.state.bufA || room.state.w !== w || room.state.h !== h) {
  room.state.w = w;
  room.state.h = h;
  room.state.bufA = new OffscreenCanvas(w, h);
  room.state.bufB = new OffscreenCanvas(w, h);
  room.state.ping = 0;
  const LUT_SIZE = 1024;
  room.state.sinLut = new Float32Array(LUT_SIZE);
  room.state.cosLut = new Float32Array(LUT_SIZE);
  for (let i = 0; i < LUT_SIZE; i++) {
    const a = (i / LUT_SIZE) * Math.PI * 2;
    room.state.sinLut[i] = Math.sin(a);
    room.state.cosLut[i] = Math.cos(a);
  }
}

const sinLut = room.state.sinLut;
const cosLut = room.state.cosLut;
const fastSin = (a) => sinLut[((Math.floor((a / 6.2831853) * 1024) % 1024) + 1024) % 1024];
const fastCos = (a) => cosLut[((Math.floor((a / 6.2831853) * 1024) % 1024) + 1024) % 1024];

const srcBuf = room.state.ping === 0 ? room.state.bufA : room.state.bufB;
const dstBuf = room.state.ping === 0 ? room.state.bufB : room.state.bufA;
room.state.ping = 1 - room.state.ping;

const bCtx = dstBuf.getContext('2d');

const zoom = getVar('feedback_zoom') ?? 1.03;
const twist = getVar('twist_speed') ?? 0.015;
const persistence = getVar('trail_persistence') ?? 0.96;
const foldsMap = { 'triad (3)': 3, 'quad (4)': 4, 'hex (6)': 6, 'octa (8)': 8 };
const folds = foldsMap[getVar('symmetry_folds')] ?? 4;
const palette = getVar('color_scheme') ?? 'cyberpunk';
const emitter = getVar('emitter_style') ?? 'pulsing_polygons';

const bassKick = (audio.bass ?? 0) * 0.06;
const beatKick = audio.beat ? 0.025 : 0.0;
const curZoom = zoom + bassKick;
const curTwist = twist + beatKick + (audio.treble ?? 0) * 0.008;

bCtx.save();
bCtx.globalCompositeOperation = 'source-over';
bCtx.fillStyle = '#040208';
bCtx.fillRect(0, 0, w, h);

bCtx.save();
bCtx.translate(cx, cy);
bCtx.scale(curZoom, curZoom);
bCtx.rotate(curTwist);
bCtx.translate(-cx, -cy);
bCtx.globalAlpha = persistence;
bCtx.drawImage(srcBuf, 0, 0);
bCtx.restore();

const getHue = (shift, idx) => {
  if (palette === 'hyper_gold') {
    return (28 + shift * 12 + idx * 8) % 360;
  } else if (palette === 'emerald_vector') {
    return (130 + shift * 20 + idx * 10) % 360;
  } else if (palette === 'deep_prism') {
    return ((frame.t * 45) + shift * 30 + idx * 25) % 360;
  }
  return (280 + shift * 35 + idx * 40) % 360;
};

bCtx.globalCompositeOperation = 'lighter';
const baseR = Math.min(w, h) * 0.16 * (1 + (audio.mid ?? 0) * 0.45);
const rotTime = frame.t * 0.8;

if (emitter === 'pulsing_polygons') {
  const sides = folds;
  const angleStep = (Math.PI * 2) / sides;
  const layers = 3;
  bCtx.lineWidth = 2.5 + (audio.treble ?? 0) * 3;
  
  for (let l = 0; l < layers; l++) {
    const r = baseR * (0.4 + l * 0.35) * (1 + fastSin(frame.t * 2 + l) * 0.15);
    const rot = rotTime * (l % 2 === 0 ? 1 : -1) + l * 0.4;
    const hCol = getHue(l, 0);
    bCtx.strokeStyle = `hsl(${hCol}, 100%, ${55 + (audio.mid ?? 0) * 30}%)`;
    
    bCtx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = rot + i * angleStep;
      const px = cx + fastCos(a) * r;
      const py = cy + fastSin(a) * r;
      if (i === 0) bCtx.moveTo(px, py);
      else bCtx.lineTo(px, py);
    }
    bCtx.stroke();
  }
} else if (emitter === 'orbital_sparks') {
  const people = room.people;
  const count = (people && people.length > 0) ? Math.min(people.length, 12) : 6;
  bCtx.lineWidth = 2 + (audio.treble ?? 0) * 2;
  
  for (let i = 0; i < count; i++) {
    const p = people && people[i];
    const hCol = p ? p.hue : getHue(i, 2);
    const speed = 1.2 + i * 0.3;
    const a = frame.t * speed + (i * Math.PI * 2) / count;
    const orbitR = baseR * (0.6 + fastSin(frame.t + i) * 0.35);
    
    for (let f = 0; f < folds; f++) {
      const fa = a + (f * Math.PI * 2) / folds;
      const sx = cx + fastCos(fa) * orbitR;
      const sy = cy + fastSin(fa) * orbitR;
      
      bCtx.fillStyle = `hsl(${hCol}, 95%, 65%)`;
      bCtx.beginPath();
      bCtx.arc(sx, sy, 3 + (audio.bass ?? 0) * 4, 0, Math.PI * 2);
      bCtx.fill();
      
      bCtx.strokeStyle = `hsla(${hCol}, 90%, 60%, 0.45)`;
      bCtx.beginPath();
      bCtx.moveTo(cx, cy);
      bCtx.lineTo(sx, sy);
      bCtx.stroke();
    }
  }
} else {
  bCtx.lineWidth = 2 + (audio.mid ?? 0) * 2;
  const steps = 48;
  const aFreq = folds;
  const bFreq = folds + 1;
  const d = frame.t * 1.5;
  
  for (let set = 0; set < 2; set++) {
    const rScale = baseR * (0.75 + set * 0.4);
    const hCol = getHue(set * 2, 1);
    bCtx.strokeStyle = `hsl(${hCol}, 100%, 60%)`;
    bCtx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const u = (i / steps) * Math.PI * 2;
      const lx = cx + fastCos(u * aFreq + d) * rScale;
      const ly = cy + fastSin(u * bFreq) * rScale;
      if (i === 0) bCtx.moveTo(lx, ly);
      else bCtx.lineTo(lx, ly);
    }
    bCtx.stroke();
  }
}

bCtx.restore();

ctx.save();
ctx.drawImage(dstBuf, 0, 0);
ctx.restore();