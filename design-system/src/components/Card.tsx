import type { MouseEventHandler, ReactNode } from 'react';
import { cx } from '../cx';

export interface CardProps {
  /** Card heading; shot cards use "3. Title". */
  title?: ReactNode;
  /** Media at the top — a `<video>` or `<img>`. */
  media?: ReactNode;
  /** QC score or status shown at the title's right edge, e.g. "8.5" or "rendering". */
  qc?: ReactNode;
  /** Render the QC marker in the alarm color (used when qc < 6). */
  qcBad?: boolean;
  /** Muted note line under the title (QC notes). */
  notes?: ReactNode;
  /** Uppercase preset chip at the bottom (template cards), e.g. "VHS". */
  preset?: string;
  /** Template-card mode: pointer cursor and indigo hover border. */
  template?: boolean;
  /** Teal selected border. */
  selected?: boolean;
  /** Dimmed with an "excluded" marker in the title row. */
  excluded?: boolean;
  /** Leading pick checkbox in the title row (shot selection). */
  pickable?: boolean;
  picked?: boolean;
  onPickChange?: (picked: boolean) => void;
  children?: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

/**
 * Grid card for shots, templates, and reference assets: optional media,
 * a title row with pick-checkbox and QC marker, a notes line, and an
 * uppercase preset chip. Selection/exclusion states recolor the border.
 */
export function Card({
  title,
  media,
  qc,
  qcBad,
  notes,
  preset,
  template,
  selected,
  excluded,
  pickable,
  picked,
  onPickChange,
  children,
  className,
  onClick,
}: CardProps) {
  return (
    <div
      className={cx(
        'vr-card',
        template && 'template',
        selected && 'selected',
        excluded && 'excluded',
        className,
      )}
      onClick={onClick}
    >
      {media}
      {(title != null || qc != null || pickable) && (
        <h4>
          {pickable && (
            <label className="vr-pick">
              <input
                type="checkbox"
                checked={picked}
                onChange={(e) => onPickChange?.(e.target.checked)}
              />
            </label>
          )}
          {title}
          {excluded && <span className="excl">excluded</span>}
          {qc != null && <span className={cx('qc', qcBad && 'bad')}>{qc}</span>}
        </h4>
      )}
      {notes != null && <div className="notes">{notes}</div>}
      {children}
      {preset && <span className="preset">{preset}</span>}
    </div>
  );
}
