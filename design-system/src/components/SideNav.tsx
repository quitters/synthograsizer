import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface SideNavItem {
  label: string;
  /** Secondary status line under the label, e.g. "rendering · $42". */
  status?: string;
  /** Indigo-bordered active state. */
  active?: boolean;
  onSelect?: () => void;
}

export interface SideNavProps {
  /** Uppercase-tracked section heading above the list, e.g. "Projects". */
  heading?: string;
  items?: SideNavItem[];
  /** Slot above the heading — typically a primary `Button` (e.g. "+ New Set"). */
  children?: ReactNode;
  className?: string;
}

/**
 * Sidebar list navigation: an optional action slot, a muted section
 * heading, and selectable rows with an optional status sub-line. The
 * active row gets an indigo border.
 */
export function SideNav({ heading, items = [], children, className }: SideNavProps) {
  return (
    <aside className={cx('vr-side', className)}>
      {children}
      {heading && <h2>{heading}</h2>}
      <ul>
        {items.map((it, i) => (
          <li key={i} className={cx(it.active && 'active')} onClick={it.onSelect}>
            {it.label}
            {it.status && <span className="st">{it.status}</span>}
          </li>
        ))}
      </ul>
    </aside>
  );
}
