'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';

type Signup = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  created_at: string;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-TT', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminSignupsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('all');

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

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      setLoading(true);
      let query = supabase
        .from('profiles')
        .select('id, full_name, email, role, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (roleFilter !== 'all') query = query.eq('role', roleFilter);
      const { data } = await query;
      setSignups((data as Signup[]) ?? []);
      setLoading(false);
    })();
  }, [authLoading, roleFilter]);

  if (authLoading) {
    return (
      <DashboardLayout role="admin" userName="Admin">
        <div className="flex items-center justify-center py-20 text-gray-400">Loading…</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="max-w-6xl mx-auto">
        <AdminBreadcrumb items={[{ label: 'Operations' }, { label: 'Signups & Onboarding' }]} />
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Signups &amp; Onboarding</h1>
            <p className="text-gray-600 mt-1">The most recent account registrations across all roles.</p>
          </div>
          <Link
            href="/admin/emails"
            className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Manage onboarding emails →
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {['all', 'student', 'parent', 'tutor'].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                roleFilter === r ? 'bg-itutor-green text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {r === 'all' ? 'All roles' : r + 's'}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Joined</th>
                <th className="px-4 py-3 text-right">Account</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">Loading signups…</td></tr>
              ) : signups.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No signups found.</td></tr>
              ) : (
                signups.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.full_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{s.email || '—'}</td>
                    <td className="px-4 py-3 capitalize text-gray-700">{s.role || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 tabular-nums">{fmtDate(s.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/accounts/${s.id}`} className="text-itutor-green hover:text-emerald-600 font-semibold">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
