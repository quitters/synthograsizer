import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface CardGridProps {
  children?: ReactNode;
  className?: string;
}

/** Responsive auto-fill grid of `Card`s (min 240px columns). */
export function CardGrid({ children, className }: CardGridProps) {
  return <div className={cx('vr-grid', className)}>{children}</div>;
}
