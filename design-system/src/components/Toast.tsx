import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface ToastProps {
  /** 'error' switches the teal border to red. */
  variant?: 'default' | 'error';
  children?: ReactNode;
  className?: string;
}

/**
 * Notification toast: raised surface, teal border, soft shadow. The app
 * stacks these fixed at the bottom-right; standalone it renders in flow.
 */
export function Toast({ variant = 'default', children, className }: ToastProps) {
  return (
    <div className={cx('vr-toast', variant === 'error' && 'error', className)}>
      {children}
    </div>
  );
}
