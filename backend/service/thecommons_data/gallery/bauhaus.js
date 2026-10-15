const count = getVar('shape_count') ?? 20;
const layout = getVar('layout') ?? 'strict grid';
const slideSpeed = getVar('slide_speed') ?? 5;
const beatSens = (getVar('beat_sensitivity') ?? 6) / 10;
const inkBlend = getVar('ink_blend') ?? 'solid';
const palChoice = getVar('palette') ?? 'classic';

const palettes = {
    'classic': { bg: '#f4f0e6', border: '#e6e0d4', colors: ['#d93c2b', '#1c5298', '#f2c73a', '#1a1a1a'] },
    'cmyk': { bg: '#f9f9f9', border: '#ececec', colors: ['#00a8e8', '#e4004f', '#ffcc00', '#222222'] },
    'muted': { bg: '#eaddcf', border: '#d4c5b3', colors: ['#a63a29', '#1b3b5c', '#d9aa38', '#333333'] },
    'monochrome': { bg: '#f0f0f0', border: '#d0d0d0', colors: ['#111111', '#555555', '#888888', '#cccccc'] }
};
const theme = palettes[palChoice] || palettes.classic;

function getNewTarget(w, h, layout, type) {
    let tx, ty, trot, tw, th;
    const gridX = w / 6, gridY = h / 8;
    if (layout === 'strict grid') {
        tx = (Math.floor(Math.random() * 6) + 0.5) * gridX;
        ty = (Math.floor(Math.random() * 8) + 0.5) * gridY;
        trot = Math.floor(Math.random() * 4) * Math.PI / 2;
        tw = (Math.floor(Math.random() * 3) + 1) * gridX * 0.95;
        th = (Math.floor(Math.random() * 4) + 1) * gridY * 0.95;
    } else if (layout === 'diagonal') {
        const step = Math.min(w, h) / 8;
        tx = (Math.floor(Math.random() * 10) - 1) * step + w/2 - step*4;
        ty = (Math.floor(Math.random() * 10) - 1) * step + h/2 - step*4;
        trot = Math.floor(Math.random() * 4) * (Math.PI / 4);
        tw = (Math.floor(Math.random() * 4) + 1) * step;
        th = (Math.floor(Math.random() * 4) + 1) * step;
    } else {
        tx = w * (0.1 + 0.8 * Math.random());
        ty = h * (0.1 + 0.8 * Math.random());
        trot = Math.floor(Math.random() * 8) * (Math.PI / 4);
        tw = w * (0.05 + 0.25 * Math.random());
        th = h * (0.05 + 0.25 * Math.random());
    }

    if (type === 0) tw = th = Math.min(tw, th);
    else if (type === 1 && Math.random() > 0.5) tw *= 2;
    else if (type === 4) { th = 3 + Math.random() * 5; tw = w * (0.3 + Math.random() * 0.5); }
    return { tx, ty, trot, tw, th };
}

room.state.shapes ??= [];
if (room.state.shapes.length > count) room.state.shapes.length = count;
while (room.state.shapes.length < count) {
    const type = Math.floor(Math.random() * 5);
    const t = getNewTarget(frame.width, frame.height, layout, type);
    room.state.shapes.push({
        type, colorIdx: Math.floor(Math.random() * 4),
        x: t.tx, y: t.ty, rot: t.trot, w: 0, h: 0,
        tx: t.tx, ty: t.ty, trot: t.trot, tw: t.tw, th: t.th
    });
}

if (audio.beat || (audio.bass > 0.85 && Math.random() < 0.1)) {
    room.state.shapes.forEach(s => {
        if (Math.random() < beatSens) {
            const t = getNewTarget(frame.width, frame.height, layout, s.type);
            s.tx = t.tx; s.ty = t.ty; s.trot = t.trot; s.tw = t.tw; s.th = t.th;
            if (Math.random() < 0.3) s.colorIdx = Math.floor(Math.random() * 4);
        }
    });
}

const dt = Math.min(frame.dt, 0.05);
const ease = 1 - Math.exp(-slideSpeed * dt * 2);
room.state.shapes.forEach(s => {
    s.x += (s.tx - s.x) * ease;
    s.y += (s.ty - s.y) * ease;
    s.w += (s.tw - s.w) * ease;
    s.h += (s.th - s.h) * ease;
    let rDiff = (s.trot - s.rot) % (Math.PI * 2);
    if (rDiff > Math.PI) rDiff -= Math.PI * 2;
    if (rDiff < -Math.PI) rDiff += Math.PI * 2;
    s.rot += rDiff * ease;
});

ctx.save();
ctx.fillStyle = theme.border;
ctx.fillRect(0, 0, frame.width, frame.height);

const margin = Math.min(frame.width, frame.height) * 0.035;
const bassPulse = 1 + audio.bass * 0.02;
ctx.translate(frame.width/2, frame.height/2);
ctx.scale(bassPulse, bassPulse);
ctx.translate(-frame.width/2, -frame.height/2);

ctx.fillStyle = theme.bg;
ctx.fillRect(margin, margin, frame.width - margin*2, frame.height - margin*2);

ctx.beginPath();
ctx.rect(margin, margin, frame.width - margin*2, frame.height - margin*2);
ctx.clip();

if (inkBlend === 'multiply') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.85;
} else if (inkBlend === 'screen') {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.9;
} else if (inkBlend === 'overlay') {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.9;
}

room.state.shapes.forEach(s => {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.fillStyle = theme.colors[s.colorIdx];
    ctx.beginPath();
    if (s.type === 0) {
        ctx.arc(0, 0, s.w/2, 0, Math.PI * 2);
    } else if (s.type === 1 || s.type === 4) {
        ctx.fillRect(-s.w/2, -s.h/2, s.w, s.h);
    } else if (s.type === 2) {
        ctx.moveTo(-s.w/2, s.h/2);
        ctx.lineTo(s.w/2, s.h/2);
        ctx.lineTo(-s.w/2, -s.h/2);
    } else if (s.type === 3) {
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, s.w/2, 0, Math.PI/2);
    }
    ctx.fill();
    ctx.restore();
});

if (room.people && room.people.length > 0) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;
    room.people.forEach((p, i) => {
        const px = frame.width/2 + Math.cos(frame.t * 0.5 + i) * (frame.width * 0.35);
        const py = frame.height/2 + Math.sin(frame.t * 0.4 + i*2) * (frame.height * 0.35);
        ctx.fillStyle = `hsl(${p.hue}, 80%, 55%)`;
        ctx.beginPath();
        ctx.arc(px, py, 6 + audio.mid * 5, 0, Math.PI*2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = theme.border;
        ctx.stroke();
    });
}

ctx.restore();