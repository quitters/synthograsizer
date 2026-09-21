/*
 * FlowMounds (v0.25), on the wall -- boil on command.
 *
 * A hand port of the p5 original (FxHashBackup, collections/bootloader/
 * flowmounds-v0-25, 2026-09-06) to plain Canvas2D. It paints the picture the
 * explorer paints for the same values: p5 1.4.0's seeded random() and noise()
 * are reimplemented exactly, every random draw happens in the original's
 * order, and the scene is laid out at the explorer's `high` tier (2000px) and
 * drawn scaled to whatever the wall is. Its composite spends no randomness, so
 * spreading the painting over many frames cannot move a single mark.
 *
 * Three passes, in the original's order: sky, land, and the creature painted
 * last and on top, modelled, with the near bank crossing its feet.
 *
 * The boil is the original's `T`, given to the host as a control: the same
 * creature is painted again from a seed of its own, once per frame of the loop,
 * with the face, the colours and any rare effect anchored where they are. The
 * wall then plays those frames back the way a hand-drawn animation is shot on
 * twos -- the picture stays still and every mark in it crawls.
 *
 * The room steers the painting. The host picks which mound, and when it boils.
 */

const FM = (room.state.flowmounds ??= (() => {
// ── p5 1.4.0's random() and noise(), exactly ────────────────────────────────
// The whole picture hangs off these two. p5's random is a 32-bit LCG and its
// noise is a 4096-entry table filled from a second LCG of the same shape. They
// are short enough to carry, and carrying them is the only way this piece and
// the explorer can draw the same marks.
const M32 = 4294967296;
let Z = 0;
const random = () => (Z = (1664525 * Z + 1013904223) % M32) / M32;
const randomSeed = (s) => { Z = s >>> 0; };
const PERLIN = new Float64Array(4096);
function noiseSeed(s) {
  let r = s >>> 0;
  for (let i = 0; i < 4096; i++) PERLIN[i] = (r = (1664525 * r + 1013904223) % M32) / M32;
}
const scaledCosine = (i) => 0.5 * (1 - Math.cos(i * Math.PI));
function noise(x, y = 0, w = 0) {
  if (x < 0) x = -x;
  if (y < 0) y = -y;
  if (w < 0) w = -w;
  let xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(w);
  let xf = x - xi, yf = y - yi, zf = w - zi;
  let r = 0, ampl = 0.5;
  for (let o = 0; o < 4; o++) {
    let of = xi + (yi << 4) + (zi << 8);
    const rxf = scaledCosine(xf), ryf = scaledCosine(yf);
    let n1 = PERLIN[of & 4095];
    n1 += rxf * (PERLIN[(of + 1) & 4095] - n1);
    let n2 = PERLIN[(of + 16) & 4095];
    n2 += rxf * (PERLIN[(of + 17) & 4095] - n2);
    n1 += ryf * (n2 - n1);
    of += 256;
    n2 = PERLIN[of & 4095];
    n2 += rxf * (PERLIN[(of + 1) & 4095] - n2);
    let n3 = PERLIN[(of + 16) & 4095];
    n3 += rxf * (PERLIN[(of + 17) & 4095] - n3);
    n2 += ryf * (n3 - n2);
    n1 += scaledCosine(zf) * (n2 - n1);
    r += n1 * ampl;
    ampl *= 0.5;
    xi <<= 1; xf *= 2; yi <<= 1; yf *= 2; zi <<= 1; zf *= 2;
    if (xf >= 1) { xi++; xf--; }
    if (yf >= 1) { yi++; yf--; }
    if (zf >= 1) { zi++; zf--; }
  }
  return r;
}

const rnd = (a, b) => a + random() * (b - a);
const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(random() * arr.length)];
const chance = (p) => random() < p;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const TWO_PI = Math.PI * 2, HALF_PI = Math.PI / 2;

// p5's color('#rrggbb') read back through red()/green()/blue(): the value is
// divided by 255 on the way in and multiplied by 255 on the way out, and the
// piece truncates the result with |0, where that round trip can show.
const p5c = (hex) => [0, 2, 4].map((i) => parseInt(String(hex).slice(1 + i, 3 + i), 16) / 255 * 255);
// The piece's own reader, which is not the same function: plain integers.
const rgbOf = (hex) => {
  const t = String(hex).replace('#', '');
  return [0, 2, 4].map((i) => parseInt(t.slice(i, i + 2), 16) || 0);
};

// ── a drawing surface ───────────────────────────────────────────────────────
// p5's createGraphics(), as much of it as this piece uses.
function surface(w, h) {
  const canvas = new OffscreenCanvas(w, h);
  return { canvas, ctx: canvas.getContext('2d'), width: w, height: h };
}
const clearSurface = (g) => { g.ctx.setTransform(1, 0, 0, 1, 0, 0); g.ctx.clearRect(0, 0, g.width, g.height); };

// ── the piece's world ───────────────────────────────────────────────────────
/*
 * The explorer's quality tiers, which change fidelity and never composition:
 * the marks are the same marks, in the same places, at the same sizes -- a
 * lower tier lays the sprite down less often along each one. Everything that
 * could make the buffer size visible is expressed relative to it (the flow
 * field is multiplied by 2000/RES, widths and step length scale with it), so
 * the same seed draws the same picture at any of them.
 *
 * The tier follows the size the piece is actually shown at, exactly as the
 * explorer's does: a wall gets `high` -- which is the tier the Sketchbook's
 * parity harness checks -- and a thumbnail on the creator desk gets `low`,
 * where it costs a third as much and nobody can tell.
 */
const TIERS = { low: [900, 2.2], medium: [1400, 1.5], high: [2000, 1.0] };
const tierFor = (side) => (side <= 520 ? 'low' : side <= 820 ? 'medium' : 'high');
let tier = 'high';
let D = 2000;                   // the layout space: the tier's buffer size
let SPACING_MUL = 1;            // how often the sprite is laid along a mark
const BRUSH_PX = 96;
const PALETTES = {
  'Chalk Pop':       { ground: '#f6efef', inks: ['#181818', '#2e2e2e', '#4fc4cf', '#994ff3'], accent: '#fbdd74' },
  'Navy Mint':       { ground: '#f2f4f6', inks: ['#00214d', '#1b2d45', '#00ebc7', '#ff5470'], accent: '#fde24f' },
  'Harbour':         { ground: '#d8eefe', inks: ['#094067', '#5f6c7b', '#3da9fc', '#90b4ce'], accent: '#ef4565' },
  'Midnight Violet': { ground: '#16161a', inks: ['#fffffe', '#94a1b2', '#7f5af0', '#72757e'], accent: '#2cb67d', dark: true },
  'Pine Amber':      { ground: '#f2f7f5', inks: ['#00473e', '#475d5b', '#faae2b', '#ffa8ba'], accent: '#fa5246' },
  'Lavender Ink':    { ground: '#fffffe', inks: ['#2b2c34', '#6246ea', '#d1d1e9'], accent: '#e45858' },
  'Orchid Dust':     { ground: '#f9f8fc', inks: ['#0e172c', '#d9d4e7', '#a786df'], accent: '#fec7d7' },
  'Teal Clay':       { ground: '#f8f5f2', inks: ['#232323', '#222525', '#078080', '#feefe8'], accent: '#f45d48' },
  'Signal Orange':   { ground: '#eff0f3', inks: ['#0d0d0d', '#2a2a2a', '#ff8e3c', '#fffffe'], accent: '#d9376e' },
  'Deep Jade':       { ground: '#004643', inks: ['#e8e4e6', '#abd1c6', '#f9bc60', '#fffffe'], accent: '#e16162', dark: true },
  'Linen Bronze':    { ground: '#f9f4ef', inks: ['#020826', '#716040', '#8c7851', '#eaddcf'], accent: '#f25042' },
  'Indigo Rose':     { ground: '#232946', inks: ['#fffffe', '#b8c1ec', '#d4d8f0', '#eebbc3'], accent: '#d4939d', dark: true },
  'Nocturne':        { ground: '#0f0e17', inks: ['#fffffe', '#a7a9be', '#ff8906', '#f25f4c'], accent: '#e53170', dark: true },
  'Aqua Sun':        { ground: '#e3f6f5', inks: ['#272343', '#2d334a', '#bae8e8', '#fffffe'], accent: '#ffd803' },
  'Blush Mint':      { ground: '#faeee7', inks: ['#33272a', '#594a4e', '#ff8ba7', '#ffc6c7'], accent: '#c3f0ca' },
  'Cacao Rose':      { ground: '#55423d', inks: ['#fff3ec', '#ffc0ad', '#9656a1', '#271c19'], accent: '#e78fb3', dark: true },
  'Cream Cobalt':    { ground: '#fef6e4', inks: ['#001858', '#172c66', '#f3d2c1', '#8bd3dd'], accent: '#f582ae' },
  'Sunshine Spritz': { ground: '#f7f7ff', inks: ['#2d3047', '#2ec4b6', '#ff7a59'], accent: '#ffd84d' },
  'Coral Confetti':  { ground: '#caffbf', inks: ['#ffa8a8', '#9bf6ff', '#ffd6a5'], accent: '#ff5e7e' },
  'Citrus Pop':      { ground: '#a3f7bf', inks: ['#3a86ff', '#fb8500', '#8eecf5'], accent: '#ffb703' },
  'Lagoon Party':    { ground: '#ffe66d', inks: ['#48cae4', '#90e0ef', '#ffafcc'], accent: '#00b4d8' },
  'Bubblegum Picnic': { ground: '#fff3b0', inks: ['#3d405b', '#7ae582', '#ff9de2'], accent: '#ff4d9d' },
  'Mango Tango':     { ground: '#cbf3f0', inks: ['#e71d36', '#2ec4b6', '#ffbf69'], accent: '#ff9f1c' },
  'Minty Smile':     { ground: '#faf3dd', inks: ['#5e6472', '#ffa69e', '#aed9e0'], accent: '#b8f2e6' },
  'Rainbow Sherbet': { ground: '#fdffb6', inks: ['#9bf6ff', '#ffd6a5', '#caffbf'], accent: '#ffadad' },
  'Peachy Parade':   { ground: '#f8edeb', inks: ['#577590', '#f9c74f', '#fcd5ce'], accent: '#ffb5a7' },
  'Lemon Lime Lift': { ground: '#c0fdfb', inks: ['#4d4d4d', '#ff6f91', '#b8f2a6'], accent: '#f9f871' },
  'Sky Balloon':     { ground: '#fffffc', inks: ['#bdb2ff', '#ffeb3b', '#ffc6ff'], accent: '#a0c4ff' },
  'Strawberry Soda': { ground: '#ffd6e0', inks: ['#3a86ff', '#06d6a0', '#ff8fa3'], accent: '#ff477e' },
  'Tulip Carnival':  { ground: '#ffbe0b', inks: ['#8338ec', '#3a86ff', '#fb5607'], accent: '#ff006e' },
  'Aqua Gelato':     { ground: '#fee440', inks: ['#2b2d42', '#00bbf9', '#ff99c8'], accent: '#00f5d4' },
  'Banana Split':    { ground: '#b8f2e6', inks: ['#3d348b', '#ff6392', '#7fc8f8'], accent: '#ffe45e' },
  'Flamingo Float':  { ground: '#fde2e4', inks: ['#a9def9', '#fec8d8', '#d0f4de'], accent: '#ff85a1' },
  'Pineapple Punch': { ground: '#9bc53d', inks: ['#e55934', '#fa7921', '#5bc0eb'], accent: '#fde74c' },
  'Sunny Studio':    { ground: '#f8f9fa', inks: ['#118ab2', '#ef476f', '#06d6a0'], accent: '#ffd166' },
  'Carnival Candies': { ground: '#e9ff70', inks: ['#ff9770', '#70d6ff', '#ffd670'], accent: '#ff70a6' },
  'Meadow Mirth':    { ground: '#d1f5be', inks: ['#2e294e', '#e9724c', '#ffc857'], accent: '#7bd389' },
};

/*
 * The piece's hash and the values the room doesn't hold. Between them and the
 * controls below this is a complete set of the explorer's 86 parameters, so
 * anything this wall draws can be typed straight back into the explorer.
 */
const HASH = 'bf5b96e7796510bd0ad7afcffd571c73267ac0fa05a0092a9df4b1a4a6f4158a';
const LOOK = {
  key: 'Natural', contrastFlip: true,
  bgGrain: 0.07, bgShade: 0.18, formShade: 0, lightAngle: 45,
  modelling: 0.66, occlusion: 0.12, rimLight: 0.22,
  hueJitter: 7, drift: 12, toneJitter: 12, inkFocus: 0.02,
  horizonRough: 0.017, tuft: 0.016, moundShadow: 0.26, lipCover: 0.48,
  skyDensity: 280, skyWidth: 29, skyAlpha: 0.15, skyFlow: 0.15,
  skyAccentOn: false, skyAccent: '#38012a', skyAccentRate: 0.12,
  landDensity: 280, landWidth: 14.6, landAlpha: 0.13, landFlow: 0.35,
  landAccentOn: false, landAccent: '#40ab4a', landAccentRate: 0.26,
  // Raised from the look's own 0 so the room's Structure control actually
  // steers the marks: at zero the field alone decides, and the choice is dead.
  structStr: 0.55, flowJitter: 0.16, turbulence: 2.95, bands: 15,
  accentBrush: 0.86, accentSpread: 24, paintRoll: 0.83,
  markAlpha: 0.14, bristles: 2, brushDry: 0.34,
  moundAccentOn: true, moundAccent: '#453bac', moundAccentRate: 0.35,
  moundBaseSource: 'Accent',
  profile: 2.55, lean: -0.06, wobble: 0.62, wobbleScale: 0.45, bodyTone: 0.74,
  eyeRoll: 0.82, eyeSpacing: 0.105, eyeY: 0.35, eyeTilt: -15, eyeHand: 0.48,
  eyeTint: 0.13, eyeInk: '#271f28',
  eyeShadow: true, shadowOpacity: 0.42, shadowShade: 0.72, shadowTint: 'Eye',
  shadowBlend: 'Exclusion', shadowOffset: 0.22, shadowSoft: 0.06, shadowAngle: 145,
  rareRoll: 0.195, rareEffect: 'Crown',
  fieldSeed: 4165779, variation: 'bprprwnsodht',
  fieldDrift: 0.5, animFrames: 8, animFps: 12,
};
// What the controls hold, repeated here because the gallery's harness and a
// display that has lost its relay both hand getVar() nothing at all.
const ROOM = {
  palette: 'Aqua Gelato', creature: 'Blush Mint', contrast: 'Value', separation: 0.02,
  structure: 'Radial', marks: 1000, mark_length: 67, mark_width: 2.05,
  horizon: 0.74, apex: 0.64, width: 0.64, eye_size: 0.14, eye_shape: 0.4, ground: true,
  mound: 1, wander: false,
};

// Mound number 1 is the look above; the others step `fieldSeed` by a prime, so
// every mound on this wall has a number the explorer can be given.
const fieldSeedFor = (mound) => (LOOK.fieldSeed + (Math.round(mound) - 1) * 7919) % 9999999;

/** The explorer's whole parameter set, for a set of room values. */
function explorerParams(want, mound) {
  return {
    ...LOOK,
    fieldSeed: fieldSeedFor(mound),
    palette: want.palette, moundPalette: want.creature,
    contrast: want.contrast, separation: want.separation,
    structure: want.structure, density: want.marks,
    markLength: want.mark_length, markWidth: want.mark_width,
    horizon: want.horizon, apex: want.apex, moundWidth: want.width,
    eyeSize: want.eye_size, eyeShape: want.eye_shape, groundInFront: want.ground,
  };
}

function readRoom(getVar) {
  const v = (name) => {
    const x = getVar(name);
    return x === null || x === undefined ? ROOM[name] : x;
  };
  const want = {};
  for (const name of Object.keys(ROOM)) want[name] = v(name);
  return want;
}

// ── the piece's own colour plumbing ─────────────────────────────────────────
const EYE_BANDS = [[0.490, 2], [0.008, 1], [0.008, 4], [0.004, 3], [0.490, 2]];
const PASS_SALT = [0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
const ZERO_OFF = [0, 0];
const SKY = 0, LAND = 1, MOUND = 2;

function eyeCountFrom(roll) {
  let acc = 0;
  const r = clamp(Number(roll) || 0, 0, 1);
  for (const [w, n] of EYE_BANDS) { acc += w; if (r < acc) return n; }
  return 2;
}

const NEUTRAL = { val: 55, pull: 0, sat: 1, dens: 1 };
const CONTRAST = {
  Value:   { fig: { val: 92, pull: 0.78, sat: 0.7, dens: 1 },
             gnd: { val: 16, pull: 0.84, sat: 0.72, dens: 1 } },
  Chroma:  { fig: { val: 55, pull: 0.1, sat: 1.5, dens: 1 },
             gnd: { val: 48, pull: 0.3, sat: 0.34, dens: 1 } },
  Density: { fig: { val: 45, pull: 0.2, sat: 1.15, dens: 1.3 },
             gnd: { val: 72, pull: 0.5, sat: 0.68, dens: 0.3 } },
  None:    { fig: NEUTRAL, gnd: NEUTRAL },
};
const KEY = { Bright: { val: 60, sat: 32 }, Natural: { val: 30, sat: 16 }, Deep: { val: 0, sat: 0 } };
const inKey = ([h, s, v], k) => [h, Math.max(s, k.sat), Math.max(v, k.val)];

function planAt(plan, amount) {
  const t = clamp(amount, 0, 1);
  return { val: plan.val, pull: plan.pull * t, sat: 1 + (plan.sat - 1) * t, dens: 1 + (plan.dens - 1) * t };
}
const tone = ([h, s, v], plan) => [h, clamp(s * plan.sat, 0, 100), clamp(v + (plan.val - v) * plan.pull, 0, 100)];
const lerpHue = (a, b, t) => {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
};

function accentFamily([h, s, v], spread, n) {
  const out = [[h, s, v]];
  const centre = clamp(v, 36, 70);
  for (let i = 1; i < n; i++) {
    const t = n > 2 ? (i - 1) / (n - 2) : 0.5;
    out.push([
      (h + (t - 0.5) * 2 * spread + rnd(-spread * 0.2, spread * 0.2) + 360) % 360,
      clamp(s * (1.12 - 0.42 * t) + rnd(-6, 6), 5, 100),
      clamp(centre + (t - 0.5) * 2 * 32 + rnd(-5, 5), 8, 97),
    ]);
  }
  return out;
}
const blendPools = (A, B, t) => A.map((a, i) => {
  const b = B[i % B.length];
  return [lerpHue(a[0], b[0], t), a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
});
function chromaticInk(inks) {
  const ranked = inks.map((c, i) => [i, hsb(c)[1]]).sort((a, b) => b[1] - a[1]);
  const pickFrom = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2)));
  return pickFrom[Math.floor(random() * pickFrom.length)][0];
}

const RARE_LO = 0.45, RARE_HI = 0.55;
const TINT_LO = 0.46, TINT_HI = 0.54;
const eyeTintFires = (p) => {
  const r = clamp(Number(p.eyeTint) || 0, 0, 1);
  return r >= TINT_LO && r < TINT_HI;
};
const PAINT_LO = 0.41, PAINT_HI = 0.59;
const moundIsPainted = (p) => {
  const r = clamp(Number(p.paintRoll) || 0, 0, 1);
  return !(r >= PAINT_LO && r < PAINT_HI);
};
const rareFrom = (roll, effect) => {
  const r = clamp(Number(roll) || 0, 0, 1);
  return (r >= RARE_LO && r < RARE_HI) ? effect : 'None';
};
const SEP_FLOOR = 0.20;
const DETAIL_RATIO = 0.6;
const UNPAINTED_CALM = 0.34;

const mixRGB = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const lumaOf = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
function massOf(groundHex, inkHexes) {
  let r = groundHex ? rgbOf(groundHex)[0] * 2 : 0;
  let g = groundHex ? rgbOf(groundHex)[1] * 2 : 0;
  let b = groundHex ? rgbOf(groundHex)[2] * 2 : 0;
  let w = groundHex ? 2 : 0;
  for (const h of inkHexes) { const c = rgbOf(h); r += c[0]; g += c[1]; b += c[2]; w++; }
  return [r / w, g / w, b / w];
}
function massGap(a, b) {
  const opp = ([r, g, b]) => [0.299 * r + 0.587 * g + 0.114 * b, r - g, 0.5 * (r + g) - b];
  const A = opp(a), B = opp(b);
  const dL = A[0] - B[0], d1 = (A[1] - B[1]) * 0.6, d2 = (A[2] - B[2]) * 0.6;
  return Math.sqrt(dL * dL + d1 * d1 + d2 * d2) / 255;
}

function hsb(hex) {
  const [R, G, B] = p5c(hex);
  const r = R / 255, g = G / 255, b = B / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, mx ? (d / mx) * 100 : 0, mx * 100];
}
function hsb2rgb(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [((r + m) * 255) | 0, ((g + m) * 255) | 0, ((b + m) * 255) | 0];
}
const hsbToHex = ([h, s, v]) => {
  const [r, g, b] = hsb2rgb(h, s, v);
  return '#' + [r, g, b].map((c) => clamp(c, 0, 255).toString(16).padStart(2, '0')).join('');
};
const toneHex = (hex, plan) => hsbToHex(tone(hsb(hex), plan));

