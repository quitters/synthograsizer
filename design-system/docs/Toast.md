---
category: Feedback
---

Notification toast on a raised surface with a teal border (red for errors). The app stacks them fixed at the bottom-right corner; the component itself renders in flow, so position the stack in your layout.

```jsx
<Toast>Prompt saved</Toast>
<Toast variant="error">Retake failed: content filter</Toast>
```
