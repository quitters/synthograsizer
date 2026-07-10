import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface ActionRowProps {
  children?: ReactNode;
  className?: string;
}

/** Wrapping flex row of action `Button`s with the suite's standard gap. */
export function ActionRow({ children, className }: ActionRowProps) {
  return <div className={cx('vr-actions', className)}>{children}</div>;
}