const jitterInk = ([h, s, b]) => [
  (h + rnd(-P.hueJitter, P.hueJitter) + 360) % 360,
  Math.max(0, Math.min(100, s + rnd(-10, 10))),
  Math.max(0, Math.min(100, b + rnd(-P.toneJitter, P.toneJitter))),
];
function lerpAngle(from, to, t) {
  const d = ((to - from + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
  return from + d * t;
}
const asHex = (v) => String(v || '#000000').slice(0, 7);
const strHash = (s) => {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

// ── the piece's state ───────────────────────────────────────────────────────
let art = null, scene = null, layers = [], brushes = [], softBrushes = [], stamp = null;
let lipLayer = null, grainTex = null;
let faceAnchor = null, handAnchor = null, facePlaced = [], facePlan = null;
let rarePlan = null, rareAnchor = null, colourAnchor = null;
let seedForPass = () => 0;
let paths = [], cursor = 0, passIndex = SKY, finished = false, painterGen = null;
let surf = null, horizonLine = null;
let P = {};
let frameNo = 0;
let faceZ = 0;

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Four big buffers is a fifth of a second of allocation, so they are made once
// and cleared thereafter -- a repaint must not cost the wall a stutter. Only a
// change of tier throws them away.
function allocBuffers() {
  if (art && art.width === D) return;
  art = surface(D, D);
  scene = surface(D, D);
  for (let i = 0; i < 3; i++) layers[i] = surface(D, D);
  if (!stamp) stamp = surface(BRUSH_PX, BRUSH_PX);
}

/**
 * The picture with the living face on top of it, in the picture's own space.
 *
 * Not drawn onto the wall directly, for two reasons: the eye shadow is a blend
 * mode, so it has to have the painting under it rather than bare canvas -- and
 * stamping the face's edge onto the canvas the browser is presenting costs
 * about fifty times what stamping it into a buffer does, which is most of a
 * frame on a desk full of thumbnails.
 */
function sceneWithFace(anim) {
  const c = scene.ctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.drawImage(art.canvas, 0, 0);
  drawFace(c, anim);
  return scene.canvas;
}

// ── build ───────────────────────────────────────────────────────────────────
/**
 * One frame of the piece, from parameters. `n` is the boil frame: frame 0 is
 * the picture itself, and every frame after it re-rolls the paint from a seed
 * of its own while the face, the colours and any rare effect stay anchored --
 * which is what makes a boil a boil rather than a slideshow.
 */
function build(p, n) {
  frameNo = n || 0;
  const pal = PALETTES[p.palette] || PALETTES['Chalk Pop'];
  const mpal = PALETTES[p.moundPalette] || pal;
  const frameCount = clamp(Math.round(p.animFrames), 1, 24);
  const passFrame = () => frameNo;
  const seedAt = (f, salt) => {
    const variation = f === 0 ? String(p.variation) : String(p.variation) + '~' + f;
    return ((strHash(HASH) ^ (p.fieldSeed % 9999999 + strHash(variation))) ^ salt) >>> 0;
  };
  seedForPass = (i) => seedAt(passFrame(), PASS_SALT[i]);
  noiseSeed((strHash(HASH) ^ (p.fieldSeed % 9999999) ^ strHash(String(p.variation))) >>> 0);
  randomSeed(seedForPass(MOUND));

  if (frameNo === 0) {
    faceAnchor = null;
    handAnchor = null;
    rareAnchor = null;
    colourAnchor = null;
  }

  const horizonY0 = clamp(p.horizon, 0.05, 0.98) * D;
  const mode = CONTRAST[p.contrast] || CONTRAST.None;
  const flip = !!p.contrastFlip;
  const figSide = flip ? mode.gnd : mode.fig;
  const gndSide = flip ? mode.fig : mode.gnd;

  const accentMix = Math.pow(clamp(p.accentBrush, 0, 1), 2);
  const rolledFamily = accentFamily(
    hsb(p.moundAccentOn ? asHex(p.moundAccent) : mpal.accent),
    clamp(p.accentSpread, 0, 90), mpal.inks.length);
  const rolledPool = accentMix > 0
    ? blendPools(mpal.inks.map(hsb), rolledFamily, accentMix)
    : mpal.inks.map(hsb);
  const rolledPoolHex = rolledPool.map(hsbToHex);
  const rolledDom = [chromaticInk(pal.inks), chromaticInk(pal.inks), chromaticInk(rolledPoolHex)];
  const rolledOthers = rolledPoolHex.filter((_, i) => i !== rolledDom[2]);
  const rolledBase = rolledOthers.length
    ? rolledOthers[Math.floor(random() * rolledOthers.length)] : rolledPoolHex[0];
  if (!colourAnchor) colourAnchor = { domIdx: rolledDom, baseInk: rolledBase, pool: rolledPool };
  const domIdx = colourAnchor.domIdx;
  const baseInk = colourAnchor.baseInk;
  const moundPool = colourAnchor.pool;

  const key = KEY[p.key] || KEY.Natural;
  const absoluteBase = p.moundBaseSource === 'White' || p.moundBaseSource === 'Black';
  const baseFrom = (plan) => {
    switch (p.moundBaseSource) {
      case 'Ink':    return toneHex(baseInk, plan);
      case 'Accent': return toneHex(p.moundAccentOn ? asHex(p.moundAccent) : mpal.accent, plan);
      case 'Tint': {
        const a = hsb(p.moundAccentOn ? asHex(p.moundAccent) : mpal.accent);
        return hsbToHex(tone([a[0], clamp(a[1], 26, 66), 92], plan));
      }
      case 'White':  return toneHex('#ffffff', { ...plan, val: 96 });
      case 'Black':  return toneHex('#000000', { ...plan, val: 8 });
      default:       return toneHex(mpal.ground, plan);
    }
  };
  const baseIn = (plan) => absoluteBase ? baseFrom(plan) : hsbToHex(inKey(hsb(baseFrom(plan)), key));
  const gndMassAt = (t) => {
    const g = planAt(gndSide, t);
    return massOf(toneHex(pal.ground, g), pal.inks.map((c) => toneHex(c, g)));
  };
  const figMassAt = (plan) =>
    massOf(baseIn(plan), moundPool.map((c) => hsbToHex(inKey(tone(c, plan), key))));

  let separation = clamp(p.separation, 0, 1);
  const gapAsked = massGap(figMassAt(planAt(figSide, separation)), gndMassAt(separation));
  while (separation < 1 &&
         massGap(figMassAt(planAt(figSide, separation)), gndMassAt(separation)) < SEP_FLOOR) {
    separation = Math.min(1, Math.round((separation + 0.05) * 100) / 100);
  }
  let gndPlan = planAt(gndSide, separation);
  let figPlan = planAt(figSide, separation);
  const gndMassOf = (plan) =>
    massOf(hsbToHex(tone(hsb(pal.ground), plan)), pal.inks.map((c) => toneHex(c, plan)));
  let forced = 0;
  while (forced < 9 && massGap(figMassAt(figPlan), gndMassOf(gndPlan)) < SEP_FLOOR) {
    forced++;
    const step = Math.min(0.92, Math.max(figPlan.pull, 0.2) + 0.1 * forced);
    const groundIsLight = lumaOf(gndMassOf(gndPlan)) >= 128;
    if (groundIsLight && key.val > 24) {
      gndPlan = { ...gndPlan, val: 12, pull: Math.min(0.9, Math.max(gndPlan.pull, 0.2) + 0.12 * forced) };
    } else {
      figPlan = { ...figPlan, val: groundIsLight ? 10 : 94, pull: step };
    }
  }
  const gndMass = gndMassOf(gndPlan);
  const baseColour = baseIn(figPlan);
  const painted = moundIsPainted(p);

  const skyAsk = clamp(Math.round(p.skyDensity * gndPlan.dens), 0, 3000);
  const landAsk = clamp(Math.round(p.landDensity * gndPlan.dens), 0, 4000);
  const figAsk = painted ? clamp(Math.round(p.density * figPlan.dens), 1, 6000) : 0;
  const skyFrac = clamp(horizonY0 / D, 0.08, 0.92);
  const perArea = (n2, frac) => n2 / Math.max(0.02, frac);
  const bgPerArea = Math.max(perArea(skyAsk, skyFrac), perArea(landAsk, 1 - skyFrac), 1);
  const calm = painted
    ? clamp((perArea(figAsk, clamp(p.moundWidth * 0.62, 0.06, 0.6)) * DETAIL_RATIO) / bgPerArea, 0.3, 1)
    : UNPAINTED_CALM;
  const widen = clamp(1 / Math.sqrt(Math.max(0.05, calm)), 1, 1.9);

  const accentFor = (on, col, from, plan) => ({ hsb: tone(hsb(on ? asHex(col) : from.accent), plan), rate: 0 });
  const withRate = (a, rate) => (a.rate = clamp(rate, 0, 1), a);

  P = {
    palette: pal,
    moundPalette: mpal,
    figPlan, gndPlan,
    inksFor: [
      pal.inks.map((c) => tone(hsb(c), gndPlan)),
      pal.inks.map((c) => tone(hsb(c), gndPlan)),
      moundPool.map((c) => inKey(tone(c, figPlan), key)),
    ],
    dominant: domIdx,
    accents: [
      withRate(accentFor(p.skyAccentOn, p.skyAccent, pal, gndPlan), p.skyAccentRate),
      withRate(accentFor(p.landAccentOn, p.landAccent, pal, gndPlan), p.landAccentRate),
      withRate(accentFor(p.moundAccentOn, p.moundAccent, mpal, figPlan), p.moundAccentRate),
    ],
    darkest: mpal.dark ? mpal.ground : mpal.inks[0],
    eyeInk: eyeTintFires(p) ? asHex(p.eyeInk) : (() => {
      const m = figMassAt(figPlan);
      return massGap(rgbOf('#f2f2f2'), m) > massGap(rgbOf('#0a0a0a'), m) * 1.25 ? '#f2f2f2' : '#0a0a0a';
    })(),
    envDarkest: toneHex(pal.dark ? pal.ground : pal.inks[0], gndPlan),
    groundColour: toneHex(pal.ground, gndPlan),
    baseColour,
    horizonY: horizonY0,
    horizonRough: Math.max(0, p.horizonRough),
    tuft: Math.max(2, clamp(p.tuft, 0, 0.4) * D),
    baseY: D,
    castShadow: clamp(p.moundShadow, 0, 1),
    groundInFront: p.groundInFront !== false,
    lipCover: clamp(p.lipCover, 0.05, 1),
    skyDensity: Math.round(skyAsk * calm),
    skyWidth: D * 0.01 * Math.max(0.05, p.skyWidth) * widen,
    skyAlpha: clamp(p.skyAlpha, 0.005, 1),
    skyFlow: clamp(p.skyFlow, 0, 1),
    landDensity: Math.round(landAsk * calm),
    landWidth: D * 0.01 * Math.max(0.05, p.landWidth) * widen,
    landAlpha: clamp(p.landAlpha, 0.005, 1),
    landFlow: clamp(p.landFlow, 0, 1),
    structure: p.structure,
    structStr: clamp(p.structStr, 0, 1),
    flowJitter: Math.max(0, p.flowJitter),
    bands: Math.max(1, Math.round(p.bands)),
    fieldScale: 0.0016 * Math.max(0.05, p.turbulence) * (2000 / D),
    turns: 2.2,
    stepLen: D * 0.005,
    maxSteps: Math.max(3, Math.round(p.markLength)),
    baseWidth: D * 0.01 * Math.max(0.05, p.markWidth),
    markAlpha: clamp(p.markAlpha, 0.01, 1),
    bristles: clamp(Math.round(p.bristles), 1, 12),
    brushDry: clamp(p.brushDry === undefined ? 0 : p.brushDry, 0, 1),
    hueJitter: Math.max(0, p.hueJitter),
    toneJitter: Math.max(0, p.toneJitter),
    inkFocus: clamp(p.inkFocus, 0, 1),
    drift: p.drift,
    density: clamp(Math.round(p.density * figPlan.dens), 1, 6000),
    accentMix,
    moundStrokes: painted,
    apex: clamp(p.apex, 0.02, 0.85),
    moundWidth: Math.max(0.04, p.moundWidth),
    profile: clamp(p.profile, 0.4, 8),
    lean: clamp(p.lean, -1.4, 1.4),
    wobble: Math.max(0, p.wobble),
    wobbleScale: Math.max(0.05, p.wobbleScale),
    bodyTone: clamp(p.bodyTone, 0, 1),
    bgGrain: clamp(p.bgGrain, 0, 1),
    bgShade: clamp(p.bgShade, 0, 1),
    formShade: clamp(p.formShade, 0, 1),
    modelling: clamp(p.modelling, 0, 1),
    occlusion: clamp(p.occlusion, 0, 1),
    rimLight: clamp(p.rimLight, 0, 1),
    lightAngle: p.lightAngle,
    rare: rareFrom(p.rareRoll, p.rareEffect),
    separation,
    animFrames: frameCount,
    fieldOff: [SKY, LAND, MOUND].map(() => {
      const th = TWO_PI * (passFrame() / Math.max(1, frameCount));
      const r = Math.max(0, p.fieldDrift);
      return [Math.cos(th) * r, Math.sin(th) * r];
    }),
    animFps: clamp(p.animFps, 1, 60),
    eyes: eyeCountFrom(p.eyeRoll),
    eyeShape: clamp(p.eyeShape, 0, 1),
    eyeSize: Math.max(0.002, p.eyeSize),
    eyeSpacing: Math.max(0, p.eyeSpacing),
    eyeY: clamp(p.eyeY, 0.02, 0.98),
    eyeTilt: p.eyeTilt,
    eyeHand: clamp(p.eyeHand === undefined ? 0 : p.eyeHand, 0, 1),
    eyeShadow: !!p.eyeShadow,
    shadowOpacity: clamp(p.shadowOpacity, 0, 1),
    shadowShade: clamp(p.shadowShade, 0, 1),
    shadowBlend: p.shadowBlend,
    shadowTint: p.shadowTint,
    shadowOffset: Math.max(0, p.shadowOffset),
    shadowSoft: Math.max(0.01, p.shadowSoft),
    shadowAngle: p.shadowAngle,
  };

  buildMound();
  computeGroundLine();
  rarePlan = planRare();
  faceZ = Z;                    // so the face alone can be replanned, see below
  facePlan = planFace();
  // The brushes and the grain are the expensive part of setting up, and the
  // wall cannot afford a frozen fifth of a second: the painter below makes
  // them a piece at a time. The grain is drawn from noise alone, so building
  // it after the brushes rather than between them costs the stream nothing.
  brushes = [];
  softBrushes = [];
  grainTex = null;
  layers.forEach(clearSurface);
  lipLayer = null;
  finished = false;
  passIndex = SKY;
  paths = [];
  cursor = 0;
  painterGen = painter();
}

// ── the silhouette and the ground ───────────────────────────────────────────
function buildMound() {
  const apexY = clamp(P.apex, 0.02, 0.98) * P.horizonY;
  const baseY = Math.max(apexY + D * 0.02, P.baseY);
  const H = baseY - apexY;
  const apexX = D * 0.5 + P.lean * D * 0.18;
  const halfL = Math.max(D * 0.03, D * P.moundWidth * (1 + P.lean * 0.5));
  const halfR = Math.max(D * 0.03, D * P.moundWidth * (1 - P.lean * 0.5));
  const fbm = (u) => noise(u) * 0.55 + noise(u * 2.17 + 31.4) * 0.28 + noise(u * 4.63 + 77.7) * 0.17;
  const amp = H * 0.16 * P.wobble;
  const freq = P.wobbleScale / D * 2.4;
  const N = 1000;
  const ys = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * D;
    const t = (x - apexX) / (x < apexX ? halfL : halfR);
    const at = Math.abs(t);
    let h = at >= 1 ? 0 : H * (1 - Math.pow(at, P.profile));
    if (h > 0) h += amp * (fbm(x * freq + 12.3) - 0.5) * 2 * (1 - t * t);
    ys[i] = baseY - Math.max(0, h);
  }
  let x0 = 0, x1 = D;
  for (let i = 0; i <= N; i++) { if (ys[i] < baseY) { x0 = (i / N) * D; break; } }
  for (let i = N; i >= 0; i--) { if (ys[i] < baseY) { x1 = (i / N) * D; break; } }
  surf = { ys, N, x0, x1, apexX, H, baseY };
  buildHorizon();
}

function buildHorizon() {
  const fbm = (u) => noise(u) * 0.55 + noise(u * 2.31 + 55.1) * 0.28 + noise(u * 4.7 + 13.7) * 0.17;
  const amp = D * P.horizonRough;
  const N = 500;
  const ys = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) ys[i] = P.horizonY + (fbm((i / N) * 3.1 + 71.3) - 0.5) * 2 * amp;
  horizonLine = { ys, N };
}

function horizonY(x) {
  const f = clamp(x / D, 0, 1) * horizonLine.N;
  const i = Math.min(horizonLine.N - 1, Math.max(0, Math.floor(f)));
  const t = f - i;
  return horizonLine.ys[i] * (1 - t) + horizonLine.ys[i + 1] * t;
}

function passEdgeDist(x, y) {
  if (passIndex === MOUND) return moundEdgeDist(x, y);
  if (passIndex === LAND) return y - horizonY(x);
  return horizonY(x) - y;
}

function passFade(x, y) {
  const d = passEdgeDist(x, y);
  if (d >= 0) return 1;
  return smoothstep(1 + d / Math.max(1, P.tuft));
}

function computeGroundLine() {
  const apexY = surfaceY(surf.apexX);
  if (!P.groundInFront) {
    P.lipBaseY = D;
    P.lipAmp = 0;
    P.groundLine = surf.baseY;
    return;
  }
  const band = D - P.horizonY;
  let amp = band * 0.16;
  let baseY = D - band * P.lipCover + amp;
  const halfWay = (D + apexY) / 2;
  if (baseY - amp < halfWay) {
    baseY = Math.max(baseY, halfWay + amp);
    if (baseY + amp > D) { amp = Math.max(0, (D - halfWay) / 2); baseY = halfWay + amp; }
  }
  P.lipBaseY = baseY;
  P.lipAmp = amp;
  P.groundLine = baseY - amp;
}

function surfaceY(x) {
  const f = clamp(x / D, 0, 1) * surf.N;
  const i = Math.min(surf.N - 1, Math.max(0, Math.floor(f)));
  const t = f - i;
  return surf.ys[i] * (1 - t) + surf.ys[i + 1] * t;
}
const insideMound = (x, y) => x >= 0 && x <= D && y <= surf.baseY && y >= surfaceY(x);
function moundEdgeDist(x, y) {
  const s = surfaceY(x);
  const slope = surfaceSlope(x);
  const dTop = (y - s) / Math.sqrt(1 + slope * slope);
  return Math.min(dTop, x - surf.x0, surf.x1 - x, surf.baseY - y);
}
const smoothstep = (t) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
function depth01(x, y) {
  const s = surfaceY(x);
  const span = surf.baseY - s;
  return span > 1 ? clamp((y - s) / span, 0, 1) : 1;
}
function bodySpanAt(y) {
  let lo = -1, hi = -1;
  for (let i = 0; i <= surf.N; i++) if (surf.ys[i] <= y) { lo = (i / surf.N) * D; break; }
  for (let i = surf.N; i >= 0; i--) if (surf.ys[i] <= y) { hi = (i / surf.N) * D; break; }
  if (lo < 0 || hi < 0) return null;
  return [lo, hi];
}
function moundPath() {
  const pts = [[surf.x0, surf.baseY]];
  const step = D / 400;
  for (let x = surf.x0; x <= surf.x1; x += step) pts.push([x, surfaceY(x)]);
  pts.push([surf.x1, surfaceY(surf.x1)], [surf.x1, surf.baseY]);
  return pts;
}
function surfaceSlope(x) {
  const d = D / surf.N;
  return (surfaceY(Math.min(D, x + d)) - surfaceY(Math.max(0, x - d))) / (2 * d);
}

// ── the brush ───────────────────────────────────────────────────────────────
// The original built these with loadPixels(); a wall piece may not read pixels
// back, so the same bytes are written through createImageData instead.
function* buildBrush(soft) {
  const g = surface(BRUSH_PX, BRUSH_PX);
  const img = g.ctx.createImageData(BRUSH_PX, BRUSH_PX);
  const px = img.data;
  const streak = rnd(0.06, 0.22);
  const holeRate = rnd(0.02, 0.09);
  const rim = rnd(0.22, 0.38);
  const dryness = rnd(0.30, 0.46);
  for (let y = 0; y < BRUSH_PX; y++) {
    if (y && y % 24 === 0) yield;
    for (let x = 0; x < BRUSH_PX; x++) {
      const i = 4 * (y * BRUSH_PX + x);
      const nx = (x / BRUSH_PX - 0.5) * 2;
      const ny = (y / BRUSH_PX - 0.5) * 2;
      const d = 1 - Math.sqrt(nx * nx * 1.05 + ny * ny * 1.7);
      if (d <= 0) { px[i + 3] = 0; continue; }
      let a = soft
        ? Math.pow(d, 1.15) * (0.55 + 0.75 * noise(x * streak * 0.5, y * streak * 1.4))
        : Math.pow(Math.min(1, d / rim), 0.8);
      const n = noise(x * streak, y * streak * 3.2);
      if (n < dryness) a *= 0.12 + 0.55 * (n / dryness);
      if (random() < holeRate) a *= 0.2;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = Math.max(0, Math.min(255, a * 255)) | 0;
    }
  }
  g.ctx.putImageData(img, 0, 0);
  return g;
}

function tintStamp(brush, rgb) {
  const c = stamp.ctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, BRUSH_PX, BRUSH_PX);
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  c.fillRect(0, 0, BRUSH_PX, BRUSH_PX);
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(brush.canvas, 0, 0, BRUSH_PX, BRUSH_PX);
  c.globalCompositeOperation = 'source-over';
}

