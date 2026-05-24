'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { RefreshCw, Eye, EyeOff, Trash2, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'resolved_hidden', label: 'Hidden' },
  { value: 'resolved_deleted', label: 'Deleted' },
  { value: 'resolved_warned', label: 'Warned' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
] as const;

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  spam: { label: 'Spam', color: 'bg-yellow-100 text-yellow-800' },
  harassment: { label: 'Harassment', color: 'bg-red-100 text-red-700' },
  inappropriate_language: { label: 'Language', color: 'bg-orange-100 text-orange-800' },
  misleading: { label: 'Misleading', color: 'bg-blue-100 text-blue-800' },
  other: { label: 'Other', color: 'bg-gray-100 text-gray-700' },
};

type Report = {
  id: string;
  target_type: string;
  target_id: string;
  reply_id: string | null;
  reason: string;
  body: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  reporter: { id: string; full_name: string; display_name: string | null } | null;
  resolved_by_profile: { id: string; full_name: string; display_name: string | null } | null;
  comment_author: { full_name: string; display_name: string | null } | null;
  comment_preview: { body: string } | null;
  target_label: string;
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function displayName(p: { full_name: string; display_name: string | null } | null) {
  if (!p) return 'Unknown';
  return p.display_name ?? p.full_name;
}

type WarnModalProps = { reportId: string; onClose: () => void; onDone: () => void };
function WarnModal({ reportId, onClose, onDone }: WarnModalProps) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    await fetch(`/api/admin/moderation/${reportId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'warn', note }),
    });
    setSubmitting(false);
    onDone();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl">
        <h3 className="text-base font-bold text-gray-900 mb-3">Warn user</h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional warning message to record..."
          rows={3}
          className="w-full p-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-brand"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100 rounded-xl transition">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 text-sm font-semibold text-white bg-brand hover:bg-brand-deep rounded-xl transition disabled:opacity-50">
            {submitting ? 'Sending…' : 'Send Warning'}
          </button>
        </div>
      </div>
    </div>
  );
}

type DeleteConfirmProps = { reportId: string; onClose: () => void; onDone: () => void };
function DeleteConfirm({ reportId, onClose, onDone }: DeleteConfirmProps) {
  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/admin/moderation/${reportId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete' }),
    });
    setDeleting(false);
    onDone();
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl text-center">
        <h3 className="text-base font-bold text-gray-900">Delete this comment?</h3>
        <p className="text-sm text-gray-500 mt-2">The comment will be permanently removed from the platform.</p>
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100 rounded-xl transition">Cancel</button>
          <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition disabled:opacity-50">
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ModerationQueuePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<Report[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [tab, setTab] = useState<string>('pending');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [warnReportId, setWarnReportId] = useState<string | null>(null);
  const [deleteReportId, setDeleteReportId] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  // Auth check
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/'); return; }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.replace('/'); return; }
      setAuthorized(true);
    })();
  }, [router]);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: tab });
      if (search) params.set('search', search);
      const res = await fetch(`/api/admin/moderation/queue?${params}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports ?? []);
        setPendingCount(data.pendingCount ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    if (authorized) fetchReports();
  }, [authorized, fetchReports]);

  // Poll every 60s
  useEffect(() => {
    if (!authorized) return;
    const id = setInterval(fetchReports, 60000);
    return () => clearInterval(id);
  }, [authorized, fetchReports]);

  async function resolveReport(reportId: string, action: 'hide' | 'dismiss') {
    await fetch(`/api/admin/moderation/${reportId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    fetchReports();
  }

  if (authorized === null) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin size-8 rounded-full border-2 border-brand border-t-transparent" /></div>;
  }

  const reasons = REASON_LABELS;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Moderation Queue</h1>
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                {pendingCount} pending
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search comment body…"
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-brand w-56"
            />
            <button
              onClick={fetchReports}
              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 transition"
              aria-label="Refresh"
            >
              <RefreshCw className="size-4 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 bg-gray-100 rounded-xl w-fit">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-semibold transition',
                tab === t.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
          ) : reports.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No reports found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Preview</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Reporter</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Reported user</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reports.map((report) => {
                    const isExpanded = expandedId === report.id;
                    const reasonStyle = reasons[report.reason] ?? reasons.other;
                    const preview = report.comment_preview?.body ?? '';
                    const truncated = preview.length > 80 ? preview.slice(0, 80) + '…' : preview;

                    return (
                      <>
                        <tr key={report.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 whitespace-nowrap text-gray-500" title={new Date(report.created_at).toLocaleString()}>
                            {relativeTime(report.created_at)}
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : report.id)}
                              className="text-left text-gray-700 hover:text-gray-900 transition"
                            >
                              {truncated || <span className="italic text-gray-400">No preview</span>}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', reasonStyle.color)}>
                              {reasonStyle.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{displayName(report.reporter)}</td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{displayName(report.comment_author)}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs max-w-[150px] truncate" title={report.target_label}>{report.target_label}</td>
                          <td className="px-4 py-3">
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', report.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600')}>
                              {report.status.replace('resolved_', '')}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {report.status === 'pending' ? (
                              <div className="flex items-center gap-1 flex-nowrap">
                                <button
                                  onClick={() => setExpandedId(isExpanded ? null : report.id)}
                                  title="View"
                                  className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-500"
                                >
                                  {isExpanded ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                                </button>
                                <button
                                  onClick={() => resolveReport(report.id, 'hide')}
                                  title="Hide comment"
                                  className="p-1.5 rounded-lg hover:bg-gray-100 transition text-orange-500"
                                >
                                  <EyeOff className="size-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleteReportId(report.id)}
                                  title="Delete comment"
                                  className="p-1.5 rounded-lg hover:bg-gray-100 transition text-red-500"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                                <button
                                  onClick={() => setWarnReportId(report.id)}
                                  title="Warn user"
                                  className="p-1.5 rounded-lg hover:bg-gray-100 transition text-yellow-500"
                                >
                                  <AlertTriangle className="size-3.5" />
                                </button>
                                <button
                                  onClick={() => resolveReport(report.id, 'dismiss')}
                                  title="Dismiss"
                                  className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400"
                                >
                                  <X className="size-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">
                                {report.resolved_at ? relativeTime(report.resolved_at) : '—'}
                              </span>
                            )}
                          </td>
                        </tr>

                        {/* Expanded row */}
                        {isExpanded && (
                          <tr key={`${report.id}-expanded`} className="bg-gray-50">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="space-y-2">
                                <p className="text-sm font-semibold text-gray-700">Full comment</p>
                                <p className="text-sm text-gray-800 whitespace-pre-wrap">{preview || '(no content)'}</p>
                                {report.body && (
                                  <div className="mt-3">
                                    <p className="text-sm font-semibold text-gray-700">Reporter&apos;s note</p>
                                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{report.body}</p>
                                  </div>
                                )}
                                {report.resolution_note && (
                                  <div className="mt-3">
                                    <p className="text-sm font-semibold text-gray-700">Resolution note</p>
                                    <p className="text-sm text-gray-600">{report.resolution_note}</p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {warnReportId && (
        <WarnModal
          reportId={warnReportId}
          onClose={() => setWarnReportId(null)}
          onDone={fetchReports}
        />
      )}

      {deleteReportId && (
        <DeleteConfirm
          reportId={deleteReportId}
          onClose={() => setDeleteReportId(null)}
          onDone={fetchReports}
        />
      )}
    </div>
  );
}
