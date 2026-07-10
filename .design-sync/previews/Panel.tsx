import { Panel, FormField, FieldRow, Button } from '@synthograsizer/design-system';

export const NewVideoSet = () => (
  <Panel title="New video set">
    <FormField label="Describe the set">
      <textarea
        rows={3}
        defaultValue="late-night 1980s Japanese city-pop TV performances where the band is slightly wrong…"
      />
    </FormField>
    <FieldRow>
      <FormField label="Clips">
        <input type="number" defaultValue={30} />
      </FormField>
      <FormField label="Budget cap $">
        <input type="number" defaultValue={300} />
      </FormField>
    </FieldRow>
    <Button variant="primary">Write brief</Button>
  </Panel>
);

export const Empty = () => (
  <Panel title="Cast &amp; Locations">
    <p style={{ opacity: 0.6, fontSize: 13 }}>
      No reference sheets yet — drop an image to pin a character or location.
    </p>
  </Panel>
);
