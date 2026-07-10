import {
  AppShell,
  HeaderBar,
  SideNav,
  Panel,
  FormField,
  FieldRow,
  Button,
} from '@synthograsizer/design-system';

const projects = [
  { label: 'City-pop TV night', status: 'rendering · $42', active: true },
  { label: 'Security time-lapse', status: 'done · $118' },
];

export const FullPage = () => (
  <div>
    <HeaderBar title="VIDEORAMA" tag="prompt → stylized video sets" backHref="#">
      api ok
    </HeaderBar>
    <AppShell
      sidebar={
        <SideNav heading="Projects" items={projects}>
          <Button variant="primary">+ New Set</Button>
        </SideNav>
      }
    >
      <Panel title="New video set">
        <FormField label="Describe the set">
          <textarea rows={3} defaultValue="neon-lit rooftop chorus, VHS bloom…" />
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
    </AppShell>
  </div>
);
