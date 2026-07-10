import { Toast } from '@synthograsizer/design-system';

export const Saved = () => <Toast>Prompt saved</Toast>;

export const Error = () => <Toast variant="error">Retake failed: content filter</Toast>;

export const Stack = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380 }}>
    <Toast>Retaking shot 3</Toast>
    <Toast>Prompt saved</Toast>
    <Toast variant="error">Budget cap reached</Toast>
  </div>
);
