'use client';

/**
 * DsPortal — renders into document.body while keeping the design-system
 * tokens.
 *
 * WHY THIS IS NECESSARY, AND WHY FORGETTING IT FAILS QUIETLY. The new UI's
 * tokens are CSS variables declared on `.ds-root` (see ds-tokens.css), because
 * four of their names collide with legacy ones and may not be redefined
 * globally. CSS variables inherit through the DOM tree, not the React tree —
 * so anything portalled out of the shell (a modal, bottom sheet, toast,
 * popover, tooltip, dropdown) lands under <body>, outside `.ds-root`, and
 * inherits the LEGACY values instead.
 *
 * The failure is not a crash and not a blank screen: `bg-brand` resolves to
 * the old oklch green, `text-ink` to the old near-black blue, `border-border`
 * to the old grey. The modal simply renders in the previous palette, slightly
 * wrong, and it is easy to miss in review. Hence a component rather than a
 * convention.
 *
 * Any hand-rolled portal that does not use this must put `DS_ROOT_CLASS` on
 * its own container.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './ds-tokens.css';

/** Put this on the container of any portal the new UI renders into. */
export const DS_ROOT_CLASS = 'ds-root';

export interface DsPortalProps {
  children: ReactNode;
  /** Extra classes for the portal host element. */
  className?: string;
}

export function DsPortal({ children, className }: DsPortalProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  // Created once. The host is inert: `ds-root--portal` carries the tokens but
  // clears the page background `.ds-root` would otherwise paint, so the host
  // never covers the page. Children position themselves.
  useEffect(() => {
    const el = document.createElement('div');
    el.className = `${DS_ROOT_CLASS} ds-root--portal`;
    document.body.appendChild(el);
    setHost(el);
    return () => {
      el.remove();
    };
  }, []);

  // Kept in a separate effect so changing className does not tear down the
  // host and remount everything inside it.
  useEffect(() => {
    if (!host) return;
    host.className = [DS_ROOT_CLASS, 'ds-root--portal', className]
      .filter(Boolean)
      .join(' ');
  }, [host, className]);

  // Nothing on the server, and nothing on the first client render: the host
  // does not exist until the effect has run.
  if (!host) return null;

  return createPortal(children, host);
}

export default DsPortal;
