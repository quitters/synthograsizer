import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface LogDisclosureProps {
  /** Disclosure summary text. */
  summary?: ReactNode;
  /** Log text, rendered in a scrollable monospace `<pre>`. */
  children?: ReactNode;
  /** Render expanded. */
  open?: boolean;
  className?: string;
}

/**
 * Collapsed-by-default disclosure holding a scrollable log `<pre>` —
 * keeps pipeline noise out of the way until it's needed.
 */
export function LogDisclosure({
  summary = 'Pipeline log',
  children,
  open,
  className,
}: LogDisclosureProps) {
  return (
    <details className={cx('vr-log', className)} open={open}>
      <summary>{summary}</summary>
      <pre>{children}</pre>
    </details>
  );
}
