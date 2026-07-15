'use client';

import { useRef, useState } from 'react';

export interface AdminEditableProfile {
  id: string;
  role: string;
  full_name?: string | null;
  display_name?: string | null;
  username?: string | null;
  bio?: string | null;
  phone_number?: string | null;
  country?: string | null;
  school?: string | null;
  form_level?: string | null;
  avatar_url?: string | null;
  profile_banner_url?: string | null;
  tutor_type?: string | null;
  teaching_mode?: string | null;
}

type ClassLite = { id: string; name: string | null };

const TEXT_FIELDS: { key: keyof AdminEditableProfile; label: string; type?: 'textarea' }[] = [
  { key: 'full_name', label: 'Full name' },
  { key: 'display_name', label: 'Display name' },
  { key: 'username', label: 'Username' },
  { key: 'phone_number', label: 'Phone number' },
  { key: 'country', label: 'Country' },
  { key: 'school', label: 'School' },
  { key: 'form_level', label: 'Form level' },
  { key: 'bio', label: 'Bio', type: 'textarea' },
];

export default function AdminAccountControls({
  profile,
  classes = [],
  onUpdated,
}: {
  profile: AdminEditableProfile;
  classes?: ClassLite[];
  onUpdated: () => void;
}) {
  const isTutor = profile.role === 'tutor';
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of TEXT_FIELDS) init[f.key as string] = (profile[f.key] as string) ?? '';
    if (isTutor) {
      init.tutor_type = profile.tutor_type ?? '';
      init.teaching_mode = profile.teaching_mode ?? '';
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true); setErr(''); setMsg('');
    try {
      const payload: Record<string, unknown> = {};
      for (const f of TEXT_FIELDS) payload[f.key as string] = form[f.key as string];
      if (isTutor) {
        payload.tutor_type = form.tutor_type || null;
        payload.teaching_mode = form.teaching_mode || null;
      }
      const res = await fetch(`/api/admin/accounts/${profile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setMsg('Profile updated.');
      onUpdated();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function upload(kind: 'avatar' | 'banner', file: File) {
    setUploading(kind); setErr(''); setMsg('');
    try {
      const fd = new FormData();
      fd.append('kind', kind);
      fd.append('file', file);
      const res = await fetch(`/api/admin/accounts/${profile.id}/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setMsg(kind === 'avatar' ? 'Profile picture updated.' : 'Profile banner updated.');
      onUpdated();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setUploading(null);
    }
  }

  async function uploadClassCover(classId: string, file: File) {
    setUploading(`class-${classId}`); setErr(''); setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/admin/classes/${classId}/cover`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setMsg('Class banner updated.');
      onUpdated();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Admin controls</h2>
        <span className="text-xs text-gray-400">All edits are audit-logged</span>
      </div>

      {msg && <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">{msg}</div>}
      {err && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{err}</div>}

      {/* Images */}
      <div className="flex flex-wrap gap-3">
        <input ref={avatarInput} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload('avatar', f); e.target.value = ''; }} />
        <input ref={bannerInput} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload('banner', f); e.target.value = ''; }} />
        <button onClick={() => avatarInput.current?.click()} disabled={uploading === 'avatar'}
          className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {uploading === 'avatar' ? 'Uploading…' : 'Set profile picture'}
        </button>
        <button onClick={() => bannerInput.current?.click()} disabled={uploading === 'banner'}
          className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {uploading === 'banner' ? 'Uploading…' : 'Set profile banner'}
        </button>
      </div>

      {/* Text fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TEXT_FIELDS.map((f) => (
          <div key={f.key as string} className={f.type === 'textarea' ? 'md:col-span-2' : ''}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
            {f.type === 'textarea' ? (
              <textarea
                value={form[f.key as string]}
                onChange={(e) => set(f.key as string, e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-itutor-green"
              />
            ) : (
              <input
                type="text"
                value={form[f.key as string]}
                onChange={(e) => set(f.key as string, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-itutor-green"
              />
            )}
          </div>
        ))}

        {isTutor && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tutor type</label>
              <select value={form.tutor_type} onChange={(e) => set('tutor_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-itutor-green">
                <option value="">—</option>
                <option value="professional_teacher">Professional teacher</option>
                <option value="university_tutor">University tutor</option>
                <option value="graduate_tutor">Graduate tutor</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teaching mode</label>
              <select value={form.teaching_mode} onChange={(e) => set('teaching_mode', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-itutor-green">
                <option value="">—</option>
                <option value="online">Online</option>
                <option value="in_person">In person</option>
                <option value="both">Both</option>
              </select>
            </div>
          </>
        )}
      </div>

      <button onClick={save} disabled={saving}
        className="px-5 py-2.5 rounded-lg bg-itutor-green text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50">
        {saving ? 'Saving…' : 'Save profile changes'}
      </button>

      {/* Per-class banners (tutors only) */}
      {isTutor && classes.length > 0 && (
        <div className="pt-4 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Class banners</h3>
          <p className="text-xs text-gray-500 mb-3">Set a banner per class. Classes without their own banner fall back to the profile banner.</p>
          <div className="space-y-2">
            {classes.map((c) => (
              <ClassBannerRow key={c.id} cls={c} uploading={uploading === `class-${c.id}`} onUpload={uploadClassCover} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ClassBannerRow({
  cls,
  uploading,
  onUpload,
}: {
  cls: ClassLite;
  uploading: boolean;
  onUpload: (classId: string, file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50">
      <span className="text-sm text-gray-800 truncate">{cls.name || 'Untitled class'}</span>
      <input ref={input} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(cls.id, f); e.target.value = ''; }} />
      <button onClick={() => input.current?.click()} disabled={uploading}
        className="shrink-0 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-white disabled:opacity-50">
        {uploading ? 'Uploading…' : 'Set banner'}
      </button>
    </div>
  );
}
