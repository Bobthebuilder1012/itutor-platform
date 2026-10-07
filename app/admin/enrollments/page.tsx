'use client';

// Student Enrollments — every enrolment into a class, newest first.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import DashboardLayout from '@/components/DashboardLayout';
import { Loader2 } from 'lucide-react';

interface EnrollmentRow {
  id: string;
  enrolled_at: string;
  student_name: string | null;
  class_name: string | null;
  tutor_name: string | null;
  amount_paid_ttd: number | null;
  payment_method: 'online' | 'cash' | 'free';
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-TT', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Port_of_Spain',
  });
}

function fmtAmount(r: EnrollmentRow) {
  if (r.payment_method === 'cash') return 'Cash';
  if (r.amount_paid_ttd == null) return 'TT$ 0.00';
  return `TT$ ${r.amount_paid_ttd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminEnrollmentsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<EnrollmentRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', user.id)
        .single();
      if (profile?.role !== 'admin') { router.push('/login'); return; }
      if (isEmailManagementOnlyAdmin(profile.email)) { router.replace('/admin/emails'); return; }
      setAuthLoading(false);
    })();
  }, []);

  const load = useCallback(async (p: number) => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/enrollments?page=${p}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setRows(data.enrollments ?? []);
      setTotal(data.total ?? 0);
      setPageSize(data.page_size ?? 50);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!authLoading) load(page); }, [authLoading, page, load]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <AdminBreadcrumb items={[{ label: 'Finance', href: '/admin/payments' }, { label: 'Enrollments' }]} />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Student Enrollments</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} enrollment(s), newest first. Times are Port of Spain.</p>
        </div>

        {error && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{error}</div>}

        <div className="rounded-xl border border-gray-200 overflow-x-auto bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="px-4 py-3 text-left">Enrolled</th>
                <th className="px-4 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-left">Class</th>
                <th className="px-4 py-3 text-left">Tutor</th>
                <th className="px-4 py-3 text-right">Amount paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {authLoading || (loading && rows.length === 0) ? (
                <tr><td colSpan={5} className="py-16 text-center text-gray-400"><Loader2 className="size-5 animate-spin inline" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="py-16 text-center text-gray-400">No enrollments yet.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className={loading ? 'opacity-50' : ''}>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDateTime(r.enrolled_at)}</td>
                  <td className="px-4 py-2.5 text-gray-900">{r.student_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-700">{r.class_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-700">{r.tutor_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{fmtAmount(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages || loading}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
