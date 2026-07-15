'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';

type AdminClass = {
  id: string;
  name: string | null;
  subject: string | null;
  tutor_id: string;
  status: string | null;
  archived: boolean;
  archived_at: string | null;
  visibility: string | null;
  price_monthly: number | null;
  created_at: string;
  tutor_name: string | null;
  tutor_email: string | null;
};

type Filter = 'all' | 'active' | 'archived';

export default function AdminClassesPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

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

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ filter });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/admin/classes?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load classes');
      setClasses(data.classes ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  async function toggleArchive(cls: AdminClass) {
    const action = cls.archived ? 'unarchive' : 'archive';
    if (action === 'archive' && !confirm(`Archive "${cls.name}"? It will be hidden from the marketplace. This is reversible.`)) return;
    setBusyId(cls.id);
    try {
      const res = await fetch(`/api/admin/classes/${cls.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${action} failed`);
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  }

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
        <AdminBreadcrumb items={[{ label: 'System' }, { label: 'Class Admin' }]} />
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Class Admin</h1>
          <p className="text-gray-600 mt-1">Archive or restore classes. Archiving hides a class from the marketplace and is reversible.</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            {(['all', 'active', 'archived'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                  filter === f ? 'bg-itutor-green text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by class name…"
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-itutor-green"
          />
        </div>

        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Class</th>
                  <th className="px-4 py-3 text-left">Tutor</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-400">Loading classes…</td></tr>
                ) : classes.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-400">No classes found.</td></tr>
                ) : (
                  classes.map((cls) => (
                    <tr key={cls.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{cls.name || 'Untitled class'}</div>
                        {cls.subject && <div className="text-xs text-gray-500">{cls.subject}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {cls.tutor_id ? (
                          <Link href={`/admin/accounts/${cls.tutor_id}`} className="text-itutor-green hover:text-emerald-600 font-medium">
                            {cls.tutor_name || cls.tutor_email || 'View tutor'}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {cls.archived ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">Archived</span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">Active</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleArchive(cls)}
                            disabled={busyId === cls.id}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-50 ${
                              cls.archived
                                ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                : 'border-amber-300 text-amber-700 hover:bg-amber-50'
                            }`}
                          >
                            {busyId === cls.id ? '…' : cls.archived ? 'Unarchive' : 'Archive'}
                          </button>
                          <button
                            disabled
                            title="Permanent delete is superadmin-only (coming soon). Prefer Archive."
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-400 cursor-not-allowed"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
