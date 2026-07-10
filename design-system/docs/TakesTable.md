---
category: Content
---

Compact data table with hairline row separators — take history in the shot inspector. Keep it dense: short cells, muted tones, links as glyphs.

```jsx
<TakesTable
  headers={['#', 'status', 'qc', 'notes', 'age', '']}
  rows={[
    ['1', 'filtered', '', 'content filter', '4h', ''],
    ['2', 'done', '8.5', 'clean take', '2h', <a href="#">⏵</a>],
  ]}
/>
```
