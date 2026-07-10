import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface BadgeProps {
  children?: ReactNode;
  className?: string;
}

/**
 * Small red uppercase alert badge — used for likeness/content flags that
 * need attention without blocking the flow.
 */
export function Badge({ children, className }: BadgeProps) {
  return <span className={cx('vr-badge-like', className)}>{children}</span>;
}
