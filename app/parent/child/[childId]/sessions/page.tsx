'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Session, Profile } from '@/lib/types/database';

export default function ChildSessions() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const childId = params?.childId as string;
  const [child, setChild] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    
    if (!profile || profile.role !== 'parent') {
      router.push('/login');
      return;
    }

    fetchData();
  }, [profile, loading, router, childId]);

  async function fetchData() {
    if (!profile || !childId) return;

    try {
      const { data: link } = await supabase
        .from('parent_child_links')
        .select('*')
        .eq('parent_id', profile.id)
        .eq('child_id', childId)
        .single();

      if (!link) {
        setError('Child not found');
        setLoadingData(false);
        return;
      }

      const [childRes, sessionsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', childId).single(),
        supabase
          .from('sessions')
          .select('*')
          .eq('student_id', childId)
          .order('scheduled_start_at', { ascending: false })
      ]);

      if (childRes.data) setChild(childRes.data);
      if (sessionsRes.data) setSessions(sessionsRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load sessions');
    } finally {
      setLoadingData(false);
    }
  }

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!profile) return null;

  if (error || !child) {
    return (
      <DashboardLayout role="parent" userName={profile.full_name}>
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error || 'Child not found'}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="parent" userName={profile.full_name}>
      <div className="px-4 py-6 sm:px-0">
        <div className="flex items-center mb-6">
          <button
            onClick={() => router.back()}
            className="mr-4 text-gray-600 hover:text-gray-900"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            {child.full_name}'s Sessions
          </h1>
        </div>

        <div className="bg-white shadow rounded-lg overflow-hidden">
          {sessions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Date & Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Amount (TTD)
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sessions.map((session) => (
                    <tr key={session.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(session.scheduled_start_at).toLocaleDateString()}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(session.scheduled_start_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {session.duration_minutes} min
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          session.status === 'COMPLETED_ASSUMED' ? 'bg-green-100 text-green-800' :
                          session.status === 'SCHEDULED' || session.status === 'JOIN_OPEN' ? 'bg-blue-100 text-blue-800' :
                          session.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                          session.status === 'NO_SHOW_STUDENT' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {session.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${session.charge_amount_ttd.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="text-gray-500">No sessions found</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
