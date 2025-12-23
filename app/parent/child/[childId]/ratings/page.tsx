'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Rating, Profile } from '@/lib/types/database';

export default function ChildRatings() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const childId = params?.childId as string;
  const [child, setChild] = useState<Profile | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
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

      const [childRes, ratingsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', childId).single(),
        supabase
          .from('public_ratings')
          .select('*')
          .eq('student_id', childId)
          .order('created_at', { ascending: false })
      ]);

      if (childRes.data) setChild(childRes.data);
      if (ratingsRes.data) setRatings(ratingsRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load ratings');
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
            {child.full_name}'s Ratings
          </h1>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          {ratings.length > 0 ? (
            <div className="space-y-6">
              {ratings.map((rating) => (
                <div key={rating.id} className="border-b pb-6 last:border-b-0">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <svg
                          key={i}
                          className={`h-5 w-5 ${
                            i < rating.stars ? 'text-yellow-400' : 'text-gray-300'
                          }`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                      <span className="ml-2 font-semibold">{rating.stars}/5</span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {new Date(rating.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {rating.comment && (
                    <p className="text-gray-700 mt-2">{rating.comment}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">No ratings yet</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
