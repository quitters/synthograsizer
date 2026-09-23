const gridN = getVar('grid_density') ?? 9;
const rings = getVar('concentric_rings') ?? 7;
const strokeW = getVar('line_weight') ?? 1.0;
const mode = getVar('disorder_mode') ?? 'traveling_wave';
const paper = getVar('paper_tone') ?? 'bristol_cream';
const style = getVar('perturbation_style') ?? 'corner_jitter';

const papers = {
  bristol_cream: { bg: '#f4ede2', stroke: '#1a1816', accent: '#7a2b1e' },
  french_parchment: { bg: '#ece4cf', stroke: '#221f1c', accent: '#b8602a' },
  blueprint_slate: { bg: '#1c242b', stroke: '#dce8f0', accent: '#4ea8de' },
  graphite_raw: { bg: '#e8e8e6', stroke: '#0d0d0d', accent: '#595959' }
};
const palette = papers[paper] ?? papers.bristol_cream;

if (!room.state.init) {
  room.state.lut = new Float32Array(2048);
  for (let i = 0; i < 2048; i++) {
    room.state.lut[i] = Math.sin(i * 0.043) * 0.5 + Math.sin(i * 0.117) * 0.3 + Math.cos(i * 0.291) * 0.2;
  }
  room.state.pulse = 0;
  room.state.init = true;
}

if (audio.beat) {
  room.state.pulse = 1.0;
} else {
  room.state.pulse = Math.max(0, room.state.pulse - frame.dt * 2.2);
}

const w = frame.width;
const h = frame.height;

ctx.save();
ctx.fillStyle = palette.bg;
ctx.fillRect(0, 0, w, h);

const pad = Math.min(w, h) * 0.06;
const availW = w - pad * 2;
const availH = h - pad * 2;
const cellSize = Math.min(availW / gridN, availH / gridN);
const startX = (w - cellSize * gridN) * 0.5;
const startY = (h - cellSize * gridN) * 0.5;
const lut = room.state.lut;
const t = frame.t;
const bass = audio.bass || 0;
const level = audio.level || 0;
const pulse = room.state.pulse;

ctx.lineWidth = strokeW;
ctx.lineCap = 'round';
ctx.lineJoin = 'round';

const peopleCount = room.people ? room.people.length : 0;

for (let gy = 0; gy < gridN; gy++) {
  for (let gx = 0; gx < gridN; gx++) {
    const cx = startX + (gx + 0.5) * cellSize;
    const cy = startY + (gy + 0.5) * cellSize;
    const maxR = cellSize * 0.44;
    
    const nx = gx / (gridN - 1 || 1);
    const ny = gy / (gridN - 1 || 1);
    
    let wave = 0;
    if (mode === 'traveling_wave') {
      wave = Math.sin(nx * 4.2 - t * 1.8 + ny * 2.1) * 0.5 + 0.5;
    } else if (mode === 'radial_pulse') {
      const dx = nx - 0.5;
      const dy = ny - 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy) * 3.5;
      wave = Math.sin(dist * 3.0 - t * 2.5) * 0.5 + 0.5;
    } else {
      const idx = (gx * 31 + gy * 73) & 2047;
      wave = (lut[idx] + 1) * 0.5;
    }
    
    const disorder = Math.min(1.2, Math.max(0, wave * (0.8 + bass * 0.7) + pulse * 0.35));
    
    let cellColor = palette.stroke;
    if (peopleCount > 0) {
      const pIdx = (gx + gy * gridN) % peopleCount;
      if (disorder > 0.75) {
        const person = room.people[pIdx];
        cellColor = `hsl(${person.hue}, 65%, 45%)`;
      }
    } else if (disorder > 0.85) {
      cellColor = palette.accent;
    }
    ctx.strokeStyle = cellColor;
    
    const cellSeed = (gx * 47 + gy * 101) & 1023;
    
    for (let r = 1; r <= rings; r++) {
      const ringFrac = r / rings;
      const rad = maxR * ringFrac;
      const depthScale = ringFrac * ringFrac;
      const amp = disorder * depthScale * (cellSize * 0.32) * (1 + level * 0.4);
      
      ctx.beginPath();
      for (let c = 0; c < 4; c++) {
        const baseAngle = c * Math.PI * 0.5 + Math.PI * 0.25;
        const baseDist = rad * 1.41421356;
        let px = cx + Math.cos(baseAngle) * baseDist;
        let py = cy + Math.sin(baseAngle) * baseDist;
        
        const lutIdx = (cellSeed + r * 13 + c * 43 + Math.floor(t * 12)) & 2047;
        const n1 = lut[lutIdx];
        const n2 = lut[(lutIdx + 311) & 2047];
        
        if (style === 'corner_jitter') {
          px += n1 * amp;
          py += n2 * amp;
        } else if (style === 'elastic_shear') {
          const shear = (c === 0 || c === 2 ? n1 : -n1) * amp;
          px += shear;
          py += (c > 1 ? n2 : -n2) * amp * 0.5;
        } else {
          const snap = (Math.round(n1 * 2) / 2) * amp * 1.3;
          const snapY = (Math.round(n2 * 2) / 2) * amp * 1.3;
          px += snap;
          py += snapY;
        }
        
        if (c === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
}

ctx.restore();