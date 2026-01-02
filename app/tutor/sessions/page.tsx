'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';
import { Session } from '@/lib/types/sessions';

type SessionWithStudent = Session & {
  student_name?: string;
};

type TabType = 'upcoming' | 'cancelled' | 'past';

export default function TutorSessions() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionWithStudent[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('upcoming');

  useEffect(() => {
    if (loading) return;
    
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }

    fetchSessions();
  }, [profile, loading, router]);

  async function fetchSessions() {
    if (!profile) return;

    console.log('🔍 Fetching sessions for tutor:', profile.id);
    
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('tutor_id', profile.id)
        .order('scheduled_start_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching sessions:', error);
      } else if (data) {
        console.log('✅ Sessions found:', data.length);
        console.log('📋 Sessions data:', data);
        
        // Fetch student information for each session
        const enrichedSessions = await Promise.all(
          data.map(async (session) => {
            const { data: studentData } = await supabase
              .from('profiles')
              .select('display_name, full_name')
              .eq('id', session.student_id)
              .single();
            
            return {
              ...session,
              student_name: studentData ? getDisplayName(studentData) : 'Unknown Student'
            } as SessionWithStudent;
          })
        );
        
        setSessions(enrichedSessions);
      }
    } catch (error) {
      console.error('❌ Error fetching sessions:', error);
    } finally {
      setLoadingData(false);
    }
  }

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  function getStatusBadge(status: string) {
    const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
      SCHEDULED: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Scheduled' },
      JOIN_OPEN: { bg: 'bg-green-100', text: 'text-green-800', label: 'Ready to Join' },
      COMPLETED_ASSUMED: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Completed' },
      NO_SHOW_STUDENT: { bg: 'bg-red-100', text: 'text-red-800', label: 'Student No-Show' },
      EARLY_END_SHORT: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Ended Early' },
      CANCELLED: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' }
    };

    const config = statusConfig[status] || { bg: 'bg-gray-100', text: 'text-gray-800', label: status };
    
    return (
      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  }

  function canJoinSession(scheduledStartAt: string): boolean {
    // TESTING MODE: Allow joining anytime
    return true;
    
    // PRODUCTION: Uncomment below to enforce 5-minute rule
    // const now = new Date();
    // const startTime = new Date(scheduledStartAt);
    // const minutesUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60);
    // return minutesUntilStart <= 5;
  }

  function handleJoinSession(joinUrl: string) {
    window.open(joinUrl, '_blank', 'noopener,noreferrer');
  }

  async function handleCancelSession(sessionId: string) {
    if (!confirm('Are you sure you want to cancel this session? This action cannot be undone.')) {
      return;
    }

    setCancellingId(sessionId);
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'CANCELLED' })
        .eq('id', sessionId);

      if (error) {
        console.error('Error cancelling session:', error);
        alert('Failed to cancel session. Please try again.');
      } else {
        alert('Session cancelled successfully.');
        fetchSessions(); // Refresh the list
      }
    } catch (error) {
      console.error('Error cancelling session:', error);
      alert('Failed to cancel session. Please try again.');
    } finally {
      setCancellingId(null);
    }
  }

  const filteredSessions = sessions.filter(session => {
    if (activeTab === 'upcoming') {
      return session.status === 'SCHEDULED' || session.status === 'JOIN_OPEN';
    }
    if (activeTab === 'cancelled') {
      return session.status === 'CANCELLED';
    }
    if (activeTab === 'past') {
      return session.status === 'COMPLETED_ASSUMED' || session.status === 'NO_SHOW_STUDENT' || session.status === 'EARLY_END_SHORT';
    }
    return true;
  });

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: sessions.filter(s => s.status === 'SCHEDULED' || s.status === 'JOIN_OPEN').length },
    { key: 'cancelled', label: 'Cancelled', count: sessions.filter(s => s.status === 'CANCELLED').length },
    { key: 'past', label: 'Past', count: sessions.filter(s => s.status === 'COMPLETED_ASSUMED' || s.status === 'NO_SHOW_STUDENT' || s.status === 'EARLY_END_SHORT').length }
  ];

  function getTabColor(tabKey: TabType, isActive: boolean) {
    const baseColors = {
      upcoming: 'text-blue-600',
      cancelled: 'text-red-600',
      past: 'text-gray-600'
    };
    const borderColors = {
      upcoming: 'border-blue-600',
      cancelled: 'border-red-600',
      past: 'border-gray-600'
    };
    return `${baseColors[tabKey]} ${isActive ? `border-b-2 ${borderColors[tabKey]}` : ''}`;
  }

  function getTabBadgeColor(tabKey: TabType) {
    const colors = {
      upcoming: 'bg-blue-100 text-blue-700',
      cancelled: 'bg-red-100 text-red-700',
      past: 'bg-gray-100 text-gray-700'
    };
    return colors[tabKey];
  }

  return (
    <DashboardLayout role="tutor" userName={getDisplayName(profile)}>
      <div className="px-4 py-6 sm:px-0 max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">My Sessions</h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-300 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                px-4 py-3 font-medium transition-all whitespace-nowrap
                ${getTabColor(tab.key, activeTab === tab.key)}
              `}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${getTabBadgeColor(tab.key)}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {loadingData ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green"></div>
            <span className="ml-3 text-gray-600">Loading sessions...</span>
          </div>
        ) : filteredSessions.length > 0 ? (
          <div className="bg-white shadow-xl rounded-2xl border-2 border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Date & Time
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Student
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Provider
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Payout (TTD)
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredSessions.map((session) => {
                    return (
                      <tr key={session.id} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {new Date(session.scheduled_start_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </div>
                          <div className="text-sm text-gray-600">
                            {new Date(session.scheduled_start_at).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {session.student_name || 'Unknown Student'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 font-medium">
                            {session.duration_minutes} min
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 capitalize">
                            {session.provider.replace('_', ' ')}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(session.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-bold text-gray-900">
                            ${session.payout_amount_ttd.toFixed(2)}
                          </div>
                          {session.charged_at && (
                            <div className="text-xs text-gray-500">
                              Paid
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex flex-col gap-2">
                            <Link
                              href={`/tutor/bookings/${session.booking_id}`}
                              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              View
                            </Link>
                            {activeTab === 'upcoming' && session.join_url && canJoinSession(session.scheduled_start_at) && (
                              <button
                                onClick={() => handleJoinSession(session.join_url!)}
                                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white rounded-lg font-medium transition shadow-lg"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Join
                              </button>
                            )}
                            {activeTab === 'upcoming' && (session.status === 'SCHEDULED' || session.status === 'JOIN_OPEN') && (
                              <button
                                onClick={() => handleCancelSession(session.id)}
                                disabled={cancellingId === session.id}
                                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                {cancellingId === session.id ? 'Cancelling...' : 'Cancel'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-2xl">
            <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-900 font-semibold mb-2">
              {activeTab === 'upcoming' && 'No Upcoming Sessions'}
              {activeTab === 'cancelled' && 'No Cancelled Sessions'}
              {activeTab === 'past' && 'No Past Sessions'}
            </p>
            <p className="text-gray-600 text-sm">
              {activeTab === 'upcoming' && 'Your upcoming sessions will appear here once students book with you.'}
              {activeTab === 'cancelled' && 'Cancelled sessions will appear here.'}
              {activeTab === 'past' && 'Completed sessions will appear here.'}
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
