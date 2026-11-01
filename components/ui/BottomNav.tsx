'use client';

/**
 * BottomNav — the ink tab bar at the bottom of every main page; the current
 * tab gets a brand-green pill.
 *
 * Show it on main pages only; hide it on flows and detail pages, as the parent
 * Figma file specifies. Parent tabs are Home, Explore, Classes, Billing,
 * Profile — the default below. Student tabs swap Billing for Wallet.
 */

import { cn } from '@/lib/utils';
import { DsIcon, type IconName } from './icons';

export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  badge?: boolean;
}

export interface BottomNavProps {
  items?: NavItem[];
  /** id of the current tab. */
  active?: string;
  onSelect?: (id: string) => void;
  className?: string;
}

export const DEFAULT_NAV: NavItem[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'explore', label: 'Explore', icon: 'explore' },
  { id: 'classes', label: 'Classes', icon: 'classes' },
  { id: 'billing', label: 'Billing', icon: 'billing' },
  { id: 'profile', label: 'Profile', icon: 'profile' },
];

export function BottomNav({
  items = DEFAULT_NAV,
  active,
  onSelect,
  className,
}: BottomNavProps) {
  return (
    <nav
      aria-label="Main"
      className={cn(
        'flex items-start justify-around gap-ds-1h bg-ink px-1 pt-[10px] pb-3',
        className
      )}
    >
      {items.map((item) => {
        const current = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={current ? 'page' : undefined}
            onClick={onSelect ? () => onSelect(item.id) : undefined}
            className={cn(
              'relative flex w-[70px] flex-col items-center gap-ds-1',
              'border-0 bg-transparent p-0 font-body cursor-pointer',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand focus-visible:rounded-ds-sm',
              current ? 'text-ink' : 'text-on-ink-subtle'
            )}
          >
            <span
              className={cn(
                'flex h-[30px] w-[46px] items-center justify-center rounded-ds-sm',
                current && 'bg-brand text-ink'
              )}
            >
              <DsIcon name={item.icon} size={21} />
            </span>

            <span
              className={cn(
                'text-[11px] font-bold leading-[13px]',
                current ? 'text-on-ink' : 'text-on-ink-muted'
              )}
            >
              {item.label}
            </span>

            {item.badge ? (
              <i
                aria-label="Needs attention"
                className="absolute top-0 right-3 h-[10px] w-[10px] rounded-ds-xs bg-danger border-bold border-ink"
              />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;
