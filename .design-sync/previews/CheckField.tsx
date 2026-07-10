import { CheckField, FieldRow } from '@synthograsizer/design-system';

export const WithHints = () => (
  <FieldRow>
    <CheckField
      label="Consistent characters"
      hint="character bible + keyframes (adds ~20–35% cost)"
    />
    <CheckField label="Full auto" hint="skip approval checkpoints" defaultChecked />
  </FieldRow>
);

export const Plain = () => <CheckField label="low QC only" />;
