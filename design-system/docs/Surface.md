---
category: Layout
---

Establishes the suite's **page canvas** — the background, base text color, and UI font the app's `body` provides. The default is the warm-cream light identity; add `data-theme="dark"` on an ancestor to switch the whole subtree to the dark theme. Its components are designed to sit on `--suite-bg`, so wrap a screen (or any region rendered outside the app `body`) in a `Surface` so they render on the background they expect. It carries only the tokens, no literal colors.

```jsx
<Surface>
  <HeaderBar title="VIDEORAMA" tag="prompt → stylized video sets" backHref="/" />
  <AppShell sidebar={<SideNav heading="Projects" items={projects} />}>
    <Panel title="New video set">…</Panel>
  </AppShell>
</Surface>
```
