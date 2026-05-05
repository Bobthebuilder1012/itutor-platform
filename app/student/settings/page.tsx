'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import CountrySelect from '@/components/CountrySelect';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import InstitutionAutocomplete from '@/components/InstitutionAutocomplete';
import type { Institution } from '@/lib/hooks/useInstitutionsSearch';
import { getDisplayName } from '@/lib/utils/displayName';
import { ensureSchoolCommunityAndMembership } from '@/lib/actions/community';

type SettingsSection = 'profile' | 'security' | 'payment' | 'reviews';

type RatingWithTutor = {
  id: string;
  tutor_id: string;
  stars: number;
  comment?: string | null;
  created_at: string;
  tutor?: {
    full_name?: string | null;
    display_name?: string | null;
    username?: string | null;
  } | null;
};

export default function StudentSettingsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [school, setSchool] = useState('');
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);
  const [country, setCountry] = useState('');
  const [bio, setBio] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [emailChangePassword, setEmailChangePassword] = useState('');
  const [showEmailPasswordPrompt, setShowEmailPasswordPrompt] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const [ratings, setRatings] = useState<RatingWithTutor[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'student') {
      router.push('/login');
      return;
    }

    setUsername(profile.username || '');
    setDisplayName(profile.display_name || profile.full_name || '');
    setEmail(profile.email || '');
    setSchool(profile.school || '');
    setCountry(profile.country || '');
    setBio(profile.bio || '');
    setSubjects(profile.subjects_of_study || []);
  }, [profile, profileLoading, router]);

  const handleSaveProfile = async () => {
    setError('');
    setMessage('');
    
    // Check if email changed - require password
    if (email !== profile?.email) {
      setPendingEmail(email);
      setShowEmailPasswordPrompt(true);
      return;
    }
    
    setSaving(true);

    try {
      if (!username || username.trim() === '') {
        setError('Username is required');
        setSaving(false);
        return;
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        setError('Username can only contain letters, numbers, underscores, and hyphens');
        setSaving(false);
        return;
      }

      const updates = {
        username: username.trim(),
        display_name: displayName && displayName.trim() !== '' ? displayName.trim() : null,
        email,
        institution_id: selectedInstitution?.id ?? null,
        school: (selectedInstitution?.name ?? school?.trim()) || null,
        country,
        bio: bio && bio.trim() !== '' ? bio.trim() : null,
        subjects_of_study: subjects.length > 0 ? subjects : null,
      };

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile!.id);

      if (updateError) {
        if (updateError.code === '23505') {
          setError('This username is already taken');
        } else {
          setError(updateError.message);
        }
        setSaving(false);
        return;
      }

      await ensureSchoolCommunityAndMembership(profile!.id);

      setMessage('Profile updated successfully!');
      
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmEmailChange = async () => {
    setError('');
    setMessage('');

    if (!emailChangePassword) {
      setError('Password is required to change email');
      return;
    }

    setSaving(true);

    try {
      // Verify password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile?.email || '',
        password: emailChangePassword
      });

      if (signInError) {
        setError('Incorrect password');
        setSaving(false);
        return;
      }

      // Update auth email
      const { error: authError } = await supabase.auth.updateUser({
        email: pendingEmail
      });

      if (authError) {
        setError(authError.message);
        setSaving(false);
        return;
      }

      const updates = {
        username: username.trim(),
        display_name: displayName && displayName.trim() !== '' ? displayName.trim() : null,
        email: pendingEmail,
        institution_id: selectedInstitution?.id ?? null,
        school: (selectedInstitution?.name ?? school?.trim()) || null,
        country,
        bio: bio && bio.trim() !== '' ? bio.trim() : null,
        subjects_of_study: subjects.length > 0 ? subjects : null,
      };

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile!.id);

      if (updateError) {
        if (updateError.code === '23505') {
          setError('This username is already taken');
        } else {
          setError(updateError.message);
        }
        setSaving(false);
        return;
      }

      await ensureSchoolCommunityAndMembership(profile!.id);

      setShowEmailPasswordPrompt(false);
      setEmailChangePassword('');
      setMessage('Profile and email updated successfully! Please check your new email for verification.');
      
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setError('');
    setMessage('');

    if (!deleteAccountPassword) {
      setError('Password is required to delete account');
      return;
    }

    setDeleting(true);

    try {
      // Verify password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile?.email || '',
        password: deleteAccountPassword
      });

      if (signInError) {
        setError('Incorrect password');
        setDeleting(false);
        return;
      }

      // Call delete account API
      const response = await fetch('/api/delete-account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to delete account');
        setDeleting(false);
        return;
      }

      // Sign out and redirect
      await supabase.auth.signOut();
      router.push('/');
    } catch (err) {
      setError('An unexpected error occurred');
      setDeleting(false);
    }
  };

  const handleChangePassword = async () => {
    setError('');
    setMessage('');

    if (!currentPassword) {
      setError('Current password is required');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setChangingPassword(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email,
        password: currentPassword
      });

      if (signInError) {
        setError('Current password is incorrect');
        setChangingPassword(false);
        return;
      }

      const { error: passwordError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (passwordError) {
        setError(passwordError.message);
        setChangingPassword(false);
        return;
      }

      setMessage('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSendResetEmail = async () => {
    setError('');
    setMessage('');
    setSendingResetEmail(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (resetError) {
        setError(resetError.message);
      } else {
        setMessage('Password reset email sent! Check your inbox.');
        setTimeout(() => setMessage(''), 5000);
      }
    } catch (err) {
      setError('Failed to send reset email');
    } finally {
      setSendingResetEmail(false);
    }
  };

  // Child accounts (created by parents) don't have payment settings
  // NOTE: Defined before early returns to keep hook order stable across renders.
  const isChildAccount = profile?.billing_mode === 'parent_required';

  const fetchRatings = async () => {
    if (!profile) return;
    setRatingsLoading(true);
    try {
      const { data } = await supabase
        .from('ratings')
        .select('id, tutor_id, stars, comment, created_at, tutor:profiles!ratings_tutor_id_fkey(full_name, display_name, username)')
        .eq('student_id', profile.id)
        .order('created_at', { ascending: false });
      if (data) {
        const seen = new Set<string>();
        setRatings((data as RatingWithTutor[]).filter((r) => {
          if (seen.has(r.tutor_id)) return false;
          seen.add(r.tutor_id);
          return true;
        }));
      }
    } finally {
      setRatingsLoading(false);
    }
  };

  const handleLogout = async () => {
    localStorage.clear();
    sessionStorage.clear();
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = '/login';
  };

  const sections = [
    { id: 'profile' as SettingsSection, label: 'Profile Information', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { id: 'security' as SettingsSection, label: 'Security & Password', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
    ...(!isChildAccount ? [{ id: 'payment' as SettingsSection, label: 'Payment Settings', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' }] : []),
    { id: 'reviews' as SettingsSection, label: 'Review History', icon: 'M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5z' },
  ];

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  return (
    <DashboardLayout role="student" userName={getDisplayName(profile)}>
      <div className="px-4 py-6 sm:px-0 max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-600 mb-8">Manage your account settings and preferences</p>

        {message && (
          <div className="bg-green-100 border-2 border-green-300 text-green-800 px-4 py-3 rounded-lg mb-6">
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-100 border-2 border-red-300 text-red-800 px-4 py-3 rounded-lg mb-6">
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Mobile & Tablet: Horizontal Tabs */}
        <div className="md:!hidden mb-4">
          <div className="bg-white border-2 border-gray-200 rounded-xl p-1.5">
            <div className="flex overflow-x-auto scrollbar-hide gap-1">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => { setActiveSection(section.id); if (section.id === 'reviews') fetchRatings(); }}
                  className={`
                    flex-shrink-0 flex flex-col items-center gap-1.5 px-3 py-2 rounded-lg font-medium transition-all whitespace-nowrap text-xs
                    ${activeSection === section.id
                      ? 'bg-gradient-to-r from-itutor-green to-emerald-600 text-white shadow-md'
                      : 'text-gray-700 hover:bg-gray-100'
                    }
                  `}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={section.icon} />
                  </svg>
                  <span className="text-[10px]">{section.label.replace(' & ', ' ').replace('Information', 'Info')}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
          {/* Desktop: Sidebar Navigation */}
          <div ref={sidebarRef} className="hidden md:!block w-52 flex-shrink-0">
            <div className="bg-white border-2 border-gray-200 rounded-xl p-1.5 sticky top-6">
              <nav className="space-y-0.5">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => { setActiveSection(section.id); if (section.id === 'reviews') fetchRatings(); }}
                    className={`
                      w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-medium transition-all text-sm
                      ${activeSection === section.id
                        ? 'bg-gradient-to-r from-itutor-green to-emerald-600 text-white shadow-md'
                        : 'text-gray-700 hover:bg-gray-100'
                      }
                    `}
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={section.icon} />
                    </svg>
                    <span className="text-xs">{section.label}</span>
                  </button>
                ))}
                <div className="pt-1 mt-1 border-t border-gray-100">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-medium transition-all text-sm text-red-500 hover:bg-red-50"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span className="text-xs">Log Out</span>
                  </button>
                </div>
              </nav>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 min-w-0">

        {/* Profile Information */}
        {activeSection === 'profile' && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="p-3 bg-blue-100 rounded-full flex-shrink-0">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Profile Information</h2>
              <p className="text-sm text-gray-600">Update your personal details and contact information</p>
            </div>
          </div>

          <div className="space-y-4 mt-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="Your unique username"
                required
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400"
              />
              <p className="text-xs text-gray-600 mt-1">Unique identifier, letters/numbers/underscore/hyphen only</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Display Name <span className="text-gray-500">(optional)</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name (defaults to username if empty)"
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400"
              />
              <p className="text-xs text-gray-600 mt-1">This is what everyone will see on your profile</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                School/Institution
              </label>
              <InstitutionAutocomplete
                selectedInstitution={selectedInstitution}
                onChange={setSelectedInstitution}
                placeholder="Type to search your school..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Country <span className="text-red-500">*</span>
              </label>
              <CountrySelect value={country} onChange={setCountry} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Biography <span className="text-gray-500">(optional)</span>
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="Tell us about yourself..."
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400"
              />
              <p className="text-xs text-gray-600 mt-1">{bio.length}/500 characters</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subjects I'm Studying
              </label>
              <SubjectMultiSelect selectedSubjects={subjects} onChange={setSubjects} />
            </div>
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={saving || !username || !email || !country}
            className="mt-6 w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
        )}

        {/* Security - Change Password */}
        {activeSection === 'security' && (
        <div className="bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200 rounded-2xl p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="p-3 bg-orange-100 rounded-full flex-shrink-0">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Security & Password</h2>
              <p className="text-sm text-gray-600">Keep your account secure by using a strong password</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400"
                placeholder="Enter your current password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400"
                placeholder="Enter new password (min 8 characters)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm New Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400"
                placeholder="Confirm new password"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <button
              onClick={handleChangePassword}
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="px-6 py-3 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {changingPassword ? 'Changing Password...' : 'Change Password'}
            </button>
            
            <button
              onClick={handleSendResetEmail}
              disabled={sendingResetEmail}
              className="px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendingResetEmail ? 'Sending Email...' : 'Forgot Password? Send Reset Email'}
            </button>
          </div>

          {/* Delete Account */}
          <div className="mt-8 pt-8 border-t-2 border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Danger Zone</h3>
            <p className="text-sm text-gray-600 mb-4">Permanently delete your account and all associated data</p>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all"
            >
              Delete Account
            </button>
          </div>

        </div>
        )}

        {/* Payment Settings */}
        {activeSection === 'payment' && (
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="p-3 bg-green-100 rounded-full flex-shrink-0">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Payment Settings</h2>
              <p className="text-sm text-gray-600 mb-4">Manage your payment methods and billing preferences</p>
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-yellow-800 mb-1">Coming Soon</p>
                    <p className="text-sm text-yellow-700">Payment method management will be available soon. You'll be able to add credit cards, manage billing details, and view your payment history.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Review History */}
        {activeSection === 'reviews' && (
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 bg-yellow-50 rounded-full flex-shrink-0">
                <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">Review History</h2>
                <p className="text-sm text-gray-600">Reviews you have given to your tutors</p>
              </div>
            </div>

            {ratingsLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green" />
              </div>
            ) : ratings.length > 0 ? (
              <div className="space-y-4">
                {ratings.map((rating) => (
                  <div key={rating.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {rating.tutor?.display_name || rating.tutor?.full_name || 'Unknown Tutor'}
                          {rating.tutor?.username && (
                            <span className="ml-2 text-sm font-normal text-gray-400">@{rating.tutor.username}</span>
                          )}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          {[...Array(5)].map((_, i) => (
                            <svg key={i} className={`w-4 h-4 ${i < rating.stars ? 'text-yellow-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                          <span className="text-sm font-semibold text-gray-700 ml-1">{rating.stars}/5</span>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">{new Date(rating.created_at).toLocaleDateString()}</span>
                    </div>
                    {rating.comment && (
                      <p className="text-sm text-gray-600 mt-2 border-t border-gray-100 pt-2">{rating.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5z" />
                </svg>
                <p className="text-sm">No reviews given yet</p>
              </div>
            )}
          </div>
        )}

          </div>
        </div>
      </div>

      {/* Email Change Password Modal */}
      {showEmailPasswordPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Email Change</h3>
            <p className="text-sm text-gray-600 mb-4">
              Enter your password to confirm changing your email to <strong>{pendingEmail}</strong>
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={emailChangePassword}
                onChange={(e) => setEmailChangePassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none"
                onKeyPress={(e) => e.key === 'Enter' && handleConfirmEmailChange()}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleConfirmEmailChange}
                disabled={saving || !emailChangePassword}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-itutor-green to-emerald-600 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Confirming...' : 'Confirm'}
              </button>
              <button
                onClick={() => {
                  setShowEmailPasswordPrompt(false);
                  setEmailChangePassword('');
                  setEmail(profile?.email || '');
                }}
                disabled={saving}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-100 rounded-full">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900">Delete Account</h3>
            </div>
            
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800 font-semibold mb-2">⚠️ This action cannot be undone</p>
              <p className="text-sm text-red-700">
                All your data, sessions, and messages will be permanently deleted.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter your password to confirm <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={deleteAccountPassword}
                onChange={(e) => setDeleteAccountPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 focus:outline-none"
                onKeyPress={(e) => e.key === 'Enter' && handleDeleteAccount()}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting || !deleteAccountPassword}
                className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete Forever'}
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteAccountPassword('');
                }}
                disabled={deleting}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
