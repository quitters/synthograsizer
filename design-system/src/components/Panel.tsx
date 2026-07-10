import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface PanelProps {
  /** Panel heading, rendered as an `<h2>`. */
  title?: string;
  children?: ReactNode;
  className?: string;
}

/**
 * The suite's primary content surface: a raised, bordered, rounded panel.
 * Forms, dashboards, and detail views all live inside Panels.
 */
export function Panel({ title, children, className }: PanelProps) {
  return (
    <section className={cx('vr-panel', className)}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
