const cw = frame.width;
const ch = frame.height;
const dt = Math.min(frame.dt, 0.1);

if (!room.state.init) {
    room.state.init = true;
    room.state.invaders = [];
    room.state.shots = [];
    room.state.particles = [];
    room.state.shipX = 0.5;
    room.state.swarmX = 0;
    room.state.swarmY = 0.1;
    room.state.swarmDir = 1;

    room.state.resetSwarm = () => {
        room.state.invaders = [];
        for(let r = 0; r < 5; r++) {
            for(let c = 0; c < 9; c++) {
                let mask = [];
                for(let i = 0; i < 15; i++) mask.push(Math.random() > 0.5);
                room.state.invaders.push({ r, c, alive: true, mask, offset: Math.random() });
            }
        }
        room.state.swarmX = 0;
        room.state.swarmY = 0.1;
    };
    room.state.resetSwarm();
}

for (const e of room.events) {
    if (e.name === 'fire') {
        const p = room.people?.find(x => x.id === e.participantId);
        const hue = p ? p.hue : Math.floor(Math.random() * 360);
        room.state.shots.push({ x: room.state.shipX, y: 0.9, hue });
        if (room.state.shots.length > 60) room.state.shots.shift();
    }
}

const targetShipX = getVar('ship_position') ?? 0.5;
const speed = getVar('game_speed') ?? 1;
const style = getVar('invader_style') ?? '8-bit';
const palette = getVar('color_palette') ?? 'neon';

const palettes = {
    'neon': (r, c) => `hsl(${ (r * 40 + c * 20 + frame.t * 30) % 360 }, 100%, 60%)`,
    'phosphor': (r, c) => `hsl(120, 100%, ${ 40 + r * 10 + audio.bass * 20 }%)`,
    'cyberpunk': (r, c) => `hsl(${ r % 2 === 0 ? 300 : 180 }, 100%, ${ 50 + audio.treble * 20 }%)`
};
const getColor = palettes[palette] || palettes['neon'];

room.state.shipX += (targetShipX - room.state.shipX) * 10 * dt;

const swarmSpeedX = 0.15 * speed * (1 + audio.bass * 1.5);
room.state.swarmX += room.state.swarmDir * swarmSpeedX * dt;

let hitEdge = false;
if (room.state.swarmX > 0.25) { room.state.swarmX = 0.25; hitEdge = true; }
if (room.state.swarmX < -0.25) { room.state.swarmX = -0.25; hitEdge = true; }

if (hitEdge) {
    room.state.swarmDir *= -1;
    room.state.swarmY += 0.05;
}

const beatPump = audio.beat ? 0.3 : 0;

ctx.fillStyle = `rgba(0, 5, 15, ${ 0.3 + audio.bass * 0.2 })`;
ctx.fillRect(0, 0, cw, ch);

const swarmBaseX = cw * (0.5 + room.state.swarmX);
const swarmBaseY = ch * room.state.swarmY;
const spacingX = cw * 0.06;
const spacingY = ch * 0.06;

let aliveCount = 0;
ctx.save();
for (let inv of room.state.invaders) {
    if (!inv.alive) continue;
    aliveCount++;
    
    const invPulse = Math.sin(frame.t * 5 + inv.offset * Math.PI * 2) * audio.mid * 10;
    const ix = swarmBaseX + (inv.c - 4) * spacingX;
    const iy = swarmBaseY + inv.r * spacingY + invPulse;

    let hit = false;
    for (let i = room.state.shots.length - 1; i >= 0; i--) {
        const s = room.state.shots[i];
        const sx = s.x * cw;
        const sy = s.y * ch;
        const dx = sx - ix;
        const dy = sy - iy;
        if (dx * dx + dy * dy < (cw * 0.025) * (cw * 0.025)) {
            hit = true;
            inv.alive = false;
            room.state.shots.splice(i, 1);
            for (let p = 0; p < 12; p++) {
                room.state.particles.push({
                    x: ix, y: iy,
                    vx: (Math.random() - 0.5) * cw * 0.6,
                    vy: (Math.random() - 0.5) * ch * 0.6,
                    life: 1 + Math.random(),
                    hue: s.hue
                });
            }
            break;
        }
    }
    if (hit) continue;

    const color = getColor(inv.r, inv.c);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = cw * 0.002;

    const scale = 1 + beatPump + audio.bass * 0.3;
    ctx.save();
    ctx.translate(ix, iy);
    ctx.scale(scale, scale);

    if (style === '8-bit') {
        const s = cw * 0.004;
        ctx.beginPath();
        for(let i = 0; i < 15; i++) {
            if (inv.mask[i]) {
                const cx = i % 3;
                const cy = Math.floor(i / 3);
                ctx.rect((cx - 2.5) * s, (cy - 2.5) * s, s, s);
                if (cx !== 0) ctx.rect((-cx - 2.5) * s, (cy - 2.5) * s, s, s);
            }
        }
        ctx.fill();
    } else if (style === 'vector') {
        const s = cw * 0.015;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s, 0);
        ctx.closePath();
        ctx.stroke();
        if (audio.mid > 0.4) ctx.fill();
    } else {
        ctx.beginPath();
        ctx.arc(0, 0, cw * 0.012 + audio.treble * cw * 0.01, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(Math.cos(frame.t * 4 + inv.c) * cw * 0.008, Math.sin(frame.t * 4 + inv.r) * cw * 0.008, cw * 0.004, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
ctx.restore();

if (aliveCount === 0 || room.state.swarmY > 0.8) {
    room.state.resetSwarm();
}

ctx.lineWidth = cw * 0.004;
ctx.lineCap = 'round';
for (let i = room.state.shots.length - 1; i >= 0; i--) {
    const s = room.state.shots[i];
    s.y -= 1.2 * speed * dt;
    if (s.y < 0) {
        room.state.shots.splice(i, 1);
        continue;
    }
    ctx.strokeStyle = `hsl(${s.hue}, 100%, 70%)`;
    ctx.beginPath();
    ctx.moveTo(s.x * cw, s.y * ch);
    ctx.lineTo(s.x * cw, (s.y + 0.04) * ch);
    ctx.stroke();
}

if (room.state.particles.length > 250) {
    room.state.particles.splice(0, room.state.particles.length - 250);
}
for (let i = room.state.particles.length - 1; i >= 0; i--) {
    const p = room.state.particles[i];
    p.life -= dt * 2;
    if (p.life <= 0) {
        room.state.particles.splice(i, 1);
        continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.95;
    p.vy *= 0.95;
    ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${p.life})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, cw * 0.003 * p.life, 0, Math.PI * 2);
    ctx.fill();
}

const sx = room.state.shipX * cw;
const sy = ch * 0.92;
ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.moveTo(sx, sy - ch * 0.03);
ctx.lineTo(sx + cw * 0.02, sy + ch * 0.02);
ctx.lineTo(sx - cw * 0.02, sy + ch * 0.02);
ctx.fill();

ctx.fillStyle = `rgba(0, 255, 255, ${0.5 + audio.bass * 0.5})`;
ctx.beginPath();
ctx.arc(sx, sy + ch * 0.025, cw * 0.01 + audio.bass * cw * 0.015, 0, Math.PI * 2);
ctx.fill();
