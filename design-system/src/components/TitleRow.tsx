import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface TitleRowProps {
  title: string;
  /** Heading level: 2 (default) for panel titles, 3 for section sub-headers. */
  level?: 2 | 3;
  /** Inline content after the title — `StateChip`s, `Button`s, filters. */
  children?: ReactNode;
  className?: string;
}

/**
 * Heading row that keeps a title and its inline status/actions on one
 * baseline — e.g. a project name next to its `StateChip` and a ghost
 * "Stop farm" button.
 */
export function TitleRow({ title, level = 2, children, className }: TitleRowProps) {
  return (
    <div className={cx('vr-title-row', className)}>
      {level === 3 ? <h3>{title}</h3> : <h2>{title}</h2>}
      {children}
    </div>
  );
}
