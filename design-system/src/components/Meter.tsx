import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface MeterProps {
  /** Fill percentage, 0–100. */
  value: number;
  /** Trailing caption, e.g. "$142 / $300". */
  label?: ReactNode;
  className?: string;
}

/**
 * Slim progress meter with an indigo→teal gradient fill and an optional
 * trailing caption — used for budget/spend tracking.
 */
export function Meter({ value, label, className }: MeterProps) {
  const width = `${Math.max(0, Math.min(100, value))}%`;
  return (
    <div className={cx('vr-meter-row', className)}>
      <div className="vr-meter">
        <div style={{ width }} />
      </div>
      {label != null && <span>{label}</span>}
    </div>
  );
}
