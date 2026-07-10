import { CardGrid, Card } from '@synthograsizer/design-system';

const Thumb = ({ hue }: { hue: string }) => (
  <div
    style={{
      aspectRatio: '16 / 9',
      borderRadius: 6,
      background: `linear-gradient(135deg, ${hue}, var(--suite-bg-4))`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 20,
      color: 'rgba(255,255,255,.8)',
    }}
  >
    ▶
  </div>
);

export const ShotGrid = () => (
  <CardGrid>
    <Card pickable picked selected media={<Thumb hue="var(--suite-indigo)" />}
      title="1. Opening pan" qc="9.0" notes="hero shot" />
    <Card pickable media={<Thumb hue="var(--suite-teal)" />}
      title="2. Band close-up" qc="8.2" notes="clean take" />
    <Card pickable media={<Thumb hue="var(--suite-rose)" />}
      title="3. Crowd pan" qc="4.1" qcBad notes="faces smear at 3s" />
    <Card pickable excluded media={<Thumb hue="var(--suite-bg-5)" />}
      title="4. Alt ending" qc="5.2" notes="cut from the sequence" />
  </CardGrid>
);

export const TemplatePicker = () => (
  <CardGrid>
    <Card template title="city pop tv" preset="VHS" notes="late-night broadcast" />
    <Card template title="security cam" preset="CCTV" notes="fixed angle, time-lapse" />
    <Card template title="news field" preset="ENG" notes="handheld ENG package" />
  </CardGrid>
);
