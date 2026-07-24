/**
 * Style Preset Library
 * ────────────────────
 * Curated style presets for image transformation, adapted from Glif's
 * Super Kontext Style Transfer workflow. Each preset defines a style name,
 * a prompt template with a {subject} placeholder, and optional generation
 * hints (negative_prompt, aspect_ratio).
 *
 * Usage:
 *   import { stylePresets, getPreset, getPresetsByCategory, applyPreset } from './stylePresets.js';
 *   const preset = getPreset('oil_painting');
 *   const prompt = applyPreset(preset, 'a cathedral at dusk');
 */

// ─── Preset definitions ──────────────────────────────────────────────────────

export const stylePresets = [
  // ── Painting & Traditional Art ────────────────────────────────────────────
  {
    id: 'oil_painting',
    name: 'Oil Painting',
    category: 'painting',
    prompt: 'a rich, textured oil painting of {subject}, thick impasto brushstrokes, gallery lighting, varnished canvas',
    negative_prompt: 'digital, 3d render, photograph',
  },
  {
    id: 'watercolor',
    name: 'Watercolor',
    category: 'painting',
    prompt: 'a delicate watercolor painting of {subject}, soft washes of pigment bleeding into wet paper, visible brush marks, white paper showing through',
    negative_prompt: 'digital, sharp edges, photorealistic',
  },
  {
    id: 'impressionist',
    name: 'Impressionism',
    category: 'painting',
    prompt: '{subject} painted in the style of French Impressionism, dappled light, visible brushstrokes, en plein air atmosphere, Monet-like color palette',
    negative_prompt: 'sharp, photorealistic, digital',
  },
  {
    id: 'ukiyo_e',
    name: 'Ukiyo-e',
    category: 'painting',
    prompt: '{subject} as a Japanese ukiyo-e woodblock print, flat areas of color, bold outlines, traditional compositional style, washi paper texture',
    negative_prompt: '3d, photorealistic, modern',
  },
  {
    id: 'ink_wash',
    name: 'Ink Wash / Sumi-e',
    category: 'painting',
    prompt: '{subject} rendered in traditional ink wash painting, flowing black ink on rice paper, negative space, zen minimalism, subtle gradations',
    negative_prompt: 'colorful, digital, cluttered',
  },
  {
    id: 'expressionist',
    name: 'Expressionism',
    category: 'painting',
    prompt: '{subject} in bold expressionist style, distorted forms, vivid unnatural colors, emotional intensity, heavy paint application, Kirchner/Munch influence',
    negative_prompt: 'photorealistic, calm, muted',
  },
  {
    id: 'pointillism',
    name: 'Pointillism',
    category: 'painting',
    prompt: '{subject} composed entirely of small distinct dots of color, pointillist technique, Seurat-inspired, optical color mixing, museum quality',
    negative_prompt: 'smooth, blended, digital',
  },

  // ── Sculpture & 3D ───────────────────────────────────────────────────────
  {
    id: 'claymation',
    name: 'Claymation',
    category: 'sculpture',
    prompt: '{subject} as a stop-motion claymation figure, visible fingerprint textures in the clay, slightly wobbly proportions, warm studio lighting, miniature set',
    negative_prompt: 'photorealistic, smooth, digital',
  },
  {
    id: 'marble_sculpture',
    name: 'Marble Sculpture',
    category: 'sculpture',
    prompt: '{subject} carved from pristine white Carrara marble, classical sculpture, museum pedestal, dramatic raking light, fine chisel detail',
    negative_prompt: 'painted, colorful, flat',
  },
  {
    id: 'kintsugi',
    name: 'Kintsugi',
    category: 'sculpture',
    prompt: '{subject} reimagined as a broken ceramic vessel repaired with gold lacquer (kintsugi), luminous gold seams tracing fracture lines, wabi-sabi beauty, dark background',
    negative_prompt: 'pristine, unbroken, digital',
  },
  {
    id: 'origami',
    name: 'Origami',
    category: 'sculpture',
    prompt: '{subject} folded from a single sheet of paper, origami style, crisp geometric folds, subtle paper texture, soft shadow, clean white background',
    negative_prompt: 'realistic, painted, messy',
  },
  {
    id: 'low_poly',
    name: 'Low Poly',
    category: 'sculpture',
    prompt: '{subject} as a low-poly 3D model, flat-shaded triangular facets, stylized geometric simplification, soft gradient background, isometric view',
    negative_prompt: 'smooth, organic, photorealistic',
  },

  // ── Photography & Cinematic ───────────────────────────────────────────────
  {
    id: 'daguerreotype',
    name: 'Daguerreotype',
    category: 'photography',
    prompt: '{subject} captured as an antique daguerreotype photograph, silver plate, mirror-like sheen, slight vignette, Victorian-era formal composition, oxidation patina',
    negative_prompt: 'modern, color, digital',
  },
  {
    id: 'polaroid',
    name: 'Polaroid',
    category: 'photography',
    prompt: '{subject} as a vintage Polaroid instant photograph, characteristic warm color shift, slightly overexposed highlights, white border frame, casual snapshot composition',
    negative_prompt: 'digital, sharp, professional',
  },
  {
    id: 'infrared',
    name: 'Infrared Photography',
    category: 'photography',
    prompt: '{subject} captured with infrared film photography, surreal white foliage, dark skies, dreamlike ethereal atmosphere, Wood effect',
    negative_prompt: 'normal colors, digital, realistic',
  },
  {
    id: 'tilt_shift',
    name: 'Tilt-Shift Miniature',
    category: 'photography',
    prompt: '{subject} photographed with extreme tilt-shift lens effect, making everything look like a miniature model, selective focus band, saturated colors, bird\'s eye view',
    negative_prompt: 'normal perspective, full focus',
  },
  {
    id: 'noir',
    name: 'Film Noir',
    category: 'photography',
    prompt: '{subject} in dramatic film noir style, high contrast black and white, venetian blind shadows, cigarette smoke, 1940s atmosphere, low-key lighting',
    negative_prompt: 'colorful, bright, modern, cheerful',
  },
  {
    id: 'cinematic',
    name: 'Cinematic Widescreen',
    category: 'photography',
    prompt: '{subject}, cinematic composition, anamorphic lens flare, shallow depth of field, color graded teal and orange, 2.39:1 aspect ratio framing, movie still',
    negative_prompt: 'flat, amateur, snapshot',
    aspect_ratio: '21:9',
  },

  // ── Digital & Glitch ──────────────────────────────────────────────────────
  {
    id: 'glitch',
    name: 'Glitch Art',
    category: 'digital',
    prompt: '{subject} corrupted with digital glitch artifacts, RGB channel splitting, data corruption bands, pixel sorting streaks, scan lines, broken signal aesthetic',
    negative_prompt: 'clean, pristine, analog',
  },
  {
    id: 'datamosh',
    name: 'Datamosh',
    category: 'digital',
    prompt: '{subject} with datamoshed video compression artifacts, pixel bloom, motion vectors dragged across the frame, I-frame deletion effect, digital entropy',
    negative_prompt: 'clean, sharp, stable',
  },
  {
    id: 'vaporwave',
    name: 'Vaporwave',
    category: 'digital',
    prompt: '{subject} in vaporwave aesthetic, neon pink and cyan gradients, Greek bust elements, retro 90s Windows UI, palm trees, chrome text, VHS tracking lines',
    negative_prompt: 'natural, muted, serious',
  },
  {
    id: 'pixel_art',
    name: 'Pixel Art',
    category: 'digital',
    prompt: '{subject} as detailed pixel art, limited color palette, visible individual pixels, retro 16-bit game aesthetic, clean edges, dithering for gradients',
    negative_prompt: 'smooth, high resolution, photorealistic',
  },
  {
    id: 'ascii',
    name: 'ASCII Art',
    category: 'digital',
    prompt: '{subject} rendered as ASCII art on a dark terminal screen, composed of typed characters and symbols, monospace font, green phosphor CRT glow',
    negative_prompt: 'photorealistic, colorful, smooth',
  },
  {
    id: 'wireframe',
    name: 'Wireframe',
    category: 'digital',
    prompt: '{subject} as a glowing wireframe model on black background, neon edge lines, no filled surfaces, retro 1980s vector graphics, Tron aesthetic',
    negative_prompt: 'solid, textured, photorealistic',
  },

  // ── Surreal & Conceptual ──────────────────────────────────────────────────
  {
    id: 'synesthesia',
    name: 'Synesthesia',
    category: 'surreal',
    prompt: '{subject} visualized through synesthesia, where sound has color and texture has melody, chromatic auras radiating from forms, impossible sensory crossover',
    negative_prompt: 'normal, realistic, mundane',
  },
  {
    id: 'temporal_collapse',
    name: 'Temporal Collapse',
    category: 'surreal',
    prompt: '{subject} experiencing temporal collapse, multiple moments existing simultaneously, overlapping transparencies of past present and future states, time-lapse in a single frame',
    negative_prompt: 'single moment, normal time, static',
  },
  {
    id: 'recursive',
    name: 'Recursive Self-Replication',
    category: 'surreal',
    prompt: '{subject} caught in infinite recursive self-replication, Droste effect, each copy containing a smaller version of itself, fractal repetition, mise en abyme',
    negative_prompt: 'single instance, simple, flat',
  },
  {
    id: 'dream_logic',
    name: 'Dream Logic',
    category: 'surreal',
    prompt: '{subject} rendered through dream logic, impossible spatial relationships, objects morphing into unrelated forms, Dalí-esque landscape, melting boundaries between categories',
    negative_prompt: 'logical, normal physics, mundane',
  },
  {
    id: 'cosmic_horror',
    name: 'Cosmic Horror',
    category: 'surreal',
    prompt: '{subject} infused with cosmic horror, non-Euclidean geometry, impossible angles, tentacular forms emerging from tears in reality, Lovecraftian dread, eldritch lighting',
    negative_prompt: 'cheerful, safe, normal, bright',
  },
  {
    id: 'bioluminescent',
    name: 'Bioluminescence',
    category: 'surreal',
    prompt: '{subject} rendered in bioluminescent deep-sea style, glowing organic forms against absolute darkness, phosphorescent blues and greens, abyssal atmosphere',
    negative_prompt: 'daylight, normal lighting, surface',
  },

  // ── Material / Texture ────────────────────────────────────────────────────
  {
    id: 'stained_glass',
    name: 'Stained Glass',
    category: 'material',
    prompt: '{subject} depicted as a Gothic cathedral stained glass window, vibrant translucent colored glass, dark lead cames between segments, backlit by sunlight',
    negative_prompt: 'opaque, modern, digital',
  },
  {
    id: 'embroidery',
    name: 'Embroidery',
    category: 'material',
    prompt: '{subject} as elaborate thread embroidery on linen fabric, visible stitch textures, French knots for detail, satin stitch fills, embroidery hoop visible',
    negative_prompt: 'digital, smooth, photorealistic',
  },
  {
    id: 'mosaic',
    name: 'Byzantine Mosaic',
    category: 'material',
    prompt: '{subject} as an ancient Byzantine mosaic, small tesserae tiles of gold and colored stone, sacred geometric composition, gold leaf background, cathedral wall',
    negative_prompt: 'smooth, modern, digital',
  },
  {
    id: 'neon_sign',
    name: 'Neon Sign',
    category: 'material',
    prompt: '{subject} as a glowing neon sign, bent glass tubes filled with noble gas, buzzing electrical glow, rain-wet reflections on dark street, night atmosphere',
    negative_prompt: 'daylight, natural, not glowing',
  },
  {
    id: 'ice_sculpture',
    name: 'Ice Sculpture',
    category: 'material',
    prompt: '{subject} carved from crystal-clear ice, refracting light through frozen facets, melt droplets, cold blue lighting, sub-zero atmosphere, transparent detail',
    negative_prompt: 'warm, opaque, painted',
  },
  {
    id: 'woodcut',
    name: 'Woodcut Print',
    category: 'material',
    prompt: '{subject} as a traditional woodcut print, bold black lines carved into wood block, limited color from hand-applied ink, visible wood grain texture, medieval aesthetic',
    negative_prompt: 'digital, photorealistic, smooth gradient',
  },

  // ── Period / Cultural ─────────────────────────────────────────────────────
  {
    id: 'art_nouveau',
    name: 'Art Nouveau',
    category: 'period',
    prompt: '{subject} in Art Nouveau style, flowing organic curves, whiplash lines, botanical motifs, Mucha-inspired decorative borders, warm muted palette',
    negative_prompt: 'geometric, digital, modern, harsh',
  },
  {
    id: 'art_deco',
    name: 'Art Deco',
    category: 'period',
    prompt: '{subject} in Art Deco style, bold geometric patterns, gold and black palette, sunburst motifs, streamlined forms, 1920s glamour, Chrysler Building aesthetic',
    negative_prompt: 'organic, messy, rustic',
  },
  {
    id: 'baroque',
    name: 'Baroque',
    category: 'period',
    prompt: '{subject} in dramatic Baroque style, Caravaggio chiaroscuro lighting, rich dark backgrounds, theatrical composition, sumptuous fabrics and textures, emotional intensity',
    negative_prompt: 'flat, modern, minimal, bright',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    category: 'period',
    prompt: '{subject} in cyberpunk setting, rain-slicked neon streets, holographic advertisements, augmented reality overlays, Blade Runner atmosphere, high tech low life',
    negative_prompt: 'nature, pastoral, clean, bright daylight',
  },
  {
    id: 'solarpunk',
    name: 'Solarpunk',
    category: 'period',
    prompt: '{subject} in solarpunk utopia, lush vertical gardens integrated with elegant solar architecture, community spaces, warm golden hour light, hopeful futurism',
    negative_prompt: 'dystopian, dark, polluted, bleak',
  },
  {
    id: 'soviet_constructivism',
    name: 'Soviet Constructivism',
    category: 'period',
    prompt: '{subject} as a Soviet Constructivist poster, bold red and black palette, dynamic diagonal composition, geometric typography, propaganda aesthetic, Rodchenko influence',
    negative_prompt: 'subtle, organic, photorealistic, pastel',
  },

  // ── Illustration & Graphic ────────────────────────────────────────────────
  {
    id: 'comic_book',
    name: 'Comic Book',
    category: 'illustration',
    prompt: '{subject} drawn in bold comic book style, strong ink outlines, Ben-Day dots, dynamic action pose, speech bubble ready composition, vibrant flat colors',
    negative_prompt: 'photorealistic, subtle, muted',
  },
  {
    id: 'manga',
    name: 'Manga',
    category: 'illustration',
    prompt: '{subject} drawn in manga style, expressive eyes, speed lines, screen tone shading, black and white with selective color accents, dramatic panel composition',
    negative_prompt: 'western comic, photorealistic',
  },
  {
    id: 'botanical_illustration',
    name: 'Botanical Illustration',
    category: 'illustration',
    prompt: '{subject} as a detailed scientific botanical illustration, precise linework, labeled anatomical parts, watercolor tinting, cream paper, natural history museum quality',
    negative_prompt: 'stylized, abstract, digital',
  },
  {
    id: 'children_book',
    name: "Children's Book",
    category: 'illustration',
    prompt: '{subject} illustrated in warm children\'s book style, gentle watercolor and ink, whimsical proportions, soft pastel palette, storybook charm, hand-drawn feeling',
    negative_prompt: 'scary, dark, photorealistic, complex',
  },
  {
    id: 'blueprint',
    name: 'Blueprint / Technical Drawing',
    category: 'illustration',
    prompt: '{subject} as a detailed technical blueprint, white lines on deep blue background, precise measurements and annotations, orthographic projection, engineering diagram',
    negative_prompt: 'colorful, artistic, painterly',
  },

  // ── Experimental / Generative ─────────────────────────────────────────────
  {
    id: 'double_exposure',
    name: 'Double Exposure',
    category: 'experimental',
    prompt: '{subject} merged with a landscape through double exposure photography, two images blended into one, silhouette filled with nature, ethereal overlay',
    negative_prompt: 'single image, clean, simple',
  },
  {
    id: 'cyanotype',
    name: 'Cyanotype',
    category: 'experimental',
    prompt: '{subject} as a cyanotype photogram, Prussian blue on white, sun-printed silhouettes, botanical specimen aesthetic, handmade darkroom process, Anna Atkins style',
    negative_prompt: 'colorful, digital, modern',
  },
  {
    id: 'risograph',
    name: 'Risograph',
    category: 'experimental',
    prompt: '{subject} printed in risograph style, limited spot color layers (fluorescent pink, teal, yellow), slight misregistration, grain texture, zine aesthetic',
    negative_prompt: 'photorealistic, clean, digital perfection',
  },
  {
    id: 'generative_art',
    name: 'Generative / Algorithmic Art',
    category: 'experimental',
    prompt: '{subject} reimagined as algorithmic generative art, mathematical patterns, particle systems, flow fields, creative coding aesthetic, Processing/p5.js look',
    negative_prompt: 'hand-drawn, photorealistic, analog',
  },
  {
    id: 'thermal_vision',
    name: 'Thermal Vision',
    category: 'experimental',
    prompt: '{subject} seen through thermal imaging camera, heat map color gradient from deep blue (cold) to bright white (hot), FLIR aesthetic, infrared radiation visualization',
    negative_prompt: 'normal colors, natural light',
  },
  {
    id: 'x_ray',
    name: 'X-Ray',
    category: 'experimental',
    prompt: '{subject} as an X-ray radiograph, internal structures visible, bones and density variations, inverted luminosity, medical imaging aesthetic, light box display',
    negative_prompt: 'opaque, colored, surface only',
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/** Map id → preset for O(1) lookups */
const _byId = new Map(stylePresets.map(p => [p.id, p]));

/** Map category → preset[] */
const _byCategory = new Map();
for (const p of stylePresets) {
  if (!_byCategory.has(p.category)) _byCategory.set(p.category, []);
  _byCategory.get(p.category).push(p);
}

/**
 * Get a style preset by id.
 * @param {string} id
 * @returns {object|null}
 */
export function getPreset(id) {
  return _byId.get(id) || null;
}

/**
 * Get all presets in a category.
 * @param {string} category
 * @returns {object[]}
 */
export function getPresetsByCategory(category) {
  return _byCategory.get(category) || [];
}

/**
 * Get all unique category names.
 * @returns {string[]}
 */
export function getCategories() {
  return [..._byCategory.keys()];
}

/**
 * Fuzzy-search presets by name or id (case-insensitive substring).
 * @param {string} query
 * @returns {object[]}
 */
export function searchPresets(query) {
  const q = query.toLowerCase();
  return stylePresets.filter(p =>
    p.id.includes(q) || p.name.toLowerCase().includes(q) || p.category.includes(q)
  );
}

/**
 * Apply a preset to a subject, returning the interpolated prompt
 * and any generation hints.
 * @param {object} preset       - from getPreset()
 * @param {string} subject      - e.g. "a cathedral at dusk"
 * @returns {{ prompt: string, negative_prompt?: string, aspect_ratio?: string }}
 */
export function applyPreset(preset, subject) {
  const result = {
    prompt: preset.prompt.replace(/\{subject\}/g, subject),
  };
  if (preset.negative_prompt) result.negative_prompt = preset.negative_prompt;
  if (preset.aspect_ratio) result.aspect_ratio = preset.aspect_ratio;
  return result;
}

/**
 * List all presets as a compact summary (for system prompts / agent descriptions).
 * @returns {string}
 */
export function listPresetsCompact() {
  const lines = [];
  for (const cat of getCategories()) {
    const presets = getPresetsByCategory(cat);
    const names = presets.map(p => p.id).join(', ');
    lines.push(`  ${cat}: ${names}`);
  }
  return lines.join('\n');
}
