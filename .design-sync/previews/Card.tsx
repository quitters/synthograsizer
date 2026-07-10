import { Card } from '@synthograsizer/design-system';

// Stand-in for a rendered clip's <video> poster — external media can't load in
// the preview, so a 16:9 gradient tile reads as the thumbnail without 404ing.
const Thumb = ({ hue = 'var(--suite-indigo)' }: { hue?: string }) => (
  <div
    style={{
      aspectRatio: '16 / 9',
      borderRadius: 6,
      background: `linear-gradient(135deg, ${hue}, var(--suite-bg-4))`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 22,
      color: 'rgba(255,255,255,.8)',
    }}
  >
    ▶
  </div>
);

export const ShotCard = () => (
  <Card
    pickable
    media={<Thumb hue="var(--suite-teal)" />}
    title="3. Neon rooftop chorus"
    qc="8.5"
    notes="clean — slight banding in the sky"
  />
);

export const LowQC = () => (
  <Card
    pickable
    media={<Thumb hue="var(--suite-rose)" />}
    title="7. Crowd pan"
    qc="4.1"
    qcBad
    notes="faces smear at 3s — queued for retake"
  />
);

export const TemplateCard = () => (
  <Card
    template
    title="city pop tv"
    preset="VHS"
    notes="late-night broadcast, band slightly wrong"
  />
);

export const Selected = () => (
  <Card
    pickable
    picked
    selected
    media={<Thumb hue="var(--suite-indigo)" />}
    title="1. Opening pan"
    qc="9.0"
    notes="hero shot"
  />
);

export const Excluded = () => (
  <Card
    pickable
    excluded
    media={<Thumb hue="var(--suite-bg-5)" />}
    title="12. Alt ending"
    qc="5.2"
    notes="cut from the sequence"
  />
);
