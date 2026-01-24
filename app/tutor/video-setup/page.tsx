'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';

type VideoProvider = 'google_meet' | 'zoom';

type Connection = {
  id: string;
  provider: VideoProvider;
  is_active: boolean;
  connection_status: 'connected' | 'needs_reauth' | 'disconnected';
  provider_account_email: string | null;
  provider_account_name: string | null;
  created_at: string;
  updated_at: string;
};

export default function VideoSetupPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [futureSessions, setFutureSessions] = useState<number>(0);
  const [checkingSessions, setCheckingSessions] = useState(true);

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }

    loadConnection();
    checkFutureSessions();
    
    // Check for OAuth callback results
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');
    const migratedCount = params.get('migrated');
    const migrationWarning = params.get('migration_warning');

    if (success === 'true') {
      if (migratedCount) {
        const count = parseInt(migratedCount);
        alert(`✅ Successfully connected video provider!\n\n🔄 ${count} future session${count > 1 ? 's were' : ' was'} automatically updated with new meeting links.`);
      } else if (migrationWarning === 'true') {
        alert('✅ Successfully connected video provider!\n\n⚠️ Some future sessions may need to be manually updated. Please check your sessions page.');
      } else {
        alert('Successfully connected video provider!');
      }
      // Remove query params
      window.history.replaceState({}, '', '/tutor/video-setup');
      loadConnection();
    } else if (error) {
      const errorMessages: Record<string, string> = {
        'auth_failed': 'Authorization failed. Please try again.',
        'connection_failed': 'Failed to save connection. Please try again.'
      };
      alert(errorMessages[error] || 'An error occurred. Please try again.');
      // Remove query params
      window.history.replaceState({}, '', '/tutor/video-setup');
      setSwitching(false);
    }
  }, [profile, profileLoading, router]);

  async function loadConnection() {
    if (!profile) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tutor_video_provider_connections')
        .select('*')
        .eq('tutor_id', profile.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error loading connection:', error);
      } else if (data) {
        setConnection(data as Connection);
      }
    } catch (error) {
      console.error('Error loading connection:', error);
    } finally {
      setLoading(false);
    }
  }

  async function checkFutureSessions() {
    if (!profile) return;

    setCheckingSessions(true);
    try {
      const { count, error } = await supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('tutor_id', profile.id)
        .in('status', ['SCHEDULED', 'JOIN_OPEN'])
        .gte('scheduled_start_at', new Date().toISOString());

      if (error) {
        console.error('Error checking sessions:', error);
      } else {
        setFutureSessions(count || 0);
      }
    } catch (error) {
      console.error('Error checking sessions:', error);
    } finally {
      setCheckingSessions(false);
    }
  }

  async function handleConnect(provider: VideoProvider) {
    if (!profile) return;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/96e0dc54-0d29-41a7-8439-97ee7ad5934e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/tutor/video-setup/page.tsx:123',message:'Connect button clicked',data:{provider,tutorId:profile.id,hasExistingConnection:!!connection,futureSessions},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,C,D'})}).catch(()=>{});
    // #endregion
    // Check if tutor has future sessions
    if (connection && futureSessions > 0) {
      alert(
        `⚠️ Cannot Switch Video Provider\n\n` +
        `You have ${futureSessions} upcoming session${futureSessions > 1 ? 's' : ''} scheduled.\n\n` +
        `To switch from ${connection.provider.replace('_', ' ')} to ${provider.replace('_', ' ')}, you must either:\n\n` +
        `• Wait for all sessions to complete\n` +
        `• Cancel your upcoming sessions\n\n` +
        `This prevents issues with meeting links for your students.`
      );
      return;
    }
    
    if (connection) {
      if (!confirm(`Switch from ${connection.provider.replace('_', ' ')} to ${provider.replace('_', ' ')}? Your existing connection will be replaced.`)) {
        return;
      }
    }

    setSwitching(true);
    
    try {
      // Redirect to OAuth flow
      const connectUrl = provider === 'google_meet' 
        ? '/api/auth/google/connect'
        : '/api/auth/zoom/connect';
      window.location.href = connectUrl;
    } catch (error) {
      console.error('Error initiating OAuth:', error);
      alert('An error occurred. Please try again.');
      setSwitching(false);
    }
  }

  async function handleDisconnect() {
    if (!connection) return;

    // Check for upcoming sessions
    if (futureSessions > 0) {
      alert(
        `⚠️ Cannot Disconnect Video Provider\n\n` +
        `You have ${futureSessions} upcoming session${futureSessions > 1 ? 's' : ''} scheduled.\n\n` +
        `To disconnect your video provider, you must first:\n\n` +
        `• Wait for all sessions to complete, or\n` +
        `• Cancel your upcoming sessions\n\n` +
        `This prevents issues with meeting links for your students.`
      );
      return;
    }

    if (!confirm(
      '⚠️ WARNING: Disconnect Video Provider?\n\n' +
      'If you disconnect:\n\n' +
      '• You will NOT be visible to students searching for tutors\n' +
      '• You CANNOT accept any booking requests\n' +
      '• You CANNOT send lesson offers\n\n' +
      'You must reconnect a video provider to resume tutoring.\n\n' +
      'Are you absolutely sure you want to disconnect?'
    )) {
      return;
    }

    setLoading(true);
    try {
      // Delete the connection from the database
      const { error } = await supabase
        .from('tutor_video_provider_connections')
        .delete()
        .eq('tutor_id', profile?.id);

      if (error) {
        console.error('Error disconnecting provider:', error);
        alert('Failed to disconnect. Please try again.');
        setLoading(false);
        return;
      }

      // Refresh the page to update the UI
      window.location.reload();
    } catch (error) {
      console.error('Error disconnecting provider:', error);
      alert('An error occurred. Please try again.');
      setLoading(false);
    }
  }

  if (profileLoading || loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  return (
    <DashboardLayout role="tutor" userName={getDisplayName(profile)}>
      <div className="px-4 py-6 sm:px-0 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Video Provider Setup</h1>
          <p className="text-gray-600">
            Connect Google Meet or Zoom to host your tutoring sessions
          </p>
        </div>

        {/* Status Alert */}
        {!connection ? (
          <div className="mb-6 p-6 bg-red-50 border-2 border-red-300 rounded-2xl">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-500 rounded-full">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-red-900 mb-2">⚠️ Account Not Active</h3>
                <p className="text-red-800 mb-3 font-semibold">
                  Your tutor profile is currently hidden from students because you don't have a video provider connected.
                </p>
                <div className="bg-red-100 border border-red-200 rounded-lg p-3 mb-3">
                  <p className="text-sm font-semibold text-red-900 mb-1">Currently you CANNOT:</p>
                  <ul className="text-sm text-red-800 space-y-1">
                    <li>• Appear in student search results</li>
                    <li>• Accept booking requests</li>
                    <li>• Send lesson offers to students</li>
                  </ul>
                </div>
                <p className="text-sm text-red-700 font-semibold">
                  👉 Connect Google Meet or Zoom below to activate your tutor account.
                </p>
              </div>
            </div>
          </div>
        ) : connection.connection_status === 'needs_reauth' ? (
          <div className="mb-6 p-6 bg-yellow-50 border-2 border-yellow-300 rounded-2xl">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-yellow-500 rounded-full">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-yellow-900 mb-2">Connection Needs Refresh</h3>
                <p className="text-yellow-800 mb-3">
                  Your {connection.provider.replace('_', ' ')} connection needs to be re-authorized.
                </p>
                <button
                  onClick={() => handleConnect(connection.provider)}
                  disabled={switching}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-semibold transition disabled:opacity-50"
                >
                  {switching ? 'Reconnecting...' : 'Reconnect Now'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-6 bg-green-50 border-2 border-green-300 rounded-2xl">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-500 rounded-full">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-green-900 mb-2">✓ Video-Ready</h3>
                <p className="text-green-800">
                  You're all set! You can now accept bookings and host sessions via {connection.provider.replace('_', ' ')}.
                </p>
                {connection.provider_account_email && (
                  <p className="text-sm text-green-700 mt-2">
                    Connected as: <span className="font-semibold">{connection.provider_account_email}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Warning: Cannot switch with active sessions */}
        {connection && futureSessions > 0 && (
          <div className="mb-6 p-6 bg-yellow-50 border-2 border-yellow-300 rounded-2xl">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-yellow-500 rounded-full flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-yellow-900 mb-2">
                  ⚠️ Provider Switching Disabled
                </h3>
                <p className="text-yellow-800 mb-3">
                  You have <strong>{futureSessions} upcoming session{futureSessions > 1 ? 's' : ''}</strong> scheduled with your current provider ({connection.provider.replace('_', ' ')}).
                </p>
                <p className="text-sm text-yellow-700 mb-3">
                  To prevent issues with meeting links for your students, you cannot switch video providers while you have scheduled sessions.
                </p>
                <div className="bg-yellow-100 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-yellow-900 mb-2">To switch providers:</p>
                  <ul className="text-sm text-yellow-800 space-y-1 ml-4">
                    <li>• Wait for your sessions to complete, or</li>
                    <li>• Cancel your upcoming sessions from the <Link href="/tutor/sessions" className="underline font-semibold hover:text-yellow-900">Sessions page</Link></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Provider Options */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Google Meet Card */}
          <div className={`bg-white border-2 rounded-2xl p-6 transition-all ${
            connection?.provider === 'google_meet' 
              ? 'border-blue-500 shadow-lg' 
              : 'border-gray-200 hover:border-gray-300'
          }`}>
            <div className="flex items-start gap-4 mb-4">
              <div className="w-16 h-16 bg-white border-2 border-gray-200 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-10 h-10" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC04" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900 mb-1">Google Meet</h3>
                <p className="text-sm text-gray-600">
                  Free video calls with Google account integration
                </p>
              </div>
            </div>

            {connection?.provider === 'google_meet' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-600 font-semibold">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Currently Connected
                </div>
                <div className="text-sm text-gray-600">
                  Connected: {new Date(connection.created_at).toLocaleDateString()}
                </div>
                <button
                  onClick={() => handleConnect('zoom')}
                  disabled={switching || futureSessions > 0}
                  title={futureSessions > 0 ? `Cannot switch while you have ${futureSessions} upcoming session${futureSessions > 1 ? 's' : ''}` : ''}
                  className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {futureSessions > 0 ? '🔒 Switch to Zoom (Disabled)' : 'Switch to Zoom'}
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={loading || switching || futureSessions > 0}
                  title={futureSessions > 0 ? `Cannot disconnect while you have ${futureSessions} upcoming session${futureSessions > 1 ? 's' : ''}` : ''}
                  className="w-full px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Disconnecting...' : futureSessions > 0 ? '🔒 Disconnect (Disabled)' : 'Disconnect'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleConnect('google_meet')}
                disabled={switching}
                className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-bold transition disabled:opacity-50"
              >
                {switching ? 'Connecting...' : 'Connect Google Meet'}
              </button>
            )}
          </div>

          {/* Zoom Card */}
          <div className={`bg-white border-2 rounded-2xl p-6 transition-all ${
            connection?.provider === 'zoom' 
              ? 'border-blue-500 shadow-lg' 
              : 'border-gray-200 hover:border-gray-300'
          }`}>
            <div className="flex items-start gap-4 mb-4">
              <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M15.546 11.196L22.394 6.5c.232-.16.606-.016.606.287v10.426c0 .303-.374.447-.606.287l-6.848-4.696v-1.608z"/>
                  <path d="M2 7.738C2 6.778 2.778 6 3.738 6h10.524C15.222 6 16 6.778 16 7.738v8.524c0 .96-.778 1.738-1.738 1.738H3.738C2.778 18 2 17.222 2 16.262V7.738z"/>
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900 mb-1">Zoom</h3>
                <p className="text-sm text-gray-600">
                  Professional video conferencing platform
                </p>
              </div>
            </div>

            {connection?.provider === 'zoom' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-600 font-semibold">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Currently Connected
                </div>
                <div className="text-sm text-gray-600">
                  Connected: {new Date(connection.created_at).toLocaleDateString()}
                </div>
                <button
                  onClick={() => handleConnect('google_meet')}
                  disabled={switching || futureSessions > 0}
                  title={futureSessions > 0 ? `Cannot switch while you have ${futureSessions} upcoming session${futureSessions > 1 ? 's' : ''}` : ''}
                  className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {futureSessions > 0 ? '🔒 Switch to Google Meet (Disabled)' : 'Switch to Google Meet'}
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={loading || switching || futureSessions > 0}
                  title={futureSessions > 0 ? `Cannot disconnect while you have ${futureSessions} upcoming session${futureSessions > 1 ? 's' : ''}` : ''}
                  className="w-full px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Disconnecting...' : futureSessions > 0 ? '🔒 Disconnect (Disabled)' : 'Disconnect'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleConnect('zoom')}
                disabled={switching}
                className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-bold transition disabled:opacity-50"
              >
                {switching ? 'Connecting...' : 'Connect Zoom'}
              </button>
            )}
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 border-2 border-blue-200 rounded-2xl p-6">
          <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            How it works
          </h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">1.</span>
              <span>Connect your preferred video provider (Google Meet or Zoom)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">2.</span>
              <span>When a booking is confirmed, we automatically create a meeting link</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">3.</span>
              <span>You and your student will see a "Join Session" button 5 minutes before the session starts</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">4.</span>
              <span>You can switch or disconnect providers, but only when you have no upcoming sessions</span>
            </li>
          </ul>
        </div>

        {/* Important Requirements Section */}
        <div className="mt-4 bg-amber-50 border-2 border-amber-200 rounded-2xl p-6">
          <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            ⚠️ Important: Video Provider is Required
          </h3>
          <div className="space-y-2 text-sm text-gray-800">
            <p className="font-semibold">Without a connected video provider:</p>
            <ul className="space-y-1.5 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-amber-600 font-bold mt-0.5">❌</span>
                <span><strong>You will NOT appear</strong> in student search results</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-600 font-bold mt-0.5">❌</span>
                <span><strong>You CANNOT accept</strong> any booking requests</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-600 font-bold mt-0.5">❌</span>
                <span><strong>You CANNOT send</strong> lesson offers to students</span>
              </li>
            </ul>
            <p className="mt-3 font-semibold text-amber-800">
              A video provider connection is required to ensure all sessions have working meeting links for your students.
            </p>
          </div>
        </div>

        {/* OAuth Info */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-300 rounded-xl">
          <p className="text-sm text-blue-800">
            <span className="font-bold">🔐 Secure Connection:</span> When you click "Connect", you'll be redirected to Google or Zoom to securely authorize iTutor. Your credentials are never stored by us - only the authorization tokens needed to create meeting links.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

