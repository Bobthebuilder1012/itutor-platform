'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import ProfileHeader from '@/components/ProfileHeader';
import { Profile, ParentChildLink } from '@/lib/types/database';

type ChildWithProfile = ParentChildLink & {
  child_profile?: Profile;
};

export default function ParentDashboard() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const testMode = searchParams.get('test') === 'true';
  const [children, setChildren] = useState<ChildWithProfile[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (testMode) {
      setLoadingData(false);
      return;
    }

    if (loading) return;
    
    if (!profile || profile.role !== 'parent') {
      router.push('/login');
      return;
    }

    fetchChildren();
  }, [profile, loading, router, testMode]);

  async function fetchChildren() {
    if (!profile) return;

    try {
      const { data } = await supabase
        .from('parent_child_links')
        .select(`
          *,
          child_profile:profiles!parent_child_links_child_id_fkey(*)
        `)
        .eq('parent_id', profile.id);

      if (data) setChildren(data as ChildWithProfile[]);
    } catch (error) {
      console.error('Error fetching children:', error);
    } finally {
      setLoadingData(false);
    }
  }

  if (!testMode && (loading || !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const displayName = testMode ? 'Test Parent' : profile?.full_name || 'Parent';

  return (
    <DashboardLayout role="parent" userName={displayName}>
      <div className="px-4 py-6 sm:px-0">
        {/* Test Mode Banner */}
        {testMode && (
          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-amber-700">
                  <strong>Test Mode:</strong> You're viewing the dashboard UI only. Real data requires authentication.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Profile Header */}
        <ProfileHeader
          fullName={displayName}
          role="parent"
          country={testMode ? 'Trinidad & Tobago' : profile?.country}
          subjectsLine={children.length > 0 ? `Managing ${children.length} ${children.length === 1 ? 'child' : 'children'}` : null}
        />

        <div className="flex justify-end mb-6">
          <Link
            href="/parent/add-child"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
          >
            + Add Child
          </Link>
        </div>

        {/* Children List */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Your Children</h2>
          
          {loadingData ? (
            <p className="text-gray-500">Loading children...</p>
          ) : children.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {children.map((link) => {
                const child = link.child_profile;
                if (!child) return null;

                return (
                  <div
                    key={link.id}
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <h3 className="font-semibold text-lg mb-2">{child.full_name}</h3>
                    <div className="space-y-2 mb-4">
                      <div>
                        <p className="text-xs text-gray-500">School</p>
                        <p className="text-sm">{child.school || 'Not set'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Form Level</p>
                        <p className="text-sm">{child.form_level || 'Not set'}</p>
                      </div>
                    </div>

                    <div className="flex flex-col space-y-2">
                      <Link
                        href={`/parent/child/${child.id}`}
                        className="text-center bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded text-sm font-medium"
                      >
                        Profile
                      </Link>
                      <Link
                        href={`/parent/child/${child.id}/sessions`}
                        className="text-center bg-gray-50 hover:bg-gray-100 text-gray-700 px-3 py-2 rounded text-sm font-medium"
                      >
                        Sessions
                      </Link>
                      <Link
                        href={`/parent/child/${child.id}/ratings`}
                        className="text-center bg-gray-50 hover:bg-gray-100 text-gray-700 px-3 py-2 rounded text-sm font-medium"
                      >
                        Ratings
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No children added</p>
              <Link
                href="/parent/add-child"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                + Add Child
              </Link>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
