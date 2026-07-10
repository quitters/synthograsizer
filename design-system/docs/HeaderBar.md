---
category: Layout
---

Top app bar for a suite tool: back link to the hub, letter-spaced teal title in the display font, a muted tagline, and a right-aligned status slot.

```jsx
<HeaderBar title="VIDEORAMA" tag="prompt → stylized video sets" backHref="/">
  api ok · $12 today
</HeaderBar>
```

The `children` slot is for lightweight status text (health checks, connection state) — actions belong in the page body, not the header.
