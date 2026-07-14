'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb, { type Crumb } from '@/components/admin/AdminBreadcrumb';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';

export interface RelatedLink {
  label: string;
  href: string;
  description?: string;
  external?: boolean;
}

/**
 * Admin-only scaffold for pages whose full UI is still being built. It keeps
 * the persistent sidebar and a breadcrumb so the page is never a dead end, and
 * surfaces links to the working areas/APIs the feature currently relies on.
 */
export default function AdminPlaceholderPage({
  breadcrumb,
  title,
  description,
  links = [],
  note,
}: {
  breadcrumb: Crumb[];
  title: string;
  description: string;
  links?: RelatedLink[];
  note?: string;
}) {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/login'); return; }
      if (isEmailManagementOnlyAdmin(profile.email)) { router.replace('/admin/emails'); return; }
      setAuthLoading(false);
    })();
  }, [router]);

  if (authLoading) {
    return (
      <DashboardLayout role="admin" userName="Admin">
        <div className="flex items-center justify-center py-20 text-gray-400">Loading…</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="max-w-4xl mx-auto">
        <AdminBreadcrumb items={breadcrumb} />
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-600 mt-2">{description}</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-8 flex items-start gap-3">
          <span className="text-amber-600 text-lg leading-none mt-0.5">⚙️</span>
          <p className="text-sm text-amber-800">
            A dedicated interface for this area is in progress. In the meantime, use the links below to reach the
            data and actions it covers. {note}
          </p>
        </div>

        {links.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {links.map((l) =>
              l.external ? (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md hover:border-itutor-green transition"
                >
                  <p className="font-semibold text-gray-900">{l.label} ↗</p>
                  {l.description && <p className="text-sm text-gray-500 mt-1">{l.description}</p>}
                </a>
              ) : (
                <Link
                  key={l.href}
                  href={l.href}
                  className="block rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md hover:border-itutor-green transition"
                >
                  <p className="font-semibold text-gray-900">{l.label} →</p>
                  {l.description && <p className="text-sm text-gray-500 mt-1">{l.description}</p>}
                </Link>
              )
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
