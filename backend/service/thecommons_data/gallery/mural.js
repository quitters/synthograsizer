const ROUND_TIME = 20;
const SHRINK_START = 17;
const MAX_MARKS = 300;
const MAX_GAL = 5;
const H_MAIN = frame.height * 0.8;

room.state.roundStart ??= frame.t;
room.state.marks ??= [];
room.state.gallery ??= [];
room.state.cursors ??= {};

let tRound = frame.t - room.state.roundStart;
let transition = 0;

if (tRound > ROUND_TIME) {
    room.state.gallery.push({ marks: [...room.state.marks] });
    if (room.state.gallery.length > MAX_GAL) {
        room.state.gallery.shift();
    }
    room.state.marks = [];
    room.state.roundStart = frame.t;
    tRound = 0;
}

if (tRound > SHRINK_START) {
    let pt = (tRound - SHRINK_START) / (ROUND_TIME - SHRINK_START);
    pt = Math.max(0, Math.min(1, pt));
    transition = pt * pt * (3 - 2 * pt); // smoothstep
}

const shape = getVar('stamp_shape') || 'circle';
const paletteName = getVar('color_theme') || 'neon';
const palettes = {
    neon: ['#ff0055', '#00ffcc', '#ffff00', '#aa00ff', '#ff5500'],
    pastel: ['#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff'],
    monochrome: ['#ffffff', '#aaaaaa', '#555555', '#cccccc', '#888888'],
    fiery: ['#ff4500', '#ff8c00', '#ffd700', '#ff0000', '#8b0000'],
    oceanic: ['#000080', '#008080', '#20b2aa', '#00ffff', '#4682b4']
};
const colors = palettes[paletteName] ?? palettes.neon;
const sizeBase = getVar('stamp_size') ?? 40;
const chaos = getVar('chaos_amount') ?? 0;
const activePeople = room.people || [];

activePeople.forEach((p) => {
    if (!room.state.cursors[p.id]) {
        room.state.cursors[p.id] = {
            x: Math.random() * frame.width,
            y: Math.random() * H_MAIN,
            tx: Math.random() * frame.width,
            ty: Math.random() * H_MAIN
        };
    }
    let c = room.state.cursors[p.id];
    c.x += (c.tx - c.x) * 0.05;
    c.y += (c.ty - c.y) * 0.05;
    if (Math.random() < 0.03) {
        c.tx = Math.random() * frame.width;
        c.ty = Math.random() * H_MAIN;
    }
});

// Curation fix: cursors were never removed, so this grew with everyone who had
// ever joined over the course of an event. Keep only the people still here.
const present = new Set(activePeople.map((p) => String(p.id)));
for (const id of Object.keys(room.state.cursors)) {
    if (!present.has(id)) delete room.state.cursors[id];
}

for (const e of room.events) {
    if (e.name === 'action_stamp' && tRound < SHRINK_START) {
        const p = activePeople.find(px => px.id === e.participantId);
        let x, y, colIdx;
        if (p && room.state.cursors[p.id]) {
            x = room.state.cursors[p.id].x;
            y = room.state.cursors[p.id].y;
            colIdx = Math.floor(p.hue) % 5;
        } else {
            x = Math.random() * frame.width;
            y = Math.random() * H_MAIN;
            colIdx = Math.floor(Math.random() * 5);
        }
        room.state.marks.push({
            x, y, color: colors[colIdx], shape,
            size: sizeBase * (1 + audio.bass),
            t: frame.t
        });
        if (room.state.marks.length > MAX_MARKS) room.state.marks.shift();
    }
}

if (audio.beat && Math.random() < 0.4 && tRound < SHRINK_START) {
    room.state.marks.push({
        x: Math.random() * frame.width,
        y: Math.random() * H_MAIN,
        color: colors[Math.floor(Math.random() * 5)],
        shape,
        size: sizeBase * (1 + audio.bass),
        t: frame.t
    });
    if (room.state.marks.length > MAX_MARKS) room.state.marks.shift();
}

