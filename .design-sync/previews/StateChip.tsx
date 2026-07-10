import { StateChip, TitleRow } from '@synthograsizer/design-system';

export const InContext = () => (
  <TitleRow title="City-pop TV night">
    <StateChip>rendering</StateChip>
  </TitleRow>
);

export const States = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    <StateChip>writing</StateChip>
    <StateChip>rendering</StateChip>
    <StateChip>done · qc 8</StateChip>
    <StateChip>stopped</StateChip>
  </div>
);
