---
category: Layout
---

The suite's primary content surface — raised background, hairline border, 14px radius. One Panel per view region; forms, dashboards, and detail content all sit inside one.

```jsx
<Panel title="New video set">
  <FormField label="Describe the set"><textarea rows={3} /></FormField>
  <Button variant="primary">Write brief</Button>
</Panel>
```

Skip the `title` prop when composing a custom heading with `TitleRow`.
