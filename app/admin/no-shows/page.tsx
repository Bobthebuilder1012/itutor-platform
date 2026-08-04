'use client';

import AdminPlaceholderPage from '@/components/admin/AdminPlaceholderPage';

export default function AdminNoShowsPage() {
  return (
    <AdminPlaceholderPage
      breadcrumb={[{ label: 'Trust & Safety' }, { label: 'No-Show Resolution' }]}
      title="No-Show Resolution"
      description="Resolve student and tutor no-show claims and apply the resulting refunds or payouts."
      links={[
        {
          label: 'One-on-One Payments',
          href: '/admin/payments/one-on-one',
          description: 'Open the No-show claims tab to review and resolve claims today.',
        },
        {
          label: 'Disputes & Reliability',
          href: '/admin/disputes',
          description: 'Related reliability signals and appeals.',
        },
      ]}
    />
  );
}
