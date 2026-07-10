import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface StateChipProps {
  children?: ReactNode;
  className?: string;
}

/**
 * Uppercase teal status pill, e.g. "RENDERING" or "done · qc 8".
 * Sits inline next to headings in a `TitleRow`.
 */
export function StateChip({ children, className }: StateChipProps) {
  return <span className={cx('vr-state', className)}>{children}</span>;
}
