import json, os

p5_code = """
const BG_MAP = {
  'solid matte black':     [17,  17,  17 ],
  'pure clinical white':   [245, 245, 245],
  'soft charcoal grey':    [60,  60,  60 ],
  'deep midnight blue':    [13,  27,  42 ],
  'muted sage green':      [141, 170, 145],
  'sterile surgical teal': [46,  123, 107],
  'rich velvet burgundy':  [74,  14,  45 ],
  'pale mint green':       [181, 234, 215]
};
const SC_MAP = {
  'pastel-pink':           [244, 167, 185],
  'soft peach':            [255, 186, 143],
  'warm terracotta':       [193, 110, 76 ],
  'pale alabaster':        [240, 235, 227],
  'flushed rose':          [232, 130, 154],
  'raw sienna':            [160, 82,  45 ],
  'sun-baked clay':        [193, 123, 74 ],
  'mottled mauve':         [155, 125, 138],
  'translucent coral':     [255, 127, 127],
  'deep crimson':          [139, 26,  26 ]
};
const AC_MAP = {
  'raised pinkish node':        [220, 120, 152],
  'soft circular peak':         [255, 182, 193],
  'textured pigmented center':  [180, 100, 100],
  'protruding ochre tip':       [205, 133, 63 ],
  'subtle roseate nub':         [255, 153, 153],
  'small darkened apex':        [150, 75,  80 ],
  'pebbled flush point':        [200, 120, 120],
  'smooth coral nub':           [255, 127, 110],
  'delicate fleshy protrusion': [255, 203, 164],
  'prominent umber tip':        [139, 69,  19 ]
};
const SHAPE_MAP = {
  'plump and rounded':    { rxs:1.00, rys:1.00, yb: 0.00 },
  'soft teardrop':        { rxs:0.88, rys:1.12, yb:-0.04 },
  'firm and uplifted':    { rxs:0.97, rys:0.93, yb:-0.07 },
  'heavy and weighted':   { rxs:1.08, rys:1.10, yb: 0.08 },
  'tight and spherical':  { rxs:0.87, rys:0.87, yb:-0.02 },
  'gently sagging':       { rxs:1.06, rys:1.10, yb: 0.07 },
  'broad and shallow':    { rxs:1.20, rys:0.82, yb: 0.04 },
  'conical and sharp':    { rxs:0.82, rys:1.20, yb:-0.05 },
  'full and overflowing': { rxs:1.12, rys:1.12, yb: 0.04 }
};
const LIGHT_MAP = {
  'glossy top-edge reflections':     { hy:-0.55, hr:0.22, ha:0.80, warm:false },
  'soft matte diffusion':            { hy:-0.30, hr:0.50, ha:0.36, warm:false },
  'slick wet highlights':            { hy:-0.52, hr:0.16, ha:0.94, warm:false },
  'harsh rim lighting':              { hy:-0.48, hr:0.18, ha:0.75, warm:false },
  'clinical ring-light reflections': { hy:-0.38, hr:0.38, ha:0.60, warm:false },
  'subtle subsurface scattering':    { hy:-0.25, hr:0.55, ha:0.28, warm:true  },
  'waxy epidermal sheen':            { hy:-0.42, hr:0.30, ha:0.55, warm:true  },
  'glistening specular pings':       { hy:-0.50, hr:0.14, ha:0.90, warm:false }
};

function adj(rgb, d) {
  return [
    Math.max(0, Math.min(255, rgb[0] + d)),
    Math.max(0, Math.min(255, rgb[1] + d)),
    Math.max(0, Math.min(255, rgb[2] + d))
  ];
}
function rgba(rgb, a) {
  if (a !== undefined) {
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a.toFixed(3) + ')';
  }
  return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
}

p.setup = function() {
  p.createCanvas(800, 800);
};

p.draw = function() {
  var f   = p.frameCount;
  var scK = p.getSynthVar('flesh_sphere_color') || 'soft peach';
  var shK = p.getSynthVar('sphere_shape')       || 'plump and rounded';
  var axK = p.getSynthVar('apex_detail')        || 'raised pinkish node';
  var bgK = p.getSynthVar('background_color')   || 'solid matte black';
  var ltK = p.getSynthVar('surface_lighting')   || 'glossy top-edge reflections';

  var bg  = BG_MAP[bgK]    || BG_MAP['solid matte black'];
  var sc  = SC_MAP[scK]    || SC_MAP['soft peach'];
  var ac  = AC_MAP[axK]    || AC_MAP['raised pinkish node'];
  var shp = SHAPE_MAP[shK] || SHAPE_MAP['plump and rounded'];
  var lgt = LIGHT_MAP[ltK] || LIGHT_MAP['glossy top-edge reflections'];

  p.background(bg[0], bg[1], bg[2]);

  var ctx  = p.drawingContext;
  var cx   = p.width  * 0.5;
  var cy   = p.height * 0.5 + 18;
  var base = 172;
  var rxS  = base * shp.rxs;
  var ryS  = base * shp.rys;
  var yOff = base * shp.yb;

  // Gentle sway + per-sphere jiggle
  var sw  = Math.sin(f * 0.016) * 3.2;
  var jgL = Math.sin(f * 0.041 + 0.40) * 1.8;
  var jgR = Math.sin(f * 0.041 + 0.85) * 1.8;

  var lx = cx - rxS * 0.84 + sw * 0.25;
  var ly = cy + yOff + jgL;
  var rx = cx + rxS * 0.84 + sw * 0.25;
  var ry = cy + yOff + jgR;

  // Ground shadow
  ctx.save();
  var gsX = cx + sw * 0.25;
  var gsY = cy + yOff + ryS * 0.92;
  var gGrad = ctx.createRadialGradient(gsX, gsY, 0, gsX, gsY, rxS * 1.65);
  gGrad.addColorStop(0, 'rgba(0,0,0,0.28)');
  gGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gGrad;
  ctx.beginPath();
  ctx.ellipse(gsX, gsY, rxS * 1.6, ryS * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  function sphere(sx, sy, right) {
    ctx.save();

    // Hemisphere clip
    ctx.beginPath();
    if (!right) { ctx.rect(0, 0, cx, p.height); }
    else        { ctx.rect(cx, 0, p.width - cx, p.height); }
    ctx.clip();

    // Base gradient
    var gx = sx + rxS * (right ? -0.14 : 0.14);
    var gy = sy - ryS * 0.30;
    var bG = ctx.createRadialGradient(gx, gy, 0, sx, sy, Math.max(rxS, ryS) * 1.18);
    bG.addColorStop(0.00, rgba(adj(sc, +60)));
    bG.addColorStop(0.30, rgba(adj(sc, +18)));
    bG.addColorStop(0.60, rgba(sc));
    bG.addColorStop(0.85, rgba(adj(sc, -30)));
    bG.addColorStop(1.00, rgba(adj(sc, -65)));
    ctx.fillStyle = bG;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rxS, ryS, 0, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    var hx = sx + rxS * (right ? 0.06 : -0.06);
    var hy = sy + ryS * lgt.hy;
    var hr = Math.min(rxS, ryS) * lgt.hr;
    var hc = lgt.warm ? [255, 232, 170] : [255, 255, 255];
    var hG = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr * 2.8);
    hG.addColorStop(0,    rgba(hc, lgt.ha));
    hG.addColorStop(0.45, rgba(hc, lgt.ha * 0.45));
    hG.addColorStop(1,    rgba(hc, 0));
    ctx.fillStyle = hG;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rxS, ryS, 0, 0, Math.PI * 2);
    ctx.fill();

    // Underside shadow
    var uG = ctx.createRadialGradient(sx, sy + ryS * 0.55, 0, sx, sy + ryS * 0.30, ryS * 0.9);
    uG.addColorStop(0, 'rgba(0,0,0,0.20)');
    uG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = uG;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rxS, ryS, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Apex detail (drawn above clip)
    var apX = sx;
    var apY = sy - ryS * 0.73;
    var arR = base * 0.108;
    var niR = base * 0.052;

    ctx.save();
    // Areola
    var aG = ctx.createRadialGradient(apX, apY, 0, apX, apY, arR);
    aG.addColorStop(0,    rgba(ac, 0.82));
    aG.addColorStop(0.65, rgba(ac, 0.50));
    aG.addColorStop(1,    rgba(ac, 0));
    ctx.fillStyle = aG;
    ctx.beginPath();
    ctx.arc(apX, apY, arR, 0, Math.PI * 2);
    ctx.fill();

    // Nipple tip
    var nG = ctx.createRadialGradient(apX - niR * 0.25, apY - niR * 0.35, 0, apX, apY, niR);
    nG.addColorStop(0, rgba(adj(ac, +22)));
    nG.addColorStop(1, rgba(adj(ac, -28)));
    ctx.fillStyle = nG;
    ctx.beginPath();
    ctx.arc(apX, apY, niR, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  sphere(lx, ly, false);
  sphere(rx, ry, true);

  // Cleavage seam shadow
  ctx.save();
  var smG = ctx.createLinearGradient(cx - 22, 0, cx + 22, 0);
  smG.addColorStop(0,    'rgba(0,0,0,0)');
  smG.addColorStop(0.30, 'rgba(0,0,0,0.30)');
  smG.addColorStop(0.50, 'rgba(0,0,0,0.48)');
  smG.addColorStop(0.70, 'rgba(0,0,0,0.30)');
  smG.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = smG;
  ctx.fillRect(cx - 22, cy + yOff - ryS * 0.97, 44, ryS * 1.96);
  ctx.restore();
};
""".strip()

