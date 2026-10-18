'use client';

// Tabs across the credits admin pages, so the programme's settings, referral
// review and campaign codes read as one area rather than two unrelated
// Finance pages.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/referrals', label: 'Overview & referrals', hint: 'Settings, totals, referrers, adjustments' },
  { href: '/admin/credit-codes', label: 'Campaign codes', hint: 'Batches, promos, QR codes, redemptions' },
];

export default function CreditsAdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Credits admin" className="mt-4 flex flex-wrap gap-2 border-b border-gray-200">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            title={tab.hint}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ${
              active ? 'border-itutor-green text-itutor-green' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
