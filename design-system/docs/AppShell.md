---
category: Layout
---

Two-column tool-page scaffold on the suite's darkest background: 230px sidebar + fluid main column. Pair with `HeaderBar` above it for the full page frame.

```jsx
<HeaderBar title="VIDEORAMA" tag="prompt → stylized video sets" backHref="/" />
<AppShell sidebar={<SideNav heading="Projects" items={projects} />}>
  <Panel title="New video set">…</Panel>
</AppShell>
```