function* buildGrain() {
  const S = 512;
  const g = surface(S, S);
  const img = g.ctx.createImageData(S, S);
  const px = img.data;
  for (let y = 0; y < S; y++) {
    if (y && y % 4 === 0) yield;
    for (let x = 0; x < S; x++) {
      const i = 4 * (y * S + x);
      const n = noise(x * 0.9, y * 0.9) * 0.7 + noise(x * 0.06, y * 0.06) * 0.3;
      const v = Math.max(0, Math.min(255, 128 + (n - 0.5) * 210)) | 0;
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = 255;
    }
  }
  g.ctx.putImageData(img, 0, 0);
  grainTex = g;
}

// ── the three passes ────────────────────────────────────────────────────────
function startPass(i) {
  passIndex = i;
  paths = [];
  cursor = 0;
  randomSeed(seedForPass(i));
  const budget = (want, units) => (units > 1e6 ? Math.max(1, Math.round(want * 1e6 / units)) : want);
  if (i === SKY) {
    const n = budget(P.skyDensity, P.skyDensity * 60);
    for (let k = 0; k < n; k++) paths.push(mark(random() * D, random() * P.horizonY, P.skyWidth, P.skyAlpha, 60));
  } else if (i === LAND) {
    const n = budget(P.landDensity, P.landDensity * 50);
    const band = Math.max(1, D - P.horizonY);
    for (let k = 0; k < n; k++) paths.push(mark(random() * D, P.horizonY + random() * band, P.landWidth, P.landAlpha, 46));
  } else {
    const span = Math.max(1, surf.x1 - surf.x0);
    const bandH = D / P.bands;
    const n = P.moundStrokes ? budget(P.density, P.density * P.maxSteps * P.bristles) : 0;
    for (let k = 0; k < n; k++) {
      let x = surf.x0 + random() * span;
      let y;
      if (P.structure === 'Banded') {
        const b = rndInt(0, P.bands - 1);
        y = (b + rnd(0.15, 0.85)) * bandH;
        if (!insideMound(x, y)) y = surfaceY(x) + random() * Math.max(1, surf.baseY - surfaceY(x));
      } else if (P.structure === 'Radial') {
        const a = random() * TWO_PI;
        const r = Math.sqrt(random()) * surf.H * 0.55;
        x = clamp(surf.apexX + Math.cos(a) * r, surf.x0, surf.x1);
        y = clamp(surf.baseY - surf.H * 0.45 + Math.sin(a) * r, 0, surf.baseY);
        if (!insideMound(x, y)) y = surfaceY(x) + random() * Math.max(1, surf.baseY - surfaceY(x));
      } else {
        const top = surfaceY(x);
        y = top + random() * Math.max(1, surf.baseY - top);
      }
      paths.push(mark(x, y, P.baseWidth, P.markAlpha, P.maxSteps));
    }
    const edgeExtra = Math.round(n * 0.3);
    for (let k = 0; k < edgeExtra; k++) {
      const px = surf.x0 + random() * Math.max(1, surf.x1 - surf.x0);
      const py = surfaceY(px) + rnd(P.tuft * 0.15, P.tuft * 2.8);
      if (!insideMound(px, py)) continue;
      paths.push(mark(px, py, P.baseWidth * rnd(0.6, 1.0), P.markAlpha,
                      Math.max(3, Math.round(P.maxSteps * 0.35))));
    }
  }
}

