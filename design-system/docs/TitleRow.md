---
category: Layout
---

Keeps a heading and its inline status/actions on one baseline — project name + `StateChip` + a ghost stop button, or a section header with a filter checkbox.

```jsx
<TitleRow title="City-pop TV night">
  <StateChip>rendering</StateChip>
  <Button title="Refresh now">⟳</Button>
  <Button variant="ghost">Stop farm</Button>
</TitleRow>

<TitleRow title="Shots" level={3}>
  <CheckField label="low QC only" />
  <Button disabled>Retake selected</Button>
</TitleRow>
```
