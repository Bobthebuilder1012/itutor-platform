'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';

type ProfileEmbed = { email: string | null; full_name: string | null; username: string | null };

type DegreeListItem = {
  id: string;
  user_id: string;
  full_name: string;
  school_name: string;
  degree: string;
  field: string | null;
  graduation_year: number;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  user: ProfileEmbed | ProfileEmbed[] | null;
  degree_documents: { id: string; file_url: string }[] | null;
};

function profileOne(p: DegreeListItem['user']): ProfileEmbed | null {
  if (!p) return null;
  return Array.isArray(p) ? p[0] ?? null : p;
}

export default function AdminDegreesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [degrees, setDegrees] = useState<DegreeListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const checkAccess = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return false;
    }
    const { data: profile } = await supabase.from('profiles').select('role, is_reviewer').eq('id', user.id).single();
    if (!profile || (!profile.is_reviewer && profile.role !== 'admin')) {
      router.push('/login');
      return false;
    }
    return true;
  }, [router]);

  const load = useCallback(async () => {
    setActionError('');
    const res = await fetch(`/api/admin/degrees?status=${encodeURIComponent(statusFilter)}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) {
      setActionError(json.error || 'Failed to load');
      setDegrees([]);
      return;
    }
    setDegrees(json.degrees || []);
  }, [statusFilter]);

  useEffect(() => {
    (async () => {
      const ok = await checkAccess();
      if (!ok) return;
      setLoading(false);
    })();
  }, [checkAccess]);

  useEffect(() => {
    if (loading) return;
    load();
  }, [loading, load]);

  const approve = async (id: string) => {
    setBusyId(id);
    setActionError('');
    try {
      const res = await fetch(`/api/admin/degrees/${id}/approve`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || 'Approve failed');
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const reject = async () => {
    if (!rejectId) return;
    setBusyId(rejectId);
    setActionError('');
    try {
      const res = await fetch(`/api/admin/degrees/${rejectId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejection_reason: rejectReason }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || 'Reject failed');
        return;
      }
      setRejectId(null);
      setRejectReason('');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const openDoc = async (id: string) => {
    const res = await fetch(`/api/admin/degrees/${id}/document-url`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.url) {
      setActionError(json.error || 'Could not open document');
      return;
    }
    window.open(json.url, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-900 border-t-transparent" />
      </div>
    );
  }

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <Link href="/admin/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
              ← Admin dashboard
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-2">Degree verifications</h1>
            <p className="text-sm text-gray-600">Review submissions and approve or reject.</p>
            <p className="text-sm text-gray-600 mt-1">
              Tutor certificate queue:{' '}
              <Link href="/reviewer/verification/queue" className="text-itutor-green font-medium hover:underline">
                Verification queue
              </Link>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['pending', 'verified', 'rejected', 'all'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  statusFilter === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {actionError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{actionError}</div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <ul className="divide-y divide-gray-100">
            {degrees.length === 0 && (
              <li className="px-4 py-8 text-center text-gray-500 text-sm">No submissions in this filter.</li>
            )}
            {degrees.map((d) => {
              const pe = profileOne(d.user);
              return (
                <li key={d.id} className="p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row lg:justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{d.full_name}</p>
                      <p className="text-sm text-gray-600">
                        {d.degree}
                        {d.field ? ` · ${d.field}` : ''} — {d.school_name} ({d.graduation_year})
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        User: {pe?.email || pe?.username || d.user_id.slice(0, 8)}… · Submitted{' '}
                        {new Date(d.created_at).toLocaleString()}
                      </p>
                      <span
                        className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded ${
                          d.status === 'pending'
                            ? 'bg-amber-100 text-amber-900'
                            : d.status === 'verified'
                              ? 'bg-green-100 text-green-900'
                              : 'bg-red-100 text-red-900'
                        }`}
                      >
                        {d.status}
                      </span>
                      {d.rejection_reason && (
                        <p className="text-xs text-red-700 mt-2 whitespace-pre-wrap">Reason: {d.rejection_reason}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 items-start shrink-0">
                      <button
                        type="button"
                        onClick={() => openDoc(d.id)}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        View document
                      </button>
                      {d.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === d.id}
                            onClick={() => approve(d.id)}
                            className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyId === d.id}
                            onClick={() => {
                              setRejectId(d.id);
                              setRejectReason('');
                            }}
                            className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {rejectId && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
              <h2 className="font-semibold text-gray-900">Reject submission</h2>
              <p className="text-sm text-gray-600 mt-1">Explain what the user should fix (min. 3 characters).</p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                className="w-full mt-3 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Reason for rejection…"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setRejectId(null)}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={rejectReason.trim().length < 3 || busyId === rejectId}
                  onClick={() => reject()}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
