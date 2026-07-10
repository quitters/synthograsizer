---
category: Content
---

Full-screen inspector overlay: dimmed backdrop, centered raised box (max 760px, scrollable). Title row carries the heading, a status pill, and the ghost ✕ close. Backdrop click closes.

```jsx
<Modal title="3. Neon rooftop chorus" state="done · qc 8" onClose={close}>
  <FormField label="Prompt"><textarea defaultValue={prompt} /></FormField>
  <ChipRow><Chip>golden hour</Chip><Chip>handheld</Chip></ChipRow>
  <ActionRow>
    <Button>Save</Button>
    <Button variant="primary">Save &amp; Retake (~$0.35–0.70)</Button>
  </ActionRow>
  <TakesTable headers={['#','status','qc','notes']} rows={takes} />
</Modal>
```
