'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';

type TutorRequest = {
  id: string;
  tutor_id: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  file_type: string;
  original_filename: string;
  tutor: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
};

type ProfileEmbed = { email: string | null; full_name: string | null; username: string | null };

type DegreeItem = {
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

type QueueRow =
  | { kind: 'tutor'; row: TutorRequest }
  | { kind: 'degree'; row: DegreeItem };

function profileOne(p: DegreeItem['user']): ProfileEmbed | null {
  if (!p) return null;
  return Array.isArray(p) ? p[0] ?? null : p;
}

/** Maps tutor queue filter to degrees API status; null = do not load degrees for this filter. */
function degreeApiStatus(tutorFilter: string): string | null {
  const u = tutorFilter.toUpperCase();
  if (u === 'ALL') return 'all';
  if (u === 'READY_FOR_REVIEW') return 'pending';
  if (u === 'APPROVED') return 'verified';
  if (u === 'REJECTED') return 'rejected';
  return null;
}

function mergeRows(tutors: TutorRequest[], degrees: DegreeItem[]): QueueRow[] {
  const out: QueueRow[] = [
    ...tutors.map((row) => ({ kind: 'tutor' as const, row })),
    ...degrees.map((row) => ({ kind: 'degree' as const, row })),
  ];
  out.sort((a, b) => {
    const ta = new Date(a.row.created_at).getTime();
    const tb = new Date(b.row.created_at).getTime();
    return tb - ta;
  });
  return out;
}

export default function VerificationQueuePage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('READY_FOR_REVIEW');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rejectDegreeId, setRejectDegreeId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const degreeFilterActive = useMemo(() => degreeApiStatus(statusFilter) !== null, [statusFilter]);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile || (!profile.is_reviewer && profile.role !== 'admin')) {
      router.push('/login');
      return;
    }
    fetchAll();
  }, [profile, profileLoading, router, statusFilter]);

  async function fetchAll() {
    setLoading(true);
    setActionError('');
    try {
      const tutorRes = await fetch(
        `/api/admin/verification/requests?status=${encodeURIComponent(statusFilter)}`,
        { cache: 'no-store' }
      );
      const tutorJson = await tutorRes.json();
      if (!tutorRes.ok) {
        console.error('Tutor queue API:', tutorJson);
        alert(tutorJson.error || 'Failed to load tutor verification requests');
      }
      const tutors: TutorRequest[] = tutorJson.requests || [];

      const degParam = degreeApiStatus(statusFilter);
      let degrees: DegreeItem[] = [];
      if (degParam !== null) {
        const degRes = await fetch(`/api/admin/degrees?status=${encodeURIComponent(degParam)}`, {
          cache: 'no-store',
        });
        const degJson = await degRes.json();
        if (!degRes.ok) {
          console.error('Degrees API:', degJson);
          setActionError(degJson.error || 'Failed to load degree submissions');
        } else {
          degrees = degJson.degrees || [];
        }
      }

      setRows(mergeRows(tutors, degrees));
    } catch (err) {
      console.error(err);
      alert('Failed to load verification queue.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteRequest(requestId: string) {
    if (!confirm('Permanently delete this verification request? This cannot be undone.')) return;
    setDeletingId(requestId);
    try {
      const res = await fetch(`/api/admin/verification/requests/${requestId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete');
      }
      setRows((prev) => prev.filter((r) => !(r.kind === 'tutor' && r.row.id === requestId)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete request');
    } finally {
      setDeletingId(null);
    }
  }

  async function openDegreeDoc(id: string) {
    setActionError('');
    const res = await fetch(`/api/admin/degrees/${id}/document-url`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.url) {
      setActionError(json.error || 'Could not open document');
      return;
    }
    window.open(json.url, '_blank', 'noopener,noreferrer');
  }

  async function approveDegree(id: string) {
    setBusyId(id);
    setActionError('');
    try {
      const res = await fetch(`/api/admin/degrees/${id}/approve`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || 'Approve failed');
        return;
      }
      await fetchAll();
    } finally {
      setBusyId(null);
    }
  }

  async function submitRejectDegree() {
    if (!rejectDegreeId || rejectReason.trim().length < 3) return;
    setBusyId(rejectDegreeId);
    setActionError('');
    try {
      const res = await fetch(`/api/admin/degrees/${rejectDegreeId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejection_reason: rejectReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || 'Reject failed');
        return;
      }
      setRejectDegreeId(null);
      setRejectReason('');
      await fetchAll();
    } finally {
      setBusyId(null);
    }
  }

  function statusBadgeClass(kind: 'tutor' | 'degree', status: string) {
    if (kind === 'tutor') {
      if (status === 'APPROVED') return 'bg-green-100 text-green-800';
      if (status === 'REJECTED') return 'bg-red-100 text-red-800';
      return 'bg-yellow-100 text-yellow-800';
    }
    if (status === 'verified') return 'bg-green-100 text-green-800';
    if (status === 'rejected') return 'bg-red-100 text-red-800';
    return 'bg-amber-100 text-amber-900';
  }

  function displayStatus(kind: 'tutor' | 'degree', status: string) {
    if (kind === 'degree' && status === 'pending') return 'pending (review)';
    return status;
  }

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  const displayName = profile.full_name || profile.email?.split('@')[0] || 'Reviewer';

  return (
    <DashboardLayout role={profile.role === 'admin' ? 'admin' : 'reviewer'} userName={displayName}>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Verification Queue</h1>
        <p className="text-gray-600 mb-2">
          Tutor certificates (CSEC, CAPE, etc.) and degree credential submissions in one list. Filter applies to both
          where the status lines up (e.g. Ready for Review shows tutor requests in review plus degree submissions awaiting
          action).
        </p>
        {!degreeFilterActive && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">
            Degree rows are hidden for <strong>{statusFilter}</strong> — switch to{' '}
            <strong>Ready for Review</strong>, <strong>Approved</strong>, <strong>Rejected</strong>, or{' '}
            <strong>All</strong> to include degrees.
          </p>
        )}

        <div className="mb-6 flex flex-wrap gap-2">
          {[
            { value: 'all', label: 'All' },
            { value: 'SUBMITTED', label: 'Submitted' },
            { value: 'PROCESSING', label: 'Processing' },
            { value: 'READY_FOR_REVIEW', label: 'Ready for Review' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'REJECTED', label: 'Rejected' },
          ].map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                statusFilter === value ? 'bg-itutor-green text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {actionError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
            {actionError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green"></div>
            <span className="ml-3 text-gray-600">Loading queue…</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 border-2 border-gray-200 rounded-lg">
            <svg
              className="w-16 h-16 text-gray-400 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No items found</h2>
            <p className="text-gray-600">
              No verification items
              {statusFilter.toLowerCase() !== 'all' ? ` for this filter (${statusFilter})` : ''}.
            </p>
          </div>
        ) : (
          <div className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Submitted
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((item) =>
                  item.kind === 'tutor' ? (
                    <tr key={`t-${item.row.id}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-sky-100 text-sky-900">
                          Tutor cert
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {item.row.tutor?.full_name?.trim() || '—'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {item.row.tutor?.email?.trim() || (
                            <span className="text-gray-400 italic">No email on profile</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {item.row.file_type === 'pdf' ? (
                            <svg className="w-5 h-5 text-red-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-blue-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                          <span className="text-sm text-gray-600">{item.row.file_type.toUpperCase()}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(item.row.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusBadgeClass('tutor', item.row.status)}`}
                        >
                          {displayStatus('tutor', item.row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => router.push(`/reviewer/verification/${item.row.id}`)}
                            className="text-itutor-green hover:text-emerald-700 font-semibold"
                          >
                            Review →
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRequest(item.row.id)}
                            disabled={deletingId === item.row.id}
                            className="text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded font-medium disabled:opacity-50"
                          >
                            {deletingId === item.row.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={`d-${item.row.id}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-violet-100 text-violet-900">
                          Degree
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900">{item.row.full_name}</div>
                        <div className="text-sm text-gray-500">
                          {profileOne(item.row.user)?.email?.trim() ||
                            profileOne(item.row.user)?.username ||
                            `${item.row.user_id.slice(0, 8)}…`}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700 max-w-xs">
                        <span className="line-clamp-2">
                          {item.row.degree}
                          {item.row.field ? ` · ${item.row.field}` : ''} — {item.row.school_name} (
                          {item.row.graduation_year})
                        </span>
                        {item.row.rejection_reason && (
                          <p className="text-xs text-red-700 mt-1 whitespace-pre-wrap line-clamp-2">
                            {item.row.rejection_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(item.row.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusBadgeClass('degree', item.row.status)}`}
                        >
                          {displayStatus('degree', item.row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => openDegreeDoc(item.row.id)}
                            className="text-gray-700 hover:text-gray-900 font-medium"
                          >
                            View doc
                          </button>
                          {item.row.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                disabled={busyId === item.row.id}
                                onClick={() => approveDegree(item.row.id)}
                                className="text-green-700 hover:text-green-900 font-semibold disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={busyId === item.row.id}
                                onClick={() => {
                                  setRejectDegreeId(item.row.id);
                                  setRejectReason('');
                                }}
                                className="text-red-600 hover:text-red-800 font-semibold disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        {rejectDegreeId && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
              <h2 className="font-semibold text-gray-900">Reject degree submission</h2>
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
                  onClick={() => setRejectDegreeId(null)}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={rejectReason.trim().length < 3 || busyId === rejectDegreeId}
                  onClick={() => submitRejectDegree()}
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
