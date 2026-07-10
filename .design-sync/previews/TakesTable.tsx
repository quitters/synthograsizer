import { TakesTable } from '@synthograsizer/design-system';

export const History = () => (
  <TakesTable
    headers={['#', 'status', 'qc', 'notes', 'age', '']}
    rows={[
      ['1', 'filtered', '', 'content filter', '5h', ''],
      ['2', 'done', '4.2', 'hands melt at 3s', '4h', <a href="#">⏵</a>],
      ['3', 'done', '8.5', 'clean take', '1h', <a href="#">⏵</a>],
    ]}
  />
);
