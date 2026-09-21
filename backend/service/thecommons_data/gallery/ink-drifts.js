const paper = getVar('paper') || 'washi (white)';
const palette = getVar('palette') || 'sumi-e';
const rate = getVar('drop_rate') ?? 2.0;
const maxSize = getVar('spread_size') ?? 150;
const drift = getVar('drift_style') || 'swirl';
const driftSpeed = getVar('drift_speed') ?? 15;

const papers = {
    'washi (white)': { bg: '#fbf9f6', mode: 'multiply' },
    'parchment': { bg: '#e4dcc5', mode: 'multiply' },
    'slate (dark)': { bg: '#1c1e24', mode: 'screen' }
};
const pInfo = papers[paper] || papers['washi (white)'];

ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = pInfo.bg;
ctx.fillRect(0, 0, frame.width, frame.height);
ctx.globalCompositeOperation = pInfo.mode;

room.state.drops ??= [];
room.state.lastT ??= frame.t;

const isDark = paper === 'slate (dark)';
const getDropColor = () => {
    if (palette === 'people hues' && room.people && room.people.length > 0) {
        const p = room.people[Math.floor(Math.random() * room.people.length)];
        return { h: p.hue, s: 60, l: isDark ? 70 : 25 };
    }
    const pInfoColors = {
        'sumi-e': { h: 240, s: 10, l: isDark ? 80 : 15 },
        'indigo': { h: 220, s: 70, l: isDark ? 70 : 25 },
        'crimson': { h: 350, s: 80, l: isDark ? 70 : 30 }
    };
    let choice = palette;
    if (choice === 'mixed' || !pInfoColors[choice]) {
        const keys = ['sumi-e', 'indigo', 'crimson'];
        choice = keys[Math.floor(Math.random() * keys.length)];
    }
    return pInfoColors[choice];
};

const spawnDrop = (x, y, scale = 1.0) => {
    room.state.drops.push({
        x, y,
        r: 1,
        targetR: maxSize * scale * (0.6 + Math.random() * 0.4),
        c: getDropColor(),
        seed: Math.random() * 1000
    });
};

if (room.state.drops.length === 0) {
    for (let i = 0; i < 6; i++) {
        spawnDrop(frame.width * (0.2 + 0.6 * Math.random()), frame.height * (0.2 + 0.6 * Math.random()));
    }
}

if (frame.t - room.state.lastT >= rate) {
    room.state.lastT = frame.t;
    spawnDrop(Math.random() * frame.width, Math.random() * frame.height);
}

if (audio.beat && room.state.drops.length > 0 && Math.random() > 0.4) {
    const base = room.state.drops[room.state.drops.length - 1];
    spawnDrop(
        base.x + (Math.random() - 0.5) * base.r * 1.5,
        base.y + (Math.random() - 0.5) * base.r * 1.5,
        0.15
    );
}

while (room.state.drops.length > 200) {
    room.state.drops.shift();
}

const dt = Math.min(frame.dt, 0.1);

room.state.drops.forEach((drop, i) => {
    const gSpeed = 0.5 + audio.bass * 2.0;
    drop.r += (drop.targetR - drop.r) * gSpeed * dt;

    let vx = 0, vy = 0;
    if (drift === 'sink') vy = driftSpeed;
    else if (drift === 'float') vy = -driftSpeed;
    else if (drift === 'swirl') {
        vx = Math.sin(drop.y * 0.003 + frame.t * 0.2 + drop.seed) * driftSpeed;
        vy = Math.cos(drop.x * 0.003 + frame.t * 0.2 + drop.seed) * driftSpeed;
    }

    drop.x += vx * dt;
    drop.y += vy * dt;

    const fade = Math.min(1, i / 15);
    const expansionAlpha = Math.max(0.1, 1 - (drop.r / (drop.targetR * 1.2)));
    const baseAlpha = 0.8 * fade * expansionAlpha;
    const { h, s, l } = drop.c;

    ctx.beginPath();
    ctx.arc(drop.x, drop.y, drop.r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(drop.x, drop.y, 0, drop.x, drop.y, drop.r);
    grad.addColorStop(0, `hsla(${h}, ${s}%, ${l}%, ${baseAlpha})`);
    grad.addColorStop(0.4, `hsla(${h}, ${s}%, ${l}%, ${baseAlpha * 0.5})`);
    grad.addColorStop(1, `hsla(${h}, ${s}%, ${l}%, 0)`);
    ctx.fillStyle = grad;
    ctx.fill();

    if (drop.r > 5) {
        ctx.beginPath();
        const coreR = drop.r * 0.4;
        const amp = coreR * (0.15 + audio.treble * 0.3);
        for (let a = 0; a <= Math.PI * 2.1; a += 0.2) {
            const rOffset = Math.sin(a * 4 + drop.seed) * Math.cos(a * 3 - frame.t * 1.5) * amp;
            const r = coreR + rOffset;
            const px = drop.x + Math.cos(a) * r;
            const py = drop.y + Math.sin(a) * r;
            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.fillStyle = `hsla(${h}, ${s}%, ${l}%, ${baseAlpha * 0.7})`;
        ctx.fill();
    }
});

ctx.globalCompositeOperation = 'source-over';
