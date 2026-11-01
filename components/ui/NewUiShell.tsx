'use client';

/**
 * NewUiShell — the layout shell for the new, light-only UI.
 *
 * THIS IS NOT DashboardLayout AND MUST NOT BECOME IT. The existing shell is
 * dark (`itutor-card` #0F0F0F and friends) and the design system has no dark
 * theme — neither Figma file defines one. Rather than teach the old shell a
 * second theme, the new UI gets its own, and the two live side by side until
 * NEXT_PUBLIC_NEW_UI_ENABLED flips.
 *
 * `.ds-root` is what makes the design-system tokens resolve: it retargets the
 * four CSS variables whose Tailwind names collide with legacy ones
 * (brand, ink, ink-muted, border) plus the two font variables. See
 * ds-tokens.css for why that indirection exists.
 *
 * The frames are drawn at 390px, so the shell is a phone column centred on
 * anything wider rather than a stretched desktop layout.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import './ds-tokens.css';
import { AppHeader, type AppHeaderProps, type HeaderAction } from './AppHeader';
import { BottomNav, DEFAULT_NAV, type NavItem } from './BottomNav';

export interface NewUiShellProps {
  children: ReactNode;
  /** id of the current tab. */
  active?: string;
  items?: NavItem[];
  /** Hide the tab bar on flows and detail pages, as the Figma files specify. */
  nav?: boolean;
  onSelect?: (id: string) => void;
  headerTone?: AppHeaderProps['tone'];
  headerActions?: HeaderAction[];
  logo?: ReactNode;
  unread?: boolean;
  initials?: string;
  /** Drop the header too, for full-bleed flows. */
  header?: boolean;
  className?: string;
}

export function NewUiShell({
  children,
  active,
  items = DEFAULT_NAV,
  nav = true,
  onSelect,
  headerTone = 'light',
  headerActions = ['bell'],
  logo,
  unread,
  initials,
  header = true,
  className,
}: NewUiShellProps) {
  return (
    <div className="ds-root min-h-screen bg-surface-page">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-surface-page">
        {header ? (
          <AppHeader
            tone={headerTone}
            actions={headerActions}
            logo={logo}
            unread={unread}
            initials={initials}
            className="sticky top-0 z-10"
          />
        ) : null}

        <main className={cn('flex-1 px-ds-4 py-ds-4', className)}>{children}</main>

        {nav ? (
          <BottomNav
            items={items}
            active={active}
            onSelect={onSelect}
            className="sticky bottom-0 z-10"
          />
        ) : null}
      </div>
    </div>
  );
}

export default NewUiShell;
