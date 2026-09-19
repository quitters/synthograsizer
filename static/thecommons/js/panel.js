// The control panel a participant holds, drawn from a sketch and its optional
// `ui` spec. Shared by the phone station and the creator desk's preview.
//
// SECURITY. A `ui` spec is model output, so it is treated as data and never as
// markup. Every string reaches the page through textContent, and every choice
// has already been checked against an allowlist by panel-spec.js. Nothing in a
// spec can add an element, a style rule, a URL or a script. The one free value,
// an accent colour, has passed a #rrggbb check before it becomes a CSS custom
// property. That is why the same panel can render on the signed-in desk as
// safely as on an anonymous phone.
//
// The panel only draws and reports. Who may touch what, the socket, and how
// often values are sent all stay with the caller.
import { defaultValue, numericValue } from './parameters.js';
import { SKINS, resolvePanel } from './panel-spec.js';

let mounted = 0;
// How far a finger travels to turn a knob through its whole range.
const KNOB_TRAVEL_PX = 220;
const HOLD_DELAY_MS = 400;
const HOLD_REPEAT_MS = 70;

// Each skin's typeface, from fixed URLs in this file. A spec names a skin; it
// never supplies a URL.
const SKIN_FONTS = {
  trainer: 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap',
  desk: 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600&display=swap',
  textmode: 'https://fonts.googleapis.com/css2?family=VT323&display=swap',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Keep receiving a drag after the finger leaves the element. Some browsers
// throw for a pointer that has already gone; the drag then simply ends early.
function capture(node, event) {
  try { node.setPointerCapture(event.pointerId); } catch {}
}

const display = (text) => String(text).replaceAll('_', ' ');
const clampTo = (v, x) => Math.min(v.max, Math.max(v.min, x));

function button(className, text, label) {
  const node = el('button', className, text);
  node.type = 'button';
  if (label) node.setAttribute('aria-label', label);
  return node;
}

// Choices drawn as a row of buttons or a grid of lit pads: same behaviour,
// different body.
function choiceButtons(v, io, className, withLed) {
  const row = el('div', className);
  const buttons = (v.values || []).map((val) => {
    const btn = button(withLed ? 'pad-choice' : '', withLed ? undefined : display(val.text));
    if (withLed) btn.append(el('span', 'led'), el('span', 'pad-label', display(val.text)));
    btn.dataset.value = val.text;
    btn.onclick = () => {
      if (!io.canUse()) return;
      // Preserve focus and touch feedback instead of rebuilding the panel.
      setValue(val.text);
      io.emit(val.text, true);
    };
    row.append(btn);
    return btn;
  });
  function setValue(value) {
    for (const btn of buttons) {
      const active = btn.dataset.value === value;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }
  return { el: row, setValue, setEnabled: (on) => { for (const b of buttons) b.disabled = !on; } };
}

// Each widget returns { el, setValue(value), setEnabled(enabled) }.
// `io.emit(value, commit)` reports a new value; commit=false marks a value
// that is still being dragged, so the caller can coalesce it, and
// `io.commit()` says the drag has ended.
const WIDGETS = {
  slider(v, io) {
    const controls = el('div', 'numeric-control');
    const output = el('output', 'numeric-value');
    output.setAttribute('aria-live', 'off');
    const input = el('input');
    input.type = 'range';
    input.id = `${io.id}-input`;
    input.min = v.min;
    input.max = v.max;
    input.step = v.step;
    input.setAttribute('aria-labelledby', io.labelId);
    output.htmlFor = input.id;
    const bounds = el('div', 'range-bounds');
    for (const text of [String(v.min), `Step ${v.step}`, String(v.max)]) bounds.append(el('span', '', text));
    const setValue = (value) => {
      input.value = value;
      output.value = String(value);
      input.style.setProperty('--position', `${100 * (value - v.min) / (v.max - v.min)}%`);
    };
    input.addEventListener('input', () => {
      const value = numericValue(v, input.valueAsNumber);
      if (value === null || !io.canUse()) return;
      setValue(value);
      io.emit(value, false);
    });
    input.addEventListener('change', () => io.commit());
    controls.append(output, input, bounds);
    return { el: controls, setValue, setEnabled: (on) => { input.disabled = !on; } };
  },

  // Turned by dragging up or right, like a hardware encoder, rather than by
  // following the finger round: a circular drag on a small phone dial is
  // fiddly, and it fights the page's own scrolling. Keys work as on a slider.
  knob(v, io) {
    const wrap = el('div', 'knob-control');
    const dial = el('div', 'knob-dial');
    dial.setAttribute('role', 'slider');
    dial.setAttribute('aria-labelledby', io.labelId);
    dial.setAttribute('aria-valuemin', String(v.min));
    dial.setAttribute('aria-valuemax', String(v.max));
    const face = el('span', 'knob-face');
    face.append(el('span', 'knob-mark'));
    dial.append(face);
    const output = el('output', 'numeric-value');
    output.setAttribute('aria-hidden', 'true');
    wrap.append(dial, output);

    let value = v.default;
    let enabled = true;
    let drag = null;
    function setValue(x) {
      value = x;
      const f = (x - v.min) / (v.max - v.min);
      dial.style.setProperty('--turn', `${-135 + 270 * f}deg`);
      dial.style.setProperty('--position', `${100 * f}%`);
      dial.setAttribute('aria-valuenow', String(x));
      output.value = String(x);
    }
    function propose(x, commit) {
      const snapped = numericValue(v, clampTo(v, x));
      if (snapped === null || !enabled || !io.canUse()) return;
      if (snapped !== value) {
        setValue(snapped);
        io.emit(snapped, commit);
      } else if (commit) io.commit();
    }
    dial.addEventListener('pointerdown', (e) => {
      if (!enabled) return;
      capture(dial, e);
      drag = { x: e.clientX, y: e.clientY, from: value };
      dial.classList.add('turning');
      dial.focus({ preventScroll: true });
      e.preventDefault();
    });
    dial.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const travel = (drag.y - e.clientY) + (e.clientX - drag.x);
      propose(drag.from + (travel / KNOB_TRAVEL_PX) * (v.max - v.min), false);
    });
    const end = () => {
      if (!drag) return;
      drag = null;
      dial.classList.remove('turning');
      io.commit();
    };
    dial.addEventListener('pointerup', end);
    dial.addEventListener('pointercancel', end);
    dial.addEventListener('lostpointercapture', end);
    dial.addEventListener('keydown', (e) => {
      const big = Math.max(v.step, (v.max - v.min) / 10);
      const delta = { ArrowUp: v.step, ArrowRight: v.step, ArrowDown: -v.step, ArrowLeft: -v.step,
                      PageUp: big, PageDown: -big }[e.key];
      const target = delta !== undefined ? value + delta
        : e.key === 'Home' ? v.min : e.key === 'End' ? v.max : null;
      if (target === null) return;
      e.preventDefault();
      propose(target, true);
    });
    return {
      el: wrap,
      setValue,
      setEnabled(on) {
        enabled = on;
        dial.tabIndex = on ? 0 : -1;
        dial.setAttribute('aria-disabled', String(!on));
      },
    };
  },

  // ◂ value ▸, one step per tap, repeating while held.
  stepper(v, io) {
    const wrap = el('div', 'stepper');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-labelledby', io.labelId);
    const down = button('step-button step-down', '◂', `Decrease ${io.label}`);
    const output = el('output', 'numeric-value step-value');
    output.setAttribute('aria-live', 'polite');
    const up = button('step-button step-up', '▸', `Increase ${io.label}`);
    wrap.append(down, output, up);

    let value = v.default;
    let enabled = true;
    function setValue(x) {
      value = x;
      output.value = String(x);
      wrap.style.setProperty('--position', `${100 * (x - v.min) / (v.max - v.min)}%`);
      down.disabled = !enabled || x <= v.min;
      up.disabled = !enabled || x >= v.max;
    }
    function nudge(direction, commit) {
      const snapped = numericValue(v, clampTo(v, value + direction * v.step));
      if (snapped === null || snapped === value || !enabled || !io.canUse()) return;
      setValue(snapped);
      io.emit(snapped, commit);
    }
    for (const [btn, direction] of [[down, -1], [up, 1]]) {
      let timer = null;
      const stop = () => {
        if (timer === null) return;
        clearTimeout(timer);
        timer = null;
        io.commit();
      };
      btn.addEventListener('pointerdown', (e) => {
        if (btn.disabled) return;
        capture(btn, e);
        nudge(direction, false);
        timer = setTimeout(function repeat() {
          nudge(direction, false);
          timer = setTimeout(repeat, HOLD_REPEAT_MS);
        }, HOLD_DELAY_MS);
      });
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', stop);
      btn.addEventListener('lostpointercapture', stop);
      // A pointer press already stepped; only keyboard activation (detail 0)
      // steps on click.
      btn.addEventListener('click', (e) => { if (e.detail === 0) nudge(direction, true); });
    }
    return {
      el: wrap,
      setValue,
      setEnabled(on) {
        enabled = on;
        setValue(value);
      },
    };
  },

  buttons: (v, io) => choiceButtons(v, io, 'values', false),
  pads: (v, io) => choiceButtons(v, io, 'values pads', true),

  // A menu of choices with a cursor: a radio group, arrow keys included.
  list(v, io) {
    const list = el('div', 'menu-list');
    list.setAttribute('role', 'radiogroup');
    list.setAttribute('aria-labelledby', io.labelId);
    const items = (v.values || []).map((val) => {
      const item = button('menu-item', display(val.text));
      item.setAttribute('role', 'radio');
      item.dataset.value = val.text;
      item.onclick = () => choose(item);
      list.append(item);
      return item;
    });
    function choose(item) {
      if (!io.canUse()) return;
      setValue(item.dataset.value);
      io.emit(item.dataset.value, true);
    }
    function setValue(value) {
      let any = false;
      for (const item of items) {
        const checked = item.dataset.value === value;
        any ||= checked;
        item.classList.toggle('active', checked);
        item.setAttribute('aria-checked', String(checked));
        item.tabIndex = checked ? 0 : -1;
      }
      if (!any && items[0]) items[0].tabIndex = 0;
    }
    list.addEventListener('keydown', (e) => {
      const at = items.indexOf(document.activeElement);
      if (at < 0) return;
      const next = { ArrowDown: at + 1, ArrowRight: at + 1, ArrowUp: at - 1, ArrowLeft: at - 1,
                     Home: 0, End: items.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      const item = items[(next + items.length) % items.length];
      item.focus();
      choose(item);
    });
    return { el: list, setValue, setEnabled: (on) => { for (const i of items) i.disabled = !on; } };
  },

  // One choice at a time, stepped through: the compact way to hold many
  // choices on a small screen.
  cycle(v, io) {
    const values = (v.values || []).map((val) => val.text);
    const wrap = el('div', 'cycle');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-labelledby', io.labelId);
    const prev = button('step-button cycle-prev', '◂', `Previous ${io.label}`);
    const current = button('cycle-value');
    const text = el('span', 'cycle-text');
    const count = el('span', 'cycle-count');
    count.setAttribute('aria-hidden', 'true');
    current.append(text, count);
    const next = button('step-button cycle-next', '▸', `Next ${io.label}`);
    wrap.append(prev, current, next);

    let index = 0;
    function setValue(value) {
      index = Math.max(0, values.indexOf(value));
      text.textContent = display(values[index] ?? '');
      count.textContent = `${index + 1}/${values.length}`;
      current.setAttribute('aria-label', `${display(values[index] ?? '')}, ${index + 1} of ${values.length}. Next ${io.label}`);
    }
    function step(direction) {
      if (!io.canUse() || !values.length) return;
      const value = values[(index + direction + values.length) % values.length];
      setValue(value);
      io.emit(value, true);
    }
    prev.onclick = () => step(-1);
    current.onclick = () => step(1);
    next.onclick = () => step(1);
    return {
      el: wrap,
      setValue,
      setEnabled: (on) => { for (const b of [prev, current, next]) b.disabled = !on; },
    };
  },

  // A momentary action, not a value: it reports a tap and changes nothing
  // locally. The piece on the wall decides what it means.
  button(v, io) {
    const holder = el('div', 'trigger-control');
    const btn = button('trigger', v.label || display(v.name));
    btn.addEventListener('click', () => io.fire(btn));
    holder.append(btn);
    return { el: holder, setValue() {}, setEnabled: (on) => { btn.disabled = !on; } };
  },

  pad(v, io) {
    const holder = el('div', 'trigger-control');
    const btn = button('trigger pad', undefined);
    btn.append(el('span', 'pad-face', v.label || display(v.name)));
    btn.addEventListener('click', () => io.fire(btn));
    holder.append(btn);
    return { el: holder, setValue() {}, setEnabled: (on) => { btn.disabled = !on; } };
  },
};

// The tap feedback every trigger widget shares: the wall may be across the
// room, so a tap is confirmed on the phone too.
function flash(node) {
  node.classList.remove('fired');
  void node.offsetWidth;  // restart the animation rather than skip it
  node.classList.add('fired');
}

const loadedFonts = new Set();

// Dress an element -- the station's <body>, or the desk's preview frame -- in
// a panel's skin. Only allowlisted names and a re-checked colour get through.
export function applySkin(target, spec) {
  const skin = Object.prototype.hasOwnProperty.call(SKINS, spec.skin) ? spec.skin : 'commons';
  target.dataset.skin = skin;
  target.dataset.variant = spec.variant;
  if (/^#[0-9a-f]{6}$/.test(spec.accent)) target.style.setProperty('--p-accent', spec.accent);
  else target.style.removeProperty('--p-accent');
  const font = SKIN_FONTS[skin];
  if (font && !loadedFonts.has(font)) {
    loadedFonts.add(font);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = font;
    document.head.append(link);
  }
}

export function mountPanel(root, sketch, values = {}, {
  canUse = () => true,
  onVar = () => {},
  onCommit = () => {},
  onTrigger = () => true,
} = {}) {
  const spec = resolvePanel(sketch);
  const id = `panel${++mounted}`;
  const controls = new Map();
  const sections = [];
  let index = 0;
  root.replaceChildren();
  applySkin(root, spec);
  root.dataset.density = spec.density;
  root.style.setProperty('--columns', String(spec.columns));

  if (spec.title || spec.tagline) {
    const head = el('header', 'panel-head');
    if (spec.title) head.append(el('p', 'panel-title', spec.title));
    if (spec.tagline) head.append(el('p', 'panel-tagline', spec.tagline));
    root.append(head);
  }
  const body = el('div', 'panel-groups');
  root.append(body);

  for (const group of spec.groups) {
    const section = el('div', 'panel-group');
    if (group.title) {
      // The text gets its own span so a skin can set it on a solid patch.
      const title = el('h3', 'panel-group-title');
      title.append(el('span', '', group.title));
      title.id = `${id}-group-${sections.length}`;
      section.setAttribute('role', 'group');
      section.setAttribute('aria-labelledby', title.id);
      section.append(title);
    }
    for (const name of group.controls) {
      const v = spec.variables.get(name);
      const { widget: widgetName, hint } = spec.controls[name];
      const n = index++;
      const label = v.label || display(v.name);
      const wrap = el('fieldset', `knob widget-${widgetName}`);
      const legend = el('legend', '', label);
      legend.id = `${id}-label-${n}`;
      const sharing = el('p', 'control-sharing');
      wrap.append(legend, sharing);
      if (hint) wrap.append(el('p', 'control-hint', hint));
      const widget = WIDGETS[widgetName](v, {
        id: `${id}-${n}`,
        label,
        labelId: legend.id,
        canUse: () => canUse(name),
        emit: (value, commit) => onVar(name, value, commit),
        commit: () => onCommit(name),
        fire: (node) => { if (canUse(name) && onTrigger(name)) flash(node); },
      });
      if (v.type !== 'trigger') widget.setValue(values[name] ?? defaultValue(v));
      wrap.append(widget.el);
      section.append(wrap);
      controls.set(name, { wrap, sharing, widget, section });
    }
    body.append(section);
    sections.push(section);
  }

  return {
    spec,
    names: () => [...controls.keys()],
    select(name, value) { controls.get(name)?.widget.setValue(value); },
    // Hidden controls belong to someone else; a group left with none hides too.
    setControl(name, { visible, enabled, sharing }) {
      const control = controls.get(name);
      if (!control) return;
      control.wrap.hidden = !visible;
      control.widget.setEnabled(enabled);
      control.sharing.textContent = sharing;
    },
    refreshGroups() {
      for (const section of sections) {
        section.hidden = ![...controls.values()].some((c) => c.section === section && !c.wrap.hidden);
      }
    },
  };
}
