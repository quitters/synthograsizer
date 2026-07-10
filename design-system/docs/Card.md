---
category: Content
---

Grid card for shots, templates, and reference assets. Shot cards: media on top, a pick checkbox + "seq. Title" + QC score in the title row, QC notes below. Template cards (`template`) get a pointer cursor, indigo hover border, and an uppercase `preset` chip. `selected` recolors the border teal; `excluded` dims the card and marks the title.

```jsx
<Card
  pickable
  title="3. Neon rooftop chorus"
  qc="8.5"
  notes="clean — slight banding in the sky"
  media={<video src="/films/rooftop.mp4" controls />}
/>

<Card template title="city pop tv" preset="VHS"
  notes="late-night broadcast, slightly wrong band" />

<Card title="7. Crowd pan" qc="4.1" qcBad excluded notes="faces smear" />
```
