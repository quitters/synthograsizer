import {
  Modal,
  FormField,
  ChipRow,
  Chip,
  ActionRow,
  Button,
  TakesTable,
} from '@synthograsizer/design-system';

export const ShotInspector = () => (
  <Modal title="3. Neon rooftop chorus" state="done · qc 8" onClose={() => {}}>
    <div
      style={{
        aspectRatio: '16 / 9',
        borderRadius: 8,
        background: 'linear-gradient(135deg, var(--suite-teal), var(--suite-bg-4))',
        marginBottom: 12,
      }}
    />
    <FormField label="Prompt">
      <textarea
        defaultValue="neon-lit rooftop at night, city-pop band mid-chorus, VHS bloom, slight tracking wobble"
      />
    </FormField>
    <ChipRow>
      <Chip>golden hour</Chip>
      <Chip>handheld camcorder</Chip>
      <Chip>slow zoom</Chip>
    </ChipRow>
    <ActionRow>
      <Button>Save</Button>
      <Button variant="primary">Save &amp; Retake (~$0.35–0.70)</Button>
      <Button>Suggest variations</Button>
    </ActionRow>
    <TakesTable
      headers={['#', 'status', 'qc', 'notes', 'age', '']}
      rows={[
        ['1', 'filtered', '', 'content filter', '5h', ''],
        ['2', 'done', '8.5', 'clean take', '1h', <a href="#">⏵</a>],
      ]}
    />
  </Modal>
);
