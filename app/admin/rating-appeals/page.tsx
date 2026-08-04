'use client';

// Admin review moderation. Lists active reviews from BOTH rating systems
// (1:1 `ratings` + group `group_reviews`), lets an admin soft-delete a review,
// and links each reviewer straight to their account page (/admin/accounts/[id])
// where suspend/unsuspend already lives.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';

type Review = {
  source: 'oneonone' | 'group';
  id: string;
  reviewerId: string | null;
  reviewerName: string;
  tutorId: string | null;
  tutorName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  context: string | null;
};

export default function AdminReviewModerationPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
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
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/reviews', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load reviews');
      setReviews(json.reviews ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);

  async function remove(r: Review) {
    if (!confirm(`Remove this ${r.source === 'group' ? 'group' : '1:1'} review by ${r.reviewerName}? This soft-deletes it (kept for audit) and updates the tutor's rating.`)) return;
    setDeleting(r.id);
    setError('');
    try {
      const url = r.source === 'group' ? `/api/admin/group-reviews/${r.id}` : `/api/admin/ratings/${r.id}`;
      const res = await fetch(url, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      setReviews((prev) => prev.filter((x) => !(x.id === r.id && x.source === r.source)));
    } catch (e: any) {
      setError(e.message ?? 'Delete failed');
    } finally {
      setDeleting(null);
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
        <AdminBreadcrumb items={[{ label: 'Trust & Safety' }, { label: 'Review Moderation' }]} />
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Review Moderation</h1>
            <p className="text-gray-600 mt-2">Remove abusive or fraudulent reviews across 1:1 sessions and group classes. Deletions are soft (kept for audit) and immediately update the tutor&apos;s rating.</p>
          </div>
          <button onClick={load} className="shrink-0 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Refresh</button>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-gray-400">Loading reviews…</div>
          ) : reviews.length === 0 ? (
            <div className="py-16 text-center text-gray-500">No active reviews.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Reviewer</th>
                    <th className="px-4 py-3 font-semibold">Tutor</th>
                    <th className="px-4 py-3 font-semibold">Rating</th>
                    <th className="px-4 py-3 font-semibold">Review</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reviews.map((r) => (
                    <tr key={`${r.source}-${r.id}`} className="align-top">
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${r.source === 'group' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                          {r.source === 'group' ? 'Group' : '1:1'}
                        </span>
                        {r.context && <div className="mt-1 text-xs text-gray-400">{r.context}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {r.reviewerId ? (
                          <Link href={`/admin/accounts/${r.reviewerId}`} className="font-medium text-itutor-green hover:underline">{r.reviewerName}</Link>
                        ) : (
                          <span className="text-gray-700">{r.reviewerName}</span>
                        )}
                        {r.reviewerId && <div className="text-xs text-gray-400">Manage account →</div>}
                      </td>
                      <td className="px-4 py-3">
                        {r.tutorId ? (
                          <Link href={`/admin/accounts/${r.tutorId}`} className="text-gray-700 hover:underline">{r.tutorName}</Link>
                        ) : (
                          <span className="text-gray-700">{r.tutorName}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-amber-600">{'★'.repeat(Math.max(1, Math.min(5, Math.round(r.rating))))}</td>
                      <td className="px-4 py-3 max-w-sm text-gray-700">{r.comment || <span className="text-gray-400 italic">No comment</span>}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => remove(r)}
                          disabled={deleting === r.id}
                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deleting === r.id ? 'Removing…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
