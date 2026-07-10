---
category: Controls
---

The suite's standard button. Outlined on the dark surface with an indigo hover border; `variant="primary"` is the one filled indigo call-to-action per view; `variant="ghost"` pushes itself to the right edge of its row (used for destructive/secondary actions like "Stop farm"). Accepts all native button props.

```jsx
<Button variant="primary">Write brief</Button>
<Button>Suggest variations</Button>
<Button variant="ghost" onClick={stop}>Stop farm</Button>
<Button disabled>Retake selected</Button>
```

Cost-bearing actions put the estimate right in the label: `Save & Retake (~$0.35–0.70)`.
