'use client';

import AdminPlaceholderPage from '@/components/admin/AdminPlaceholderPage';

export default function AdminClassesPage() {
  return (
    <AdminPlaceholderPage
      breadcrumb={[{ label: 'System' }, { label: 'Class Admin' }]}
      title="Class Admin"
      description="Manage and archive inactive group classes and lessons."
      links={[
        {
          label: 'Lesson Payments',
          href: '/admin/lesson-payments',
          description: 'Group lesson billing and payout status.',
        },
        {
          label: 'Payments Overview',
          href: '/admin/payments',
          description: 'Platform-wide payment and payout pipeline stats.',
        },
      ]}
    />
  );
}
