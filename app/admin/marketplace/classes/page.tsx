'use client';

// Admin control of the group-class marketplace order.
//
// The list is the marketplace, top to bottom. A divider splits it in two,
// because only the top half is actually storable:
//
//   above  pinned — an explicit position an admin dragged it to
//   below  ranked by score — computed, and so not hand-orderable; dragging a
//          class up across the divider is what pins it
//
// Showing one list with a divider rather than two panels keeps "this is the
// order students see" literally true, while being honest that dropping a
// class into the lower half means "stop pinning this", not "put it 7th".
//
// Drag-and-drop uses the native HTML5 events rather than a library: it is one
// vertical list, and the dependency isn't worth it. Native DnD is not
// keyboard-accessible, so every row also has move up/down buttons.

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import {
  Layers, Search, Loader2, Edit2, X, Save, Star, Pin, PinOff, TrendingUp,
  CheckCircle, AlertCircle, Gauge, GripVertical, ChevronUp, ChevronDown, Users,
} from 'lucide-react';

interface ClassRow {
  group_id: string;
  name: string;
  subject: string | null;
  cover_image: string | null;
  price_monthly: number | null;
  pricing_model: string | null;
  tutor_id: string;
  tutor_name: string;
  tutor_avatar: string | null;
  tutor_pin_rank: number | null;
  tutor_ranking_score: number;
  rating_avg: number;
  rating_count: number;
  member_count: number;
  max_students: number;
  completion_score: number;
  admin_boost: number;
  pin_rank: number | null;
  ranking_score: number;
  admin_boost_note: string | null;
  admin_boost_updated_at: string | null;
}

