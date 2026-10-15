ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;

// 1. Settings & Variables
const moodKey = getVar('alley_mood') ?? 'vice_city';
const flickerAmt = getVar('flicker_intensity') ?? 0.5;
const showBricks = getVar('brick_texture') ?? true;
const bloomKey = getVar('glow_bloom') ?? 'vivid';
const sputterSign = getVar('sputter_target') ?? 'open';

const palettes = {
  vice_city:      { bg: '#06040a', palm: '#00ffb4', glass: '#ff2d95', liquid: '#ffe600', arrow: '#00f0ff', open: '#ff0055' },
  downtown_rain:  { bg: '#04070c', palm: '#1fe0ba', glass: '#3a86ff', liquid: '#ff006e', arrow: '#ffbe0b', open: '#fb5607' },
  midnight_tokyo: { bg: '#070308', palm: '#05ffa1', glass: '#b000ff', liquid: '#00f5d4', arrow: '#ff007f', open: '#ffe600' },
  retro_noir:     { bg: '#050403', palm: '#ff8800', glass: '#ff3333', liquid: '#ffcc00', arrow: '#ffaa00', open: '#ff2200' }
};
const col = palettes[moodKey] ?? palettes.vice_city;

const bloomMults = { soft: 0.6, vivid: 1.0, hyper: 1.7 };
const bloom = bloomMults[bloomKey] ?? 1.0;

// 2. Offscreen Brick Wall Cache in room.state
if (!room.state.brickCanvas || room.state.brickW !== W || room.state.brickH !== H || room.state.brickMode !== showBricks) {
  room.state.brickW = W;
  room.state.brickH = H;
  room.state.brickMode = showBricks;
  const bc = new OffscreenCanvas(W, H);
  const bctx = bc.getContext('2d');
  
  bctx.fillStyle = '#060608';
  bctx.fillRect(0, 0, W, H);
  
  if (showBricks) {
    const bw = 54, bh = 22;
    bctx.lineWidth = 1.5;
    for (let y = -bh; y < H + bh; y += bh + 3) {
      const row = Math.floor(y / (bh + 3));
      const offset = (row % 2) * (bw / 2);
      for (let x = -bw + offset; x < W + bw; x += bw + 3) {
        const shade = Math.sin(row * 13.7 + x * 7.3) * 0.5 + 0.5;
        bctx.fillStyle = `rgb(${10 + shade * 10}, ${10 + shade * 9}, ${12 + shade * 11})`;
        bctx.fillRect(x, y, bw, bh);
        bctx.strokeStyle = '#020203';
        bctx.strokeRect(x, y, bw, bh);
      }
    }
    // Add subtle ambient vignette
    const grad = bctx.createRadialGradient(W * 0.5, H * 0.5, W * 0.2, W * 0.5, H * 0.5, W * 0.8);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.85)');
    bctx.fillStyle = grad;
    bctx.fillRect(0, 0, W, H);
  }
  room.state.brickCanvas = bc;
}

// Draw base wall
ctx.drawImage(room.state.brickCanvas, 0, 0);

// 3. Flicker & Buzz computation per sign
function getFlicker(seed, isSputtering) {
  const noise1 = Math.sin(t * 37.1 + seed * 19.3);
  const noise2 = Math.cos(t * 89.4 - seed * 43.1);
  let val = 0.88 + 0.12 * Math.sin(t * 120.0 + seed * 5.0) + (noise1 * noise2) * 0.15 * flickerAmt;
  
  // Electrical hum buzz
  val += (audio.bass * 0.25) * Math.sin(t * 180.0 + seed);
  
  if (isSputtering) {
    const cycle = (t * 1.8 + seed) % 5.0;
    if (cycle > 4.2 || (cycle > 1.8 && cycle < 2.1)) {
      // Sputter crackle
      val = Math.random() < 0.35 ? (Math.random() * 0.4) : 0.02;
    } else if (Math.sin(t * 43.0 + seed) > 0.85) {
      val *= 0.3;
    }
    if (audio.treble > 0.55 && Math.random() < 0.25) val = 0.05;
  }
  if (audio.beat && Math.sin(seed * 77) > 0.3) {
    val = Math.min(1.4, val * 1.35);
  }
  return Math.max(0, Math.min(1.5, val));
}

const fPalm = getFlicker(1.1, sputterSign === 'palm');
const fGlass = getFlicker(2.7, sputterSign === 'cocktail');
const fArrow = getFlicker(4.3, sputterSign === 'arrow');
const fOpen = getFlicker(7.9, sputterSign === 'open');

// 4. Transform scale to 1920x1080 space centered
const scale = Math.min(W / 1920, H / 1080);
const offsetX = (W - 1920 * scale) * 0.5;
const offsetY = (H - 1080 * scale) * 0.5;

ctx.translate(offsetX, offsetY);
ctx.scale(scale, scale);

