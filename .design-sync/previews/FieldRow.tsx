import { FieldRow, FormField, Button } from '@synthograsizer/design-system';

export const ThreeUp = () => (
  <FieldRow>
    <FormField label="Clips">
      <input type="number" defaultValue={30} />
    </FormField>
    <FormField label="Signal path">
      <select defaultValue="vhs">
        <option value="auto">auto (writer picks)</option>
        <option value="vhs">VHS camcorder</option>
      </select>
    </FormField>
    <FormField label="Budget cap $">
      <input type="number" defaultValue={300} />
    </FormField>
  </FieldRow>
);

export const InputWithButton = () => (
  <FieldRow>
    <input placeholder="restyle direction (rewrites every prompt, re-renders all)…" />
    <Button>Restyle</Button>
  </FieldRow>
);
