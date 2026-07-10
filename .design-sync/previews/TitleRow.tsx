import {
  TitleRow,
  StateChip,
  Button,
  CheckField,
} from '@synthograsizer/design-system';

export const ProjectHeader = () => (
  <TitleRow title="City-pop TV night">
    <StateChip>rendering</StateChip>
    <Button title="Refresh now">⟳</Button>
    <Button variant="ghost">Stop farm</Button>
  </TitleRow>
);

export const SectionHeader = () => (
  <TitleRow title="Shots" level={3}>
    <CheckField label="low QC only" />
    <Button disabled>Retake selected</Button>
  </TitleRow>
);
