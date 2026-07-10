import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {}

/**
 * Pill-shaped suggestion button — indigo outline that fills on hover.
 * Used for one-tap prompt variations; compose several inside a `ChipRow`.
 */
export function Chip({ className, ...rest }: ChipProps) {
  return <button className={cx('vr-chip', className)} {...rest} />;
}

export interface ChipRowProps {
  children?: ReactNode;
  className?: string;
}

/** Wrapping flex container for `Chip`s. */
export function ChipRow({ children, className }: ChipRowProps) {
  return <div className={cx('vr-chips', className)}>{children}</div>;
}