function mark(x, y, width, alpha, steps) {
  return {
    x, y,
    reach: rnd(-0.7, 1.15) * P.tuft,
    bias: rnd(-1, 1) * P.flowJitter,
    ink: chance(P.accents[passIndex].rate) ? P.accents[passIndex].hsb
       : chance(P.inkFocus) ? P.inksFor[passIndex][P.dominant[passIndex]]
       : pick(P.inksFor[passIndex]),
    steps: rndInt(Math.max(2, steps * 0.4), steps),
    width: width * rnd(0.45, 1.8),
    alpha: alpha * rnd(0.6, 1.5),
    drift: rnd(-P.drift, P.drift),
  };
}

function fieldAngle(x, y, p) {
  const off = P.fieldOff ? P.fieldOff[passIndex] : ZERO_OFF;
  const base = (noise(x * P.fieldScale * 0.35 + off[0], y * P.fieldScale * 0.35 + off[1]) * P.turns +
                noise(x * P.fieldScale * 2.1 + off[0], y * P.fieldScale * 2.1 + off[1]) * 0.35) * TWO_PI;
  if (passIndex === SKY) return P.skyFlow > 0 ? lerpAngle(base, 0, P.skyFlow) : base;
  if (passIndex === LAND) return P.landFlow > 0 ? lerpAngle(base, 0, P.landFlow) : base;
  if (P.structure === 'Drift' || P.structStr <= 0) return base;
  const bias = p ? p.bias : 0;
  let want;
  if (P.structure === 'Contour') {
    want = Math.atan2(surfaceSlope(x), 1) * (1 - depth01(x, y) * 0.75);
  } else if (P.structure === 'Radial') {
    want = Math.atan2(y - (surf.baseY - surf.H * 0.45), x - surf.apexX);
  } else {
    const band = Math.floor(y / (D / P.bands));
    want = (band % 2 ? 1 : -1) * 0.14;
  }
  return lerpAngle(base, want + bias, P.structStr);
}

function inBounds(x, y, p) {
  if (x < -D * 0.1 || x > D * 1.1) return false;
  const reach = p ? p.reach : 0;
  if (passIndex === SKY) return y > -D * 0.1 && horizonY(x) - y > reach;
  if (passIndex === LAND) return y < D * 1.1 && y - horizonY(x) > reach;
  return moundEdgeDist(x, y) > reach && y <= surf.baseY + P.tuft;
}

function smoothPath(pts) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i];
    const p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let t = 0; t < 1; t += 0.5) {
      const t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}

function interiorAngle(x, y) {
  const d = P.stepLen;
  const gx = passEdgeDist(x + d, y) - passEdgeDist(x - d, y);
  const gy = passEdgeDist(x, y + d) - passEdgeDist(x, y - d);
  return Math.atan2(gy, gx) + rnd(-0.6, 0.6);
}

const brushPool = () => (passIndex === MOUND ? brushes : softBrushes);

