import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface HeaderBarProps {
  /** Tool name — rendered in the display font, letter-spaced, teal accent. */
  title: string;
  /** Short muted descriptor beside the title, e.g. "prompt → stylized video sets". */
  tag?: string;
  /** Href for the back link to the suite hub; omit to hide it. */
  backHref?: string;
  /** Back link text. */
  backLabel?: string;
  /** Right-aligned slot (health/status text). */
  children?: ReactNode;
  className?: string;
}

/**
 * Top app bar for a suite tool: back link, tool title, tagline, and a
 * right-aligned status slot, on a raised background with a bottom border.
 */
export function HeaderBar({
  title,
  tag,
  backHref,
  backLabel = '← Suite',
  children,
  className,
}: HeaderBarProps) {
  return (
    <header className={cx('vr-header', className)}>
      {backHref && (
        <a className="vr-back" href={backHref}>
          {backLabel}
        </a>
      )}
      <h1>{title}</h1>
      {tag && <span className="vr-tag">{tag}</span>}
      {children != null && <span className="vr-health">{children}</span>}
    </header>
  );
}