template = {
  "name": "Twin Spheres",
  "promptTemplate": "Minimalist 2D vector illustration in a bold Pop Art style. Two symmetrical {{sphere_shape}} {{flesh_sphere_color}} spheres press together centrally, creating a vertical seam. Each sphere is crowned with a {{apex_detail}}. This centered composition is isolated against a {{background_color}} background. Digital overhead lighting produces {{surface_lighting}} and subtle volumetric gradients. The palette emphasizes flesh-toned anatomical hues and high-contrast white. Sharp vector paths and smooth color transitions define the polished surfaces. The aesthetic is surreal and provocative, utilizing clean geometric abstraction to suggest anatomical forms.",
  "variables": [
    {
      "name": "flesh_sphere_color",
      "feature_name": "Sphere Color",
      "values": [
        {"text":"pastel-pink","weight":3},
        {"text":"soft peach","weight":3},
        {"text":"warm terracotta","weight":3},
        {"text":"pale alabaster","weight":3},
        {"text":"flushed rose","weight":2},
        {"text":"raw sienna","weight":2},
        {"text":"sun-baked clay","weight":2},
        {"text":"mottled mauve","weight":1},
        {"text":"translucent coral","weight":1},
        {"text":"deep crimson","weight":1}
      ]
    },
    {
      "name": "sphere_shape",
      "feature_name": "Sphere Shape",
      "values": [
        {"text":"plump and rounded","weight":3},
        {"text":"soft teardrop","weight":3},
        {"text":"firm and uplifted","weight":3},
        {"text":"heavy and weighted","weight":2},
        {"text":"tight and spherical","weight":2},
        {"text":"gently sagging","weight":2},
        {"text":"broad and shallow","weight":1},
        {"text":"conical and sharp","weight":1},
        {"text":"full and overflowing","weight":1}
      ]
    },
    {
      "name": "apex_detail",
      "feature_name": "Apex Detail",
      "values": [
        {"text":"raised pinkish node","weight":3},
        {"text":"soft circular peak","weight":3},
        {"text":"textured pigmented center","weight":2},
        {"text":"protruding ochre tip","weight":3},
        {"text":"subtle roseate nub","weight":2},
        {"text":"small darkened apex","weight":3},
        {"text":"pebbled flush point","weight":2},
        {"text":"smooth coral nub","weight":1},
        {"text":"delicate fleshy protrusion","weight":1},
        {"text":"prominent umber tip","weight":1}
      ]
    },
    {
      "name": "background_color",
      "feature_name": "Background",
      "values": [
        {"text":"solid matte black","weight":3},
        {"text":"pure clinical white","weight":3},
        {"text":"soft charcoal grey","weight":3},
        {"text":"deep midnight blue","weight":2},
        {"text":"muted sage green","weight":2},
        {"text":"sterile surgical teal","weight":1},
        {"text":"rich velvet burgundy","weight":1},
        {"text":"pale mint green","weight":1}
      ]
    },
    {
      "name": "surface_lighting",
      "feature_name": "Surface Lighting",
      "values": [
        {"text":"glossy top-edge reflections","weight":3},
        {"text":"soft matte diffusion","weight":3},
        {"text":"slick wet highlights","weight":2},
        {"text":"harsh rim lighting","weight":2},
        {"text":"clinical ring-light reflections","weight":2},
        {"text":"subtle subsurface scattering","weight":1},
        {"text":"waxy epidermal sheen","weight":1},
        {"text":"glistening specular pings","weight":1}
      ]
    }
  ],
  "p5Code": p5_code
}

out = os.path.join("static", "synthograsizer", "templates", "twin-spheres.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(template, f, indent=2, ensure_ascii=False)

print("Written:", out)
print("p5Code length:", len(p5_code), "chars")
