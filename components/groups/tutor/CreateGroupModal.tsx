'use client';

import { useCallback, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { CreateGroupInput, DayOfWeek, RecurrenceType } from '@/lib/types/groups';
import { supabase } from '@/lib/supabase/client';
import { getCroppedImg, type Area } from '@/lib/utils/imageCrop';
import { randomDefaultThumbnailValue, isDefaultThumbnail } from '@/lib/defaultThumbnails';

interface CreateGroupModalProps {
  onCreated: (groupId: string) => void;
  onClose: () => void;
}

const STEPS = ['Details', 'Schedule', 'Review'] as const;
const DAY_SHORT: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

function formatTime12(t: string) {
  const [hh, mm] = t.split(':').map(Number);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

function computeEndTime(t: string, dur: number) {
  const [hh, mm] = t.split(':').map(Number);
  const total = hh * 60 + mm + dur;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  const ampm = eh >= 12 ? 'PM' : 'AM';
  return `${eh % 12 || 12}:${String(em).padStart(2, '0')} ${ampm}`;
}

export default function CreateGroupModal({ onCreated, onClose }: CreateGroupModalProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<CreateGroupInput>({
    name: '',
    description: '',
    topic: '',
    subject: '',
    subjects: [],
    form_level: 'FORM_4',
  });
  const [goals, setGoals] = useState('');

  // Schedule state
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('weekly');
  const [recurrenceDays, setRecurrenceDays] = useState<DayOfWeek[]>([]);
  const [startTime, setStartTime] = useState('09:00');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Image handling
  const [uploadingImage, setUploadingImage] = useState(false);
  const [draggingImage, setDraggingImage] = useState(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Subject search
  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectResults, setSubjectResults] = useState<{ id: string; label: string }[]>([]);
  const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);
  const subjectDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchSubjects = (query: string) => {
    setSubjectSearch(query);
    if (subjectDebounce.current) clearTimeout(subjectDebounce.current);
    if (!query.trim()) { setSubjectResults([]); setSubjectDropdownOpen(false); return; }
    subjectDebounce.current = setTimeout(async () => {
      const { data } = await supabase
        .from('subjects')
        .select('id, label')
        .ilike('label', `%${query}%`)
        .eq('is_active', true)
        .limit(15);
      setSubjectResults(data ?? []);
      setSubjectDropdownOpen(true);
    }, 200);
  };

  const selectSubject = (label: string) => {
    setForm((prev) => ({ ...prev, subject: label, subjects: [label] }));
    setSubjectSearch(label);
    setSubjectDropdownOpen(false);
  };

  const clearSubject = () => {
    setForm((prev) => ({ ...prev, subject: '', subjects: [] }));
    setSubjectSearch('');
  };

  const toggleDay = (day: DayOfWeek) => {
    setRecurrenceDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const uploadImage = async (file: Blob) => {
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) return;
    setUploadingImage(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setUploadingImage(false); return; }
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${userData.user.id}/groups/cover-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: true });
    if (uploadError) { setError(uploadError.message); setUploadingImage(false); return; }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    setForm((prev) => ({ ...prev, cover_image: `${urlData.publicUrl}?t=${Date.now()}` }));
    setUploadingImage(false);
  };

  const onCropComplete = useCallback((_: Area, px: Area) => setCroppedAreaPixels(px), []);

  const handleImageSelection = (file: File | null) => {
    if (!file?.type.startsWith('image/') || file.size > 10 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => { setCropImageSrc(reader.result as string); setCrop({ x: 0, y: 0 }); setZoom(1); };
    reader.readAsDataURL(file);
  };

  const handleApplyCrop = async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;
    try {
      const blob = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      await uploadImage(blob);
      setCropImageSrc(null);
    } catch (err: any) { setError(err?.message || 'Failed to upload image'); }
  };

  const canProceed = () => {
    if (step === 1) return !!form.name.trim();
    if (step === 2) {
      if (recurrenceType === 'weekly' && recurrenceDays.length === 0) return false;
      return !!startTime;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Class title is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const payload = { ...form };
      if (!payload.cover_image || isDefaultThumbnail(payload.cover_image)) {
        payload.cover_image = randomDefaultThumbnailValue();
      }

      // 1. Create the group
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create class');

      const groupId = data.group.id;

      // 2. Auto-create the session with the schedule
      const today = new Date().toISOString().slice(0, 10);
      const sessionPayload = {
        title: form.name.trim(),
        recurrence_type: recurrenceType,
        recurrence_days: recurrenceType === 'weekly' ? recurrenceDays : [],
        start_time: startTime,
        duration_minutes: durationMinutes,
        starts_on: recurrenceType === 'none' ? sessionDate : today,
        timezone_offset: new Date().getTimezoneOffset(),
      };

      const sessRes = await fetch(`/api/groups/${groupId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionPayload),
      });
      if (!sessRes.ok) {
        const sessData = await sessRes.json();
        console.error('Session creation failed:', sessData.error);
      }

      onCreated(groupId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const activeDayLabels = recurrenceDays.map((d) => DAY_SHORT[d]).join(', ');

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Create a New Class</h2>
              <p className="text-xs text-gray-500 mt-0.5">Step {step} of 3</p>
            </div>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Step bar */}
          <div className="flex items-center gap-0 px-5 pt-3 flex-shrink-0">
            {[1, 2, 3].map((s, i) => (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div className={`transition-all rounded-full ${s < step ? 'w-2 h-2 bg-emerald-500' : s === step ? 'w-5 h-2 bg-emerald-500 rounded-md' : 'w-2 h-2 bg-gray-200'}`} />
                {i < 2 && <div className={`flex-1 h-0.5 mx-1 transition-colors ${s < step ? 'bg-emerald-500' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
          <div className="flex justify-between px-5 pt-1 pb-3 flex-shrink-0">
            {STEPS.map((l, i) => (
              <span key={l} className={`text-[10px] ${i + 1 <= step ? 'text-emerald-600 font-semibold' : 'text-gray-300'}`}>{l}</span>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 pb-5" style={{ scrollbarWidth: 'thin' }}>
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

            {/* STEP 1: DETAILS */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Class Title <span className="text-red-400">*</span></label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. CSEC Trigonometry Mastery"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <input type="text" value={subjectSearch} onChange={(e) => searchSubjects(e.target.value)}
                      onFocus={() => { if (subjectResults.length > 0) setSubjectDropdownOpen(true); }}
                      placeholder="Search CSEC or CAPE subjects..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-8" />
                    {form.subject && (
                      <button type="button" onClick={clearSubject} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                  {subjectDropdownOpen && subjectResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {subjectResults.map((s) => (
                        <button key={s.id} type="button" onClick={() => selectSubject(s.label)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 transition-colors ${form.subject === s.label ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-700'}`}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Form level</label>
                  <select value={form.form_level ?? 'FORM_4'} onChange={(e) => setForm({ ...form, form_level: e.target.value as any })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="FORM_1">Form 1</option><option value="FORM_2">Form 2</option><option value="FORM_3">Form 3</option>
                    <option value="FORM_4">Form 4</option><option value="FORM_5">Form 5</option><option value="CAPE">CAPE</option>
                  </select>
                </div>
              </div>
            )}

            {/* STEP 2: SCHEDULE */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Recurrence</label>
                  <div className="flex gap-2">
                    {(['none', 'weekly', 'daily'] as RecurrenceType[]).map((rt) => (
                      <button key={rt} type="button" onClick={() => setRecurrenceType(rt)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${recurrenceType === rt ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400'}`}>
                        {rt === 'none' ? 'One-Time' : rt}
                      </button>
                    ))}
                  </div>
                </div>

                {recurrenceType === 'weekly' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Which days?</label>
                    <div className="flex gap-1.5">
                      {([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]).map((day) => (
                        <button key={day} type="button" onClick={() => toggleDay(day)}
                          className={`flex-1 py-2.5 rounded-lg text-xs font-semibold border transition-colors ${recurrenceDays.includes(day) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400'}`}>
                          {DAY_SHORT[day]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {recurrenceType === 'none' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Session Date <span className="text-red-400">*</span></label>
                    <p className="text-xs text-gray-500 mb-1.5">The date this one-time session will take place.</p>
                    <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time <span className="text-red-400">*</span></label>
                    <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
                    <select value={durationMinutes} onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value={30}>30</option><option value={60}>60</option><option value={90}>90</option><option value={120}>120</option>
                    </select>
                  </div>
                </div>

                {/* Session preview */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5">
                  <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={2} /><line x1="16" y1="2" x2="16" y2="6" strokeWidth={2} /><line x1="8" y1="2" x2="8" y2="6" strokeWidth={2} /><line x1="3" y1="10" x2="21" y2="10" strokeWidth={2} /></svg>
                    Session preview
                  </p>
                  <div className="text-sm text-gray-900 font-medium">{form.name || 'Your class title'}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatTime12(startTime)} – {computeEndTime(startTime, durationMinutes)} · {durationMinutes} min
                  </div>
                  {recurrenceType === 'weekly' && recurrenceDays.length > 0 && (
                    <div className="text-xs text-gray-500 mt-0.5">Every {activeDayLabels}</div>
                  )}
                  {recurrenceType === 'daily' && <div className="text-xs text-gray-500 mt-0.5">Every day</div>}
                  {recurrenceType === 'none' && <div className="text-xs text-gray-500 mt-0.5">One-time on {sessionDate}</div>}
                </div>

                {recurrenceType !== 'none' && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-[11px] text-amber-800 leading-relaxed">
                    <svg className="w-4 h-4 flex-shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    You can add more sessions or edit the schedule from the Sessions tab after creation.
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: REVIEW */}
            {step === 3 && (
              <div className="space-y-3">
                <p className="text-sm font-bold text-gray-900 mb-3">Review your class</p>

                {/* Class card */}
                <div className="flex items-start gap-3 p-4 border border-gray-200 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 text-xl">📚</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Class</p>
                    <p className="text-sm font-bold text-gray-900 truncate">{form.name || '—'}</p>
                    <p className="text-sm text-gray-600">{[form.subject, form.form_level?.replace('_', ' ')].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  <button type="button" onClick={() => setStep(1)} className="text-sm font-semibold flex-shrink-0" style={{ color: '#199356', background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
                </div>

                {/* Schedule card */}
                <div className="flex items-start gap-3 p-4 border border-gray-200 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0 text-xl">📅</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Schedule</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {recurrenceType === 'weekly' ? `Weekly · ${activeDayLabels || '—'}` : recurrenceType === 'daily' ? 'Daily' : `One-time · ${sessionDate}`}
                    </p>
                    <p className="text-sm text-gray-600">{formatTime12(startTime)} – {computeEndTime(startTime, durationMinutes)} · {durationMinutes} min</p>
                  </div>
                  <button type="button" onClick={() => setStep(2)} className="text-sm font-semibold flex-shrink-0" style={{ color: '#199356', background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
                </div>

                <div className="flex items-start gap-2 p-3 bg-emerald-50 rounded-lg text-[11px] text-emerald-800 leading-relaxed mt-1">
                  <svg className="w-4 h-4 flex-shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                  Your class will be published with sessions already scheduled. You can add a banner image by hovering over the lesson card on your Lessons page.
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-2 p-4 border-t border-gray-100 flex-shrink-0">
            {step === 1 ? (
              <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
            ) : (
              <button type="button" onClick={() => { setStep((p) => Math.max(1, p - 1) as 1 | 2 | 3); setError(''); }}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Back</button>
            )}
            {step < 3 ? (
              <button type="button" onClick={() => { setError(''); setStep((p) => Math.min(3, p + 1) as 1 | 2 | 3); }} disabled={!canProceed()}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">Next</button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={submitting}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5">
                {submitting ? 'Creating…' : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>Create class</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Crop overlay */}
      {cropImageSrc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-900">Reposition thumbnail</h3>
              <button type="button" onClick={() => { setCropImageSrc(null); setCrop({ x: 0, y: 0 }); setZoom(1); }} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="relative w-full overflow-hidden rounded-xl bg-gray-100" style={{ aspectRatio: '16 / 9' }}>
                <Cropper image={cropImageSrc} crop={crop} zoom={zoom} aspect={16 / 9} showGrid={false}
                  onCropChange={setCrop} onCropComplete={onCropComplete} onZoomChange={setZoom} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Zoom</label>
                <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-emerald-600" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setCropImageSrc(null); setCrop({ x: 0, y: 0 }); setZoom(1); }}
                  className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="button" onClick={handleApplyCrop} disabled={uploadingImage}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {uploadingImage ? 'Uploading...' : 'Apply image'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
