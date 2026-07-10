import { Meter } from '@synthograsizer/design-system';

export const Budget = () => <Meter value={47} label="$142 / $300" />;

export const Levels = () => (
  <div style={{ display: 'grid', gap: 12 }}>
    <Meter value={12} label="$36 / $300" />
    <Meter value={47} label="$142 / $300" />
    <Meter value={92} label="$276 / $300" />
  </div>
);