// 5. Helper to draw glowing neon paths with tube gaps and brackets
function drawNeon(paths, color, intensity, tubeWidth) {
  if (intensity <= 0.02) return;
  
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  // Layer A: Wide atmospheric wall bounce (Screen / Lighter)
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = color;
  ctx.globalAlpha = Math.min(1, 0.18 * intensity * bloom);
  ctx.lineWidth = tubeWidth * 7.0 + (audio.bass * 14.0);
  for (let i = 0; i < paths.length; i++) {
    ctx.stroke(paths[i]);
  }
  
  // Layer B: Medium outer glow
  ctx.globalAlpha = Math.min(1, 0.45 * intensity * bloom);
  ctx.lineWidth = tubeWidth * 3.2;
  for (let i = 0; i < paths.length; i++) {
    ctx.stroke(paths[i]);
  }
  
  // Layer C: Core colored gas
  ctx.globalAlpha = Math.min(1, 0.9 * intensity);
  ctx.lineWidth = tubeWidth * 1.3;
  for (let i = 0; i < paths.length; i++) {
    ctx.stroke(paths[i]);
  }
  
  // Layer D: White-hot central discharge
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = Math.min(1, 0.95 * Math.min(1.0, intensity));
  ctx.lineWidth = Math.max(1.2, tubeWidth * 0.35);
  for (let i = 0; i < paths.length; i++) {
    ctx.stroke(paths[i]);
  }
  
  ctx.restore();
}