const drawMural = (mList, cLevel) => {
    ctx.lineCap = 'round';
    mList.forEach((m) => {
        const dx = cLevel > 0 ? Math.sin(frame.t * 2 + m.t * 10) * cLevel : 0;
        const dy = cLevel > 0 ? Math.cos(frame.t * 2 + m.t * 12) * cLevel : 0;
        const mx = m.x + dx;
        const my = m.y + dy;

        ctx.fillStyle = m.color;
        ctx.strokeStyle = m.color;
        ctx.beginPath();

        if (m.shape === 'circle') {
            ctx.arc(mx, my, m.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (m.shape === 'square') {
            ctx.fillRect(mx - m.size, my - m.size, m.size * 2, m.size * 2);
        } else if (m.shape === 'triangle') {
            ctx.moveTo(mx, my - m.size);
            ctx.lineTo(mx + m.size, my + m.size);
            ctx.lineTo(mx - m.size, my + m.size);
            ctx.fill();
        } else if (m.shape === 'star') {
            for (let j = 0; j < 5; j++) {
                const ang = j * Math.PI * 2 / 5 - Math.PI / 2;
                ctx[j === 0 ? 'moveTo' : 'lineTo'](mx + Math.cos(ang) * m.size, my + Math.sin(ang) * m.size);
                const inAng = ang + Math.PI / 5;
                ctx.lineTo(mx + Math.cos(inAng) * m.size * 0.4, my + Math.sin(inAng) * m.size * 0.4);
            }
            ctx.fill();
        } else if (m.shape === 'splatter') {
            for (let j = 0; j < 5; j++) {
                const ang = (j * Math.PI * 2 / 5) + (m.t * 10);
                ctx.moveTo(mx, my);
                ctx.lineTo(mx + Math.cos(ang) * m.size, my + Math.sin(ang) * m.size);
            }
            ctx.lineWidth = m.size * 0.2;
            ctx.stroke();
        }
    });
};

ctx.fillStyle = '#050505';
ctx.fillRect(0, 0, frame.width, frame.height);

const slideOffset = (room.state.gallery.length >= MAX_GAL) ? transition * (frame.width * 0.2) : 0;

room.state.gallery.forEach((g, i) => {
    ctx.save();
    const gw = frame.width * 0.2;
    const gh = H_MAIN * 0.2;
    const x = i * gw - slideOffset;
    const y = frame.height - gh;
    ctx.translate(x, y);
    ctx.scale(0.2, 0.2);

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, frame.width, H_MAIN);
    ctx.beginPath();
    ctx.rect(0, 0, frame.width, H_MAIN);
    ctx.clip();

    drawMural(g.marks, 0);

    ctx.strokeStyle = '#222';
    ctx.lineWidth = 15;
    ctx.strokeRect(0, 0, frame.width, H_MAIN);
    ctx.restore();
});

ctx.save();
const currentScale = 1 - (0.8 * transition);
let targetIndex = room.state.gallery.length;
if (targetIndex >= MAX_GAL) targetIndex = MAX_GAL;
const targetX = (targetIndex * (frame.width * 0.2)) - slideOffset;
const targetY = frame.height - (H_MAIN * 0.2);

const curX = targetX * transition;
const curY = targetY * transition;

ctx.translate(curX, curY);
ctx.scale(currentScale, currentScale);

ctx.fillStyle = '#151515';
ctx.fillRect(0, 0, frame.width, H_MAIN);
ctx.beginPath();
ctx.rect(0, 0, frame.width, H_MAIN);
ctx.clip();

if (transition === 0 && audio.level > 0.05) {
    ctx.fillStyle = `rgba(255,255,255,${audio.level * 0.03})`;
    ctx.fillRect(0, 0, frame.width, H_MAIN);
}

drawMural(room.state.marks, chaos);

if (transition === 0) {
    activePeople.forEach((p) => {
        const c = room.state.cursors[p.id];
        if (c) {
            ctx.strokeStyle = `hsl(${p.hue}, 100%, 70%)`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(c.x, c.y, 10 + audio.bass * 15, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(c.x - 5, c.y); ctx.lineTo(c.x + 5, c.y);
            ctx.moveTo(c.x, c.y - 5); ctx.lineTo(c.x, c.y + 5);
            ctx.stroke();
        }
    });
}

ctx.strokeStyle = `rgba(255,255,255,${0.2 + audio.bass * 0.4})`;
ctx.lineWidth = 6;
ctx.strokeRect(0, 0, frame.width, H_MAIN);
ctx.restore();

if (transition === 0) {
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, frame.width, 4);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, frame.width * (1 - tRound / SHRINK_START), 4);
}
