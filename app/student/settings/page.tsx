'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import { ensureSchoolCommunityAndMembership } from '@/lib/actions/community';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import AvatarUploadModal from '@/components/AvatarUploadModal';
import UserAvatar from '@/components/UserAvatar';
import { useAvatarUpload } from '@/lib/hooks/useAvatarUpload';
import { User, Bell, Lock, CreditCard, GraduationCap, ChevronRight, Camera, LogOut, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Area } from '@/lib/utils/imageCrop';

type Section = 'profile' | 'academic' | 'notifications' | 'security' | 'billing';

const SECTIONS: { id: Section; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'academic', label: 'Academic', icon: GraduationCap },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'billing', label: 'Billing', icon: CreditCard },
];

const DEFAULT_NOTIF = { lessons: true, reminders: true, marketing: false, sms: false };

function Field({ label, value, onChange, type = 'text', hint, readOnly }: { label: string; value: string; onChange: (v: string) => void; type?: string; hint?: string; readOnly?: boolean }) {
  return (
    <div>
      <label className="text-sm font-medium text-ink mb-1.5 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className={cn('w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent', readOnly && 'opacity-60 cursor-not-allowed')}
      />
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function SaveBar({ onSave, saving, label = 'Save changes' }: { onSave: () => void; saving: boolean; label?: string }) {
  return (
    <div className="flex justify-end gap-2 pt-4 border-t border-border">
      <button type="button" className="px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted">Cancel</button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50"
      >
        {saving ? 'Saving…' : label}
      </button>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn('relative w-11 h-6 rounded-full transition-colors flex-shrink-0', checked ? 'bg-brand' : 'bg-gray-300')}
    >
      <span className={cn('absolute top-1 size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  );
}

export default function StudentSettingsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const { uploadAvatar, deleteAvatar, uploading: avatarUploading } = useAvatarUpload(profile?.id ?? '');

  const [section, setSection] = useState<Section>('profile');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [school, setSchool] = useState('');
  const [country, setCountry] = useState('');
  const [bio, setBio] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [notif, setNotif] = useState(DEFAULT_NOTIF);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile || profile.role !== 'student') { router.push('/login'); return; }
    setDisplayName(profile.display_name || profile.full_name || '');
    setUsername(profile.username || '');
    setEmail(profile.email || '');
    setNewEmail(profile.email || '');
    setSchool(profile.school || '');
    setCountry(profile.country || '');
    setBio(profile.bio || '');
    setSubjects(profile.subjects_of_study || []);
    if (profile.notification_preferences) {
      setNotif({ ...DEFAULT_NOTIF, ...profile.notification_preferences });
    }
  }, [profile, profileLoading, router]);

  const fullName = profile ? getDisplayName(profile) : '';

  const handleSaveProfile = async () => {
    setError(''); setMessage('');
    if (!username.trim()) { setError('Username is required'); return; }
    setSaving(true);
    try {
      const { error: err } = await supabase.from('profiles').update({
        username: username.trim(),
        display_name: displayName.trim() || null,
        school: school.trim() || null,
        country,
        bio: bio.trim() || null,
        subjects_of_study: subjects.length > 0 ? subjects : null,
      }).eq('id', profile!.id);
      if (err) { setError(err.code === '23505' ? 'Username already taken' : err.message); return; }
      await ensureSchoolCommunityAndMembership(profile!.id);
      setMessage('Profile updated!');
      setTimeout(() => { setMessage(''); window.location.reload(); }, 1500);
    } catch { setError('An unexpected error occurred'); }
    finally { setSaving(false); }
  };

  const handleSaveNotifications = async () => {
    setError(''); setMessage('');
    setSavingNotif(true);
    try {
      const { error: err } = await supabase.from('profiles').update({
        notification_preferences: notif,
      }).eq('id', profile!.id);
      if (err) throw err;
      setMessage('Notification preferences saved!');
      setTimeout(() => setMessage(''), 2500);
    } catch { setError('Failed to save notification preferences'); }
    finally { setSavingNotif(false); }
  };

  const handleUpdateEmail = async () => {
    setError(''); setMessage('');
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || trimmed === email) { setError('Enter a different email address'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setError('Invalid email address'); return; }
    setChangingEmail(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ email: trimmed });
      if (err) { setError(err.message); return; }
      setMessage(`Confirmation sent to ${trimmed}. Check your inbox to confirm the change.`);
    } catch { setError('Failed to update email'); }
    finally { setChangingEmail(false); }
  };

  const handleChangePassword = async () => {
    setError(''); setMessage('');
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setChangingPw(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
      if (signInErr) { setError('Current password is incorrect'); return; }
      const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword });
      if (pwErr) { setError(pwErr.message); return; }
      setMessage('Password changed!');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setTimeout(() => setMessage(''), 3000);
    } catch { setError('An unexpected error occurred'); }
    finally { setChangingPw(false); }
  };

  const handleLogout = async () => {
    localStorage.clear(); sessionStorage.clear();
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = '/login';
  };

  const handleAvatarUpload = async (imageSrc: string, croppedArea: Area) => {
    const result = await uploadAvatar(imageSrc, croppedArea);
    if (result.success) {
      setShowAvatarModal(false);
      setMessage('Profile photo updated!');
      setTimeout(() => { setMessage(''); window.location.reload(); }, 1500);
    } else {
      setError(result.error || 'Failed to upload photo');
    }
  };

  const handleAvatarRemove = async () => {
    const result = await deleteAvatar();
    if (result.success) {
      setShowAvatarModal(false);
      setMessage('Profile photo removed');
      setTimeout(() => { setMessage(''); window.location.reload(); }, 1500);
    } else {
      setError('Failed to remove photo');
    }
  };

  if (profileLoading || !profile) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  return (
    <>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your account and preferences</p>
        </div>

        {message && <div className="mb-4 px-4 py-3 rounded-xl bg-brand-soft border border-brand text-forest text-sm font-medium">{message}</div>}
        {error && <div className="mb-4 px-4 py-3 rounded-xl bg-coral-soft border border-coral text-coral text-sm font-medium">{error}</div>}

        <div className="grid lg:grid-cols-[220px_1fr] gap-6">
          {/* Sidebar nav */}
          <nav className="space-y-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => { setSection(s.id); setMessage(''); setError(''); }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition',
                    active ? 'bg-background border border-border text-ink shadow-sm' : 'text-muted-foreground hover:bg-background'
                  )}
                >
                  <Icon className="size-4" />
                  <span className="flex-1 text-left">{s.label}</span>
                  <ChevronRight className={cn('size-3.5 transition', active && 'text-brand-deep')} />
                </button>
              );
            })}
            <div className="pt-2 mt-1 border-t border-border">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-coral hover:bg-coral-soft transition"
              >
                <LogOut className="size-4" />
                <span className="flex-1 text-left">Log out</span>
              </button>
            </div>
          </nav>

          {/* Panel */}
          <div className="rounded-2xl bg-background border border-border p-6 space-y-6">

            {section === 'profile' && (
              <>
                <div className="flex items-center gap-4 pb-6 border-b border-border">
                  <div className="relative">
                    <UserAvatar avatarUrl={profile.avatar_url} name={fullName} size={80} />
                    <button
                      onClick={() => setShowAvatarModal(true)}
                      className="absolute -bottom-1 -right-1 size-7 rounded-full bg-background border border-border grid place-items-center hover:bg-muted"
                    >
                      <Camera className="size-3.5" />
                    </button>
                  </div>
                  <div>
                    <div className="font-semibold text-ink">{fullName}</div>
                    <div className="text-sm text-muted-foreground">{profile.email}</div>
                  </div>
                </div>
                <Field label="Display name" value={displayName} onChange={setDisplayName} hint="This is what everyone will see on your profile" />
                <Field label="Username" value={username} onChange={setUsername} hint="Letters, numbers, underscores and hyphens only" />
                <div>
                  <label className="text-sm font-medium text-ink mb-1.5 block">Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    maxLength={500}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                  />
                </div>
                <SaveBar onSave={handleSaveProfile} saving={saving} />
              </>
            )}

            {section === 'academic' && (
              <>
                <div>
                  <label className="text-sm font-medium text-ink mb-1.5 block">Education level</label>
                  <select
                    value={profile.form_level || ''}
                    onChange={() => {}}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand pointer-events-none opacity-60"
                  >
                    {['Primary (SEA)', 'Form 1-3', 'Form 4-5 (CSEC)', 'Form 6 (CAPE)'].map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <Field label="School" value={school} onChange={setSchool} />
                <div>
                  <label className="text-sm font-medium text-ink mb-2 block">Subjects you study</label>
                  <SubjectMultiSelect selectedSubjects={subjects} onChange={setSubjects} />
                </div>
                <SaveBar onSave={handleSaveProfile} saving={saving} />
              </>
            )}

            {section === 'notifications' && (
              <>
                {([
                  { key: 'lessons' as const, label: 'Lesson reminders', desc: 'Notify me 30 min before each lesson' },
                  { key: 'reminders' as const, label: 'Homework reminders', desc: 'Daily check-ins for assignments' },
                  { key: 'marketing' as const, label: 'Tips & promotions', desc: 'Study tips, offers, new tutors' },
                  { key: 'sms' as const, label: 'SMS alerts', desc: 'Critical reminders via text message' },
                ]).map((n) => (
                  <div key={n.key} className="flex items-start justify-between gap-4 py-1">
                    <div>
                      <div className="font-medium text-ink text-sm">{n.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{n.desc}</div>
                    </div>
                    <Toggle checked={notif[n.key]} onChange={(v) => setNotif((prev) => ({ ...prev, [n.key]: v }))} />
                  </div>
                ))}
                <SaveBar onSave={handleSaveNotifications} saving={savingNotif} label="Save preferences" />
              </>
            )}

            {section === 'security' && (
              <>
                {/* Email change */}
                <div className="pb-6 border-b border-border space-y-4">
                  <div>
                    <div className="font-medium text-ink text-sm mb-0.5">Email address</div>
                    <div className="text-xs text-muted-foreground">Changing your email sends a confirmation to the new address.</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-ink mb-1.5 block flex items-center gap-1.5"><Mail className="size-3.5" /> New email</label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder={email}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleUpdateEmail}
                      disabled={changingEmail || newEmail.trim() === email}
                      className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50"
                    >
                      {changingEmail ? 'Sending…' : 'Update email'}
                    </button>
                  </div>
                </div>

                {/* Password change */}
                <div>
                  <div className="font-medium text-ink text-sm mb-4">Change password</div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-ink mb-1.5 block">Current password</label>
                      <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-ink mb-1.5 block">New password</label>
                      <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-ink mb-1.5 block">Confirm new password</label>
                      <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                    </div>
                  </div>
                </div>
                <SaveBar onSave={handleChangePassword} saving={changingPw} label="Update password" />
              </>
            )}

            {section === 'billing' && (
              <>
                <div className="rounded-2xl bg-brand-soft p-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Current plan</div>
                    <div className="font-semibold text-ink mt-1">Pay-as-you-go</div>
                  </div>
                  <button className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep">Upgrade</button>
                </div>
                <div>
                  <div className="text-sm font-medium text-ink mb-3">Payment methods</div>
                  <div className="p-4 rounded-xl border border-dashed border-border text-sm text-muted-foreground text-center">
                    Payment method management coming soon
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mobile logout */}
        <div className="lg:hidden mt-6 pt-4 border-t border-border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-coral-soft text-coral font-semibold text-sm hover:bg-coral hover:text-white transition"
          >
            <LogOut className="size-4" /> Log out of iTutor
          </button>
        </div>
      </div>

      {/* Avatar Upload Modal */}
      <AvatarUploadModal
        isOpen={showAvatarModal}
        onClose={() => setShowAvatarModal(false)}
        onUpload={handleAvatarUpload}
        uploading={avatarUploading}
        hasAvatar={!!profile.avatar_url}
        onRemovePhoto={handleAvatarRemove}
      />
    </>
  );
}
