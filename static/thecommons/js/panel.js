// The control panel a participant holds, drawn from a sketch and its optional
// `ui` spec. Shared by the phone station and the creator desk's preview.
//
// SECURITY. A `ui` spec is model output, so it is treated as data and never as
// markup. Every string reaches the page through textContent, and every choice
// has already been checked against an allowlist by panel-spec.js. Nothing in a
// spec can add an element, a style rule, a URL or a script. That is why the
// same panel can render on the signed-in desk as safely as on an anonymous
// phone.
//
// The panel only draws and reports. Who may touch what, the socket, and how
// often values are sent all stay with the caller.
import { defaultValue, numericValue } from './parameters.js';
import { resolvePanel } from './panel-spec.js';

let mounted = 0;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const display = (text) => String(text).replaceAll('_', ' ');

// Each widget returns { el, setValue(value), setEnabled(enabled) }.
// `io.emit(value, commit)` reports a new value; commit=false marks a value
// that is still being dragged, so the caller can coalesce it.
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

  buttons(v, io) {
    const row = el('div', 'values');
    const buttons = (v.values || []).map((val) => {
      const btn = el('button', '', display(val.text));
      btn.type = 'button';
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
  },

  // A momentary action, not a value: it reports a tap and changes nothing
  // locally. The piece on the wall decides what it means.
  button(v, io) {
    const holder = el('div', 'trigger-control');
    const btn = el('button', 'trigger', v.label || display(v.name));
    btn.type = 'button';
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

  for (const group of spec.groups) {
    const section = el('div', 'panel-group');
    if (group.title) section.append(el('h3', 'panel-group-title', group.title));
    for (const name of group.controls) {
      const v = spec.variables.get(name);
      const n = index++;
      const wrap = el('fieldset', 'knob');
      const legend = el('legend', '', v.label || display(v.name));
      legend.id = `${id}-label-${n}`;
      const sharing = el('p', 'control-sharing');
      wrap.append(legend, sharing);
      const widget = WIDGETS[spec.controls[name].widget](v, {
        id: `${id}-${n}`,
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
    root.append(section);
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
