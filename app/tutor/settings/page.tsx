'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Bell, Lock, Wallet, GraduationCap, ChevronRight, Camera, Video, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useUnsavedGuard } from '@/lib/hooks/useUnsavedGuard';
import { UnsavedBar } from '@/components/UnsavedBar';
import { supabase } from '@/lib/supabase/client';
import CountrySelect from '@/components/CountrySelect';
import TutorShell from '@/components/tutor/TutorShell';

type Section = 'profile' | 'teaching' | 'notifications' | 'security' | 'payouts';

const SECTIONS: { id: Section; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Account', icon: User },
  { id: 'teaching', label: 'Teaching', icon: GraduationCap },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'payouts', label: 'Payouts', icon: Wallet },
];

export default function TutorSettingsPage() {
  return (
    <TutorShell>
      <SettingsContent />
    </TutorShell>
  );
}

function SettingsContent() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [uploading, setUploading] = useState(false);

  const [section, setSection] = useState<Section>('profile');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [school, setSchool] = useState('');
  const [country, setCountry] = useState('');
  const [bio, setBio] = useState('');
  const [allowSameDay, setAllowSameDay] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [emailChangePassword, setEmailChangePassword] = useState('');
  const [showEmailPasswordPrompt, setShowEmailPasswordPrompt] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');

  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [saved, setSaved] = useState({ username: '', displayName: '', email: '', school: '', country: '', bio: '' });
  const dirty = section === 'profile'
    ? (username !== saved.username || displayName !== saved.displayName || email !== saved.email || school !== saved.school || country !== saved.country)
    : section === 'teaching'
    ? bio !== saved.bio
    : false;
  useUnsavedGuard(dirty);

  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (profileLoading) return;
    if (!profile || profile.role !== 'tutor') { router.push('/login'); return; }
    const u = profile.username || '';
    const dn = profile.display_name || profile.full_name || '';
    const em = profile.email || '';
    const sc = profile.school || '';
    const co = profile.country || '';
    const bi = profile.bio || '';
    setUsername(u); setDisplayName(dn); setEmail(em); setSchool(sc); setCountry(co); setBio(bi);
    setSaved({ username: u, displayName: dn, email: em, school: sc, country: co, bio: bi });
    if (profile.email === 'jovangoodluck@myitutor.com') {
      setAllowSameDay(profile.allow_same_day_bookings || false);
    }
  }, [profile, profileLoading, router]);

  const initials = (profile?.display_name || profile?.full_name || profile?.email || 'T').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();

  const handleSaveProfile = async () => {
    setError(''); setMessage('');
    if (email !== profile?.email) { setPendingEmail(email); setShowEmailPasswordPrompt(true); return; }
    setSaving(true);
    try {
      if (!username.trim()) throw new Error('Username is required');
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) throw new Error('Username can only contain letters, numbers, underscores, and hyphens');
      const updates: Record<string, unknown> = {
        username: username.trim(),
        display_name: displayName.trim() || null,
        email,
        school: school || null,
        country,
      };
      if (profile?.email === 'jovangoodluck@myitutor.com') updates.allow_same_day_bookings = allowSameDay;
      const { error: updateError } = await supabase.from('profiles').update(updates).eq('id', profile!.id);
      if (updateError) throw new Error(updateError.code === '23505' ? 'This username is already taken' : updateError.message);
      setSaved((s) => ({ ...s, username: username.trim(), displayName: displayName.trim(), email, school, country }));
      setMessage('Profile updated successfully!');
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTeaching = async () => {
    setError(''); setMessage('');
    setSaving(true);
    try {
      const { error: updErr } = await supabase.from('profiles').update({ bio: bio.trim() || null }).eq('id', profile!.id);
      if (updErr) throw new Error(updErr.message);
      setSaved((s) => ({ ...s, bio: bio.trim() }));
      setMessage('Teaching info updated!');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmEmailChange = async () => {
    setError(''); setMessage('');
    if (!emailChangePassword) { setError('Password is required'); return; }
    setSaving(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: profile?.email || '', password: emailChangePassword });
      if (signInError) throw new Error('Incorrect password');
      const { error: authError } = await supabase.auth.updateUser({ email: pendingEmail });
      if (authError) throw new Error(authError.message);
      const { error: updErr } = await supabase.from('profiles').update({
        username: username.trim(), display_name: displayName.trim() || null, email: pendingEmail, school: school || null, country,
      }).eq('id', profile!.id);
      if (updErr) throw new Error(updErr.message);
      setShowEmailPasswordPrompt(false);
      setEmailChangePassword('');
      setMessage('Profile and email updated! Check your new email for verification.');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setError(''); setMessage('');
    if (!currentPassword) { setError('Current password is required'); return; }
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setChangingPassword(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
      if (signInErr) throw new Error('Current password is incorrect');
      const { error: passErr } = await supabase.auth.updateUser({ password: newPassword });
      if (passErr) throw new Error(passErr.message);
      setMessage('Password changed successfully!');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSendResetEmail = async () => {
    setError(''); setMessage(''); setSendingResetEmail(true);
    try {
      const { error: rErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      if (rErr) throw new Error(rErr.message);
      setMessage('Password reset email sent! Check your inbox.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSendingResetEmail(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!profile || deleteConfirmInput !== (profile.username || '')) return;
    setDeleting(true); setError('');
    try {
      const res = await fetch('/api/delete-account', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to delete account'); return; }
      localStorage.clear(); sessionStorage.clear();
      window.location.href = '/login';
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setDeleting(false);
    }
  };

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setError(''); setMessage(''); setUploading(true);
    try {
      const path = `${profile.id}/avatar.jpg`;
      // Remove old avatar first to avoid CDN serving stale cached version
      await supabase.storage.from('avatars').remove([path]);
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      });
      if (upErr) throw new Error(upErr.message);
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      // Add cache-busting timestamp so browsers don't serve the old cached image
      const url = `${data.publicUrl}?t=${Date.now()}`;
      const { error: updErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id);
      if (updErr) throw new Error(updErr.message);
      setMessage('Profile photo updated!');
      setTimeout(() => window.location.reload(), 800);
    } catch (e2) {
      setError((e2 as Error).message);
    } finally {
      setUploading(false);
    }
  };

  if (profileLoading || !profile) {
    return <div className="min-h-[400px] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-ink">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account, teaching, and payouts</p>
      </div>

      {message && <div className="mb-4 px-4 py-3 rounded-xl bg-brand-soft border border-brand/30 text-brand-deep text-sm font-medium">{message}</div>}
      {error && <div className="mb-4 px-4 py-3 rounded-xl bg-coral-soft border border-coral/30 text-coral text-sm font-medium">{error}</div>}

      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        <nav className="space-y-1">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button key={s.id} onClick={() => {
                if (dirty && !confirm('You have unsaved changes. Discard them and switch?')) return;
                setSection(s.id);
              }}
                className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition group',
                  active ? 'bg-background border border-border text-ink shadow-sm' : 'text-muted-foreground hover:bg-background')}>
                <Icon className="size-4" />
                <span className="flex-1 text-left">{s.label}</span>
                <ChevronRight className={cn('size-3.5 transition', active && 'text-brand-deep')} />
              </button>
            );
          })}
        </nav>

        <div className="rounded-2xl bg-background border border-border p-6 space-y-6">
          {section === 'profile' && (
            <>
              <div className="flex items-center gap-4 pb-6 border-b border-border">
                <div className="relative">
                  <div className="size-20 rounded-full bg-gradient-to-br from-brand to-brand-deep grid place-items-center text-white text-2xl font-semibold overflow-hidden">
                    {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="size-20 rounded-full object-cover" /> : initials}
                  </div>
                  <label className="absolute -bottom-1 -right-1 size-7 rounded-full bg-background border border-border grid place-items-center hover:bg-muted cursor-pointer">
                    <Camera className="size-3.5" />
                    <input type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
                  </label>
                </div>
                <div>
                  <div className="font-semibold text-ink">{displayName || profile.full_name || profile.email}</div>
                  <div className="text-sm text-muted-foreground">{profile.email}</div>
                  {uploading && <div className="text-xs text-brand-deep mt-1">Uploading…</div>}
                </div>
              </div>

              <Field label="Username *" value={username} onChange={(v) => setUsername(v.toLowerCase())} placeholder="your-username" />
              <Field label="Display name" value={displayName} onChange={setDisplayName} placeholder="Your display name" />
              <Field label="Email *" type="email" value={email} onChange={setEmail} />
              <Field label="School / Institution" value={school} onChange={setSchool} />
              <div>
                <label className="text-sm font-medium text-ink mb-1.5 block">Country *</label>
                <CountrySelect value={country} onChange={setCountry} />
              </div>

              {profile.email === 'jovangoodluck@myitutor.com' && (
                <ToggleRow label="Allow same-day bookings" desc="Bypass the 24-hour advance notice for testing." checked={allowSameDay} onChange={setAllowSameDay} />
              )}

              <SaveBar onSave={handleSaveProfile} saving={saving} />
            </>
          )}

          {section === 'teaching' && (
            <>
              <Link href="/tutor/availability" className="block rounded-xl border border-border p-4 hover:bg-muted transition">
                <div className="font-semibold text-ink">Manage availability</div>
                <div className="text-xs text-muted-foreground mt-1">Set your weekly schedule and time-off blocks.</div>
              </Link>
              <Link href="/tutor/dashboard" className="block rounded-xl border border-border p-4 hover:bg-muted transition">
                <div className="font-semibold text-ink">Manage subjects & rates</div>
                <div className="text-xs text-muted-foreground mt-1">Add, remove or update the subjects you teach and their pricing.</div>
              </Link>
              <Link href="/tutor/video-setup" className="block rounded-xl border border-border p-4 hover:bg-muted transition">
                <div className="flex items-center gap-2">
                  <Video className="size-4 text-brand-deep" />
                  <div>
                    <div className="font-semibold text-ink">Video conferencing</div>
                    <div className="text-xs text-muted-foreground mt-1">Connect Zoom or Google Meet for your sessions.</div>
                  </div>
                </div>
              </Link>
              <div>
                <label className="text-sm font-medium text-ink mb-1.5 block">Bio</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={5} maxLength={500}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  placeholder="Tell students about your teaching style, qualifications, and experience…" />
                <div className="text-xs text-muted-foreground mt-1">{bio.length}/500 · 150 characters minimum to get listed.</div>
              </div>
              <SaveBar onSave={handleSaveTeaching} saving={saving} />
            </>
          )}

          {section === 'notifications' && (
            <div className="rounded-xl border border-border p-5 text-center">
              <Bell className="size-8 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium text-ink mt-3">Manage notification preferences</p>
              <p className="text-xs text-muted-foreground mt-1">Toggle email/push categories from the Notifications page.</p>
              <Link href="/tutor/notifications" className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
                Open Notifications
              </Link>
            </div>
          )}

          {section === 'security' && (
            <>
              <Field label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} />
              <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} placeholder="Min 8 characters" />
              <Field label="Confirm new password" type="password" value={confirmPassword} onChange={setConfirmPassword} />
              <div className="flex flex-wrap gap-2">
                <button onClick={handleChangePassword} disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50">
                  {changingPassword ? 'Updating…' : 'Update password'}
                </button>
                <button onClick={handleSendResetEmail} disabled={sendingResetEmail}
                  className="px-4 py-2 rounded-xl border border-border bg-background text-sm font-semibold hover:bg-muted">
                  {sendingResetEmail ? 'Sending…' : 'Forgot password?'}
                </button>
              </div>
              <div className="pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-ink text-sm">Two-factor authentication</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Add an extra layer of security.</div>
                  </div>
                  <span className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-peach text-ink">Coming soon</span>
                </div>
              </div>
              <div className="pt-4 border-t border-border">
                <div className="rounded-2xl border border-coral/30 bg-coral-soft/40 p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <Trash2 className="size-5 text-coral mt-0.5" />
                    <div>
                      <h3 className="text-base font-semibold text-coral">Delete account</h3>
                      <p className="text-sm text-muted-foreground mt-1">Permanently delete your account and all associated data. This cannot be undone.</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-ink mb-1.5">
                      Type your username <span className="font-bold">@{profile.username}</span> to confirm
                    </label>
                    <input type="text" value={deleteConfirmInput} onChange={(e) => setDeleteConfirmInput(e.target.value)} placeholder={profile.username || ''}
                      className="w-full px-3 py-2.5 rounded-xl border border-coral/30 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-coral" />
                  </div>
                  <button type="button" onClick={handleDeleteAccount} disabled={deleting || deleteConfirmInput !== (profile.username || '')}
                    className="w-full px-4 py-2.5 rounded-xl bg-coral hover:bg-coral/90 text-white text-sm font-semibold disabled:opacity-40">
                    {deleting ? 'Deleting…' : 'Permanently delete my account'}
                  </button>
                </div>
              </div>
            </>
          )}

          {section === 'payouts' && (
            <>
              <div className="rounded-2xl bg-mint p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Payouts</div>
                  <div className="font-semibold text-ink mt-1">No payout method connected yet</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Set up your bank account to receive automatic payouts.</div>
                </div>
              </div>
              <div className="rounded-xl border border-border p-5 text-center">
                <Wallet className="size-8 mx-auto text-muted-foreground/40" />
                <p className="text-sm font-medium text-ink mt-3">Payout management coming soon</p>
                <p className="text-xs text-muted-foreground mt-1">Bank account, payout frequency, and tax documents will be configurable here.</p>
              </div>
            </>
          )}
        </div>
      </div>

      {showEmailPasswordPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-2xl p-6 max-w-md w-full shadow-pop">
            <h3 className="text-xl font-bold text-ink mb-2">Confirm email change</h3>
            <p className="text-sm text-muted-foreground mb-4">Enter your password to confirm changing your email to <strong>{pendingEmail}</strong></p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-ink mb-1.5">Current password</label>
              <input type="password" value={emailChangePassword} onChange={(e) => setEmailChangePassword(e.target.value)} placeholder="Enter your password"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmEmailChange()} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleConfirmEmailChange} disabled={saving || !emailChangePassword}
                className="flex-1 px-4 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50">
                {saving ? 'Confirming…' : 'Confirm'}
              </button>
              <button onClick={() => { setShowEmailPasswordPrompt(false); setEmailChangePassword(''); setEmail(profile.email || ''); }} disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-sm font-semibold hover:bg-muted">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <UnsavedBar
        dirty={dirty}
        saving={saving}
        onSave={section === 'teaching' ? handleSaveTeaching : handleSaveProfile}
        onDiscard={() => {
          setUsername(saved.username); setDisplayName(saved.displayName);
          setEmail(saved.email); setSchool(saved.school); setCountry(saved.country); setBio(saved.bio);
        }}
        saveLabel="Save account settings"
      />
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="text-sm font-medium text-ink mb-1.5 block">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent" />
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <div className="font-medium text-ink text-sm">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <button type="button" onClick={() => onChange(!checked)}
        className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition', checked ? 'bg-brand' : 'bg-muted')}>
        <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

function SaveBar({ onSave, saving, label = 'Save changes' }: { onSave: () => void; saving: boolean; label?: string }) {
  return (
    <div className="flex justify-end gap-2 pt-4 border-t border-border">
      <button onClick={onSave} disabled={saving} className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50">
        {saving ? 'Saving…' : label}
      </button>
    </div>
  );
}
