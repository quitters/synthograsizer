import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface NoteProps {
  /** 'error' switches from the indigo info tint to the red alert tint. */
  variant?: 'info' | 'error';
  children?: ReactNode;
  className?: string;
}

/**
 * Inline callout box for statuses and warnings. Indigo-tinted info by
 * default; the error variant is red. Preserves line breaks.
 */
export function Note({ variant = 'info', children, className }: NoteProps) {
  return (
    <div className={cx('vr-note', variant === 'error' && 'vr-error', className)}>
      {children}
    </div>
  );
}
