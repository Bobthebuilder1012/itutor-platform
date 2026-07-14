'use client';

import AdminPlaceholderPage from '@/components/admin/AdminPlaceholderPage';

export default function AdminStrikesPage() {
  return (
    <AdminPlaceholderPage
      breadcrumb={[{ label: 'Trust & Safety' }, { label: 'Strikes & Warnings' }]}
      title="Strikes & Warnings"
      description="Review reliability strikes and warnings issued to students and tutors."
      links={[
        {
          label: 'Disputes & Reliability',
          href: '/admin/disputes',
          description: 'The current home for no-show claims, warnings, and appeals.',
        },
        {
          label: 'One-on-One Payments',
          href: '/admin/payments/one-on-one',
          description: 'Cancellations and no-show resolutions that issue strikes.',
        },
      ]}
    />
  );
}
