'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';

interface AccountDetails {
  profile: any;
  additionalData: any;
  statistics: {
    totalSessions: number;
    completedSessions: number;
  };
  ratings: any;
  suspensionHistory: any;
}

export default function AccountDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.userId as string;
  const { profile, loading: profileLoading } = useProfile();
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');

  useEffect(() => {
    if (!profileLoading && !profile?.is_reviewer) {
      router.push('/');
    }
  }, [profile, profileLoading, router]);

  useEffect(() => {
    if (userId) {
      fetchAccountDetails();
    }
  }, [userId]);

  const fetchAccountDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/accounts/${userId}`);
      if (response.ok) {
        const data = await response.json();
        setAccountDetails(data);
      } else {
        router.push('/reviewer/accounts');
      }
    } catch (error) {
      console.error('Error fetching account details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!suspensionReason.trim()) {
      alert('Please provide a reason for suspension');
      return;
    }

    try {
      setActionLoading(true);
      const response = await fetch(`/api/admin/accounts/${userId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: suspensionReason }),
      });

      if (response.ok) {
        alert('Account suspended successfully');
        setShowSuspendModal(false);
        setSuspensionReason('');
        fetchAccountDetails();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to suspend account');
      }
    } catch (error) {
      console.error('Error suspending account:', error);
      alert('An error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsuspend = async () => {
    if (!confirm('Are you sure you want to lift the suspension on this account?')) {
      return;
    }

    try {
      setActionLoading(true);
      const response = await fetch(`/api/admin/accounts/${userId}/unsuspend`, {
        method: 'POST',
      });

      if (response.ok) {
        alert('Account suspension lifted successfully');
        fetchAccountDetails();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to unsuspend account');
      }
    } catch (error) {
      console.error('Error unsuspending account:', error);
      alert('An error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  if (profileLoading || loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>;
  }

  if (!profile?.is_reviewer || !accountDetails) {
    return null;
  }

  const { profile: userProfile, additionalData, statistics, ratings, suspensionHistory } = accountDetails;

  return (
    <DashboardLayout role="reviewer" userName={profile.full_name || 'Admin'}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/reviewer/accounts')}
            className="text-itutor-green hover:text-emerald-600 mb-4 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Accounts
          </button>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{userProfile.full_name}</h1>
              <p className="text-gray-600 mt-1">{userProfile.email}</p>
            </div>
            <div className="flex gap-3">
              {userProfile.is_suspended ? (
                <button
                  onClick={handleUnsuspend}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {actionLoading ? 'Processing...' : 'Lift Suspension'}
                </button>
              ) : (
                <button
                  onClick={() => setShowSuspendModal(true)}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  Suspend Account
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Status Alert */}
        {userProfile.is_suspended && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-900">Account Suspended</h3>
                <p className="text-sm text-red-700 mt-1">
                  <strong>Reason:</strong> {userProfile.suspension_reason}
                </p>
                <p className="text-sm text-red-600 mt-1">
                  Suspended on {new Date(userProfile.suspended_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Profile Information */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Profile Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-600">Role</label>
                <p className="text-gray-900 capitalize">{userProfile.role}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Phone Number</label>
                <p className="text-gray-900">{userProfile.phone_number || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Country</label>
                <p className="text-gray-900">{userProfile.country || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">School</label>
                <p className="text-gray-900">{userProfile.school || 'N/A'}</p>
              </div>
              {userProfile.form_level && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Form Level</label>
                  <p className="text-gray-900">{userProfile.form_level}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-600">Joined</label>
                <p className="text-gray-900">{new Date(userProfile.created_at).toLocaleDateString()}</p>
              </div>
            </div>

            {userProfile.role === 'tutor' && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Tutor Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Verification Status</label>
                    <p className="text-gray-900">{userProfile.tutor_verification_status || 'Not Verified'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Rating</label>
                    <p className="text-gray-900">
                      {userProfile.rating_average ? `${userProfile.rating_average.toFixed(1)} / 5.0` : 'No ratings yet'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Tutor Type</label>
                    <p className="text-gray-900 capitalize">{userProfile.tutor_type?.replace('_', ' ') || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Teaching Mode</label>
                    <p className="text-gray-900 capitalize">{userProfile.teaching_mode || 'N/A'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Statistics */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Statistics</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-600">Total Sessions</label>
                  <p className="text-2xl font-bold text-gray-900">{statistics.totalSessions}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Completed Sessions</label>
                  <p className="text-2xl font-bold text-green-600">{statistics.completedSessions}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Role-Specific Information */}
        {userProfile.role === 'parent' && additionalData.children && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Linked Children</h2>
            <div className="space-y-3">
              {additionalData.children.map((link: any) => (
                link.child ? (
                  <div key={link.child_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{link.child.full_name}</p>
                      <p className="text-sm text-gray-600">{link.child.email}</p>
                      {link.child.form_level && (
                        <p className="text-sm text-gray-500">{link.child.form_level}</p>
                      )}
                    </div>
                    <button
                      onClick={() => router.push(`/reviewer/accounts/${link.child_id}`)}
                      className="text-itutor-green hover:text-emerald-600 text-sm"
                    >
                      View Profile
                    </button>
                  </div>
                ) : null
              ))}
              {additionalData.children.length === 0 && (
                <p className="text-gray-500">No linked children</p>
              )}
            </div>
          </div>
        )}

        {userProfile.role === 'student' && additionalData.parents && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Parent/Guardian</h2>
            <div className="space-y-3">
              {additionalData.parents.map((link: any) => (
                link.parent ? (
                  <div key={link.parent_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{link.parent.full_name}</p>
                      <p className="text-sm text-gray-600">{link.parent.email}</p>
                    </div>
                    <button
                      onClick={() => router.push(`/reviewer/accounts/${link.parent_id}`)}
                      className="text-itutor-green hover:text-emerald-600 text-sm"
                    >
                      View Profile
                    </button>
                  </div>
                ) : null
              ))}
              {additionalData.parents.length === 0 && (
                <p className="text-gray-500">No linked parent</p>
              )}
            </div>
          </div>
        )}

        {userProfile.role === 'tutor' && additionalData.subjects && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Subjects Offered</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {additionalData.subjects.map((subject: any) => (
                <div key={subject.id} className="p-4 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900">{subject.subject.name}</p>
                  <p className="text-sm text-gray-600">{subject.subject.curriculum} - {subject.subject.level}</p>
                  <p className="text-sm text-itutor-green font-semibold mt-1">
                    TTD ${subject.hourly_rate}/hour
                  </p>
                </div>
              ))}
              {additionalData.subjects.length === 0 && (
                <p className="text-gray-500 col-span-2">No subjects listed</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Suspend Modal */}
      {showSuspendModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Suspend Account</h2>
            <p className="text-gray-600 mb-4">
              Please provide a reason for suspending this account. This action will prevent the user from accessing their account.
            </p>
            <textarea
              value={suspensionReason}
              onChange={(e) => setSuspensionReason(e.target.value)}
              placeholder="Enter suspension reason..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-itutor-green mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSuspendModal(false);
                  setSuspensionReason('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSuspend}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? 'Suspending...' : 'Suspend Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

