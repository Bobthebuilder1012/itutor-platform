'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Profile } from '@/lib/types/database';

export default function ChildProfile() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const childId = params?.childId as string;
  const [child, setChild] = useState<Profile | null>(null);
  const [loadingChild, setLoadingChild] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    
    if (!profile || profile.role !== 'parent') {
      router.push('/login');
      return;
    }

    fetchChild();
  }, [profile, loading, router, childId]);

  async function fetchChild() {
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
        setLoadingChild(false);
        return;
      }

      const { data: childData, error: childError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', childId)
        .single();

      if (childError) throw childError;
      setChild(childData);
    } catch (err) {
      console.error('Error fetching child:', err);
      setError('Failed to load child profile');
    } finally {
      setLoadingChild(false);
    }
  }

  if (loading || loadingChild) {
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
          <h1 className="text-3xl font-bold text-gray-900">{child.full_name}'s Profile</h1>
        </div>

        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Student Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Full Name</p>
              <p className="font-medium">{child.full_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-medium">{child.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">School</p>
              <p className="font-medium">{child.school || 'Not set'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Form Level</p>
              <p className="font-medium">{child.form_level || 'Not set'}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm text-gray-500 mb-2">Subjects of Study</p>
              <div className="flex flex-wrap gap-2">
                {child.subjects_of_study && child.subjects_of_study.length > 0 ? (
                  child.subjects_of_study.map((subject, index) => (
                    <span
                      key={index}
                      className="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full"
                    >
                      {subject}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-400">No subjects added</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={`/parent/child/${childId}/sessions`}
              className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
            >
              View Sessions
            </Link>
            <Link
              href={`/parent/child/${childId}/ratings`}
              className="inline-flex items-center justify-center bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md font-medium"
            >
              View Ratings
            </Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
