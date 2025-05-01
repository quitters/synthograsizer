new p5(p => {
  // --- Instance Variables (Scope) ---
  let ww, wh, wr; // Canvas dimensions
  let dw, dh, LX, RX, TY, BY, spc, sW, sH; // Coordinate system & grid
  let needsRegeneration = true;

  // --- RNG Functions (Internal) ---
  const hash32 = (a, b = 0) => {
    const c = 16
      , e = 65535
      , f = 255;
    for (var g, j = 1540483477, m = a.length, n = b ^ m, o = 0; 4 <= m; )
        g = a[o] & f | (a[++o] & f) << 8 | (a[++o] & f) << 16 | (a[++o] & f) << 24,
        g = (g & e) * j + (((g >>> c) * j & e) << c),
        g ^= g >>> 24,
        g = (g & e) * j + (((g >>> c) * j & e) << c),
        n = (n & e) * j + (((n >>> c) * j & e) << c) ^ g,
        m -= 4,
        ++o;
    switch (m) {
    case 3:
        n ^= (a[o + 2] & f) << c;
    case 2:
        n ^= (a[o + 1] & f) << 8;
    case 1:
        n ^= a[o] & f,
        n = (n & e) * j + (((n >>> c) * j & e) << c);
    }
    return n ^= n >>> 13,
    n = (n & e) * j + (((n >>> 16) * j & e) << 16),
    n ^= n >>> 15,
    n >>> 0
  };

  const pm1 = () => p.gssn(p.w(.025), p.w(.005));

  const pm2 = () => {
    const a = p.w(.018);
    return p.rng(a, 1.2 * a)
  };

  const pm3 = () => {
    const a = p.w(.015);
    return p.rng(a, 1.2 * a)
  };

  const pm4 = () => {
    const a = p.w(.01);
    return p.rng(a, 1.2 * a)
  };

  const pm5 = () => {
    const a = p.w(.008);
    return p.rng(a, 1.2 * a)
  };

  const pm6 = () => {
    const a = p.w(.006);
    return p.rng(a, 1.2 * a)
  };

  const pm7 = () => p.w(.004);

  const k = (a) => {
    return "pm1" === a ? pm1 : "pm2" === a ? pm2 : "pm3" === a ? pm3 : "pm4" === a ? pm4 : "pm5" === a ? pm5 : "pm6" === a ? pm6 : pm7
  };

  const d = (a) => {
    let b = pcRad;
    return "rad" === a ? b = pcRad : "blk" === a ? b = pcBlk : "wht" === a ? b = pcWht : "gry" === a ? b = pcDrkGry : "ltGry" === a ? b = pcLghtGry : "nice" === a && (b = () => {
      const a = p.rnd() < .5 ? pcRad(p.floor(p.rng(2, 5)), 10, 40, 70, 100, 70, 100) : pcRad(p.floor(p.rng(2, 5)), 60, 90, 70, 100, 70, 100);
      return a.concat(pcLx("#000", p.floor(p.rng(1, 3))))
    }
    ),
    b
  };

  // --- Utility/Geometric Helpers (Internal) ---
  const w = (a) => {
    return void 0 === a ? dw : dw * a
  };

  const h = (a) => {
    return void 0 === a ? dh : dh * a
  };

  const vrtx = (a, b) => {
    p.vertex(a * wr, b * wr)
  };

  const swght = (a) => {
    p.strokeWeight(a * wr)
  };

  const pi = (a) => {
    return Math.PI * a
  };

  const od = (a) => {
    return p.rnd() <= a
  };

  const rscl = (a, b, c, e, f) => {
    return e + (a - b) * ((f - e) / (c - b))
  };

  const snp = (a, b) => {
    let c = a % b;
    return c > .5 * b ? a + b - c : a - c
  };

  const offset = (a, b, c, e) => {
    return [a + e * p.cos(c), b + e * p.sin(c)]
  };

  const angle = (b, c, e, f) => {
    const g = p.atan2(f - c, e - b);
    return 0 > g ? g + pi(2) : g
  };

  const pAng = (a, b) => {
    return angle(a[0], a[1], b[0], b[1])
  };

  const lrp = (a, b, c) => {
    return a * (1 - c) + b * c
  };

  const crvL = (a) => {
    if (2 > a.length)
        return 0;
    let b = 0;
    for (let c = 0; c < a.length - 1; c++)
        b += p.dist(a[c][0], a[c][1], a[c + 1][0], a[c + 1][1]);
    return b
  };

  const lerpCrv = (a, b, c) => {
    const e = a[0]
      , f = a[a.length - 1];
    if (0 >= b)
        return e;
    if (b >= c)
        return f;
    let g = 0
      , h = 0;
    for (let e = 0; e < a.length - 1; e++) {
        const f = p.dist(a[e][0], a[e][1], a[e + 1][0], a[e + 1][1]);
        if (g + f >= b) {
            h = (b - g) / f;
            const c = a[e][0]
              , i = a[e][1]
              , j = a[e + 1][0]
              , k = a[e + 1][1];
            return [lrp(c, j, h), lrp(i, k, h)]
        }
        g += f
    }
    return f
  };

  const wc = (a) => {
    const b = p.rnd();
    let c = 0;
    for (let e = 1; e < a.length; e += 2) {
        c += a[e];
        if (b <= c)
            return a[e - 1]
    }
    return a[a.length - 2]
  };

  // --- p5.js Lifecycle Functions ---
  p.setup = function() {
    windowHeight >= 1.2 * windowWidth ? (ww = windowWidth, wh = 1.2 * windowWidth) : (wh = windowHeight, ww = windowHeight / 1.2);
    p.createCanvas(ww, wh).parent('p5-output');
    wr = ww / 2000;

    dw = 2000;
    dh = 2400;
    LX = -500;
    RX = 2500;
    TY = -.25 * dh;
    BY = 1.25 * dh;
    spc = Math.floor(10);
    sW = dw / 10;
    sH = dh / 10;

    console.log("p5 setup complete for fidenza.js");
    p.regenerateArt();
    needsRegeneration = false;
  };

  p.draw = function() {
    if (needsRegeneration) {
      p.regenerateArt();
      needsRegeneration = false;
    } else {
      // Static art, no updates needed in draw loop for now
    }
  };

  p.regenerateArt = function() {
    p.background(0);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noStroke();

    let synth_flow_angle = 0;
    let synth_flow_turb = "med";
    let synth_line_count = 4e3;
    let synth_palette = "rad";
    let synth_line_thick_mode = "pm4";
    let synth_density = "med";
    let synth_seed = p.floor(p.random(1e5));

    p.set_seed(synth_seed);
    console.log("Seed:", synth_seed);

    const a = synth_flow_angle;
    const b = synth_flow_turb;
    const c = synth_line_count;
    const e = p.rnd() < .08;
    const f = k(synth_line_thick_mode);
    const g = p.rnd() < .1;
    const i = synth_density;
    const j = p.rnd() < .1;
    const l = p.rnd() < .5;
    const m = p.rnd() < .5;
    const n = p.rnd() < .08;

    let clrs = d(synth_palette)();
    clrs = p.shffl(clrs);

    const o = flwP(a, b, j);
    const q = cSegs(o, [p.w(.5)], c, a, f, g, i, j, l, m, n);

    let r = p.color(0, 0, 0);
    p.rnd() < .5 && (r = p.color(p.random(360), 10, 90));
    if (p.rnd() < .2) {
        const a = pCl(p.random(), clrs);
        const b = p.color(p.hue(a), p.saturation(a) / 3, p.brightness(a) / 3);
        p.background(b)
    } else
        p.background(r);

    p.random() < .5 && p.scale(1, -1), p.translate(0, -p.height);

    for (let s = 0; s < q.length; s++) {
        const a = q[s]
          , b = a.points
          , c = a.margin
          , e = a.id;
        if (b.length < 2)
            continue;
        let f, g;
        if (j)
            f = pCl(p.dist(b[0][0], b[0][1], p.w(.5), p.h(.4)) / p.w(.6), clrs),
            g = f;
        else {
            const a = p.rnd();
            g = pMnCl(() => mnCl(p.random(), clrs), f, c, p.rnd() < .05),
            f = p.rnd() < .1 ? mxCl(p.random(), clrs) : g
        }
        p.fill(f),
        p.stroke(g),
        p.strokeWeight(p.w(.001));
        const h = fat(b, c);
        p.beginShape();
        for (let i = 0; i < h.length; i++)
            p.vertex(h[i][0], h[i][1]);
        p.endShape(p.CLOSE)
    }
    console.log("Art generation complete.");
  };

  // --- Flow Field & Segment Generation Functions (Internal) ---
  const adjFlw = (a, b, c, e, f) => {
    for (let g = 0; g < a.length; g++) {
        const h = LX + spc * g;
        for (let i = 0; i < a[0].length; i++) {
            const j = TY + spc * i
              , k = p.dist(b, c, h, j);
            if (k < e) {
                const b = rscl(k, 0, e, f, 0);
                a[g][i] += b
            }
        }
    }
  };

  const adjFlw2 = (a, b, c, e, f) => {
    let g = w(1);
    g = "low" === f ? w(.25) : (f = "med") ? w(.18) : w(.12);
    for (let h = 0; h < a.length; h++) {
        const f = LX + spc * h;
        for (let i = 0; i < a[0].length; i++) {
            const j = TY + spc * i
              , k = p.dist(b, c, f, j)
              , l = e ? pi(.025) : pi(-.025)
              , m = l * p.sqrt(k / g);
            a[h][i] += m
        }
    }
  };

  const flwP = (a, b, c) => {
    const e = [];
    for (let f = LX; f < RX; f += spc) {
        const b = [];
        for (let e, g = TY; g < BY; g += spc)
            e = a,
            c && (e = angle(f, g, w(.5), h(.5)) - pi(.5),
            d = p.dist(f, g, w(.5), h(.5)),
            e += rscl(d, 0, w(1.5), 0, pi(1))),
            b.push(e);
        e.push(b)
    }
    let f = 0
      , g = 0;
    "none" === b ? f = 0 : "low" === b ? (f = 15,
    g = pi(.1)) : "med" === b ? (f = 28,
    g = pi(.25)) : (f = 45,
    g = pi(.45)),
    c && (f = 0);
    for (let h = 0; h < f; h++) {
        const a = p.rng(LX, RX)
          , c = p.rng(TY, BY);
        if (od(.7)) {
            const b = p.gssn(0, g)
              , f = Math.max(w(.1), Math.abs(p.gssn(w(.35), w(.15))));
            adjFlw(e, a, c, f, b)
        } else {
            const f = od(.5);
            adjFlw2(e, a, c, f, b)
        }
    }
    return e
  };

  const flwL = (a, b, c, e, f) => {
    const g = a.length
      , h = a[0].length
      , i = w(.007)
      , j = [];
    for (let k = 0; k < b.length; k++) {
        const l = []
          , m = Math.abs(p.gssn(c, .25 * c));
        let n = b[k][0]
          , o = b[k][1];
        for (let b = 0; b < m; b++) {
            l.push([n, o]);
            const b = Math.floor((n - LX) / spc)
              , c = Math.floor((o - TY) / spc);
            let j = e;
            0 <= c && c < h && 0 <= b && b < g && (j = a[b][c]),
            f && (j = snp(j, pi(.2))),
            n += i * p.cos(j),
            o += i * p.sin(j)
        }
        j.push(l)
    }
    return j
  };

  const fatTop = (a, b) => {
    const c = [];
    for (let e = 0; e < a.length - 1; e++) {
        let f = a[e]
          , g = a[e + 1];
        const h = pAng(f, g)
          , i = f[0]
          , j = f[1];
        c.push(offset(i, j, h - pi(.5), b))
    }
    let e = a[a.length - 2]
      , f = a[a.length - 1];
    const g = pAng(e, f)
      , h = f[0]
      , i = f[1];
    return c.push(offset(h, i, g - pi(.5), b)),
    c
  };

  const fatBot = (a, b) => {
    const c = [];
    for (let e = 0; e < a.length - 1; e++) {
        let f = a[e]
          , g = a[e + 1];
        const h = pAng(f, g)
          , i = f[0]
          , j = f[1];
        c.push(offset(i, j, h + pi(.5), b))
    }
    let e = a[a.length - 2]
      , f = a[a.length - 1];
    const g = pAng(e, f)
      , h = f[0]
      , i = f[1];
    return c.push(offset(h, i, g + pi(.5), b)),
    c
  };

  const fat = (a, b) => {
    const c = fatTop(a, b)
      , e = fatBot(a, b);
    return e.reverse(),
    c.concat(e)
  };

  const sctrs = (a, b, c) => {
    const e = Math.max(0, Math.floor((a - c) / sW))
      , f = Math.min(9, Math.floor((a + c) / sW))
      , g = Math.max(0, Math.floor((b - c) / sH))
      , h = Math.min(9, Math.floor((b + c) / sH))
      , i = [];
    for (let j = e; j <= f; j++)
        for (let a = g; a <= h; a++)
            i.push([j, a]);
    return i
  };

  const cllsn = (a, b, c, e, f, g) => {
    if (g && p.dist(a, b, w(.5), h(.4)) <= 1.3 * c)
        return !0;
    const j = sctrs(a, b, c);
    for (let h = 0; h < j.length; h++) {
        let[g,i] = j[h];
        const k = e[g][i];
        for (const g of k) {
            const [e,h,i,j] = g;
            if (p.dist(a, b, e, h) <= c + i && f !== j)
                return !0
        }
    }
    return !1
  };

  const cSegs = (a, b, c, e, f, g, i, j, l, m, n) => {
    const o = []
      , p = [];
    for (let h = 0; h < 10; h++) {
        const a = [];
        for (let b = 0; b < 10; b++)
            a.push([]);
        o.push(a)
    }
    let q = w(.03);
    "low" === i && (q = w(.07));
    let r = w(.01);
    "low" === i ? r = w(.02) : "highAF" == i && (r = w(.007));
    let s = [];
    for (let k = 0; k < b.length; k++) {
        const y = b[k];
        for (let a = w(-.2); a < w(1.2); a += r) {
            const b = p.gssn(a, w(.005))
              , c = p.gssn(y, q);
            (!j || p.dist(b, c, w(.5), h(.4)) > w(.07)) && s.push([b, c])
        }
    }
    s = p.shffl(s);
    const t = flwL(a, s, c, e, n);
    for (let q = 0; q < t.length; q++) {
        const a = t[q];
        let b = f();
        b = m ? .65 * b : b;
        const c = g ? b + w(.03) : w(-.1)
          , e = w() - c
          , i = h() - (c + w(.015))
          , r = q;
        let n = []
          , s = !1
          , u = 0;
        while (u < a.length) {
            const [f,g] = a[u];
            if (f >= c && f < e && g >= c && g < i && (l || !cllsn(f, g, b, o, r, j))) {
                const h = 0 === n.length;
                if (!h) {
                    for (const a of sctrs(f, g, b)) {
                        const [c,e] = a;
                        o[c][e].push([f, g, b, r])
                    }
                    n.push([f, g]),
                    s = !0,
                    u += 1
                } else {
                    const f = Math.max(2, Math.floor(b / w(.001)));
                    let g = !0;
                    for (let h, j = 1; j < f; j++) {
                        if (h = u + j,
                        h >= a.length) {
                            g = !1;
                            break
                        }
                        const [f,k] = a[h];
                        if (f < c || f >= e || k < c || k >= i || !l && cllsn(f, k, b, o, r)) {
                            g = !1;
                            break
                        }
                    }
                    if (g) {
                        s = !0;
                        for (let c = 0; c < f; c++) {
                            const [c,e] = a[u];
                            for (const a of sctrs(c, e, b)) {
                                const [f,g] = a;
                                o[f][g].push([c, e, b, r])
                            }
                            n.push([c, e]),
                            u += 1
                        }
                    } else
                        u += 1,
                        n = []
                }
            } else
                s && p.push({
                    points: n,
                    margin: b,
                    id: r
                }),
                s = !1,
                n = [],
                u += 1
        }
        2 <= n.length && p.push({
            points: n,
            margin: b,
            id: r
        })
    }
    return p
  };

  // --- Color & Palette Functions (Internal) ---
  const pcLx = (a, b) => {
    const c = [];
    for (let e = 0; e < b; e++) {
        const b = p.color(a);
        c.push(b)
    }
    return c
  };

  const pcRad = (a, b, c, e, f, g, h) => {
    const i = [];
    for (let j = 0; j < a; j++) {
        const a = p.color(b + j / a * (c - b), e + j / a * (f - e), g + j / a * (h - g));
        i.push(a)
    }
    return i
  };

  const pcBlk = a => pcLx("#000", a);

  const pcWht = a => pcLx("#fff", a);

  const pcLghtGry = a => pcLx("#aaa", a);

  const pcDrkGry = a => pcLx("#333", a);

  const pCl = (a, clrs) => {
    a %= 1;
    const b = p.lerpCrv(a, .5, 1.5)
      , c = clrs.length
      , e = Math.floor(b * c) % c
      , f = Math.ceil(b * c) % c;
    return p.lerpColor(clrs[e], clrs[f], b)
  };

  const mnCl = (a, clrs) => {
    const b = p.floor(p.random() * clrs.length);
    return p.lerpColor(clrs[b], clrs[b], p.lerpCrv(a, .3, 1))
  };

  const mxCl = (a, clrs) => {
    const b = p.floor(p.random() * clrs.length);
    return p.lerpColor(clrs[b], clrs[b], p.lerpCrv(a, 0, .7))
  };

  const pMnCl = (a, b, e, f) => {
    let g = a();
    if (f || e < p.w(.015))
        return g;
    for (; g === b; )
        g = a();
    return g
  };

  // --- Constants & State (moved here for setup) ---
  const nScts = 10;
  const z0 = 2;
  const z1 = 5;
  const z2 = 10;
  const z3 = 20;
  const z4 = 40;
  const z5 = 80;
  const z6 = 160;
  const z7 = 320;

  let flowField = null;
  let segments = [];
  let currentParams = {};
});