// Helper for dark tube back-paint / brackets
function drawTapeGaps(points, radius) {
  ctx.save();
  ctx.fillStyle = '#101114';
  ctx.strokeStyle = '#050507';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < points.length; i++) {
    ctx.beginPath();
    ctx.arc(points[i][0], points[i][1], radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// 6. Define Sign Paths
// Sign 1: PALM TREE (Left area ~ x: 380, y: 520)
const palmPaths = [];
const palmTrunk = new Path2D();
palmTrunk.moveTo(370, 720);
palmTrunk.bezierCurveTo(365, 590, 390, 480, 420, 390);
palmPaths.push(palmTrunk);

// Fronds
const fronds = [
  [[420, 390], [330, 350], [250, 390]],
  [[420, 390], [350, 300], [280, 270]],
  [[420, 390], [420, 270], [400, 220]],
  [[420, 390], [490, 280], [550, 250]],
  [[420, 390], [520, 340], [580, 370]],
  [[420, 390], [480, 410], [520, 460]]
];
for (let i = 0; i < fronds.length; i++) {
  const p = new Path2D();
  p.moveTo(fronds[i][0][0], fronds[i][0][1]);
  p.quadraticCurveTo(fronds[i][1][0], fronds[i][1][1], fronds[i][2][0], fronds[i][2][1]);
  palmPaths.push(p);
}

// Sign 2: COCKTAIL GLASS (Center-Left ~ x: 800, y: 500)
const glassOutlinePaths = [];
const glassV = new Path2D();
glassV.moveTo(690, 360);
glassV.lineTo(800, 510);
glassV.lineTo(910, 360);
glassV.closePath();
glassOutlinePaths.push(glassV);

const stem = new Path2D();
stem.moveTo(800, 510);
stem.lineTo(800, 680);
stem.moveTo(740, 680);
stem.lineTo(860, 680);
glassOutlinePaths.push(stem);

// Liquid & Olive
const liquidPaths = [];
const liquid = new Path2D();
liquid.moveTo(725, 410);
liquid.lineTo(800, 500);
liquid.lineTo(875, 410);
liquid.closePath();
liquidPaths.push(liquid);

// Skewer & Olive
const skewer = new Path2D();
skewer.moveTo(740, 480);
skewer.lineTo(890, 320);
liquidPaths.push(skewer);

// Sign 3: ARROW (Bottom-Right, pulsing/chasing)
const arrowPaths = [];
const arrowPhase = Math.floor((t * 5.0) % 3);
const arrowBase = new Path2D();
arrowBase.moveTo(1120, 660);
arrowBase.lineTo(1380, 660);
arrowPaths.push(arrowBase);

// Chevrons
const ch1 = new Path2D();
ch1.moveTo(1330, 600);
ch1.lineTo(1390, 660);
ch1.lineTo(1330, 720);
arrowPaths.push(ch1);

const ch2 = new Path2D();
ch2.moveTo(1390, 600);
ch2.lineTo(1450, 660);
ch2.lineTo(1390, 720);
arrowPaths.push(ch2);

const ch3 = new Path2D();
ch3.moveTo(1450, 600);
ch3.lineTo(1510, 660);
ch3.lineTo(1450, 720);
arrowPaths.push(ch3);

// Sign 4: Cursive "OPEN" (Upper-Right ~ x: 1220, y: 360)
const openPaths = [];
// Letter O
const pO = new Path2D();
pO.ellipse(1160, 340, 45, 65, -0.15, 0, Math.PI * 2);
openPaths.push(pO);

// Connection O to P
const pOP = new Path2D();
pOP.moveTo(1195, 315);
pOP.quadraticCurveTo(1220, 305, 1245, 330);
openPaths.push(pOP);

// Letter P
const pP = new Path2D();
pP.moveTo(1250, 270);
pP.lineTo(1230, 420);
pP.moveTo(1245, 300);
pP.quadraticCurveTo(1295, 290, 1285, 340);
pP.quadraticCurveTo(1275, 375, 1238, 365);
openPaths.push(pP);

// Letter E
const pE = new Path2D();
pE.moveTo(1280, 360);
pE.bezierCurveTo(1330, 310, 1370, 330, 1340, 370);
pE.quadraticCurveTo(1310, 395, 1360, 380);
openPaths.push(pE);

// Letter N
const pN = new Path2D();
pN.moveTo(1360, 380);
pN.lineTo(1385, 330);
pN.quadraticCurveTo(1405, 315, 1425, 340);
pN.lineTo(1415, 385);
pN.quadraticCurveTo(1435, 330, 1465, 330);
pN.lineTo(1455, 385);
pN.quadraticCurveTo(1475, 390, 1495, 375);
openPaths.push(pN);

// Oval border around OPEN
const openBorder = new Path2D();
openBorder.ellipse(1330, 345, 240, 130, -0.05, 0, Math.PI * 2);

// 7. Ambient Floor Reflection / Alley Mist Pool
ctx.save();
ctx.globalCompositeOperation = 'screen';
const hazeGrad = ctx.createRadialGradient(960, 600, 100, 960, 600, 900);
hazeGrad.addColorStop(0, `rgba(180, 20, 100, ${0.12 * bloom * fOpen})`);
hazeGrad.addColorStop(0.4, `rgba(0, 220, 180, ${0.08 * bloom * fPalm})`);
hazeGrad.addColorStop(0.8, `rgba(0, 140, 255, ${0.05 * bloom * fArrow})`);
hazeGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = hazeGrad;
ctx.fillRect(0, 150, 1920, 930);
ctx.restore();

// 8. Render Signs
// PALM
drawNeon(palmPaths, col.palm, fPalm, 6.0);

// COCKTAIL GLASS
drawNeon(glassOutlinePaths, col.glass, fGlass, 5.5);
drawNeon(liquidPaths, col.liquid, fGlass * 0.95, 4.5);

// ARROW - Chevrons chase on arrowPhase
const arrowCol = col.arrow;
drawNeon([arrowBase], arrowCol, fArrow * 0.7, 5.0);
drawNeon([ch1], arrowCol, fArrow * (arrowPhase >= 0 ? 1.2 : 0.25), 6.0);
drawNeon([ch2], arrowCol, fArrow * (arrowPhase >= 1 ? 1.2 : 0.25), 6.0);
drawNeon([ch3], arrowCol, fArrow * (arrowPhase >= 2 ? 1.2 : 0.25), 6.0);

// OPEN SIGN + BORDER
drawNeon([openBorder], col.arrow, fOpen * 0.75, 4.5);
drawNeon(openPaths, col.open, fOpen, 6.5);

// 9. Blacked-out Glass Jumper Caps / Wire Connectors
const caps = [
  // Palm base & junction
  [420, 390], [370, 720],
  // Cocktail joins
  [800, 510], [800, 680], [740, 680], [860, 680], [890, 320],
  // Arrow tail
  [1120, 660],
  // Open letter junctions
  [1247, 315], [1280, 360], [1360, 380], [1495, 375]
];
drawTapeGaps(caps, 4.0);

// 10. Connected People Presence (Subtle glowing tags in alley graffiti)
if (room.people && room.people.length > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < room.people.length; i++) {
    const p = room.people[i];
    const px = 180 + ((i * 137.5) % 1560);
    const py = 880 + ((i * 47) % 120);
    const rad = 4 + (audio.bass * 6.0);
    ctx.fillStyle = `hsla(${p.hue}, 90%, 65%, 0.45)`;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `hsla(${p.hue}, 100%, 85%, 0.75)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

// 11. Subtle rain streaks in dark alley
ctx.save();
ctx.strokeStyle = 'rgba(200, 230, 255, 0.08)';
ctx.lineWidth = 1.0;
const rainTime = t * 1200;
ctx.beginPath();
for (let i = 0; i < 40; i++) {
  const rx = (i * 49.3 + t * 40) % 1920;
  const ry = (rainTime + i * 197.1) % 1080;
  ctx.moveTo(rx, ry);
  ctx.lineTo(rx - 8, ry + 26);
}
ctx.stroke();
ctx.restore();

ctx.restore();