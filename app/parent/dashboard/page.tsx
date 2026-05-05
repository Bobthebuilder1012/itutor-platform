'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import DashboardLayout from '@/components/DashboardLayout';
import ProfileHeader from '@/components/ProfileHeader';
import AvatarUploadModal from '@/components/AvatarUploadModal';
import EditProfileModal from '@/components/EditProfileModal';
import UniversalSearchBar from '@/components/UniversalSearchBar';
import { useAvatarUpload } from '@/lib/hooks/useAvatarUpload';
import { Area } from '@/lib/utils/imageCrop';
import { getDisplayName } from '@/lib/utils/displayName';
import { ParentAttendanceReadOnly } from '@/components/student/StudentSessionAttendance';

type DashboardData = {
  overview: {
    totalChildren: number;
    totalSessionsBooked: number;
    totalPaymentsMade: number;
    totalPaymentsAmount: number;
    upcomingSessions: number;
  };
  children: Array<{
    id: string;
    color: string;
    fullName: string;
    displayName: string | null;
    email: string | null;
    school: string | null;
    formLevel: string | null;
    subjectsOfStudy: string[];
    stats: {
      classes: number;
      bookings: number;
      upcomingSessions: number;
    };
  }>;
  upcomingSessions: Array<{
    id: string;
    childId: string;
    childName: string;
    tutorName: string;
    subjectName: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    durationMinutes: number;
    status: string;
    bookingId: string;
    selfReportedAttendance: { status: 'attending' | 'not_attending'; updatedAt: string } | null;
  }>;
  recentBookings: Array<{
    id: string;
    childId: string;
    childName: string;
    tutorName: string;
    subjectName: string;
    status: string;
    requestedStartAt: string;
    confirmedStartAt: string | null;
    durationMinutes: number;
    priceTtd: number;
  }>;
  recentPayments: Array<{
    id: string;
    bookingId: string;
    childName: string;
    tutorName: string;
    subjectName: string;
    amountTtd: number;
    createdAt: string;
    status: string;
  }>;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-TT', {
    style: 'currency',
    currency: 'TTD',
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ParentDashboard() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const { uploadAvatar, deleteAvatar, uploading } = useAvatarUpload(profile?.id || '');

  useEffect(() => {
    if (loading) return;

    if (!profile || profile.role !== 'parent') {
      router.push('/login');
      return;
    }

    void fetchDashboard();
  }, [profile, loading, router]);

  async function fetchDashboard() {
    setLoadingData(true);
    setError(null);

    try {
      const response = await fetch('/api/parent/dashboard');
      const contentType = response.headers.get('content-type') || '';

      if (!contentType.includes('application/json')) {
        throw new Error('Parent dashboard returned an unexpected response');
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Failed to load parent dashboard');
      }

      setDashboard(result.dashboard as DashboardData);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load parent dashboard');
    } finally {
      setLoadingData(false);
    }
  }

  const handleAvatarUpload = async (imageSrc: string, croppedArea: Area) => {
    if (!profile) return;

    const result = await uploadAvatar(imageSrc, croppedArea);
    if (result.success) {
      window.location.reload();
    }
  };

  const handleRemoveAvatar = async () => {
    if (!profile) return;
    const result = await deleteAvatar();
    if (!result.success) throw new Error(result.error || 'Failed to remove photo');
    setAvatarModalOpen(false);
    window.location.reload();
  };

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const displayName = getDisplayName(profile);

  return (
    <DashboardLayout role="parent" userName={displayName}>
      <div className="px-4 sm:px-6 lg:px-8 pt-2 pb-1 bg-gradient-to-br from-gray-50 to-white">
        <UniversalSearchBar
          userRole="parent"
          onResultClick={(tutor) => {
            router.push(`/parent/tutors/${tutor.id}`);
          }}
        />
      </div>

      <div className="px-4 py-4 sm:px-0 space-y-6">
        <ProfileHeader
          fullName={displayName}
          role="parent"
          country={profile.country}
          subjectsLine={
            dashboard
              ? `Managing ${dashboard.overview.totalChildren} ${
                  dashboard.overview.totalChildren === 1 ? 'child' : 'children'
                }`
              : null
          }
          bio={profile.bio}
          avatarUrl={profile.avatar_url}
          onAvatarClick={() => setAvatarModalOpen(true)}
          userId={profile.id}
        />

        <AvatarUploadModal
          isOpen={avatarModalOpen}
          onClose={() => setAvatarModalOpen(false)}
          onUpload={handleAvatarUpload}
          uploading={uploading}
          hasAvatar={Boolean(profile.avatar_url)}
          onRemovePhoto={handleRemoveAvatar}
        />

        <EditProfileModal
          isOpen={editProfileModalOpen}
          onClose={() => setEditProfileModalOpen(false)}
          profile={profile}
          onSuccess={() => window.location.reload()}
        />

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <button
            onClick={() => setEditProfileModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-itutor-green to-emerald-600 px-4 py-2 font-semibold text-black transition"
          >
            Edit Profile
          </button>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/parent/add-child"
              className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white transition hover:bg-purple-700"
            >
              Add or Link Child
            </Link>
            <Link
              href="/parent/search"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Find a Tutor
            </Link>
          </div>
        </div>

        {loadingData ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <p className="text-gray-600">Loading parent dashboard...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            {error}
          </div>
        ) : dashboard ? (
          <>
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Total Sessions Booked</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {dashboard.overview.totalSessionsBooked}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Total Payments Made</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {formatCurrency(dashboard.overview.totalPaymentsAmount)}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {dashboard.overview.totalPaymentsMade} successful payments
                </p>
              </div>
              <div className="rounded-2xl border border-purple-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Upcoming Sessions</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {dashboard.overview.upcomingSessions}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Linked Children</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {dashboard.overview.totalChildren}
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Children</h2>
                  <p className="text-sm text-gray-500">
                    View each child, track activity, and jump straight into booking.
                  </p>
                </div>
                <Link
                  href="/parent/add-child"
                  className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white transition hover:bg-black"
                >
                  Manage Children
                </Link>
              </div>

              {dashboard.children.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
                  <h3 className="text-xl font-semibold text-gray-900">No children linked yet</h3>
                  <p className="mt-2 text-gray-600">
                    Add a new child account or link an existing student account to get started.
                  </p>
                  <Link
                    href="/parent/add-child"
                    className="mt-6 inline-flex items-center justify-center rounded-lg bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700"
                  >
                    Add or Link a Child
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
                  {dashboard.children.map((child) => (
                    <div
                      key={child.id}
                      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                      style={{ borderTopColor: child.color, borderTopWidth: '4px' }}
                    >
                      <div className="mb-4 flex items-start gap-3">
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
                          style={{ backgroundColor: child.color }}
                        >
                          {child.fullName.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{child.fullName}</h3>
                          <p className="text-sm text-gray-500">
                            {child.school || 'School not set'}
                            {child.formLevel ? ` • ${child.formLevel}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="mb-4 grid grid-cols-3 gap-3">
                        <div className="rounded-xl bg-gray-50 p-3 text-center">
                          <p className="text-xs text-gray-500">Classes</p>
                          <p className="text-xl font-bold text-gray-900">{child.stats.classes}</p>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3 text-center">
                          <p className="text-xs text-gray-500">Bookings</p>
                          <p className="text-xl font-bold text-gray-900">{child.stats.bookings}</p>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3 text-center">
                          <p className="text-xs text-gray-500">Upcoming</p>
                          <p className="text-xl font-bold text-gray-900">
                            {child.stats.upcomingSessions}
                          </p>
                        </div>
                      </div>

                      {child.subjectsOfStudy.length > 0 && (
                        <div className="mb-4 flex flex-wrap gap-2">
                          {child.subjectsOfStudy.slice(0, 3).map((subject) => (
                            <span
                              key={subject}
                              className="rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700"
                            >
                              {subject}
                            </span>
                          ))}
                          {child.subjectsOfStudy.length > 3 && (
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                              +{child.subjectsOfStudy.length - 3} more
                            </span>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <Link
                          href={`/parent/child/${child.id}`}
                          className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700"
                        >
                          View Child
                        </Link>
                        <Link
                          href={`/parent/child/${child.id}/bookings`}
                          className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                        >
                          Bookings
                        </Link>
                        <Link
                          href={`/parent/child/${child.id}/sessions`}
                          className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                        >
                          Sessions
                        </Link>
                        <Link
                          href="/parent/search"
                          className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                        >
                          Book a Tutor
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <section className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Upcoming Sessions</h2>
                  {dashboard.upcomingSessions.length > 0 && (
                    <span className="text-sm text-gray-500">
                      {dashboard.overview.upcomingSessions} scheduled
                    </span>
                  )}
                </div>
                {dashboard.upcomingSessions.length === 0 ? (
                  <p className="text-gray-600">No upcoming sessions right now.</p>
                ) : (
                  <div className="space-y-4">
                    {dashboard.upcomingSessions.map((session) => (
                      <div
                        key={session.id}
                        className="rounded-xl border border-blue-100 bg-blue-50 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-gray-900">{session.subjectName}</p>
                            <p className="text-sm text-gray-600">
                              {session.childName} with {session.tutorName}
                            </p>
                            <p className="mt-2 text-sm text-gray-600">
                              {formatDateTime(session.scheduledStartAt)} • {session.durationMinutes}{' '}
                              min
                            </p>
                            <p className="mt-1 text-xs font-medium text-gray-500">Child&apos;s plan (self-reported)</p>
                            <ParentAttendanceReadOnly attendance={session.selfReportedAttendance} />
                          </div>
                          <Link
                            href={`/parent/child/${session.childId}/sessions`}
                            className="text-sm font-semibold text-blue-700 hover:text-blue-800"
                          >
                            View
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-green-200 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Recent Bookings</h2>
                  <Link
                    href="/parent/approve-bookings"
                    className="text-sm font-semibold text-green-700 hover:text-green-800"
                  >
                    Review approvals
                  </Link>
                </div>
                {dashboard.recentBookings.length === 0 ? (
                  <p className="text-gray-600">No bookings yet.</p>
                ) : (
                  <div className="space-y-4">
                    {dashboard.recentBookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="rounded-xl border border-green-100 bg-green-50 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-gray-900">{booking.subjectName}</p>
                            <p className="text-sm text-gray-600">
                              {booking.childName} with {booking.tutorName}
                            </p>
                            <p className="mt-2 text-sm text-gray-600">
                              {formatDateTime(booking.confirmedStartAt || booking.requestedStartAt)} •{' '}
                              {booking.status}
                            </p>
                          </div>
                          <Link
                            href={`/parent/child/${booking.childId}/bookings`}
                            className="text-sm font-semibold text-green-700 hover:text-green-800"
                          >
                            View
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Payments</h2>
                  <p className="text-sm text-gray-500">
                    Simple stats and recent payment history for your family account.
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Paid so far</p>
                  <p className="text-xl font-bold text-gray-900">
                    {formatCurrency(dashboard.overview.totalPaymentsAmount)}
                  </p>
                </div>
              </div>

              {dashboard.recentPayments.length === 0 ? (
                <p className="text-gray-600">No completed payments yet.</p>
              ) : (
                <div className="space-y-4">
                  {dashboard.recentPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-gray-900">{payment.subjectName}</p>
                        <p className="text-sm text-gray-600">
                          {payment.childName} with {payment.tutorName}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          {formatDateTime(payment.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          {formatCurrency(payment.amountTtd)}
                        </p>
                        <p className="text-sm text-gray-500">{payment.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
