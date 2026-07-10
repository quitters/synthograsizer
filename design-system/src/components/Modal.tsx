import type { ReactNode } from 'react';
import { cx } from '../cx';
import { Button } from './Button';

export interface ModalProps {
  /** The modal only renders while open. */
  open?: boolean;
  /** Called on backdrop click and on the ✕ button. */
  onClose?: () => void;
  /** Heading in the modal's title row. */
  title?: string;
  /** Inline status next to the title, shown as a `StateChip`-style pill. */
  state?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * Full-screen inspector overlay: dimmed backdrop centering a raised,
 * scrollable box (max 760px wide). The title row carries the heading,
 * an optional status pill, and a ghost ✕ close button.
 */
export function Modal({
  open = true,
  onClose,
  title,
  state,
  children,
  className,
}: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="vr-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={cx('vr-modal-box', className)}>
        {(title != null || state != null || onClose) && (
          <div className="vr-title-row" style={{ marginTop: 0 }}>
            {title != null && <h2 style={{ margin: 0 }}>{title}</h2>}
            {state != null && <span className="vr-state">{state}</span>}
            {onClose && (
              <Button variant="ghost" onClick={onClose} aria-label="Close">
                ✕
              </Button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
