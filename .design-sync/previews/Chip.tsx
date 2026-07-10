import { Chip, ChipRow } from '@synthograsizer/design-system';

export const Variations = () => (
  <ChipRow>
    <Chip title="rewrite in golden-hour light">golden hour</Chip>
    <Chip title="switch to a handheld camcorder look">handheld camcorder</Chip>
    <Chip title="add a slow push-in">slow zoom</Chip>
    <Chip title="drop the crowd, isolate the band">empty room</Chip>
  </ChipRow>
);

export const Single = () => <Chip>golden hour</Chip>;
