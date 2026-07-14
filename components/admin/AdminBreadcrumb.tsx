'use client';

import Link from 'next/link';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Shared breadcrumb / back control for admin pages.
 *
 * Navigation is the primary objective of the admin account: every admin page
 * must have a consistent way back and onward. This component renders a uniform
 * "Admin / Section / Page" trail (with the leading "Admin" crumb linking to the
 * dashboard) so no page is a dead end. Reuse it at the top of every admin page
 * instead of hand-rolling per-page links.
 *
 * `tone="dark"` is for the dark-themed finance pages (one-on-one, lesson
 * payments) that render outside the light DashboardLayout shell.
 */
export default function AdminBreadcrumb({
  items,
  tone = 'light',
}: {
  items: Crumb[];
  tone?: 'light' | 'dark';
}) {
  const trail: Crumb[] = [{ label: 'Admin', href: '/admin/dashboard' }, ...items];

  const base =
    tone === 'dark'
      ? { muted: 'text-white/40', link: 'hover:text-white', current: 'text-white font-semibold', sep: 'text-white/20' }
      : { muted: 'text-gray-500', link: 'hover:text-itutor-green', current: 'text-gray-900 font-semibold', sep: 'text-gray-300' };

  return (
    <nav aria-label="Breadcrumb" className="mb-5">
      <ol className={`flex flex-wrap items-center gap-1.5 text-sm ${base.muted}`}>
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
              {c.href && !last ? (
                <Link href={c.href} className={`transition-colors ${base.link}`}>
                  {c.label}
                </Link>
              ) : (
                <span className={last ? base.current : undefined}>{c.label}</span>
              )}
              {!last && <span className={base.sep} aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
