# Synthograsizer Suite — how to build with this design system

This DS is the suite's identity for its landing / Videorama / Glitcher surfaces: **light-first, warm-cream, teal-forward** (cozy pastel minimalist, functional lo-fi). It's expressed as thin React wrappers over the suite's real CSS. Components carry their own styling through the suite's class vocabulary; you supply layout glue with the suite's **CSS custom properties** (design tokens). There is **no utility-class framework** (no Tailwind) and **no theme-prop system** — style through the `var(--suite-*)` tokens, never raw hex.

**Light is the default; teal leads.** Backgrounds are warm cream/paper, text is warm dark ink, and the accent/action color is **teal** — not purple. A dark theme is available but opt-in: put `data-theme="dark"` on an ancestor (`Surface` handles the rest). Build light unless asked otherwise.

## Setup: wrap every screen in `Surface`

Components assume the page provides the background and base text color. **Wrap each screen in `Surface`** — it establishes `--suite-bg`, `--suite-text`, and the UI font (it's the `body` the components expect). Without it, components render on the browser-default white and look wrong. No other provider/context is needed.

```jsx
<Surface>
  <HeaderBar title="VIDEORAMA" tag="prompt → stylized video sets" backHref="/">api ok</HeaderBar>
  <AppShell sidebar={
    <SideNav heading="Projects" items={projects}>
      <Button variant="primary">+ New Set</Button>
    </SideNav>
  }>
    <Panel title="New video set">
      <FormField label="Describe the set"><textarea rows={3} /></FormField>
      <FieldRow>
        <FormField label="Clips"><input type="number" defaultValue={30} /></FormField>
        <FormField label="Budget cap $"><input type="number" defaultValue={300} /></FormField>
      </FieldRow>
      {/* layout glue you write yourself: colors come from the tokens, never hex */}
      <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
        <Button variant="primary">Write brief</Button>
        <StateChip>writing</StateChip>
        <span style={{ color: 'var(--suite-text-mute)', fontFamily: 'var(--suite-font-mono)' }}>
          ~30 shots
        </span>
      </div>
    </Panel>
  </AppShell>
</Surface>
```

`FormField` styles raw `<input>` / `<textarea>` / `<select>` children directly — pass native form elements, don't reach for a styled input component (there isn't one).

## The token vocabulary (style your own glue with these)

Color and type come from `--suite-*` custom properties (defined in `styles.css`). Use them for any layout/markup you add:

- **Brand hues** — `--suite-teal` (the **lead** accent/action color for these light surfaces — buttons, links, active states, tool titles), `--suite-indigo` / `--suite-indigo-2` (secondary; indigo is Synthograsizer's signature, used sparingly here), `--suite-fuchsia` (Taste Profile accent; also a warm rose in light), `--suite-amber`, `--suite-rose`, `--suite-green` (success), `--suite-red` (danger). RGB triplets exist for `rgba()`: `--suite-teal-rgb`, `--suite-indigo-rgb`, …
- **Elevation ramp** (warm-cream page → paper) — `--suite-bg` (cream page), `--suite-bg-raised` (paper; panels, headers, toasts), plus `--suite-bg-2…5` and `--suite-bg-hover` for recessed/hover tints.
- **Surfaces / borders** — `--suite-surface`, `--suite-surface-hi`, `--suite-border`, `--suite-border-hi` (warm brown-grey ink).
- **Text** — `--suite-text` (warm dark ink), `--suite-text-mute`, `--suite-text-dim`.
- **Type** — `--suite-font-display` (Space Grotesk; letter-spaced tool titles), `--suite-font-ui` (Inter; UI/body), `--suite-font-mono` (JetBrains Mono; code, prompts, data).

Accent rule: **lead with teal** for focus rings, active states, headers, and the primary action; reserve indigo/fuchsia as secondary. Keep the warm-cream surfaces underneath. Panels sit on `--suite-bg-raised` (paper) above the `--suite-bg` (cream) page.

## Where the truth lives

- **`styles.css`** — the single stylesheet entry; it `@import`s the tokens, the self-hosted fonts, and the component styles (`_ds_bundle.css`). Link this one file; read it to see the exact token values and the `.vr-*` component classes.
- **Per-component docs** — each component's `.prompt.md` has its API and a realistic usage example drawn from the real app.
- `ColorPalette` and `TypeRamp` are live reference components — render them to see the palette and type ramp in place.

## Building the pastel direction

The active exploratory direction (cozy pastel minimalist, functional lo-fi) applies to **the landing page, Videorama, and Glitcher** — not Synthograsizer's main app, which stays as-is. Keep these components' structure and ergonomics; re-skin toward the pastel seeds. See `guidelines/design-direction.md` for the palette seeds and hard constraints.
