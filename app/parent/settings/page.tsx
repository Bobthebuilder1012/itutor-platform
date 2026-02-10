'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import CountrySelect from '@/components/CountrySelect';
import { getDisplayName } from '@/lib/utils/displayName';

type SettingsSection = 'profile' | 'security' | 'payment';

export default function ParentSettingsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [emailChangePassword, setEmailChangePassword] = useState('');
  const [showEmailPasswordPrompt, setShowEmailPasswordPrompt] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'parent') {
      router.push('/login');
      return;
    }

    setUsername(profile.username || '');
    setDisplayName(profile.display_name || profile.full_name || '');
    setEmail(profile.email || '');
    setCountry(profile.country || '');
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
        country,
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

      // Update profile email
      const updates = {
        username: username.trim(),
        display_name: displayName && displayName.trim() !== '' ? displayName.trim() : null,
        email: pendingEmail,
        country,
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

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  const sections = [
    { id: 'profile' as SettingsSection, label: 'Profile Information', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { id: 'security' as SettingsSection, label: 'Security & Password', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
    { id: 'payment' as SettingsSection, label: 'Payment Settings', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' }
  ];

  return (
    <DashboardLayout role="parent" userName={getDisplayName(profile)}>
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
                  onClick={() => setActiveSection(section.id)}
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
          <div className="hidden md:!block w-52 flex-shrink-0">
            <div className="bg-white border-2 border-gray-200 rounded-xl p-1.5 sticky top-6">
              <nav className="space-y-0.5">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
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
                Country <span className="text-red-500">*</span>
              </label>
              <CountrySelect value={country} onChange={setCountry} />
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