function tracePath(p) {
  const pts = [];
  let x = p.x, y = p.y;
  let turns = 0;
  for (let i = 0; i < p.steps; i++) {
    const a = fieldAngle(x, y, p);
    let nx = x + Math.cos(a) * P.stepLen;
    let ny = y + Math.sin(a) * P.stepLen;
    if (!inBounds(nx, ny, p)) {
      if (pts.length >= 4 || turns >= 3) break;
      turns++;
      const back = interiorAngle(x, y);
      nx = x + Math.cos(back) * P.stepLen;
      ny = y + Math.sin(back) * P.stepLen;
      if (!inBounds(nx, ny, p)) break;
    }
    x = nx; y = ny;
    pts.push([x, y]);
  }
  if (pts.length < 2) return;
  const smooth = smoothPath(pts);
  const bristles = passIndex === MOUND ? P.bristles : 1;
  for (let b = 0; b < bristles; b++) {
    const off = bristles === 1 ? 0 : (b / (bristles - 1) - 0.5) * p.width * 0.5;
    stampRun(smooth, p, off + rnd(-p.width * 0.05, p.width * 0.05), pick(brushPool()));
  }
}

const DRY_BY_PASS = [0.35, 0.7, 1];
const DRY_RUN = 0.05;
const DRY_GRAIN = 0.05;

function stampRun(pts, p, offset, brush) {
  const ctx = layers[passIndex].ctx;
  const head = jitterInk(p.ink);
  const tail = [(head[0] + p.drift + 360) % 360, head[1], head[2]];
  const spacing = Math.max(2.5 * (D / 2000), p.width * 0.20) * SPACING_MUL;
  const n = pts.length;
  ctx.save();
  let acc = spacing, chunk = -1, dist = 0;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    acc += seg;
    dist += seg;
    if (acc < spacing) continue;
    acc = 0;
    const t = (i + 0.5) / n;
    const taper = Math.min(1, Math.pow(Math.sin(Math.PI * t), 0.55) * 2.3);
    if (taper < 0.03) continue;
    const c = Math.floor(t * 5);
    if (c !== chunk) {
      chunk = c;
      tintStamp(brush, hsb2rgb(
        head[0] + (tail[0] - head[0]) * t,
        head[1] + (tail[1] - head[1]) * t,
        head[2] + (tail[2] - head[2]) * t));
    }
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const w = Math.max(0.5, p.width * taper * rnd(0.85, 1.2));
    const h = Math.max(0.5, w * rnd(0.45, 0.8));
    const edge = passFade(x0, y0);
    if (edge <= 0.002) continue;
    const dry = P.brushDry * DRY_BY_PASS[passIndex] * Math.min(1, dist / (D * DRY_RUN));
    const nz = clamp((noise(pts[0][0] * 0.01, pts[0][1] * 0.01, dist * DRY_GRAIN) - 0.3) / 0.36, 0, 1);
    if (dry > 0 && nz < dry) continue;
    const a = Math.min(1, p.alpha * taper * edge * (1 - dry * 0.25));
    ctx.globalAlpha = SPACING_MUL === 1 ? a : 1 - Math.pow(1 - a, SPACING_MUL);
    ctx.translate(x0 + Math.cos(ang + Math.PI / 2) * offset,
                  y0 + Math.sin(ang + Math.PI / 2) * offset);
    ctx.rotate(ang);
    ctx.drawImage(stamp.canvas, -w / 2, -h / 2, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.restore();
}

// ── the face ────────────────────────────────────────────────────────────────
function planEyeEdge(rim, size) {
  const marks = [];
  const every = Math.max(1, Math.round((rim.length - 1) / 30));
  const phase = rnd(0, TWO_PI);
  const freq = rnd(1, 2);
  for (let i = 0; i < rim.length - 1; i += every) {
    const a = (i / (rim.length - 1)) * TWO_PI;
    const [px, py] = rim[i];
    const [nx, ny] = rim[Math.min(rim.length - 1, i + every)];
    const w = Math.max(1.5, size * (0.78 + 0.42 * Math.sin(freq * a + phase)) * rnd(0.85, 1.15));
    marks.push({ x: px, y: py, w, h: w * rnd(0.6, 1), ang: Math.atan2(ny - py, nx - px), a: rnd(0.45, 0.8), bi: rndInt(0, 2) });
  }
  return marks;
}

const RIM_STEPS = 48;
const EYE_OVAL = [0.78, 1.30];
const EYE_TALL = [0.42, 1.50];

function rollHandShape(count, hand) {
  const eyes = [];
  let swell = 1;
  for (let i = 0; i < count; i++) {
    const amps = [rnd(0.02, 0.075) * hand, rnd(0.02, 0.075) * hand, rnd(0.02, 0.075) * hand];
    const kw = rnd(1 - 0.08 * hand, 1 + 0.08 * hand);
    const kh = rnd(1 - 0.08 * hand, 1 + 0.08 * hand);
    const ph1 = rnd(0, TWO_PI);
    const lean = (rnd(-4, 4) * hand * Math.PI) / 180;
    swell = Math.max(swell, Math.max(kw, kh) * (1 + amps[0] + amps[1] + amps[2]));
    eyes.push({ amps, kw, kh, ph1, lean });
  }
  return { eyes, swell };
}

function solveFace(swell) {
  facePlaced = [];
  if (P.eyes < 1) return null;
  const apexY = surfaceY(surf.apexX);
  const t = P.eyeShape;
  const sw = EYE_OVAL[0] + (EYE_TALL[0] - EYE_OVAL[0]) * t;
  const sh = EYE_OVAL[1] + (EYE_TALL[1] - EYE_OVAL[1]) * t;
  let s = D * P.eyeSize;
  let ew = Math.max(1, s * sw);
  let eh = Math.max(1, s * sh);
  const ground = (P.groundLine !== undefined ? P.groundLine : surf.baseY) - eh * 0.7 * swell;
  const ceiling = Math.max(apexY + eh * 0.6 * swell, Math.min(ground, surf.baseY));
  const faceY = clamp(apexY + (surf.baseY - apexY) * P.eyeY, apexY, ceiling);
  const span = bodySpanAt(faceY);
  if (!span) return null;
  const faceCx = (span[0] + span[1]) / 2;
  const bodyW = span[1] - span[0];
  const gap = D * P.eyeSpacing;
  const minGap = ew * 1.12 * swell;
  if (gap < minGap) {
    const k = gap / minGap;
    ew *= k; eh *= k; s *= k;
  }
  const slots = [];
  if (P.eyes === 1) slots.push(0);
  else for (let i = 0; i < P.eyes; i++) slots.push((i - (P.eyes - 1) / 2) * gap);
  const faceW = (slots[slots.length - 1] - slots[0]) + ew * swell;
  const fit = Math.min(1, (bodyW * 0.78) / Math.max(1, faceW));
  ew *= fit; eh *= fit; s *= fit;
  for (let i = 0; i < slots.length; i++) slots[i] *= fit;
  if (!faceAnchor) faceAnchor = { cx: faceCx, y: faceY, ew, eh, s, slots: slots.slice() };
  const A = faceAnchor;
  ew = A.ew; eh = A.eh; s = A.s;
  const anchorCx = A.cx, anchorY = A.y, anchorSlots = A.slots;
  const tilt = (P.eyeTilt * Math.PI) / 180;
  const placed = [];
  for (const dx of anchorSlots) {
    const x = anchorCx + dx;
    let y = anchorY;
    const top = surfaceY(x);
    if (y - eh / 2 < top + eh * 0.35) y = top + eh * 0.85;
    if (insideMound(x, y)) placed.push([x, y]);
  }
  facePlaced = placed;
  return { placed, ew, eh, s, tilt };
}

function planFace() {
  if (P.eyes < 1) return null;
  const hand = clamp(P.eyeHand, 0, 1);
  if (!handAnchor) handAnchor = rollHandShape(P.eyes, hand);
  const sol = solveFace(handAnchor.swell);
  if (!sol) return null;
  const { placed, ew, eh, s, tilt } = sol;
  const eyes = placed.map(([x, y], i) => {
    const h = handAnchor.eyes[i % handAnchor.eyes.length];
    const ph2 = rnd(0, TWO_PI), ph3 = rnd(0, TWO_PI);
    const devAt = (a, off) =>
      1 + h.amps[0] * Math.sin((a + off) + h.ph1)
        + h.amps[1] * Math.sin(2 * (a + off) + ph2)
        + h.amps[2] * Math.sin(3 * (a + off) + ph3);
    const rw = Math.max(0.5, (ew / 2) * h.kw);
    const rh = Math.max(0.5, (eh / 2) * h.kh);
    const lean = tilt + h.lean;
    const rim = [];
    for (let a = 0; a <= TWO_PI + 0.01; a += TWO_PI / RIM_STEPS) {
      const c = Math.cos(a) * rw * devAt(a, 0);
      const sn = Math.sin(a) * rh * devAt(a, 0.7);
      rim.push([x + c * Math.cos(lean) - sn * Math.sin(lean), y + c * Math.sin(lean) + sn * Math.cos(lean)]);
    }
    return { x, y, ew: rw * 2, eh: rh * 2, tilt: lean, rim, edge: planEyeEdge(rim, s * 0.085) };
  });
  return { placed, ew, eh, s, tilt, eyes };
}

const BLEND_MODES = {
  Multiply: 'multiply', Screen: 'screen', Darken: 'darken', Lighten: 'lighten',
  Overlay: 'overlay', 'Hard light': 'hard-light', 'Soft light': 'soft-light',
  Difference: 'difference', Exclusion: 'exclusion', Normal: 'source-over',
};

function eyeShadow(ctx, x, y, ew, eh, tilt, rgb) {
  const soft = P.shadowSoft;
  const r = Math.max(1, (ew / 2) * (1 + soft * 0.9));
  const ratio = ew > 0 ? Math.max(0.05, eh / ew) : 1;
  const off = ew * P.shadowOffset;
  ctx.save();
  ctx.globalCompositeOperation = BLEND_MODES[P.shadowBlend] || 'multiply';
  const dir = P.shadowAngle * Math.PI / 180;
  ctx.translate(x + Math.cos(dir) * off, y + Math.sin(dir) * off);
  ctx.rotate(tilt);
  ctx.scale(1, ratio);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  const a = P.shadowOpacity;
  const solid = clamp(1 - soft, 0.02, 0.95);
  g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`);
  g.addColorStop(solid, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a * 0.75})`);
  g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TWO_PI);
  ctx.fill();
  ctx.restore();
}

/**
 * The face. `anim` is the wall's own addition and the only thing here the
 * explorer does not do: it moves and squashes what was already placed, so at
 * rest (open 1, no drift) this draws the explorer's face exactly.
 */
function drawFace(ctx, anim) {
  const F = facePlan;
  if (!F || !softBrushes.length) return;   // its brushes are still being made
  const open = anim ? anim.open : 1;
  const dx = anim ? anim.dx : 0;
  const dy = anim ? anim.dy : 0;
  const at = (eye, [px, py]) => [px + dx, eye.y + (py - eye.y) * open + dy];
  const rgb = p5c(P.eyeInk).map((v) => v | 0);
  if (P.eyeShadow && P.shadowOpacity > 0) {
    const eyeRGB = p5c(P.eyeInk);
    const eyeLum = (eyeRGB[0] * 0.299 + eyeRGB[1] * 0.587 + eyeRGB[2] * 0.114);
    const tint =
      P.shadowTint === 'White' ? [250, 250, 250] :
      P.shadowTint === 'Black' ? [8, 8, 8] :
      P.shadowTint === 'Eye' ? eyeRGB : (eyeLum < 128 ? [250, 250, 250] : [8, 8, 8]);
    const k = clamp(P.shadowShade, 0, 1);
    const srgb = eyeRGB.map((c, i) => Math.round(c + (tint[i] - c) * k));
    for (const e of F.eyes) eyeShadow(ctx, e.x + dx, e.y + dy, e.ew, e.eh * open, e.tilt, srgb);
  }
  for (const eye of F.eyes) {
    ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.beginPath();
    const first = at(eye, eye.rim[0]);
    ctx.moveTo(first[0], first[1]);
    for (let k = 1; k < eye.rim.length; k++) {
      const q = at(eye, eye.rim[k]);
      ctx.lineTo(q[0], q[1]);
    }
    ctx.closePath();
    ctx.fill();
    for (const m of eye.edge) {
      const q = at(eye, [m.x, m.y]);
      dab(ctx, rgb, q[0], q[1], m.w, m.h * (open < 1 ? Math.max(0.25, open) : 1), m.ang, m.a,
          softBrushes[m.bi % softBrushes.length]);
    }
  }
}

