import { Button, ActionRow } from '@synthograsizer/design-system';

export const Primary = () => <Button variant="primary">Write brief</Button>;

export const Default = () => <Button>Suggest variations</Button>;

export const Ghost = () => <Button variant="ghost">Stop farm</Button>;

export const Disabled = () => <Button disabled>Retake selected</Button>;

export const WithCostEstimate = () => (
  <Button variant="primary">Save &amp; Retake (~$0.35–0.70)</Button>
);

export const Row = () => (
  <ActionRow>
    <Button>Save</Button>
    <Button variant="primary">Save &amp; Retake</Button>
    <Button>Suggest variations</Button>
  </ActionRow>
);
