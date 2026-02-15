'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import OffersReceivedList from '@/components/offers/OffersReceivedList';

type OffersCardProps = {
  studentId: string;
};

export default function OffersCard({ studentId }: OffersCardProps) {
  const [hasOffers, setHasOffers] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkForOffers();
  }, [studentId]);

  async function checkForOffers() {
    try {
      const { data, error } = await supabase
        .from('lesson_offers')
        .select('id')
        .eq('student_id', studentId)
        .limit(1);

      if (error) throw error;
      setHasOffers(data && data.length > 0);
    } catch (err) {
      console.error('Error checking offers:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div id="lesson-offers" className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-md scroll-mt-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Offers Received</h2>
        <p className="text-gray-600">Loading offers...</p>
      </div>
    );
  }

  if (!hasOffers) {
    return (
      <div id="lesson-offers" className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-md scroll-mt-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Offers Received</h2>
        <div className="text-center py-8">
          <div className="bg-gray-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
            <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-gray-700 mb-2">No offers right now</p>
          <p className="text-gray-500">When an iTutor reaches out, you'll see it here.</p>
        </div>
      </div>
    );
  }

  return <OffersReceivedList studentId={studentId} />;
}

