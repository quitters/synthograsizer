---
category: Controls
---

Labeled form field: a small caption over a full-width control. Pass a raw `<input>`, `<textarea>`, or `<select>` as the child — the suite's stylesheet styles those elements directly (dark inset field, rounded hairline border), so no styled input component is needed.

```jsx
<FormField label="Describe the set">
  <textarea rows={3} placeholder="e.g. late-night 1980s city-pop TV performances…" />
</FormField>

<FieldRow>
  <FormField label="Clips"><input type="number" defaultValue={30} /></FormField>
  <FormField label="Signal path">
    <select><option>auto (writer picks)</option><option>VHS camcorder</option></select>
  </FormField>
  <FormField label="Budget cap $"><input type="number" defaultValue={300} /></FormField>
</FieldRow>
```
