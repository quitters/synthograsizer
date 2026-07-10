import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';

export interface CheckFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Caption after the checkbox. */
  label: ReactNode;
  /** Muted hint after the label, e.g. cost or behavior notes. */
  hint?: ReactNode;
}

/**
 * Inline checkbox with a label and an optional muted hint —
 * e.g. "Consistent characters (adds ~20–35% cost)".
 */
export function CheckField({ label, hint, className, ...rest }: CheckFieldProps) {
  return (
    <label className={cx('vr-check', className)}>
      <input type="checkbox" {...rest} />
      {label}
      {hint != null && <small>{hint}</small>}
    </label>
  );
}
