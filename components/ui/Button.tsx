'use client';

/**
 * Button — the chunky, tappable action with a solid 3px lip underneath.
 *
 * TEXT ON BRAND GREEN IS ALWAYS INK, NEVER WHITE. White on #32cc6e is 2.1:1
 * and fails; ink on it is 7.9:1. The parent Figma file's "View class" button
 * gets this wrong, and the design system corrects it — so this component does
 * too. Do not add a white-on-green variant.
 *
 * The press is the system's tactile signature: down 2px, lip shrinks 3px → 1px.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DsIcon, type IconName } from './icons';

export interface ButtonProps {
  /** primary: brand fill, ink text. danger: fix/destroy. dark: ink fill. outline: white with ink border. */
  variant?: 'primary' | 'danger' | 'dark' | 'outline';
  /** lg 48px, md 42px, sm 40px. */
  size?: 'lg' | 'md' | 'sm';
  /** Span the full width of the parent (use inside cards). */
  block?: boolean;
  icon?: IconName;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-brand border-brand text-ink shadow-edge-brand active:shadow-edge-brand-active',
  danger:
    'bg-danger border-danger text-on-ink shadow-edge-danger active:shadow-edge-danger-active',
  dark: 'bg-ink border-ink text-on-ink shadow-edge-ink-raised active:shadow-edge-ink-raised-active',
  outline:
    'bg-surface-card border-ink text-ink shadow-edge-ink active:shadow-edge-ink-active',
};

const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  lg: 'h-12 text-[15px]',
  md: 'h-[42px] text-[14px]',
  sm: 'h-10 text-[14px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  icon,
  disabled,
  type = 'button',
  onClick,
  className,
  children,
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-ds-2 px-ds-4 mb-[3px]',
        'rounded-ds-btn border-bold border-transparent',
        'font-body font-extrabold leading-none',
        'cursor-pointer transition-[transform,box-shadow] duration-[90ms] ease-out',
        '[-webkit-tap-highlight-color:transparent]',
        'active:translate-y-[2px]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ink',
        'disabled:opacity-45 disabled:cursor-not-allowed disabled:active:translate-y-0',
        SIZES[size],
        VARIANTS[variant],
        block && 'flex w-full',
        className
      )}
    >
      {icon ? <DsIcon name={icon} size={18} /> : null}
      {children}
    </button>
  );
}

export default Button;
