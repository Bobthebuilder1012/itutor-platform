'use client';

// Inline-editable version of the tutor's public-profile summary for the
// "My Business" page. Every field has an edit affordance so the tutor can change
// their info in place without navigating to get-listed. All writes go directly
// to Supabase, mirroring the exact patterns on the get-listed page (profiles for
// name/bio/avatar; tutor_subjects for subjects + rates), and fire
// notifyCompletionUpdated() so the completion gate stays in sync.

import { useEffect, useRef, useState } from 'react';
import { MapPin, Pencil, Check, X, Camera, Loader2, Plus, Trash2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import { notifyCompletionUpdated } from '@/lib/hooks/useTutorCompletion';
import VerifiedBadge from '@/components/VerifiedBadge';

type SubjectRow = { rowId: string; subject_id: string; name: string; curriculum: string; price: number };
type SubjectSearchResult = { id: string; name: string; curriculum: string; level: string; label: string | null };

const INPUT = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand';

export default function EditableProfilePanel({ profile, onUpdated }: { profile: any; onUpdated?: () => void }) {
  const tutorId: string | undefined = profile?.id;

  // Name
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Bio
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState('');
  const [savingBio, setSavingBio] = useState(false);

  // Avatar
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Subjects & rates
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
  const [savingRateId, setSavingRateId] = useState<string | null>(null);

  // Add-subject search
  const [subjectQuery, setSubjectQuery] = useState('');
  const [subjectResults, setSubjectResults] = useState<SubjectSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [changeInFlight, setChangeInFlight] = useState(false);

  useEffect(() => { if (tutorId) loadSubjects(tutorId); /* eslint-disable-next-line */ }, [tutorId]);

  async function loadSubjects(id: string) {
    setSubjectsLoading(true);
    try {
      const { data } = await supabase
        .from('tutor_subjects')
        .select('id, subject_id, price_per_hour_ttd, subjects(name, label, curriculum)')
        .eq('tutor_id', id);
      const rows: SubjectRow[] = (data ?? []).map((r: any) => {
        const s = Array.isArray(r.subjects) ? r.subjects[0] : r.subjects;
        return {
          rowId: r.id,
          subject_id: r.subject_id,
          name: s?.label || s?.name || 'Subject',
          curriculum: s?.curriculum || '',
          price: r.price_per_hour_ttd ?? 0,
        };
      });
      setSubjects(rows);
      const inputs: Record<string, string> = {};
      rows.forEach((r) => { if (r.price > 0) inputs[r.subject_id] = String(r.price); });
      setRateInputs(inputs);
    } finally {
      setSubjectsLoading(false);
    }
  }

  // ── Name ──────────────────────────────────────────────────────────────────
  function startName() { setNameInput(getDisplayName(profile) || ''); setEditingName(true); }
  async function saveName() {
    if (!tutorId) return;
    setSavingName(true);
    try {
      await supabase.from('profiles').update({ display_name: nameInput.trim() || null }).eq('id', tutorId);
      setEditingName(false);
      onUpdated?.();
    } finally {
      setSavingName(false);
    }
  }

  // ── Bio ───────────────────────────────────────────────────────────────────
  function startBio() { setBioInput(profile?.bio || ''); setEditingBio(true); }
  async function saveBio() {
    if (!tutorId) return;
    setSavingBio(true);
    try {
      await supabase.from('profiles').update({ bio: bioInput.trim() || null }).eq('id', tutorId);
      setEditingBio(false);
      onUpdated?.();
      notifyCompletionUpdated();
    } finally {
      setSavingBio(false);
    }
  }

  // ── Avatar ──────────────────────────────────────────────────────────────────
  async function handleAvatar(file: File) {
    if (!tutorId) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${tutorId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, cacheControl: '3600' });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', tutorId);
      onUpdated?.();
      notifyCompletionUpdated();
    } catch (e) {
      console.error('[EditableProfilePanel] avatar upload failed:', e);
    } finally {
      setUploading(false);
    }
  }

  // ── Subjects & rates ────────────────────────────────────────────────────────
  async function saveRate(subjectId: string) {
    if (!tutorId) return;
    const price = parseFloat(rateInputs[subjectId] ?? '');
    if (!price || price <= 0) return;
    setSavingRateId(subjectId);
    try {
      await supabase.from('tutor_subjects').upsert(
        { tutor_id: tutorId, subject_id: subjectId, price_per_hour_ttd: price, mode: 'either' },
        { onConflict: 'tutor_id,subject_id' }
      );
      await loadSubjects(tutorId);
      notifyCompletionUpdated();
    } finally {
      setSavingRateId(null);
    }
  }

  async function addSubject(subjectId: string) {
    if (!tutorId) return;
    setChangeInFlight(true);
    try {
      await supabase.from('tutor_subjects').upsert(
        { tutor_id: tutorId, subject_id: subjectId, price_per_hour_ttd: 100, mode: 'either' },
        { onConflict: 'tutor_id,subject_id' }
      );
      await loadSubjects(tutorId);
      notifyCompletionUpdated();
      setSubjectQuery('');
      setSubjectResults([]);
      setShowDropdown(false);
    } finally {
      setChangeInFlight(false);
    }
  }

  async function removeSubject(subjectId: string) {
    if (!tutorId) return;
    setChangeInFlight(true);
    try {
      await supabase.from('tutor_subjects').delete().eq('tutor_id', tutorId).eq('subject_id', subjectId);
      await loadSubjects(tutorId);
      notifyCompletionUpdated();
    } finally {
      setChangeInFlight(false);
    }
  }

  // Subject search debounce
  useEffect(() => {
    if (!subjectQuery.trim()) { setSubjectResults([]); setShowDropdown(false); return; }
    const t = setTimeout(async () => {
      const safe = subjectQuery.trim().replace(/%/g, '').replace(/,/g, '');
      const { data } = await supabase
        .from('subjects')
        .select('id, name, curriculum, level, label')
        .or(`name.ilike.%${safe}%,label.ilike.%${safe}%`)
        .order('name')
        .limit(10);
      const currentIds = new Set(subjects.map((s) => s.subject_id));
      setSubjectResults(((data ?? []) as SubjectSearchResult[]).filter((s) => !currentIds.has(s.id)));
      setShowDropdown(true);
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectQuery, subjects]);

  const name = getDisplayName(profile);
  const isVerified = profile?.tutor_verification_status === 'VERIFIED';
  const initials = (name || 'T').split(' ').map((s: string) => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-4">
      {/* Summary — avatar / name / bio */}
      <section className="rounded-3xl bg-background border border-border p-6">
        <div className="flex items-start gap-4">
          {/* Avatar with camera overlay */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="relative size-16 rounded-2xl bg-brand grid place-items-center text-white text-lg font-bold overflow-hidden shrink-0 group"
            title="Change photo"
          >
            {profile?.avatar_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={profile.avatar_url} alt="" className="size-16 object-cover" />
              : initials}
            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition grid place-items-center">
              {uploading ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatar(f); }} />

          <div className="min-w-0 flex-1">
            {/* Name */}
            {editingName ? (
              <div className="flex items-center gap-2">
                <input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)} className={INPUT}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }} />
                <button onClick={saveName} disabled={savingName} className="size-8 grid place-items-center rounded-lg bg-brand text-white hover:bg-brand-deep disabled:opacity-50">
                  {savingName ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                </button>
                <button onClick={() => setEditingName(false)} className="size-8 grid place-items-center rounded-lg border border-border hover:bg-muted"><X className="size-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <h2 className="text-lg font-bold text-ink truncate">{name}</h2>
                {isVerified && <VerifiedBadge size="sm" />}
                <button onClick={startName} className="ml-1 size-6 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-ink" title="Edit name"><Pencil className="size-3.5" /></button>
              </div>
            )}
            {profile?.country && (
              <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" /> {profile.country}
              </div>
            )}
          </div>
        </div>

        {/* Bio */}
        <div className="mt-4">
          {editingBio ? (
            <div className="space-y-2">
              <textarea autoFocus value={bioInput} onChange={(e) => setBioInput(e.target.value)} rows={4}
                className={cn(INPUT, 'resize-y')} placeholder="Tell students about your experience and teaching style…" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditingBio(false)} className="px-3 py-1.5 rounded-lg border border-border text-sm font-semibold hover:bg-muted">Cancel</button>
                <button onClick={saveBio} disabled={savingBio} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50">
                  {savingBio ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {profile?.bio || <span className="italic">No bio yet — add one so students know who you are.</span>}
              </p>
              <button onClick={startBio} className="shrink-0 size-6 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-ink" title="Edit bio"><Pencil className="size-3.5" /></button>
            </div>
          )}
        </div>
      </section>

      {/* Subjects & rates */}
      <section className="rounded-3xl bg-background border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ink">Subjects &amp; rates</h3>
          <span className="text-xs text-muted-foreground">TT$ / hour</span>
        </div>

        {subjectsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        ) : subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subjects yet — add one below.</p>
        ) : (
          <ul className="divide-y divide-border">
            {subjects.map((s) => (
              <li key={s.rowId} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink">{s.name}</div>
                  {s.curriculum && <div className="text-xs text-muted-foreground">{s.curriculum}</div>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground">TT$</span>
                  <input
                    type="number" min={1} inputMode="numeric"
                    value={rateInputs[s.subject_id] ?? ''}
                    onChange={(e) => setRateInputs((p) => ({ ...p, [s.subject_id]: e.target.value }))}
                    placeholder={s.price > 0 ? String(s.price) : '—'}
                    className="w-20 px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                  <button
                    onClick={() => saveRate(s.subject_id)}
                    disabled={savingRateId === s.subject_id || !(parseFloat(rateInputs[s.subject_id] ?? '') > 0)}
                    className="size-8 grid place-items-center rounded-lg bg-brand text-white hover:bg-brand-deep disabled:opacity-40"
                    title="Save rate"
                  >
                    {savingRateId === s.subject_id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  </button>
                  <button
                    onClick={() => removeSubject(s.subject_id)}
                    disabled={changeInFlight}
                    className="size-8 grid place-items-center rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-40"
                    title="Remove subject"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Add subject */}
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={subjectQuery}
              onChange={(e) => setSubjectQuery(e.target.value)}
              onFocus={() => { if (subjectResults.length) setShowDropdown(true); }}
              placeholder="Add a subject…"
              className={cn(INPUT, 'pl-9')}
              disabled={changeInFlight}
            />
          </div>
          {showDropdown && subjectResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-background shadow-pop max-h-60 overflow-y-auto">
              {subjectResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => addSubject(r.id)}
                  disabled={changeInFlight}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                >
                  <Plus className="size-3.5 text-brand-deep shrink-0" />
                  <span className="text-ink">{r.label || r.name}</span>
                  {r.curriculum && <span className="text-xs text-muted-foreground">· {r.curriculum}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
