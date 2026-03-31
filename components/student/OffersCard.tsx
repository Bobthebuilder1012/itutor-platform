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

  const cardBase = 'bg-white border border-gray-100 rounded-2xl p-5 sm:p-6 shadow-sm scroll-mt-6';

  const cardHeader = (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-8 h-8 rounded-xl bg-itutor-green/10 text-itutor-green flex items-center justify-center">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </div>
      <h2 className="text-base font-bold text-gray-900">Offers Received</h2>
    </div>
  );

  if (loading) {
    return (
      <div id="lesson-offers" className={cardBase}>
        {cardHeader}
        <p className="text-sm text-gray-500">Loading offers…</p>
      </div>
    );
  }

  if (!hasOffers) {
    return (
      <div id="lesson-offers" className={cardBase}>
        {cardHeader}
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-14 h-14 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">No offers yet</h4>
          <p className="text-xs text-gray-500 max-w-[180px] leading-relaxed">When an iTutor reaches out, you'll see it here.</p>
        </div>
      </div>
    );
  }

  return <OffersReceivedList studentId={studentId} />;
}

