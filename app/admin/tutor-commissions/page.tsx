'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import {
  Percent, Users, ShieldCheck, Search, Loader2,
  Edit2, Plus, Trash2, CheckCircle, AlertCircle, X, Save,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

type CommissionMode = 'constant' | 'reflexive';

interface GlobalSettings {
  id: string;
  commission_mode: CommissionMode;
  commission_rate: number | null;
  updated_at: string;
}

interface TutorRow {
  id: string;
  full_name: string | null;
  email: string | null;
  commission_mode: CommissionMode | null;
  commission_rate: number | null;
  is_commission_exception: boolean;
  updated_at: string | null;
}

interface EditState {
  tutorId: string;
  mode: CommissionMode;
  rate: string;
  isException: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtRate(mode: CommissionMode | null, rate: number | null): string {
  if (!mode) return '—';
  if (mode === 'reflexive') return 'Reflexive';
  return rate != null ? `${rate}%` : '—';
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-TT', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({
  tutor,
  initial,
  onSave,
  onClose,
  saving,
}: {
  tutor: TutorRow;
  initial: EditState;
  onSave: (state: EditState) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [mode, setMode] = useState<CommissionMode>(initial.mode);
  const [rate, setRate] = useState(initial.rate);
  const [isException, setIsException] = useState(initial.isException);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Edit Commission — {tutor.full_name ?? tutor.email}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Mode */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Commission Mode</label>
            <div className="flex gap-2">
              {(['constant', 'reflexive'] as CommissionMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    mode === m
                      ? 'border-green-600 bg-green-50 text-green-700'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {m === 'constant' ? 'Constant Rate' : 'Reflexive Rate'}
                </button>
              ))}
            </div>
          </div>

          {/* Rate */}
          {mode === 'constant' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Commission Rate (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-10 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  placeholder="e.g. 20"
                />
                <Percent className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              </div>
            </div>
          )}

          {mode === 'reflexive' && (
            <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Reflexive mode uses the existing tier-based commission logic:
              &lt;TT$100 → 10%, TT$100–199 → 15%, TT$200+ → 20%
            </p>
          )}

          {/* Exception toggle */}
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={isException}
              onChange={(e) => setIsException(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <div>
              <p className="text-sm font-medium text-gray-700">Exception List</p>
              <p className="text-xs text-gray-500">
                Tutors on this list are skipped when &ldquo;Apply to All&rdquo; is used
              </p>
            </div>
          </label>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ tutorId: tutor.id, mode, rate, isException })}
            disabled={saving || (mode === 'constant' && !rate)}
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

// ─── Add to Exception Modal ────────────────────────────────────────────────────

