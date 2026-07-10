import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../cx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * 'primary' = filled indigo call-to-action; 'ghost' = outlined and pushed
   * to the right edge of its row; 'default' = outlined, indigo border on hover.
   */
  variant?: 'default' | 'primary' | 'ghost';
}

/**
 * The suite's standard button. Outlined on the dark surface by default;
 * one filled indigo primary per view; disabled state dims to 35%.
 */
export function Button({ variant = 'default', className, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(
        'vr-btn',
        variant === 'primary' && 'vr-btn-primary',
        variant === 'ghost' && 'vr-btn-ghost',
        className,
      )}
      {...rest}
    />
  );
}