// ─── Boost modal ─────────────────────────────────────────────────────────────
function BoostModal({
  row, onSave, onClose, saving,
}: {
  row: ClassRow;
  onSave: (v: { admin_boost: number; admin_boost_note: string | null }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [boost, setBoost] = useState(row.admin_boost);
  const [note, setNote] = useState(row.admin_boost_note ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="truncate text-lg font-semibold text-gray-900">Boost — {row.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Class boost — <span className="tabular-nums">{boost}</span>/100
            </label>
            <p className="mb-2 text-xs text-gray-500">
              A nudge worth 10% of this class&apos;s score. It moves the class up the ranked
              section but never overtakes a pinned one — to place a class exactly, drag it
              above the divider instead.
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

          <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
            <p className="mb-1 font-medium text-gray-700">Where this class&apos;s score comes from</p>
            <p>
              Rating {row.rating_count > 0 ? `${row.rating_avg.toFixed(1)}★ (${row.rating_count})` : 'none yet'} ·
              {' '}{row.member_count}/{row.max_students || '∞'} students ·
              {' '}listing {row.completion_score}% complete ·
              {' '}tutor score {row.tutor_ranking_score.toFixed(1)}
            </p>
          </div>

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
            onClick={() => onSave({ admin_boost: boost, admin_boost_note: note.trim() || null })}
            disabled={saving}
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

// ─── Page ────────────────────────────────────────────────────────────────────
export default function AdminClassPromotionPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [rows, setRows] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [boostTarget, setBoostTarget] = useState<ClassRow | null>(null);
  const [boostSaving, setBoostSaving] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  // The list as it was before the in-flight save, so a failed PUT can put the
  // rows back where the admin found them rather than leaving a lie on screen.
  const lastGood = useRef<ClassRow[]>([]);

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
      const res = await fetch('/api/admin/marketplace/classes');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRows(json.classes ?? []);
      lastGood.current = json.classes ?? [];
    } catch {
      showToast('error', 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!authLoading) loadData(); }, [authLoading, loadData]);

  const pinnedCount = rows.filter((r) => r.pin_rank != null).length;

  /**
   * Persists the pinned block of `next`. The list is already in the order the
   * admin sees, so the pinned ids in order ARE the sequence to store.
   */
  async function persistOrder(next: ClassRow[]) {
    const pinned = next.filter((r) => r.pin_rank != null).map((r) => r.group_id);
    setSavingOrder(true);
    try {
      const res = await fetch('/api/admin/marketplace/classes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', pinned.length === 0 ? 'All classes unpinned' : 'Marketplace order saved');
      await loadData();
    } catch (e: any) {
      setRows(lastGood.current);
      showToast('error', e.message ?? 'Could not save the order');
    } finally {
      setSavingOrder(false);
    }
  }

  /** Positions are 1..pinnedAfter; everything past that is score-ordered. */
  function renumber(list: ClassRow[], pinnedAfter: number): ClassRow[] {
    return list.map((r, i) => ({ ...r, pin_rank: i < pinnedAfter ? i + 1 : null }));
  }

  /**
   * Moves `id` to visual position `to`.
   *
   * Only the pinned block is hand-orderable. Positions inside the ranked
   * section are computed from the score, so there is nothing to store about
   * one — a ranked class can be dragged INTO the block (which pins it) but not
   * shuffled within the section it already sits in.
   *
   * Dragging a pinned class down past the divider is the drag equivalent of
   * unpinning, so the block shrinks by one.
   */
  function moveTo(id: string, to: number) {
    const from = rows.findIndex((r) => r.group_id === id);
    if (from === -1) return;

    const moved = rows[from]!;
    const wasPinned = moved.pin_rank != null;
    const prevPinned = rows.filter((r) => r.pin_rank != null).length;
    const target = Math.max(0, Math.min(rows.length - 1, to));
    if (from === target) return;

    if (!wasPinned && target > prevPinned) {
      showToast('error', 'Below the divider the order comes from the score — pin the class to place it.');
      return;
    }

    const next = [...rows];
    next.splice(from, 1);
    next.splice(target, 0, moved);

    const pinnedAfter = wasPinned
      ? target >= prevPinned
        ? prevPinned - 1 // dragged out of the block
        : prevPinned // reordered within it
      : prevPinned + 1; // joined it

    const renumbered = renumber(next, pinnedAfter);
    setRows(renumbered);
    void persistOrder(renumbered);
  }

  function togglePin(row: ClassRow) {
    const pinned = rows.filter((r) => r.pin_rank != null);
    const isPinned = row.pin_rank != null;
    const others = rows.filter((r) => r.group_id !== row.group_id);

    // Unpin: fall to the top of the ranked section and let the score take over.
    // Pin: join the end of the pinned block, so nothing else shifts position.
    const next = isPinned
      ? [...others.filter((r) => r.pin_rank != null), row, ...others.filter((r) => r.pin_rank == null)]
      : [...pinned, row, ...others.filter((r) => r.pin_rank == null)];

    const renumbered = renumber(next, isPinned ? pinned.length - 1 : pinned.length + 1);
    setRows(renumbered);
    void persistOrder(renumbered);
  }

  async function saveBoost(v: { admin_boost: number; admin_boost_note: string | null }) {
    if (!boostTarget) return;
    setBoostSaving(true);
    try {
      const res = await fetch(`/api/admin/marketplace/classes/${boostTarget.group_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Boost updated');
      setBoostTarget(null);
      await loadData();
    } catch (e: any) {
      showToast('error', e.message ?? 'Failed to save');
    } finally {
      setBoostSaving(false);
    }
  }

  // Search hides rows but must never let a drag reorder against a list the
  // admin can only partly see, so dragging is disabled while filtering.
  const q = search.trim().toLowerCase();
  const visible = q
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.subject ?? '').toLowerCase().includes(q) ||
          r.tutor_name.toLowerCase().includes(q)
      )
    : rows;
  const dragEnabled = !q && !savingOrder;

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <AdminBreadcrumb items={[{ label: 'Marketplace' }, { label: 'Class Promotion' }]} />

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Class Promotion & Ranking</h1>
          <p className="mt-1 text-sm text-gray-500">
            Top to bottom, this is the order students see when browsing classes. Drag a class above
            the divider to pin it to an exact position; drag it back below to let its score decide
            again. Boost nudges a class within the ranked section.
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
                <Layers className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">All Classes</h2>
                <p className="text-xs text-gray-500">
                  {rows.length} class{rows.length !== 1 ? 'es' : ''} · {pinnedCount} pinned
                  {savingOrder && <span className="ml-2 text-green-600">saving…</span>}
                </p>
              </div>
            </div>
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search class, subject or tutor…"
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>

          {q && (
            <p className="border-b border-amber-100 bg-amber-50 px-6 py-2 text-xs text-amber-800">
              Dragging is off while searching — positions only mean anything against the full list.
              Clear the search to reorder.
            </p>
          )}

          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : visible.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No classes found</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {visible.map((r, i) => {
                const isPinned = r.pin_rank != null;
                const showsDivider = !q && i === pinnedCount && pinnedCount > 0;
                return (
                  <li key={r.group_id}>
                    {showsDivider && (
                      <div className="flex items-center gap-3 bg-gray-50 px-6 py-1.5">
                        <div className="h-px flex-1 bg-gray-300" />
                        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Ranked by score below
                        </span>
                        <div className="h-px flex-1 bg-gray-300" />
                      </div>
                    )}
                    <div
                      draggable={dragEnabled}
                      onDragStart={() => setDragId(r.group_id)}
                      onDragEnd={() => { setDragId(null); setDropIndex(null); }}
                      onDragOver={(e) => { if (dragEnabled && dragId) { e.preventDefault(); setDropIndex(i); } }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragId && dragId !== r.group_id) moveTo(dragId, i);
                        setDragId(null); setDropIndex(null);
                      }}
                      className={[
                        'flex items-center gap-3 px-4 py-3 sm:px-6',
                        isPinned ? 'bg-green-50/50' : '',
                        dragId === r.group_id ? 'opacity-40' : '',
                        dropIndex === i && dragId && dragId !== r.group_id ? 'border-t-2 border-green-500' : '',
                        dragEnabled ? 'cursor-grab active:cursor-grabbing' : '',
                      ].join(' ')}
                    >
                      <GripVertical className={`h-4 w-4 shrink-0 ${dragEnabled ? 'text-gray-300' : 'text-gray-200'}`} />

                      <span className="w-6 shrink-0 text-right text-sm tabular-nums text-gray-400">{i + 1}</span>

                      <div className="h-10 w-14 shrink-0 overflow-hidden rounded-md bg-gray-100">
                        {r.cover_image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.cover_image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
                            no cover
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-gray-900">{r.name}</p>
                          {isPinned && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                              <Pin className="h-3 w-3" />{r.pin_rank}
                            </span>
                          )}
                          {r.admin_boost > 0 && (
                            <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                              +{r.admin_boost}
                            </span>
                          )}
                          {r.tutor_pin_rank != null && (
                            <span
                              className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700"
                              title={`${r.tutor_name} is pinned at position ${r.tutor_pin_rank}, which lifts all of their classes`}
                            >
                              tutor pin {r.tutor_pin_rank}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-gray-500">
                          {r.subject ? `${r.subject} · ` : ''}{r.tutor_name}
                        </p>
                      </div>

                      <div className="hidden shrink-0 items-center gap-4 text-xs text-gray-600 sm:flex">
                        <span className="inline-flex items-center gap-1" title="Class rating">
                          <Star className="h-3.5 w-3.5 text-amber-400" />
                          {r.rating_count > 0 ? r.rating_avg.toFixed(1) : '—'}
                        </span>
                        <span className="inline-flex items-center gap-1 tabular-nums" title="Students enrolled">
                          <Users className="h-3.5 w-3.5 text-gray-400" />
                          {r.member_count}/{r.max_students || '∞'}
                        </span>
                        <span className="inline-flex items-center gap-1 tabular-nums" title="Listing completeness">
                          <Gauge className="h-3.5 w-3.5 text-gray-400" />
                          {r.completion_score}%
                        </span>
                        <span className="inline-flex w-14 items-center justify-end gap-1 font-semibold tabular-nums text-gray-900" title="Class ranking score">
                          <TrendingUp className="h-3.5 w-3.5 text-gray-400" />
                          {r.ranking_score.toFixed(1)}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        {/* Keyboard path for the same moves as dragging. Only
                            the pinned block can be stepped through; the one
                            ranked class directly under the divider can step up
                            into it, and nothing below that has a position to
                            move to. */}
                        <button
                          onClick={() => moveTo(r.group_id, i - 1)}
                          disabled={!dragEnabled || (isPinned ? i === 0 : i !== pinnedCount)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                          title={isPinned ? 'Move up' : 'Pin here, above the divider'}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => moveTo(r.group_id, i + 1)}
                          disabled={!dragEnabled || !isPinned || i === visible.length - 1}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                          title={
                            isPinned
                              ? i === pinnedCount - 1 ? 'Move down — unpins this class' : 'Move down'
                              : 'Ranked classes are ordered by score'
                          }
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => togglePin(r)}
                          disabled={savingOrder}
                          className={`rounded p-1.5 disabled:opacity-40 ${isPinned ? 'text-green-600 hover:bg-green-100' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'}`}
                          title={isPinned ? 'Unpin' : 'Pin to the end of the pinned block'}
                        >
                          {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => setBoostTarget(r)}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          title="Edit boost"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="text-xs text-gray-500">
          A class&apos;s score blends its rating (25%), its tutor&apos;s marketplace score (25%),
          enrolment (15%), how full it is (10%), how complete the listing is (15%) and the admin
          boost (10%). Tutor pins still lift every class that tutor teaches, below any class pinned
          here — set those on{' '}
          <a href="/admin/tutors" className="text-green-700 underline">Tutor Promotion</a>.
        </p>
      </div>

      {boostTarget && (
        <BoostModal
          row={boostTarget}
          onSave={saveBoost}
          onClose={() => setBoostTarget(null)}
          saving={boostSaving}
        />
      )}
    </DashboardLayout>
  );
}