// ── the marks that are not strokes ──────────────────────────────────────────
function dab(ctx, rgb, x, y, w, h, ang, alpha, brush) {
  tintStamp(brush || pick(brushes), rgb);
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.drawImage(stamp.canvas, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function formStroke(ctx, rgb, x, y, len, w, ang, alpha, brush) {
  tintStamp(brush || pick(brushes), rgb);
  const step = Math.max(1, w * 0.5);
  const n = clamp(Math.round(len / step), 2, 26);
  const bend = rnd(-0.45, 0.45) / n;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const taper = Math.pow(Math.sin(Math.PI * t), 0.55);
    const a = ang + bend * (i - n / 2);
    const px = x + Math.cos(a) * (t - 0.5) * len;
    const py = y + Math.sin(a) * (t - 0.5) * len;
    const thick = Math.max(0.6, w * (0.45 + 0.7 * taper));
    ctx.globalAlpha = clamp(alpha * (0.4 + 0.6 * taper), 0, 1);
    ctx.translate(px, py);
    ctx.rotate(a);
    ctx.drawImage(stamp.canvas, -thick * 0.75, -thick / 2, thick * 1.5, thick);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.restore();
}

// The passes end with a few hundred marks that are not strokes -- the frayed
// edge, the modelling, the near bank. In the explorer they are one long
// blocking call; on a wall that is a frozen second, so each of them yields
// every so often and the wall picks the work up again on the next frame. The
// marks, and the random draws behind them, are unchanged and in the same order.
const CHUNK = 24;

function* stampEdge(ctx, path, rgb, size, spread, every) {
  const brush = pick(brushes);
  tintStamp(brush, rgb);
  ctx.save();
  let since = 0;
  for (let i = 0; i < path.length; i += every) {
    if (++since > CHUNK) {
      since = 0;
      yield;
      tintStamp(brush, rgb);         // the sprite is shared: colour it again
    }
    const [x, y] = path[i];
    const n = path[Math.min(path.length - 1, i + 1)];
    const ang = Math.atan2(n[1] - y, n[0] - x) + rnd(-0.5, 0.5);
    const w = size * rnd(0.5, 1.7);
    const h = w * rnd(0.4, 0.9);
    ctx.globalAlpha = rnd(0.55, 1);
    ctx.translate(x + rnd(-spread, spread), y + rnd(-spread, spread));
    ctx.rotate(ang);
    ctx.drawImage(stamp.canvas, -w / 2, -h / 2, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.restore();
}

function fillPath(ctx, path) {
  ctx.beginPath();
  ctx.moveTo(path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
  ctx.closePath();
  ctx.fill();
}

function lighting() {
  const apexY = surfaceY(surf.apexX);
  const a = P.lightAngle * Math.PI / 180;
  const cx = (surf.x0 + surf.x1) / 2;
  const cy = (apexY + surf.baseY) / 2;
  const rad = Math.max(1, Math.max(surf.x1 - surf.x0, surf.baseY - apexY) * 0.72);
  return {
    cx, cy, rad, angle: a, lx: Math.cos(a), ly: Math.sin(a),
    facing(x, y) { return clamp(((x - cx) * this.lx + (y - cy) * this.ly) / rad, -1, 1); },
  };
}

function litPoint(L, want, power) {
  for (let t = 0; t < 24; t++) {
    const x = rnd(surf.x0, surf.x1);
    const top = surfaceY(x);
    if (top >= surf.baseY - 2) continue;
    const y = rnd(top, surf.baseY);
    if (random() < Math.pow(clamp((L.facing(x, y) * want + 1) / 2, 0, 1), power)) return [x, y];
  }
  return null;
}

function* modelMound(mc, L) {
  const dark = mixRGB(mixRGB(rgbOf(P.baseColour), [0, 0, 0], 0.45), rgbOf(P.darkest), 0.35);
  const lit = mixRGB(rgbOf(P.baseColour), [255, 255, 255], 0.55);
  const scale = D / 1000;
  const k = P.modelling;
  mc.save();
  mc.globalCompositeOperation = 'source-atop';
  const masses = Math.round((8 + 34 * k) * scale);
  for (let i = 0; i < masses; i++) {
    if (i && i % CHUNK === 0) yield;
    const pt = litPoint(L, -1, 2.2);
    if (!pt) continue;
    const w = D * rnd(0.10, 0.26);
    dab(mc, dark, pt[0], pt[1], w, w * rnd(0.45, 0.85), interiorAngle(pt[0], pt[1]) + HALF_PI, 0.10 + 0.30 * k);
  }
  const planes = Math.round(70 * k * scale);
  for (let i = 0; i < planes; i++) {
    if (i && i % 8 === 0) yield;
    const pt = litPoint(L, -1, 1.6);
    if (!pt) continue;
    const w = D * rnd(0.010, 0.028);
    formStroke(mc, mixRGB(dark, rgbOf(P.baseColour), rnd(0, 0.4)),
               pt[0], pt[1], D * rnd(0.035, 0.13), w, interiorAngle(pt[0], pt[1]) + HALF_PI, 0.10 + 0.30 * k);
  }
  const highs = Math.round(22 * k * scale);
  for (let i = 0; i < highs; i++) {
    if (i && i % 8 === 0) yield;
    const pt = litPoint(L, 1, 3);
    if (!pt) continue;
    const w = D * rnd(0.007, 0.019);
    formStroke(mc, lit, pt[0], pt[1], D * rnd(0.03, 0.11), w, interiorAngle(pt[0], pt[1]) + HALF_PI, 0.09 + 0.30 * k);
  }
  mc.restore();
}

function* turnEdges(mc, L, path) {
  const bodyH = Math.max(1, surf.baseY - surfaceY(surf.apexX));
  const dark = mixRGB(mixRGB(rgbOf(P.baseColour), [0, 0, 0], 0.62), rgbOf(P.darkest), 0.3);
  const acc = P.accents[MOUND].hsb;
  const rim = hsb2rgb(acc[0], clamp(Math.max(acc[1], 34), 0, 72), clamp(Math.max(acc[2], 70) + 30, 0, 100));
  mc.save();
  mc.globalCompositeOperation = 'source-atop';
  const every = Math.max(1, Math.round(path.length / 320));
  let since = 0;
  for (let i = 1; i < path.length - 1; i += every) {
    if (++since > CHUNK) { since = 0; yield; }
    const [x, y] = path[i];
    if (y >= surf.baseY - 1) continue;
    const f = L.facing(x, y);
    if (f > -0.05) continue;
    const weight = clamp(-f, 0, 1);
    const m = surfaceSlope(x);
    const n = Math.sqrt(1 + m * m);
    const ix = -m / n, iy = 1 / n;
    const along = Math.atan2(m, 1);
    const at = (inset, w, hk, ang, rgb, a) => dab(mc, rgb, x + ix * inset, y + iy * inset, w, w * hk, ang, a);
    if (P.occlusion > 0) {
      const k = P.occlusion;
      at(bodyH * (0.03 + 0.06 * rnd(0.7, 1.3)), D * rnd(0.02, 0.05), rnd(0.3, 0.7),
         along + rnd(-0.3, 0.3), dark, (0.10 + 0.42 * k) * weight);
      at(bodyH * (0.10 + 0.10 * rnd(0.6, 1.4)), D * rnd(0.04, 0.09), rnd(0.35, 0.8),
         along + rnd(-0.4, 0.4), dark, (0.04 + 0.18 * k) * weight);
    }
    if (P.rimLight > 0) {
      const k = P.rimLight;
      at(bodyH * rnd(0.022, 0.05), D * rnd(0.018, 0.04), rnd(0.2, 0.45),
         along + rnd(-0.25, 0.25), dark, (0.06 + 0.3 * k) * weight);
      at(bodyH * rnd(0.004, 0.018), D * rnd(0.012, 0.032), rnd(0.16, 0.34),
         along + rnd(-0.2, 0.2), rim, (0.10 + 0.55 * k) * weight);
    }
  }
  mc.restore();
}

function* finishMoundLayer() {
  const mc = layers[MOUND].ctx;
  const path = moundPath();
  {
    const g = p5c(P.baseColour), d = p5c(P.darkest);
    const mix = (i) => Math.round(g[i] + (d[i] - g[i]) * P.bodyTone * 0.4);
    mc.save();
    mc.globalCompositeOperation = 'destination-over';
    mc.fillStyle = `rgb(${mix(0)},${mix(1)},${mix(2)})`;
    fillPath(mc, path);
    mc.restore();
  }
  const g2 = p5c(P.baseColour), d2 = p5c(P.darkest);
  const rgb = [0, 1, 2].map((i) => Math.round(g2[i] + (d2[i] - g2[i]) * P.bodyTone * 0.4));
  mc.save();
  mc.globalCompositeOperation = 'destination-over';
  yield* stampEdge(mc, path, rgb, P.tuft * 1.5, P.tuft * 0.5, 2);
  mc.restore();
  yield* stampEdge(mc, path, rgb, P.tuft * 1.1, P.tuft * 0.35, 3);
  if (surf.x1 > surf.x0) {
    const L = lighting();
    if (P.formShade > 0) {
      const d = p5c(P.darkest).map((v) => v | 0);
      mc.save();
      mc.globalCompositeOperation = 'source-atop';
      const g = mc.createRadialGradient(
        L.cx + L.lx * L.rad * 0.55, L.cy + L.ly * L.rad * 0.55, L.rad * 0.12, L.cx, L.cy, L.rad);
      g.addColorStop(0, `rgba(${d[0]},${d[1]},${d[2]},0)`);
      g.addColorStop(1, `rgba(${d[0]},${d[1]},${d[2]},${P.formShade})`);
      mc.fillStyle = g;
      mc.fillRect(0, 0, D, D);
      mc.restore();
    }
    if (P.modelling > 0) yield* modelMound(mc, L);
    if (P.occlusion > 0 || P.rimLight > 0) yield* turnEdges(mc, L, path);
  }
}

function* buildLipLayer() {
  const g = surface(D, D);
  const c = g.ctx;
  c.drawImage(layers[LAND].canvas, 0, 0);
  const maskG = surface(D, D);
  const k = maskG.ctx;
  const baseY = P.lipBaseY, amp = P.lipAmp;
  const line = [];
  for (let i = 0; i <= 220; i++) {
    const x = (i / 220) * D;
    const n = noise(x * 0.0016 + 400.5) * 0.65 + noise(x * 0.0051 + 88.2) * 0.35;
    line.push([x, baseY + (n - 0.5) * 2 * amp]);
  }
  k.fillStyle = '#fff';
  k.beginPath();
  k.moveTo(0, D);
  for (const [x, y] of line) k.lineTo(x, y);
  k.lineTo(D, D);
  k.closePath();
  k.fill();
  // The sprite is shared with everything else that stamps -- including the
  // face the wall draws over the picture between frames -- so it is coloured
  // again after every yield, never only once at the top.
  const brush = pick(brushes);
  tintStamp(brush, [255, 255, 255]);
  for (let i = 0; i < line.length; i += 2) {
    if (i && i % (2 * CHUNK) === 0) { yield; tintStamp(brush, [255, 255, 255]); }
    const [x, y] = line[i];
    const w = P.tuft * rnd(1.2, 3.4);
    const h = w * rnd(0.35, 0.8);
    k.save();
    k.globalAlpha = rnd(0.5, 1);
    k.translate(x + rnd(-w, w) * 0.3, y + rnd(-h, h));
    k.rotate(rnd(-0.4, 0.4));
    k.drawImage(stamp.canvas, -w / 2, -h / 2, w, h);
    k.restore();
  }
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(maskG.canvas, 0, 0);
  lipLayer = g;
}

// ── the rare effects ────────────────────────────────────────────────────────
function outwardAt(x) {
  const m = surfaceSlope(x);
  const n = Math.sqrt(1 + m * m);
  return [m / n, -1 / n];
}

function brightAccent(lift) {
  const a = P.accents[MOUND].hsb;
  return hsb2rgb(a[0], clamp(Math.max(a[1], 26) * 0.85, 0, 100), clamp(Math.max(a[2], 58) + lift, 0, 100));
}

function planRare() {
  if (!surf || P.rare === 'None') return null;
  switch (P.rare) {
    case 'Halo': return planHalo();
    case 'Crown': return planCrown();
    case 'Motes': return planMotes();
    case 'Glow': return { rgb: brightAccent(30), k: rnd(0.5, 1) };
    case 'Contour': return planContour();
    case 'Halftone': return planHalftone();
    case 'Eclipse':
      if (!rareAnchor) rareAnchor = planEclipse();
      return rareAnchor;
    default: return null;
  }
}

function planHalo() {
  const path = moundPath();
  const marks = [];
  const every = Math.max(1, Math.round(path.length / 70));
  const spread = rnd(0.06, 0.16);
  for (let i = 1; i < path.length - 1; i += every) {
    const [x, y] = path[i];
    if (y > surf.baseY - 4) continue;
    const [ox2, oy2] = outwardAt(x);
    const ang = Math.atan2(oy2, ox2);
    for (let r = 0; r < 3; r++) {
      const t = Math.pow(random(), 3);
      const d = D * (0.005 + spread * t);
      const w = D * (0.05 + 0.16 * t);
      marks.push({
        x: x + ox2 * d, y: y + oy2 * d, w, h: w * rnd(0.35, 0.8),
        ang: ang + rnd(-0.5, 0.5), a: (0.30 - 0.24 * t) * rnd(0.6, 1.4),
        bi: rndInt(0, 2), soft: true,
      });
    }
  }
  return { marks, rgb: brightAccent(24) };
}

function planCrown() {
  const apexY = surfaceY(surf.apexX);
  const cut = apexY + (surf.baseY - apexY) * rnd(0.18, 0.34);
  const marks = [];
  const ink = pick(P.inksFor[MOUND]);
  const rgb = hsb2rgb(ink[0], ink[1], ink[2]);
  const n = rndInt(10, 22);
  for (let i = 0; i < n; i++) {
    const x = rnd(surf.x0, surf.x1);
    const y = surfaceY(x);
    if (y > cut) continue;
    const [ox2, oy2] = outwardAt(x);
    const ang = lerpAngle(Math.atan2(oy2, ox2), -HALF_PI, 0.45) + rnd(-0.32, 0.32);
    const len = D * rnd(0.05, 0.17);
    const steps = 12;
    const w0 = D * rnd(0.009, 0.024);
    for (let k = 0; k < steps; k++) {
      const t = k / (steps - 1);
      const d = len * t;
      const w = w0 * (1 - t * 0.8);
      marks.push({
        x: x + Math.cos(ang) * d, y: y + Math.sin(ang) * d,
        w, h: w * rnd(0.5, 0.9), ang: ang + rnd(-0.18, 0.18),
        a: (1 - t * 0.45) * rnd(0.5, 1), rgb, bi: rndInt(0, 2),
      });
    }
  }
  return { marks };
}

function planMotes() {
  const apexY = surfaceY(surf.apexX);
  const cx = (surf.x0 + surf.x1) / 2;
  const cy = (apexY + surf.baseY) / 2;
  const rad = Math.max(1, surf.x1 - surf.x0);
  const marks = [];
  const n = rndInt(50, 130);
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0, ok = false;
    for (let t = 0; t < 12 && !ok; t++) {
      x = random() * D; y = random() * D;
      const d = Math.hypot(x - cx, y - cy) / rad;
      ok = random() < Math.exp(-d * 1.3);
    }
    if (!ok) continue;
    const w = D * (random() < 0.16 ? rnd(0.018, 0.036) : rnd(0.006, 0.018));
    const ang = rnd(0, TWO_PI), a = rnd(0.4, 1);
    marks.push({ x, y, w: w * 2.6, h: w * 2.6 * rnd(0.8, 1.2), ang, a: a * 0.32, bi: rndInt(0, 2), soft: true });
    marks.push({ x, y, w, h: w * rnd(0.8, 1.2), ang, a, bi: rndInt(0, 2) });
  }
  return { marks, rgb: brightAccent(34), blend: 'lighter' };
}

function planEclipse() {
  const r = D * rnd(0.09, 0.2);
  const side = surf.apexX > D / 2 ? -1 : 1;
  const cx = clamp(D / 2 + side * rnd(0.12, 0.34) * D, r * 1.1, D - r * 1.1);
  const cy = clamp(rnd(0.1, 0.42) * D, r * 1.1, P.horizonY - r * 0.6);
  const dark = lumaOf(rgbOf(P.groundColour)) > 128;
  const rim = [];
  const n = 90;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TWO_PI;
    const w = D * rnd(0.014, 0.038);
    rim.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, w, h: w * rnd(0.4, 0.9),
               ang: a + HALF_PI + rnd(-0.3, 0.3), a: rnd(0.3, 0.9), bi: rndInt(0, 2) });
  }
  return { cx, cy, r, rim, rgb: dark ? mixRGB(rgbOf(P.envDarkest), [0, 0, 0], 0.35) : brightAccent(40), alpha: rnd(0.35, 0.8) };
}

function planContour() {
  const path = moundPath();
  const marks = [];
  const every = Math.max(1, Math.round(path.length / 170));
  const size = D * rnd(0.014, 0.026);
  const gapAt = rnd(0.06, 0.82), gapLen = rnd(0.05, 0.15);
  const pf = rnd(1.2, 2.4), pph = rnd(0, TWO_PI);
  for (let i = 1; i < path.length - 1; i += every) {
    const t = i / (path.length - 1);
    if (t >= gapAt && t < gapAt + gapLen) continue;
    const [x, y] = path[i];
    if (y > surf.baseY - 2) continue;
    const n = path[Math.min(path.length - 1, i + every)];
    const press = clamp(0.8 + 0.5 * Math.sin(pf * t * Math.PI + pph), 0.58, 1.35);
    const th = size * press;
    marks.push({ x, y, w: th * 1.6, h: th, ang: Math.atan2(n[1] - y, n[0] - x), a: clamp(0.5 + 0.5 * press, 0, 1), bi: rndInt(0, 2) });
  }
  const inks = P.inksFor[MOUND];
  const dark = inks.reduce((a, b) => (a[2] <= b[2] ? a : b));
  return { marks, rgb: hsb2rgb(dark[0], dark[1] * 0.7, Math.min(dark[2], 16)), veil: rnd(0.74, 0.9), paper: P.groundColour };
}

function planHalftone() {
  const pitch = D * rnd(0.017, 0.032);
  const jitter = [];
  for (let i = 0; i < 64; i++) jitter.push([rnd(-0.18, 0.18), rnd(-0.18, 0.18), rnd(0.75, 1.25)]);
  const ink = pick(P.inksFor[MOUND]);
  return {
    pitch, jitter, r: pitch * rnd(0.22, 0.34),
    rgb: hsb2rgb(ink[0], Math.min(100, ink[1] * 1.3), ink[2]),
    alpha: rnd(0.34, 0.6), onMound: random() < 0.35,
  };
}

function drawPlanned(ac, plan) {
  ac.save();
  if (plan.blend) ac.globalCompositeOperation = plan.blend;
  for (const m of plan.marks) {
    const pool = m.soft ? softBrushes : brushes;
    dab(ac, m.rgb || plan.rgb, m.x, m.y, m.w, m.h, m.ang, m.a,
        m.bi === undefined ? undefined : pool[m.bi % pool.length]);
  }
  ac.restore();
}

function drawContourVeil(ac, plan) {
  const c = p5c(plan.paper).map((v) => v | 0);
  ac.save();
  ac.globalAlpha = plan.veil;
  ac.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
  ac.fillRect(0, 0, D, D);
  ac.restore();
  drawPlanned(ac, plan);
}

function drawHalftone(ac, h) {
  ac.save();
  const path = moundPath();
  ac.beginPath();
  if (!h.onMound) ac.rect(0, 0, D, D);
  ac.moveTo(path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i++) ac.lineTo(path[i][0], path[i][1]);
  ac.closePath();
  ac.clip('evenodd');
  ac.globalCompositeOperation = 'multiply';
  ac.globalAlpha = h.alpha;
  ac.fillStyle = `rgb(${h.rgb[0]},${h.rgb[1]},${h.rgb[2]})`;
  const cells = Math.ceil(D / h.pitch);
  for (let gy = 0; gy <= cells; gy++) {
    for (let gx = 0; gx <= cells + 1; gx++) {
      const j = h.jitter[(gy * 7 + gx) % h.jitter.length];
      const x = (gx + (gy % 2) * 0.5 + j[0]) * h.pitch - h.pitch * 0.5;
      const y = (gy + j[1]) * h.pitch - h.pitch * 0.5;
      if (x < -h.r || y < -h.r || x > D + h.r || y > D + h.r) continue;
      ac.beginPath();
      ac.arc(x, y, h.r * j[2], 0, TWO_PI);
      ac.fill();
    }
  }
  ac.restore();
}

function drawEclipse(ac, e) {
  ac.save();
  ac.globalAlpha = e.alpha;
  ac.fillStyle = `rgb(${e.rgb[0]},${e.rgb[1]},${e.rgb[2]})`;
  ac.beginPath();
  ac.arc(e.cx, e.cy, e.r, 0, TWO_PI);
  ac.fill();
  ac.globalAlpha = 1;
  for (const m of e.rim) dab(ac, e.rgb, m.x, m.y, m.w, m.h, m.ang, m.a * e.alpha, brushes[m.bi % brushes.length]);
  ac.restore();
}

function drawGlow(ac, g) {
  if (!facePlaced.length || !faceAnchor) return;
  const r = Math.max(4, faceAnchor.ew * (3 + 3.6 * g.k));
  ac.save();
  ac.globalCompositeOperation = 'screen';
  for (const [x, y] of facePlaced) {
    const rad = ac.createRadialGradient(x, y, r * 0.05, x, y, r);
    rad.addColorStop(0, `rgba(${g.rgb[0]},${g.rgb[1]},${g.rgb[2]},${0.9 * g.k})`);
    rad.addColorStop(0.4, `rgba(${g.rgb[0]},${g.rgb[1]},${g.rgb[2]},${0.4 * g.k})`);
    rad.addColorStop(1, `rgba(${g.rgb[0]},${g.rgb[1]},${g.rgb[2]},0)`);
    ac.fillStyle = rad;
    ac.beginPath();
    ac.arc(x, y, r, 0, TWO_PI);
    ac.fill();
  }
  ac.restore();
}

// ── the composite ───────────────────────────────────────────────────────────
/**
 * The explorer's composite, in its order. `opts.face` false leaves the face out
 * -- the living variation draws it every frame instead -- and the rare layers
 * that belong over the face are drawn by `drawOver` so it can put them back.
 */
function composite(opts) {
  const withFace = !opts || opts.face !== false;
  const ac = art.ctx;
  ac.setTransform(1, 0, 0, 1, 0, 0);
  ac.globalAlpha = 1;
  ac.globalCompositeOperation = 'source-over';
  ac.fillStyle = P.groundColour;
  ac.fillRect(0, 0, D, D);
  ac.drawImage(layers[SKY].canvas, 0, 0);
  ac.drawImage(layers[LAND].canvas, 0, 0);
  if (rarePlan && P.rare === 'Eclipse') drawEclipse(ac, rarePlan);
  if (P.bgShade > 0) {
    const a = P.lightAngle * Math.PI / 180;
    const d = p5c(P.envDarkest).map((v) => v | 0);
    ac.save();
    ac.globalCompositeOperation = 'multiply';
    const g = ac.createLinearGradient(
      D / 2 + Math.cos(a) * D * 0.6, D / 2 + Math.sin(a) * D * 0.6,
      D / 2 - Math.cos(a) * D * 0.6, D / 2 - Math.sin(a) * D * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, `rgba(${d[0]},${d[1]},${d[2]},${P.bgShade})`);
    ac.fillStyle = g;
    ac.fillRect(0, 0, D, D);
    ac.restore();
  }
  if (P.bgGrain > 0 && grainTex) {
    ac.save();
    ac.globalCompositeOperation = 'overlay';
    ac.globalAlpha = P.bgGrain;
    ac.drawImage(grainTex.canvas, 0, 0, D, D);
    ac.restore();
  }
  ac.save();
  if (P.castShadow > 0 && surf.x1 > surf.x0) {
    const cx = (surf.x0 + surf.x1) / 2;
    const w = (surf.x1 - surf.x0) * 0.62;
    const h = Math.max(2, (D - P.horizonY) * 0.16);
    const sd = p5c(P.envDarkest).map((v) => v | 0);
    ac.save();
    ac.globalCompositeOperation = 'multiply';
    ac.translate(cx, surf.baseY + h * 0.35);
    ac.scale(1, Math.max(0.02, h / Math.max(1, w)));
    const g = ac.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, w));
    g.addColorStop(0, `rgba(${sd[0]},${sd[1]},${sd[2]},${P.castShadow})`);
    g.addColorStop(1, `rgba(${sd[0]},${sd[1]},${sd[2]},0)`);
    ac.fillStyle = g;
    ac.beginPath();
    ac.arc(0, 0, Math.max(1, w), 0, TWO_PI);
    ac.fill();
    ac.restore();
  }
  if (rarePlan && P.rare === 'Halo') drawPlanned(ac, rarePlan);
  ac.drawImage(layers[MOUND].canvas, 0, 0);
  if (rarePlan && P.rare === 'Crown') drawPlanned(ac, rarePlan);
  if (rarePlan && P.rare === 'Glow') drawGlow(ac, rarePlan);
  if (withFace) drawFace(ac, null);
  ac.restore();
  drawOver(ac, withFace);
}

