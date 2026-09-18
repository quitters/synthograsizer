ctx.save();

const w = frame.width;
const h = frame.height;
room.state.marbles ??= [];

const layout = getVar('peg_layout') ?? 'pachinko';
if (!room.state.pegs || room.state.w !== w || room.state.h !== h || room.state.layout !== layout) {
    room.state.w = w;
    room.state.h = h;
    room.state.layout = layout;
    room.state.pegs = [];
    
    let spacing = Math.min(w, h) / (layout === 'sparse' ? 6 : 12);
    
    for (let y = spacing * 1.5; y < h - spacing * 2; y += spacing * (layout === 'grid' ? 1 : 0.866)) {
        let row = Math.round(y / (spacing * 0.866));
        let offset = (layout === 'grid' || layout === 'funnel') ? 0 : ((row % 2 === 0) ? spacing / 2 : 0);
        
        for (let x = spacing; x < w - spacing; x += spacing) {
            let px = x + offset;
            if (px > w - spacing) continue;
            
            if (layout === 'funnel') {
                let cx = w / 2;
                let gap = w * 0.45 * (1.1 - y / h);
                if (Math.abs(px - cx) < gap) continue;
            }
            
            room.state.pegs.push({ x: px, y: y });
        }
    }
}

for (const e of room.events) {
    if (e.name === 'drop_marble') {
        const person = room.people?.find(p => p.id === e.participantId);
        const hue = person ? person.hue : Math.floor(Math.random() * 360);
        room.state.marbles.push({
            x: w / 2 + (Math.random() - 0.5) * w * 0.5,
            y: 20,
            vx: (Math.random() - 0.5) * 100,
            vy: 0,
            hue: hue
        });
    } else if (e.name === 'clear_board') {
        room.state.marbles = [];
    }
}

if (audio.beat && audio.level > 0.6 && room.state.marbles.length < 15 && Math.random() < 0.4) {
    room.state.marbles.push({
        x: w / 2 + (Math.random() - 0.5) * w * 0.5,
        y: 20,
        vx: (Math.random() - 0.5) * 50,
        vy: 0,
        hue: Math.floor(Math.random() * 360)
    });
}

while (room.state.marbles.length > 150) {
    room.state.marbles.shift();
}

const gravity = getVar('gravity_strength') ?? 1500;
const tilt = getVar('board_tilt') ?? 0;
const bounciness = getVar('bounciness') ?? 0.6;
const marbleRadius = getVar('marble_size') ?? 16;
const pegRadius = (getVar('peg_size') ?? 12) + audio.treble * 5;

const gx = tilt * gravity;
const gy = gravity;
const steps = 4;
const sdt = Math.min(frame.dt, 0.1) / steps;

if (audio.beat && audio.bass > 0.8) {
    for (let m of room.state.marbles) m.vy -= audio.bass * 200;
}

for (let s = 0; s < steps; s++) {
    for (let m of room.state.marbles) {
        m.vx += gx * sdt;
        m.vy += gy * sdt;
        m.x += m.vx * sdt;
        m.y += m.vy * sdt;
        
        if (m.y > h - marbleRadius) {
            m.y = h - marbleRadius;
            if (Math.abs(m.vy) < 30) m.vy = 0;
            else m.vy *= -bounciness;
            m.vx *= 0.85;
        }
        if (m.x < marbleRadius) { m.x = marbleRadius; m.vx *= -bounciness; }
        if (m.x > w - marbleRadius) { m.x = w - marbleRadius; m.vx *= -bounciness; }
    }

    for (let m of room.state.marbles) {
        for (let p of room.state.pegs) {
            let dx = m.x - p.x;
            let dy = m.y - p.y;
            let distSq = dx * dx + dy * dy;
            let minDist = marbleRadius + pegRadius;
            if (distSq < minDist * minDist && distSq > 0.0001) {
                let dist = Math.sqrt(distSq);
                let nx = dx / dist, ny = dy / dist;
                let pen = minDist - dist;
                m.x += nx * pen;
                m.y += ny * pen;
                let dot = m.vx * nx + m.vy * ny;
                if (dot < 0) {
                    m.vx -= (1 + bounciness) * dot * nx;
                    m.vy -= (1 + bounciness) * dot * ny;
                }
            }
        }
    }

    for (let i = 0; i < room.state.marbles.length; i++) {
        for (let j = i + 1; j < room.state.marbles.length; j++) {
            let m1 = room.state.marbles[i];
            let m2 = room.state.marbles[j];
            let dx = m1.x - m2.x, dy = m1.y - m2.y;
            let distSq = dx * dx + dy * dy;
            let minDist = marbleRadius * 2;
            if (distSq < minDist * minDist && distSq > 0.0001) {
                let dist = Math.sqrt(distSq);
                let nx = dx / dist, ny = dy / dist;
                let pen = minDist - dist;
                
                m1.x += nx * (pen * 0.5);
                m1.y += ny * (pen * 0.5);
                m2.x -= nx * (pen * 0.5);
                m2.y -= ny * (pen * 0.5);
                
                let rvx = m1.vx - m2.vx, rvy = m1.vy - m2.vy;
                let velAlong = rvx * nx + rvy * ny;
                if (velAlong < 0) {
                    let e = Math.abs(velAlong) < 40 ? 0.1 : bounciness;
                    let j_impulse = -(1 + e) * velAlong * 0.5;
                    m1.vx += j_impulse * nx; m1.vy += j_impulse * ny;
                    m2.vx -= j_impulse * nx; m2.vy -= j_impulse * ny;
                    
                    let tx = -ny, ty = nx;
                    let velTan = rvx * tx + rvy * ty;
                    let jt = -velTan * 0.1 * 0.5;
                    m1.vx += jt * tx; m1.vy += jt * ty;
                    m2.vx -= jt * tx; m2.vy -= jt * ty;
                }
            }
        }
    }
}

let bgGrad = ctx.createLinearGradient(0, 0, 0, h);
bgGrad.addColorStop(0, '#161622');
bgGrad.addColorStop(1, '#09090e');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, w, h);

ctx.fillStyle = '#445';
ctx.strokeStyle = '#778';
ctx.lineWidth = 2;
ctx.beginPath();
for (let p of room.state.pegs) {
    ctx.moveTo(p.x + pegRadius, p.y);
    ctx.arc(p.x, p.y, pegRadius, 0, Math.PI * 2);
}
ctx.fill();
ctx.stroke();

for (let m of room.state.marbles) {
    ctx.beginPath();
    ctx.arc(m.x, m.y, marbleRadius, 0, Math.PI * 2);
    let r = marbleRadius;
    let grad = ctx.createRadialGradient(m.x - r * 0.3, m.y - r * 0.3, r * 0.1, m.x, m.y, r);
    grad.addColorStop(0, `hsl(${m.hue}, 90%, 85%)`);
    grad.addColorStop(0.3, `hsl(${m.hue}, 80%, 55%)`);
    grad.addColorStop(1, `hsl(${m.hue}, 90%, 20%)`);
    ctx.fillStyle = grad;
    ctx.fill();
}

ctx.restore();
