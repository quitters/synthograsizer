ctx.save();

ctx.fillStyle = '#010308';
ctx.fillRect(0, 0, frame.width, frame.height);

const palName = getVar('ocean_palette');
const palettes = {
    "Bioluminescent": { h1: 170, h2: 200, s: 90, l: 50 },
    "Midnight Blue": { h1: 220, h2: 260, s: 80, l: 40 },
    "Deep Trench": { h1: 240, h2: 280, s: 70, l: 30 },
    "Kelp Forest": { h1: 140, h2: 170, s: 80, l: 35 }
};
const pal = palettes[palName] || palettes["Bioluminescent"];

const numPoints = getVar('focal_points') ?? 4;
const density = getVar('ring_density') ?? 20;
const speed = getVar('plasma_speed') ?? 1;
const swell = getVar('swell_intensity') ?? 6;
const blend = getVar('blend_mode') ?? 'screen';
const style = getVar('ripple_style') ?? 'sharp';

room.state.phase ??= 0;
room.state.phase += frame.dt * 15 * speed;
room.state.phase += audio.bass * frame.dt * swell * 60;

const cx = frame.width / 2;
const cy = frame.height / 2;
const activePoints = [];

if (room.people) {
    for (let i = 0; i < Math.min(room.people.length, numPoints); i++) {
        const p = room.people[i];
        const ptT = frame.t * 0.1 * speed + p.hue;
        activePoints.push({
            x: cx + cx * 0.7 * Math.sin(ptT * 0.9),
            y: cy + cy * 0.7 * Math.cos(ptT * 1.1),
            color: `hsla(${p.hue}, ${pal.s}%, ${pal.l}%, 0.6)`
        });
    }
}

while (activePoints.length < numPoints) {
    const i = activePoints.length;
    const ptT = frame.t * 0.2 * speed;
    const f = numPoints > 1 ? i / (numPoints - 1) : 0;
    const hue = pal.h1 + (pal.h2 - pal.h1) * f;
    
    activePoints.push({
        x: cx + cx * 0.6 * Math.sin(ptT * (0.7 + i * 0.05)),
        y: cy + cy * 0.6 * Math.cos(ptT * (0.8 - i * 0.04)),
        color: `hsla(${hue}, ${pal.s}%, ${pal.l}%, 0.6)`
    });
}

ctx.globalCompositeOperation = blend;
ctx.lineWidth = Math.max(0.5, (density / 10) + audio.bass * swell * 0.5);

if (style === 'soft') {
    ctx.shadowBlur = density * 0.8;
} else if (style === 'dashed') {
    ctx.setLineDash([density * 0.4, density * 0.6]);
}

const maxR = Math.hypot(frame.width, frame.height);
let startR = room.state.phase % density;
if (startR < 0) startR += density; 

for (const pt of activePoints) {
    ctx.strokeStyle = pt.color;
    if (style === 'soft') ctx.shadowColor = pt.color;
    
    ctx.beginPath();
    for (let r = startR; r < maxR; r += density) {
        ctx.moveTo(pt.x + r, pt.y);
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    }
    ctx.stroke();
}

ctx.globalCompositeOperation = 'source-over';
const edge = 0.8 + audio.bass * 0.2;
const grad = ctx.createRadialGradient(cx, cy, Math.min(cx, cy) * 0.5, cx, cy, maxR * 0.8);
grad.addColorStop(0, 'rgba(1, 3, 8, 0)');
grad.addColorStop(1, `rgba(1, 3, 8, ${edge})`);
ctx.fillStyle = grad;
ctx.fillRect(0, 0, frame.width, frame.height);

ctx.restore();