/** Everything the explorer draws after the face. */
function drawOver(ac, withFace) {
  if (lipLayer && P.groundInFront) ac.drawImage(lipLayer.canvas, 0, 0);
  if (rarePlan && P.rare === 'Contour') {
    drawContourVeil(ac, rarePlan);
    if (withFace) drawFace(ac, null);
  }
  if (rarePlan && P.rare === 'Motes') drawPlanned(ac, rarePlan);
  if (rarePlan && P.rare === 'Halftone') drawHalftone(ac, rarePlan);
}

// ── painting under a budget ─────────────────────────────────────────────────
/**
 * The explorer paints in one blocking run. Here the same marks are laid in the
 * same order under a per-frame budget, which is free of consequence: this
 * piece's composite spends no randomness, so where the wall stops and starts
 * cannot move a single mark.
 */
/**
 * The whole painting as one resumable run: the grain, then the three passes in
 * the explorer's order, yielding often enough that no frame is ever long. A
 * yield costs the picture nothing -- the marks and the random draws behind
 * them are the same ones in the same order either way.
 */
function* painter() {
  for (let i = 0; i < 3; i++) brushes.push(yield* buildBrush());
  for (let i = 0; i < 3; i++) softBrushes.push(yield* buildBrush(true));
  if (P.bgGrain > 0) yield* buildGrain();
  for (const pass of [SKY, LAND, MOUND]) {
    startPass(pass);
    while (cursor < paths.length) { tracePath(paths[cursor++]); yield; }
    if (pass === LAND && P.groundInFront) yield* buildLipLayer();
    if (pass === MOUND) yield* finishMoundLayer();
  }
}

