import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface AppShellProps {
  /** Left column — typically a `SideNav`. */
  sidebar: ReactNode;
  /** Main column — typically one or more `Panel`s. */
  children: ReactNode;
  className?: string;
}

/**
 * Two-column tool-page scaffold: a fixed 230px sidebar and a fluid main
 * column, on the suite's darkest page background. Collapses to a single
 * column under 760px. Compose as `<AppShell sidebar={<SideNav …/>}>…`.
 */
export function AppShell({ sidebar, children, className }: AppShellProps) {
  return (
    <main className={cx('vr-main', className)}>
      {sidebar}
      <div>{children}</div>
    </main>
  );
}