function AddExceptionModal({
  tutors,
  existing,
  onAdd,
  onClose,
  saving,
}: {
  tutors: TutorRow[];
  existing: Set<string>;
  onAdd: (tutorId: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');

  const available = tutors.filter(
    (t) =>
      !existing.has(t.id) &&
      (t.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        t.email?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Add to Exception List</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tutors..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-200">
            {available.length === 0 ? (
              <p className="p-4 text-center text-sm text-gray-500">No tutors available</p>
            ) : (
              available.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                    selected === t.id ? 'bg-green-50' : ''
                  }`}
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
                    {(t.full_name ?? t.email ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{t.full_name ?? '—'}</p>
                    <p className="text-xs text-gray-500">{t.email}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => selected && onAdd(selected)}
            disabled={!selected || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add to Exception List
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function TutorCommissionsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
  const [tutors, setTutors] = useState<TutorRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Global form state
  const [globalMode, setGlobalMode] = useState<CommissionMode>('reflexive');
  const [globalRate, setGlobalRate] = useState('');
  const [globalSaving, setGlobalSaving] = useState(false);

  // Applying to all
  const [applying, setApplying] = useState(false);

  // Search for all-tutors table
  const [search, setSearch] = useState('');

  // Edit modal
  const [editTarget, setEditTarget] = useState<TutorRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Add exception modal
  const [showAddException, setShowAddException] = useState(false);
  const [addExceptionSaving, setAddExceptionSaving] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  // Auth
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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [gRes, tRes] = await Promise.all([
        fetch('/api/admin/tutor-commissions/global'),
        fetch('/api/admin/tutor-commissions'),
      ]);
      const [gJson, tJson] = await Promise.all([gRes.json(), tRes.json()]);

      if (gJson.settings) {
        setGlobalSettings(gJson.settings);
        setGlobalMode(gJson.settings.commission_mode);
        setGlobalRate(gJson.settings.commission_rate != null ? String(gJson.settings.commission_rate) : '');
      }
      if (tJson.tutors) setTutors(tJson.tutors);
    } catch {
      showToast('error', 'Failed to load commission data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) loadData();
  }, [authLoading, loadData]);

  // Save global settings
  async function saveGlobal() {
    if (globalMode === 'constant' && !globalRate) return;
    setGlobalSaving(true);
    try {
      const res = await fetch('/api/admin/tutor-commissions/global', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commission_mode: globalMode,
          commission_rate: globalMode === 'constant' ? parseFloat(globalRate) : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Global settings saved');
      await loadData();
    } catch (e: any) {
      showToast('error', e.message ?? 'Failed to save');
    } finally {
      setGlobalSaving(false);
    }
  }

  // Apply to all
  async function applyToAll() {
    if (
      !confirm(
        'This will update commission settings for all tutors except tutors in the exception list. Tutors in the exception list will keep their custom commission settings.'
      )
    ) return;
    setApplying(true);
    try {
      const res = await fetch('/api/admin/tutor-commissions/apply-all', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast('success', `Updated ${json.updated} tutor${json.updated !== 1 ? 's' : ''}`);
      await loadData();
    } catch (e: any) {
      showToast('error', e.message ?? 'Failed to apply');
    } finally {
      setApplying(false);
    }
  }

  // Save single tutor edit
  async function saveEdit(state: EditState) {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/tutor-commissions/${state.tutorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commission_mode: state.mode,
          commission_rate: state.mode === 'constant' ? parseFloat(state.rate) : null,
          is_commission_exception: state.isException,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Commission settings updated');
      setEditTarget(null);
      await loadData();
    } catch (e: any) {
      showToast('error', e.message ?? 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  }

  // Add to exception list (keeps their existing commission or defaults to global)
  async function addException(tutorId: string) {
    setAddExceptionSaving(true);
    const tutor = tutors.find((t) => t.id === tutorId);
    const mode = tutor?.commission_mode ?? globalMode;
    const rate = tutor?.commission_rate ?? (globalMode === 'constant' ? parseFloat(globalRate) : null);
    try {
      const res = await fetch(`/api/admin/tutor-commissions/${tutorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commission_mode: mode,
          commission_rate: rate,
          is_commission_exception: true,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Added to exception list');
      setShowAddException(false);
      await loadData();
    } catch (e: any) {
      showToast('error', e.message ?? 'Failed to add');
    } finally {
      setAddExceptionSaving(false);
    }
  }

  // Remove from exception list
  async function removeException(tutorId: string) {
    const tutor = tutors.find((t) => t.id === tutorId);
    try {
      const res = await fetch(`/api/admin/tutor-commissions/${tutorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commission_mode: tutor?.commission_mode ?? globalMode,
          commission_rate: tutor?.commission_rate ?? null,
          is_commission_exception: false,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Removed from exception list');
      await loadData();
    } catch (e: any) {
      showToast('error', e.message ?? 'Failed to remove');
    }
  }

  const exceptionTutors = tutors.filter((t) => t.is_commission_exception);
  const exceptionIds = new Set(exceptionTutors.map((t) => t.id));

  const filteredTutors = tutors.filter(
    (t) =>
      !search ||
      t.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.email?.toLowerCase().includes(search.toLowerCase())
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
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tutor Commission Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage platform-wide commission rates and per-tutor overrides.
          </p>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={`fixed right-4 top-4 z-[60] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              toast.type === 'success'
                ? 'bg-green-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            {toast.msg}
          </div>
        )}

        {/* ── Section 1: Global Commission Settings ── */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100">
              <Percent className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Global Commission Settings</h2>
              <p className="text-xs text-gray-500">
                This default applies to all tutors not in the exception list when you use &ldquo;Apply to All&rdquo;
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-5">
              {/* Mode toggle */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Commission Mode</label>
                <div className="flex gap-2">
                  {(['constant', 'reflexive'] as CommissionMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setGlobalMode(m)}
                      className={`rounded-lg border px-5 py-2 text-sm font-medium transition-colors ${
                        globalMode === m
                          ? 'border-green-600 bg-green-50 text-green-700'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {m === 'constant' ? 'Constant Rate' : 'Reflexive Rate'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rate input */}
              {globalMode === 'constant' && (
                <div className="max-w-xs">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Default commission rate
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={globalRate}
                      onChange={(e) => setGlobalRate(e.target.value)}
                      placeholder="e.g. 20"
                      className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-10 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <Percent className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
              )}

              {globalMode === 'reflexive' && (
                <div className="max-w-md rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  Uses the existing tier-based logic: &lt;TT$100 → 10% &nbsp;|&nbsp; TT$100–199 → 15% &nbsp;|&nbsp; TT$200+ → 20%
                </div>
              )}

              {/* Save + Apply row */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  onClick={saveGlobal}
                  disabled={globalSaving || (globalMode === 'constant' && !globalRate)}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {globalSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save global settings
                </button>

                <button
                  onClick={applyToAll}
                  disabled={applying}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                  Apply to all non-exception tutors
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Section 2: Exception List ── */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                <ShieldCheck className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Exception List</h2>
                <p className="text-xs text-gray-500">
                  These tutors are skipped when &ldquo;Apply to All&rdquo; is used
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowAddException(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              <Plus className="h-4 w-4" /> Add tutor
            </button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : exceptionTutors.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No tutors in the exception list
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <th className="px-6 py-3">Tutor</th>
                    <th className="px-6 py-3">Mode</th>
                    <th className="px-6 py-3">Rate</th>
                    <th className="px-6 py-3">Last Updated</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {exceptionTutors.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">{t.full_name ?? '—'}</p>
                        <p className="text-xs text-gray-500">{t.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          t.commission_mode === 'constant'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {t.commission_mode === 'constant' ? 'Constant' : 'Reflexive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-800">
                        {fmtRate(t.commission_mode, t.commission_rate)}
                      </td>
                      <td className="px-6 py-4 text-gray-500">{fmtDate(t.updated_at)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() =>
                              setEditTarget(t)
                            }
                            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => removeException(t.id)}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Remove from exception list"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Section 3: All Tutors ── */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">All Tutors</h2>
                <p className="text-xs text-gray-500">{tutors.length} tutor{tutors.length !== 1 ? 's' : ''} total</p>
              </div>
            </div>
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filteredTutors.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No tutors found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <th className="px-6 py-3">Tutor</th>
                    <th className="px-6 py-3">Mode</th>
                    <th className="px-6 py-3">Rate</th>
                    <th className="px-6 py-3">Exception?</th>
                    <th className="px-6 py-3">Last Updated</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTutors.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">{t.full_name ?? '—'}</p>
                        <p className="text-xs text-gray-500">{t.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        {t.commission_mode ? (
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            t.commission_mode === 'constant'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {t.commission_mode === 'constant' ? 'Constant' : 'Reflexive'}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-800">
                        {fmtRate(t.commission_mode, t.commission_rate)}
                      </td>
                      <td className="px-6 py-4">
                        {t.is_commission_exception ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                            <ShieldCheck className="h-3 w-3" /> Yes
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">No</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-500">{fmtDate(t.updated_at)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setEditTarget(t)}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="Edit commission"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          {t.is_commission_exception ? (
                            <button
                              onClick={() => removeException(t.id)}
                              className="rounded-md p-1.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-600"
                              title="Remove from exception list"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={async () => {
                                const tutor = tutors.find(x => x.id === t.id);
                                if (!tutor) return;
                                const mode = tutor.commission_mode ?? globalMode;
                                const rate = tutor.commission_rate ?? (globalMode === 'constant' ? parseFloat(globalRate) : null);
                                try {
                                  const res = await fetch(`/api/admin/tutor-commissions/${t.id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ commission_mode: mode, commission_rate: rate, is_commission_exception: true }),
                                  });
                                  if (!res.ok) throw new Error((await res.json()).error);
                                  showToast('success', 'Added to exception list');
                                  await loadData();
                                } catch (e: any) {
                                  showToast('error', e.message ?? 'Failed');
                                }
                              }}
                              className="rounded-md p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600"
                              title="Add to exception list"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Edit modal */}
      {editTarget && (
        <EditModal
          tutor={editTarget}
          initial={{
            tutorId: editTarget.id,
            mode: editTarget.commission_mode ?? globalMode,
            rate: editTarget.commission_rate != null ? String(editTarget.commission_rate) : globalRate,
            isException: editTarget.is_commission_exception,
          }}
          onSave={saveEdit}
          onClose={() => setEditTarget(null)}
          saving={editSaving}
        />
      )}

      {/* Add exception modal */}
      {showAddException && (
        <AddExceptionModal
          tutors={tutors}
          existing={exceptionIds}
          onAdd={addException}
          onClose={() => setShowAddException(false)}
          saving={addExceptionSaving}
        />
      )}
    </DashboardLayout>
  );
}
