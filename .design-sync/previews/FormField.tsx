import { FormField, FieldRow } from '@synthograsizer/design-system';

export const Textarea = () => (
  <FormField label="Describe the set">
    <textarea
      rows={3}
      defaultValue="late-night 1980s city-pop TV performances, band slightly wrong…"
    />
  </FormField>
);

export const Select = () => (
  <FormField label="Signal path">
    <select defaultValue="vhs">
      <option value="auto">auto (writer picks)</option>
      <option value="vhs">VHS camcorder</option>
      <option value="publicaccess">Public-access studio</option>
      <option value="betacam">Betacam / corporate</option>
    </select>
  </FormField>
);

export const NumberRow = () => (
  <FieldRow>
    <FormField label="Clips">
      <input type="number" defaultValue={30} />
    </FormField>
    <FormField label="Budget cap $">
      <input type="number" defaultValue={300} />
    </FormField>
  </FieldRow>
);
