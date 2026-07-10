import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface TakesTableProps {
  /** Column headers. */
  headers: ReactNode[];
  /** Row cells, one array per row. */
  rows: ReactNode[][];
  className?: string;
}

/**
 * Compact data table with hairline row separators — used for a shot's
 * take history (#, status, qc, notes, age).
 */
export function TakesTable({ headers, rows, className }: TakesTableProps) {
  return (
    <table className={cx('vr-takes', className)}>
      <tbody>
        <tr>
          {headers.map((h, i) => (
            <th key={i}>{h}</th>
          ))}
        </tr>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
