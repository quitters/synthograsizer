import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface FormFieldProps {
  /** Field caption, rendered above the control. */
  label: ReactNode;
  /**
   * The control — a raw `<input>`, `<textarea>`, or `<select>`. The suite
   * styles these elements directly (dark inset field, rounded border).
   */
  children: ReactNode;
  className?: string;
}

/**
 * Labeled form field: small caption over a full-width dark control.
 * Place several inside a `FieldRow` to lay them out side by side.
 */
export function FormField({ label, children, className }: FormFieldProps) {
  return (
    <label className={cx(className)}>
      {label}
      {children}
    </label>
  );
}
