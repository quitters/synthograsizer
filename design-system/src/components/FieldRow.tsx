import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface FieldRowProps {
  children?: ReactNode;
  className?: string;
}

/**
 * Horizontal row of `FormField`s (each field flexes equally) — the suite's
 * standard way to pack related inputs onto one line. Stacks under 760px.
 */
export function FieldRow({ children, className }: FieldRowProps) {
  return <div className={cx('vr-row', className)}>{children}</div>;
}
