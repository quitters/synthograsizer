// Resolves a sketch into the panel a phone draws: which widget each control
// gets and how controls are grouped. Pure, with no DOM, so node can test it.
//
// Without a `ui` spec every control gets its type's default widget in a single
// untitled group -- exactly the panel The Commons has always drawn.

export const DEFAULT_WIDGET = { number: 'slider', select: 'buttons', trigger: 'button' };

export function controlType(variable) {
  return variable.type === 'number' || variable.type === 'trigger' ? variable.type : 'select';
}

export function resolvePanel(sketch) {
  const variables = (sketch?.variables || []).filter((v) => v && typeof v.name === 'string');
  const controls = {};
  for (const v of variables) controls[v.name] = { widget: DEFAULT_WIDGET[controlType(v)], hint: '' };
  return {
    skin: 'commons',
    variant: '',
    title: '',
    tagline: '',
    accent: '',
    groups: [{ title: '', controls: variables.map((v) => v.name) }],
    controls,
    density: 'roomy',
    columns: 1,
    variables: new Map(variables.map((v) => [v.name, v])),
  };
}
