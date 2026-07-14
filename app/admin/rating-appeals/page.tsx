'use client';

import AdminPlaceholderPage from '@/components/admin/AdminPlaceholderPage';

export default function AdminRatingAppealsPage() {
  return (
    <AdminPlaceholderPage
      breadcrumb={[{ label: 'Trust & Safety' }, { label: 'Rating Appeals' }]}
      title="Rating Appeals"
      description="Review appeals against system-issued ratings and decide whether to uphold or overturn them."
      links={[
        {
          label: 'Disputes & Reliability',
          href: '/admin/disputes',
          description: 'The current home for appeals and reliability decisions.',
        },
      ]}
    />
  );
}
