'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import {
  Users, Search, Loader2, Edit2, X, Save, Star, Pin, TrendingUp,
  CheckCircle, AlertCircle, Gauge,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
interface TutorRow {
  tutor_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  verification_status: string | null;
  rating_avg: number;
  rating_count: number;
  completion_score: number;
  sessions_held: number;
  classes_created: number;
  admin_boost: number;
  pin_rank: number | null;
  ranking_score: number;
  admin_boost_note: string | null;
  admin_boost_updated_at: string | null;
}

// ─── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({
  tutor, others, onSave, onClose, saving,
}: {
  tutor: TutorRow;
  others: TutorRow[];
  onSave: (v: { admin_boost: number; pin_rank: number | null; admin_boost_note: string | null }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [boost, setBoost] = useState(tutor.admin_boost);
  const [pin, setPin] = useState<string>(tutor.pin_rank != null ? String(tutor.pin_rank) : '');
  const [note, setNote] = useState(tutor.admin_boost_note ?? '');

  const pinNum = pin.trim() === '' ? null : Number(pin);
  const pinInvalid = pin.trim() !== '' && (!Number.isInteger(pinNum) || (pinNum as number) < 1);
  const collision = pinNum != null && others.find((o) => o.pin_rank === pinNum);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Promote — {tutor.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Boost */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Admin boost — <span className="tabular-nums">{boost}</span>/100
            </label>
            <p className="mb-2 text-xs text-gray-500">
              A gentle nudge (10% of the ranking score). It moves the tutor up but never guarantees the top spot on its own.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={100} value={boost}
                onChange={(e) => setBoost(Number(e.target.value))}
                className="flex-1 accent-green-600"
              />
              <input
                type="number" min={0} max={100} value={boost}
                onChange={(e) => setBoost(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Pin rank */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Pin to position</label>
            <p className="mb-2 text-xs text-gray-500">
              Explicit placement — overrides score. 1 = very top, 2 = second, etc. Leave empty to unpin.
            </p>
            <input
              type="number" min={1} value={pin} placeholder="Unpinned"
              onChange={(e) => setPin(e.target.value)}
              className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            {pinInvalid && (
              <p className="mt-1.5 text-xs text-red-600">Pin must be a whole number ≥ 1, or empty.</p>
            )}
            {collision && !pinInvalid && (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Position {pinNum} is already used by <strong>{collision.name}</strong>. Both will share it, broken by score. Consider giving one of them a different position.
              </p>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Note (optional)</label>
            <input
              type="text" value={note} maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this promotion? (audit trail)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onSave({ admin_boost: boost, pin_rank: pinNum, admin_boost_note: note.trim() || null })}
            disabled={saving || pinInvalid}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function AdminTutorsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [tutors, setTutors] = useState<TutorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<TutorRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('role, is_reviewer, email').eq('id', user.id).single();
      if (profile?.role !== 'admin' && profile?.is_reviewer !== true) { router.push('/login'); return; }
      if (isEmailManagementOnlyAdmin(profile.email)) { router.replace('/admin/emails'); return; }
      setAuthLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/tutors');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setTutors(json.tutors ?? []);
    } catch {
      showToast('error', 'Failed to load tutors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!authLoading) loadData(); }, [authLoading, loadData]);

  async function saveEdit(v: { admin_boost: number; pin_rank: number | null; admin_boost_note: string | null }) {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/tutors/${editTarget.tutor_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Promotion updated');
      setEditTarget(null);
      await loadData();
    } catch (e: any) {
      showToast('error', e.message ?? 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  }

  const filtered = tutors.filter(
    (t) => !search || t.name.toLowerCase().includes(search.toLowerCase()) || (t.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <AdminBreadcrumb items={[{ label: 'Marketplace' }, { label: 'Tutor Promotion' }]} />

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tutor Promotion & Ranking</h1>
          <p className="mt-1 text-sm text-gray-500">
            Ordered exactly as the marketplaces show tutors: pinned first (in pin order), then by ranking score.
            Boost nudges; pin places.
          </p>
        </div>

        {toast && (
          <div className={`fixed right-4 top-4 z-[60] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
            {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {toast.msg}
          </div>
        )}

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">All Tutors</h2>
                <p className="text-xs text-gray-500">{tutors.length} tutor{tutors.length !== 1 ? 's' : ''} · ranked</p>
              </div>
            </div>
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No tutors found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Tutor</th>
                    <th className="px-4 py-3 text-right"><Star className="inline h-3.5 w-3.5" /> Rating</th>
                    <th className="px-4 py-3 text-right"><Gauge className="inline h-3.5 w-3.5" /> Completion</th>
                    <th className="px-4 py-3 text-right">Sessions</th>
                    <th className="px-4 py-3 text-right">Classes</th>
                    <th className="px-4 py-3 text-right"><TrendingUp className="inline h-3.5 w-3.5" /> Score</th>
                    <th className="px-4 py-3 text-right">Boost</th>
                    <th className="px-4 py-3 text-center"><Pin className="inline h-3.5 w-3.5" /> Pin</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((t, i) => (
                    <tr key={t.tutor_id} className={`hover:bg-gray-50 ${t.pin_rank != null ? 'bg-green-50/40' : ''}`}>
                      <td className="px-4 py-4 text-gray-400 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-green-100 text-xs font-bold text-green-700">
                            {t.avatar_url ? <img src={t.avatar_url} alt="" className="h-8 w-8 object-cover" /> : t.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{t.name}</p>
                            <p className="text-xs text-gray-500 truncate">{t.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums text-gray-800">
                        {t.rating_count > 0 ? <>{t.rating_avg.toFixed(1)} <span className="text-xs text-gray-400">({t.rating_count})</span></> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums text-gray-800">{t.completion_score}%</td>
                      <td className="px-4 py-4 text-right tabular-nums text-gray-800">{t.sessions_held}</td>
                      <td className="px-4 py-4 text-right tabular-nums text-gray-800">{t.classes_created}</td>
                      <td className="px-4 py-4 text-right font-semibold tabular-nums text-gray-900">{t.ranking_score.toFixed(1)}</td>
                      <td className="px-4 py-4 text-right tabular-nums">
                        {t.admin_boost > 0 ? <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">+{t.admin_boost}</span> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {t.pin_rank != null ? <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700"><Pin className="h-3 w-3" />{t.pin_rank}</span> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button onClick={() => setEditTarget(t)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Edit promotion">
                          <Edit2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {editTarget && (
        <EditModal
          tutor={editTarget}
          others={tutors.filter((t) => t.tutor_id !== editTarget.tutor_id)}
          onSave={saveEdit}
          onClose={() => setEditTarget(null)}
          saving={editSaving}
        />
      )}
    </DashboardLayout>
  );
}
