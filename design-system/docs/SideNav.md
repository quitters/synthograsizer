---
category: Layout
---

Sidebar list navigation for the `AppShell` sidebar slot: an action slot (usually one primary `Button`), a muted uppercase heading, and selectable rows with an optional status sub-line. The active row gets an indigo border.

```jsx
<SideNav
  heading="Projects"
  items={[
    { label: 'City-pop TV night', status: 'rendering · $42', active: true },
    { label: 'Security time-lapse', status: 'done · $118' },
  ]}
>
  <Button variant="primary">+ New Set</Button>
</SideNav>
```
