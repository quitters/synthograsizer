import {
  Surface,
  TitleRow,
  StateChip,
  Note,
  Button,
} from '@synthograsizer/design-system';

export const DarkCanvas = () => (
  <Surface>
    <TitleRow title="City-pop TV night">
      <StateChip>rendering</StateChip>
      <Button variant="ghost">Stop farm</Button>
    </TitleRow>
    <Note>The dark background, text color, and font all come from Surface.</Note>
  </Surface>
);
