// Resolves a sketch into the panel a phone draws: its skin, the widget for
// each control, and how controls are grouped. Pure (no DOM), so node can test
// it.
//
// This mirrors backend/service/thecommons_ui.py, which normalises every spec
// before it reaches a phone. It is checked again here anyway, because the
// phone is where a bad spec would do harm, and because not every sketch comes
// through that gate: the inherited p5 library never does. The same test
// (tests/test_thecommons_ui.py) keeps the two in step.
//
// With no `ui` spec, every control gets its type's default widget in one
// untitled group, which is the panel The Commons has always drawn.

export const SKINS = {
  commons: { label: 'The Commons', variants: { night: '#0a0b0f' } },
  trainer: { label: 'Trainer menu', variants: { violet: '#000000', fire: '#000000', ice: '#000000', acid: '#000000' } },
  desk: { label: 'Retro desktop', variants: { blue: '#0055aa', grey: '#a8a8a8' } },
  textmode: { label: 'Text mode', variants: { blue: '#0000aa', amber: '#1a1000', green: '#001a06' } },
};
export const DEFAULT_SKIN = 'commons';
export const WIDGETS_BY_TYPE = {
  number: ['slider', 'knob', 'stepper'],
  select: ['buttons', 'list', 'cycle', 'pads'],
  trigger: ['button', 'pad'],
};
export const DENSITIES = ['roomy', 'compact'];
export const CAPS = { groups: 6, title: 28, tagline: 60, groupTitle: 20, hint: 60, accentContrast: 4.5 };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
// The same whitespace set as the server's _is_space().
const SPACE_RE = /[\t\n\v\f\r\p{Zs}\p{Zl}\p{Zp}]/gu;
const LINKISH_RE = /:\/\/|www\.|@|\.(?:com|net|org|io|ly|app|xyz)\b/i;
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

export function controlType(variable) {
  return variable.type === 'number' || variable.type === 'trigger' ? variable.type : 'select';
}

function cleanText(value, cap) {
  if (typeof value !== 'string') return '';
  // Whitespace becomes a space FIRST -- a newline is a control character too,
  // and dropping it would glue two words together. Then drop every other
  // control and format character (\p{C}: bidi overrides, zero-width spaces).
  const text = value.replace(SPACE_RE, ' ').replace(/\p{C}/gu, '').split(' ').filter(Boolean).join(' ');
  if (LINKISH_RE.test(text)) return '';
  // Count code points, not UTF-16 units, to cut exactly where the server does.
  return Array.from(text).slice(0, cap).join('').trimEnd();
}

function luminance(hex) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function resolvePanel(sketch) {
  const variables = (sketch?.variables || []).filter((v) => v && typeof v.name === 'string');
  const names = new Set(variables.map((v) => v.name));
  const ui = isObject(sketch?.ui) ? sketch.ui : {};

  const skin = typeof ui.skin === 'string' && own(SKINS, ui.skin) ? ui.skin : DEFAULT_SKIN;
  const variants = SKINS[skin].variants;
  const variant = typeof ui.variant === 'string' && own(variants, ui.variant) ? ui.variant : Object.keys(variants)[0];
  const accent = typeof ui.accent === 'string' && HEX_RE.test(ui.accent)
    && contrast(ui.accent, variants[variant]) >= CAPS.accentContrast ? ui.accent.toLowerCase() : '';

  const groups = [];
  const placed = new Set();
  for (const group of (Array.isArray(ui.groups) ? ui.groups : []).slice(0, CAPS.groups)) {
    if (!isObject(group) || !Array.isArray(group.controls)) continue;
    const members = [];
    for (const name of group.controls) {
      if (typeof name === 'string' && names.has(name) && !placed.has(name)) {
        placed.add(name);
        members.push(name);
      }
    }
    if (members.length) groups.push({ title: cleanText(group.title, CAPS.groupTitle), controls: members });
  }
  // Nothing may go missing: a control the spec forgot still reaches phones.
  const leftover = variables.map((v) => v.name).filter((name) => !placed.has(name));
  if (leftover.length) {
    if (groups.length) groups[groups.length - 1].controls.push(...leftover);
    else groups.push({ title: '', controls: leftover });
  }

  const rawControls = isObject(ui.controls) ? ui.controls : {};
  const controls = {};
  for (const v of variables) {
    const raw = own(rawControls, v.name) && isObject(rawControls[v.name]) ? rawControls[v.name] : {};
    const allowed = WIDGETS_BY_TYPE[controlType(v)];
    controls[v.name] = {
      widget: allowed.includes(raw.widget) ? raw.widget : allowed[0],
      hint: cleanText(raw.hint, CAPS.hint),
    };
  }

  const mobile = isObject(ui.mobile) ? ui.mobile : {};
  const desktop = isObject(ui.desktop) ? ui.desktop : {};
  const columns = Number.isInteger(desktop.columns) && desktop.columns >= 1 && desktop.columns <= 3
    ? desktop.columns : Math.max(1, Math.min(2, groups.length));

  return {
    skin,
    variant,
    title: cleanText(ui.title, CAPS.title),
    tagline: cleanText(ui.tagline, CAPS.tagline),
    accent,
    groups,
    controls,
    density: DENSITIES.includes(mobile.density) ? mobile.density : DENSITIES[0],
    columns,
    variables: new Map(variables.map((v) => [v.name, v])),
  };
}
