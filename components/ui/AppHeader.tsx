'use client';

/**
 * AppHeader — the top bar on every main page: logo left, icon buttons and the
 * account chip right.
 *
 * `tone="light"` (default) sits on `surface-page` with a hairline bottom
 * border, as in the Figma files; `tone="dark"` is for ink screens.
 *
 * THE CONSUMER SUPPLIES THE LOGO. The light-ground wordmark (green mark, ink
 * "itutor") exists in the parent Figma file but could not be exported into the
 * design system, so there is no asset to default to here. Passing nothing
 * renders no logo rather than a guessed one.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DsIcon } from './icons';

export type HeaderAction = 'bell' | 'chat' | 'search';

export interface AppHeaderProps {
  tone?: 'light' | 'dark';
  /** The logo element; supplied by the consumer. */
  logo?: ReactNode;
  actions?: HeaderAction[];
  /** Red dot on the bell. */
  unread?: boolean;
  initials?: string;
  onAction?: (action: HeaderAction) => void;
  onAccount?: () => void;
  className?: string;
}

const LABELS: Record<HeaderAction, string> = {
  bell: 'Notifications',
  chat: 'Messages',
  search: 'Search',
};

export function AppHeader({
  tone = 'light',
  logo,
  actions = ['bell'],
  unread,
  initials,
  onAction,
  onAccount,
  className,
}: AppHeaderProps) {
  const dark = tone === 'dark';

  return (
    <header
      className={cn(
        'flex h-14 items-center justify-between border-b-hair pl-ds-4 pr-ds-card',
        dark ? 'bg-ink border-ink' : 'bg-surface-page border-border',
        className
      )}
    >
      {logo ?? <span />}

      <div className="flex items-center gap-ds-1h">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            aria-label={LABELS[action]}
            onClick={onAction ? () => onAction(action) : undefined}
            className={cn(
              'relative inline-flex h-10 w-10 items-center justify-center',
              'rounded-ds-card border-0 bg-transparent cursor-pointer',
              dark ? 'text-on-ink' : 'text-ink'
            )}
          >
            <DsIcon name={action} size={22} />
            {action === 'bell' && unread ? (
              <i
                className={cn(
                  'absolute top-[6px] right-[7px] h-[10px] w-[10px]',
                  'rounded-ds-xs bg-danger border-bold',
                  dark ? 'border-ink' : 'border-surface-page'
                )}
              />
            ) : null}
          </button>
        ))}

        <button
          type="button"
          aria-label="Account"
          onClick={onAccount}
          className={cn(
            'inline-flex h-[34px] w-[34px] items-center justify-center',
            'rounded-ds-sm border-0 font-extrabold text-[12px] text-brand cursor-pointer',
            dark ? 'bg-ink-raised' : 'bg-ink'
          )}
        >
          {initials ?? ''}
        </button>
      </div>
    </header>
  );
}

export default AppHeader;
