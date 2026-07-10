import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface SurfaceProps {
  children?: ReactNode;
  className?: string;
}

/**
 * Establishes the suite's page canvas — the background, base text color, and UI
 * font that the app's `body` normally provides. Default is the warm-cream light
 * identity; add `data-theme="dark"` on an ancestor for the dark theme. Wrap a
 * screen (or any region rendered outside the app shell) in a Surface so the
 * components sit on the background they're designed for. Mirrors the suite's
 * `body` rule; it carries no color values of its own, only the tokens.
 */
export function Surface({ children, className }: SurfaceProps) {
  return (
    <div
      className={cx('vr-surface', className)}
      style={{
        background: 'var(--suite-bg)',
        color: 'var(--suite-text)',
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}
