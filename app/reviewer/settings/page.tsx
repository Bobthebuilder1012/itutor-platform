'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import CountrySelect from '@/components/CountrySelect';
import { getDisplayName } from '@/lib/utils/displayName';
import SupportFormModal from '@/components/SupportFormModal';

type SettingsSection = 'profile' | 'security' | 'payment';

export default function ReviewerSettingsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayNameValue] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [bio, setBio] = useState('');
  
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
  const [showSupportForm, setShowSupportForm] = useState(false);

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || (!profile.is_reviewer && profile.role !== 'admin')) {
      router.push('/login');
      return;
    }

    setUsername(profile.username || '');
    setDisplayNameValue(profile.display_name || profile.full_name || '');
    setEmail(profile.email || '');
    setCountry(profile.country || '');
    setBio(profile.bio || '');
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
        bio: bio && bio.trim() !== '' ? bio.trim() : null,
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
        bio: bio && bio.trim() !== '' ? bio.trim() : null,
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
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        setError(resetError.message);
        setSendingResetEmail(false);
        return;
      }

      setMessage('Password reset email sent! Check your inbox.');
    } catch (err) {
      setError('Failed to send reset email');
    } finally {
      setSendingResetEmail(false);
    }
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const currentDisplayName = getDisplayName(profile);

  return (
    <DashboardLayout role={profile.role === 'admin' ? 'admin' : 'reviewer'} userName={currentDisplayName}>
      {/* Mobile & Tablet: Horizontal Tabs */}
      <div className="md:hidden mb-4">
        <div className="bg-white border-2 border-gray-200 rounded-xl p-1.5">
          <div className="flex overflow-x-auto scrollbar-hide gap-1">
            <button
              onClick={() => setActiveSection('profile')}
              className={`flex-shrink-0 px-3 py-2 rounded-lg font-medium transition-colors whitespace-nowrap text-xs ${
                activeSection === 'profile'
                  ? 'bg-gradient-to-r from-itutor-green to-emerald-600 text-white shadow-md'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Profile
            </button>
            <button
              onClick={() => setActiveSection('security')}
              className={`flex-shrink-0 px-3 py-2 rounded-lg font-medium transition-colors whitespace-nowrap text-xs ${
                activeSection === 'security'
                  ? 'bg-gradient-to-r from-itutor-green to-emerald-600 text-white shadow-md'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Security
            </button>
            <button
              onClick={() => setActiveSection('payment')}
              className={`flex-shrink-0 px-3 py-2 rounded-lg font-medium transition-colors whitespace-nowrap text-xs ${
                activeSection === 'payment'
                  ? 'bg-gradient-to-r from-itutor-green to-emerald-600 text-white shadow-md'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Payment
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        {/* Desktop: Sidebar Navigation */}
        <div className="hidden md:block w-52 flex-shrink-0">
          <nav className="space-y-1 bg-white border-2 border-gray-200 rounded-xl p-1.5">
            <button
              onClick={() => setActiveSection('profile')}
              className={`w-full text-left px-3 py-2.5 rounded-lg font-medium transition-colors text-xs ${
                activeSection === 'profile'
                  ? 'bg-gradient-to-r from-itutor-green to-emerald-600 text-white shadow-md'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Profile Info
            </button>
            <button
              onClick={() => setActiveSection('security')}
              className={`w-full text-left px-3 py-2.5 rounded-lg font-medium transition-colors text-xs ${
                activeSection === 'security'
                  ? 'bg-gradient-to-r from-itutor-green to-emerald-600 text-white shadow-md'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Security
            </button>
            <button
              onClick={() => setActiveSection('payment')}
              className={`w-full text-left px-3 py-2.5 rounded-lg font-medium transition-colors text-xs ${
                activeSection === 'payment'
                  ? 'bg-gradient-to-r from-itutor-green to-emerald-600 text-white shadow-md'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Payment
            </button>
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Global Messages */}
          {message && (
            <div className="mb-6 bg-green-50 border-2 border-green-300 text-green-800 px-4 py-3 rounded-lg">
              {message}
            </div>
          )}
          {error && (
            <div className="mb-6 bg-red-50 border-2 border-red-300 text-red-800 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Profile Information Section */}
          {activeSection === 'profile' && (
            <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-lg">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Profile Information</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Full Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={profile.full_name || ''}
                    disabled
                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-300 text-gray-900 rounded-lg"
                  />
                  <p className="text-sm text-gray-600 mt-1">Contact support to change your full name</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Username <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none"
                    placeholder="username123"
                  />
                  <p className="text-sm text-gray-600 mt-1">Letters, numbers, underscores, and hyphens only</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayNameValue(e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none"
                    placeholder="How you want to be shown"
                  />
                  <p className="text-sm text-gray-600 mt-1">Leave empty to use your full name</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Email Address <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-300 text-gray-900 rounded-lg"
                  />
                  <p className="text-sm text-gray-600 mt-1">Contact support to change your email</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Country
                  </label>
                  <CountrySelect
                    value={country}
                    onChange={setCountry}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Bio
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none resize-y"
                    placeholder="Tell us about yourself..."
                  />
                </div>

                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="w-full px-6 py-3 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white rounded-lg font-semibold shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* Security & Password Section */}
          {activeSection === 'security' && (
            <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-lg">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Security & Password</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Current Password <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none"
                    placeholder="Enter current password"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    New Password <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none"
                    placeholder="Enter new password (min 8 characters)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Confirm New Password <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none"
                    placeholder="Confirm new password"
                  />
                </div>

                <button
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                  className="w-full px-6 py-3 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white rounded-lg font-semibold shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {changingPassword ? 'Changing Password...' : 'Change Password'}
                </button>

                <div className="border-t-2 border-gray-200 pt-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Forgot Password?</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    If you've forgotten your password, we can send you a reset link via email.
                  </p>
                  <button
                    onClick={handleSendResetEmail}
                    disabled={sendingResetEmail}
                    className="px-6 py-3 bg-white border-2 border-itutor-green text-itutor-green rounded-lg font-semibold hover:bg-itutor-green hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendingResetEmail ? 'Sending...' : 'Send Reset Email'}
                  </button>
                </div>

                {/* Delete Account */}
                <div className="border-t-2 border-gray-200 pt-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Danger Zone</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Permanently delete your account and all associated data
                  </p>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Payment Settings Section */}
          {activeSection === 'payment' && (
            <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-lg">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Payment Settings</h2>
              
              <div className="text-center py-12">
                <div className="bg-gray-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                  <svg className="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Coming Soon</h3>
                <p className="text-gray-600">
                  Payment settings will be available soon. Contact support for payment-related inquiries.
                </p>
                <button
                  onClick={() => setShowSupportForm(true)}
                  className="mt-4 inline-flex items-center px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition shadow-md"
                >
                  Contact Support
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Support Form Modal */}
      <SupportFormModal isOpen={showSupportForm} onClose={() => setShowSupportForm(false)} />

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