function advance(budgetMs) {
  if (finished || !painterGen) return finished;
  const started = clock();
  while (!painterGen.next().done) if (clock() - started > budgetMs) return false;
  painterGen = null;
  finished = true;
  return true;
}

/** A finished picture, copied down to the size the wall will show it at. */
function snapshot(size) {
  const g = surface(size, size);
  g.ctx.imageSmoothingQuality = 'high';
  g.ctx.drawImage(art.canvas, 0, 0, size, size);
  return g;
}

/**
 * Replan the face alone, for a new eye size or shape.
 *
 * The face is planned before a single mark is laid and nothing in the painting
 * depends on it, so redrawing it from the random state it was planned at gives
 * exactly the face a full repaint would -- as long as the same number of eyes
 * land on the body, since a lost or gained eye moves the stream. When one does,
 * this changes nothing and says so, and the wall repaints properly instead.
 */
function replanFace(eyeSize, eyeShape) {
  const keep = { z: Z, plan: facePlan, anchor: faceAnchor, placed: facePlaced, size: P.eyeSize, shape: P.eyeShape };
  Z = faceZ;
  faceAnchor = null;
  P.eyeSize = Math.max(0.002, eyeSize);
  P.eyeShape = clamp(eyeShape, 0, 1);
  const next = planFace();
  Z = keep.z;
  const same = next && keep.plan && next.placed.length === keep.plan.placed.length;
  if (!same) {
    facePlan = keep.plan;
    faceAnchor = keep.anchor;
    facePlaced = keep.placed;
    P.eyeSize = keep.size;
    P.eyeShape = keep.shape;
    return false;
  }
  facePlan = next;
  return true;
}

// ── the wall around the picture ─────────────────────────────────────────────
// The piece is square and a wall usually isn't, so the picture hangs on a wall
// of its own colour with a soft shadow under it, and the mound's number is
// written small in the margin -- the one thing a host needs to find it again.
let W = 0, H = 0, S = 0, ox = 0, oy = 0;
let wallBg = null, wallKey = '';
let prevShot = null, fadeAt = -1;
let builtKey = '', pendingKey = '', pendingSince = 0, built = false;
let moundNo = 1, wanderOffset = 0, lastMound = null, doneAt = 0, wanderAt = -1e9;
const SETTLE = 0.8;       // seconds a change must hold before the piece repaints
const FADE = 1.4;         // seconds to dissolve out of the old picture
const BUDGET_MS = 6;      // painting time per frame, leaving the wall its own
const PREVIEW_MS = 120;   // how often the picture in progress is recomposited

/**
 * Where the square sits on this wall, and which tier to paint it at. The tier
 * follows the canvas the picture really lands on rather than the coordinates
 * the piece is handed: a desk thumbnail draws a 1280x720 wall into 320x180.
 */
function layout(w, h, ctx) {
  W = w; H = h;
  S = Math.min(w, h);
  ox = (W - S) >> 1;
  oy = (H - S) >> 1;
  const canvas = ctx && ctx.canvas;
  const shown = canvas && canvas.width > 0 && canvas.height > 0
    ? Math.min(canvas.width, canvas.height) : S;
  const want = tierFor(shown);
  if (want !== tier) {
    tier = want;
    [D, SPACING_MUL] = TIERS[want];
    art = null;                       // the buffers are the tier's own size
    built = false;
  }
  wallBg = null;
  wallKey = '';
  prevShot = null;
  fadeAt = -1;
}

function wallBackground() {
  const key = `${W}x${H}|${P.groundColour}|${moundNo}`;
  if (wallKey === key && wallBg) return;
  wallKey = key;
  wallBg = surface(W, H);
  const c = wallBg.ctx;
  const g = rgbOf(P.groundColour), d = rgbOf(P.envDarkest);
  const tone = g.map((v, i) => Math.round(v + (d[i] - v) * 0.55));
  c.fillStyle = `rgb(${tone[0]},${tone[1]},${tone[2]})`;
  c.fillRect(0, 0, W, H);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.4)';
  c.shadowBlur = Math.round(S * 0.03);
  c.shadowOffsetY = Math.round(S * 0.01);
  c.fillStyle = `rgb(${g[0]},${g[1]},${g[2]})`;
  c.fillRect(ox, oy, S, S);
  c.restore();
  if (ox > S * 0.1) {
    c.globalAlpha = 0.55;
    c.fillStyle = `rgb(${g[0]},${g[1]},${g[2]})`;
    c.font = `${Math.round(S * 0.02)}px ui-monospace, monospace`;
    c.textAlign = 'left';
    c.fillText(`Mound ${moundNo}`, Math.round(S * 0.04), H - Math.round(S * 0.05));
    c.globalAlpha = 1;
  }
}

/** Put a square picture on the wall. */
function showSquare(ctx, canvas) {
  if (W > S || H > S) {
    wallBackground();
    ctx.drawImage(wallBg.canvas, 0, 0);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, S, S);
  ctx.clip();
  ctx.drawImage(canvas, ox, oy, S, S);
  ctx.restore();
}

/** Dissolve out of whatever the wall was showing before this repaint. */
function showFade(ctx, t) {
  if (fadeAt < 0 || !prevShot) return;
  const u = (t - fadeAt) / FADE;
  if (u >= 1) { fadeAt = -1; prevShot = null; return; }
  ctx.save();
  ctx.globalAlpha = 1 - u;
  ctx.drawImage(prevShot.canvas, ox, oy, S, S);
  ctx.restore();
}

function keepForFade(ctx, t) {
  if (!built || S < 8) return;
  prevShot = surface(S, S);
  try {
    prevShot.ctx.drawImage(ctx.canvas, ox, oy, S, S, 0, 0, S, S);
    fadeAt = t;
  } catch (e) {
    prevShot = null;                  // not a real canvas: the gallery's harness
  }
}

// ── which picture the room has asked for ────────────────────────────────────
const keyOf = (want, m) => [want.palette, want.creature, want.contrast, want.separation,
  want.structure, want.marks, want.mark_length, want.mark_width,
  want.horizon, want.apex, want.width, want.ground, m].join('|');

/**
 * The host's mound number, plus however far wandering has carried it. The
 * offset is the wall's own and never touches the control, so the number on the
 * desk -- and a look saved from it -- still says where this started.
 */
function mounded(want, t, wanderOn, wanderEvery) {
  if (!wanderOn && wanderOffset) wanderOffset = 0;
  if (want.mound !== lastMound) { lastMound = want.mound; wanderOffset = 0; }
  // Stepping once is enough: without marking the moment, every frame between
  // here and the repaint would step again and the picture would never settle.
  if (wanderOn && finished && t - Math.max(doneAt, wanderAt) > wanderEvery) {
    wanderOffset++;
    wanderAt = t;
  }
  return ((Math.round(want.mound) - 1 + wanderOffset) % 9999 + 9999) % 9999 + 1;
}

/**
 * Start the picture over, once the room has stopped fiddling for a moment.
 * Every control here changes how the paint falls, so there is nothing to
 * update live: the piece is repainted from the first mark, out of a dissolve.
 */
function repaintWhenSettled(ctx, want, m, t, starter) {
  const key = keyOf(want, m);
  if (key === builtKey) { pendingKey = ''; return false; }
  if (key !== pendingKey) { pendingKey = key; pendingSince = t; return false; }
  if (t - pendingSince < SETTLE) return false;
  keepForFade(ctx, t);
  pendingKey = '';
  starter(want, m, t);
  return true;
}

// ── the whole piece, and the boil on command ────────────────────────────────
// The picture is the explorer's, face and all. The host's Boil paints the same
// creature over again from a seed of its own, once per frame of the loop, with
// the face and the colours held still -- then the wall plays those frames back
// the way a hand-drawn animation is shot on twos.
let bank = [], playing = false, boiling = false, shown = 0, shownAt = 0;
let livePlan = null, lastPreview = -1e9, boilRes = 1024;

function onFinished(t) {
  doneAt = t;
  composite();
  bank.push(snapshot(boilRes));
  if (boiling && bank.length < P.animFrames) {
    build(livePlan, bank.length);      // straight on to the next frame of the loop
    return;
  }
  boiling = false;
  if (bank.length > 1) { playing = true; shown = 0; shownAt = t; }
}

function startPicture(want, m, t) {
  moundNo = m;
  bank = [];
  playing = false;
  boiling = false;
  boilRes = Math.min(D, Math.max(320, S || 1024));   // never bigger than the tier
  livePlan = explorerParams(want, m);
  allocBuffers();
  build(livePlan, 0);
  builtKey = keyOf(want, m);
  built = true;
  lastPreview = -1e9;
}

function startBoil(t) {
  if (!built || P.animFrames < 2 || boiling) return;
  if (bank.length >= P.animFrames) { playing = true; shown = 0; shownAt = t; return; }
  boiling = true;
  playing = false;
  if (finished) build(livePlan, bank.length);
}

function frame_(ctx, frame, getVar, audio, room) {
  const t = frame.t;
  const w = frame.width | 0, h = frame.height | 0;
  if (w < 8 || h < 8) return;
  if (w !== W || h !== H || !built) layout(w, h, ctx);

  const want = readRoom(getVar);
  const m = mounded(want, t, false, 1e9);
  if (!built) startPicture(want, m, t);
  else repaintWhenSettled(ctx, want, m, t, startPicture);

  for (const e of (room && room.events) || []) if (e && e.name === 'boil') startBoil(t);

  if (!finished) {
    advance(BUDGET_MS);
    if (finished) onFinished(t);
    else if (t * 1000 - lastPreview > PREVIEW_MS) { lastPreview = t * 1000; composite(); }
  }

  if (playing && bank.length > 1) {
    const step = 1 / P.animFps;
    if (t - shownAt >= step) {
      shownAt = t - shownAt > step * 3 ? t : shownAt + step;
      shown = (shown + 1) % bank.length;
    }
    showSquare(ctx, bank[shown].canvas);
  } else {
    showSquare(ctx, art.canvas);
  }

  if (boiling && ox > S * 0.1) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = `rgb(${rgbOf(P.groundColour).join(',')})`;
    ctx.font = `${Math.round(S * 0.02)}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(`Boiling ${bank.length + 1} of ${P.animFrames}`,
                 Math.round(S * 0.04), H - Math.round(S * 0.09));
    ctx.restore();
  }
  showFade(ctx, t);
}

return {
  frame: frame_,
  // What the explorer needs to draw this same picture, and how far along the
  // painting is: the Sketchbook's parity harness drives the piece through this.
  explorerParams, readRoom, HASH,
  progress: () => ({ done: finished, pass: passIndex, cursor, total: paths.length, tier, res: D }),
  mound: () => moundNo,
};

})());

FM.frame(ctx, frame, getVar, audio, room);
