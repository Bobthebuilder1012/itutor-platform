'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { LessonOffer } from '@/lib/types/lessonOffers';
import { getDisplayName } from '@/lib/utils/displayName';
import CounterOfferModal from './CounterOfferModal';

type OffersReceivedListProps = {
  studentId: string;
};

export default function OffersReceivedList({ studentId }: OffersReceivedListProps) {
  const [offers, setOffers] = useState<LessonOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOffer, setSelectedOffer] = useState<LessonOffer | null>(null);
  const [counterModalOpen, setCounterModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchOffers();
  }, [studentId]);

  async function fetchOffers() {
    try {
      // Fetch lesson offers first
      const { data: offersData, error: offersError } = await supabase
        .from('lesson_offers')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

      if (offersError) throw offersError;

      if (!offersData || offersData.length === 0) {
        setOffers([]);
        return;
      }

      // Get unique tutor and subject IDs
      const tutorIds = [...new Set(offersData.map(o => o.tutor_id))];
      const subjectIds = [...new Set(offersData.map(o => o.subject_id))];

      // Fetch tutor profiles
      const { data: tutorsData, error: tutorsError } = await supabase
        .from('profiles')
        .select('id, username, display_name, full_name, avatar_url, school, country')
        .in('id', tutorIds);

      if (tutorsError) throw tutorsError;

      // Fetch subject details
      const { data: subjectsData, error: subjectsError } = await supabase
        .from('subjects')
        .select('id, name, label')
        .in('id', subjectIds);

      if (subjectsError) throw subjectsError;

      // Combine the data
      const combined = offersData.map(offer => {
        const tutor = tutorsData?.find(t => t.id === offer.tutor_id);
        const subject = subjectsData?.find(s => s.id === offer.subject_id);
        return {
          ...offer,
          tutor,
          subject
        };
      });

      setOffers(combined as any);
    } catch (err) {
      console.error('Error fetching offers:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept(offerId: string) {
    setActionLoading(offerId);
    try {
      // Get the offer details
      const offer = offers.find(o => o.id === offerId);
      if (!offer) throw new Error('Offer not found');

      // Update offer status to accepted
      const { error: offerError } = await supabase
        .from('lesson_offers')
        .update({ status: 'accepted' })
        .eq('id', offerId);

      if (offerError) throw offerError;

      // Create a booking from the accepted offer
      const { data: newBooking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          student_id: offer.student_id,
          tutor_id: offer.tutor_id,
          subject_id: offer.subject_id,
          requested_start_at: offer.proposed_start_at,
          requested_end_at: new Date(new Date(offer.proposed_start_at).getTime() + 60 * 60 * 1000).toISOString(), // 1 hour session
          confirmed_start_at: offer.proposed_start_at,
          confirmed_end_at: new Date(new Date(offer.proposed_start_at).getTime() + 60 * 60 * 1000).toISOString(),
          status: 'CONFIRMED',
          price_ttd: 100, // Default price - adjust as needed
          student_notes: offer.tutor_note || null,
          last_action_by: 'student'
        })
        .select()
        .single();

      if (bookingError || !newBooking) throw bookingError || new Error('Failed to create booking');

      // Create session for the confirmed booking
      try {
        const sessionResponse = await fetch('/api/sessions/create-for-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: newBooking.id })
        });

        if (!sessionResponse.ok) {
          console.error('Failed to create session:', await sessionResponse.text());
          alert('✅ Offer accepted and booking created!\n⚠️ Session creation pending - check tutor video provider connection.');
        } else {
          alert('✅ Offer accepted! Booking and session created successfully.');
        }
      } catch (sessionError) {
        console.error('Error creating session:', sessionError);
        alert('✅ Offer accepted and booking created!\n⚠️ Session will be created when tutor is ready.');
      }

      fetchOffers(); // Refresh list
    } catch (err) {
      console.error('Error accepting offer:', err);
      alert('Failed to accept offer: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDecline(offerId: string) {
    setActionLoading(offerId);
    try {
      const { error } = await supabase
        .from('lesson_offers')
        .update({ status: 'declined' })
        .eq('id', offerId);

      if (error) throw error;
      fetchOffers(); // Refresh list
    } catch (err) {
      console.error('Error declining offer:', err);
      alert('Failed to decline offer');
    } finally {
      setActionLoading(null);
    }
  }

  function handleCounter(offer: LessonOffer) {
    setSelectedOffer(offer);
    setCounterModalOpen(true);
  }

  function formatDateTime(dateTime: string) {
    const date = new Date(dateTime);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  if (loading) {
    return (
      <div className="bg-white border-2 border-gray-300 rounded-2xl p-6 shadow-lg">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Offers Received</h2>
        <p className="text-gray-600">Loading offers...</p>
      </div>
    );
  }

  const pendingOffers = offers.filter(o => o.status === 'pending');
  const counteredOffers = offers.filter(o => o.status === 'countered');

  if (offers.length === 0) {
    return null; // Don't show section if no offers
  }

  return (
    <>
      <div id="lesson-offers" className="bg-white border-2 border-purple-200 rounded-2xl p-6 shadow-lg mb-6 scroll-mt-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Offers Received</h2>
        
        {pendingOffers.length === 0 && counteredOffers.length === 0 ? (
          <p className="text-gray-600">No pending offers</p>
        ) : (
          <div className="space-y-4">
            {[...pendingOffers, ...counteredOffers].map((offer: any) => (
              <div
                key={offer.id}
                className="bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200 rounded-xl p-4 hover:border-purple-400 transition-all"
              >
                <div className="flex items-start gap-4">
                  {/* Tutor Avatar */}
                  {offer.tutor?.avatar_url ? (
                    <img
                      src={offer.tutor.avatar_url}
                      alt={getDisplayName(offer.tutor)}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-itutor-green to-emerald-600 flex items-center justify-center text-white font-bold text-lg">
                      {getDisplayName(offer.tutor).charAt(0)}
                    </div>
                  )}

                  <div className="flex-1">
                    {/* Tutor Info */}
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-gray-900">{getDisplayName(offer.tutor)}</p>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        offer.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        offer.status === 'countered' ? 'bg-blue-100 text-blue-800' :
                        offer.status === 'accepted' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {offer.status === 'countered' ? 'Counter Sent' : offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
                      </span>
                    </div>

                    {/* Offer Details */}
                    <p className="text-sm text-gray-600 mb-2">
                      <span className="font-medium text-itutor-green">{offer.subject?.label || offer.subject?.name}</span>
                      {' • '}
                      {formatDateTime(offer.proposed_start_at)}
                      {' • '}
                      {offer.duration_minutes} minutes
                    </p>

                    {offer.tutor_note && (
                      <p className="text-sm text-gray-700 bg-white/50 rounded p-2 mb-2 italic">
                        "{offer.tutor_note}"
                      </p>
                    )}

                    {/* Counter Proposal Info */}
                    {offer.status === 'countered' && offer.counter_proposed_start_at && (
                      <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-2">
                        <p className="text-sm text-blue-900 font-medium">
                          Your counter: {formatDateTime(offer.counter_proposed_start_at)}
                        </p>
                        {offer.counter_tutor_note && (
                          <p className="text-xs text-blue-700 mt-1 italic">"{offer.counter_tutor_note}"</p>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    {offer.status === 'pending' && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleAccept(offer.id)}
                          disabled={actionLoading === offer.id}
                          className="px-4 py-2 bg-itutor-green hover:bg-emerald-600 text-black font-semibold rounded-lg transition disabled:opacity-50"
                        >
                          {actionLoading === offer.id ? 'Accepting...' : 'Accept'}
                        </button>
                        <button
                          onClick={() => handleCounter(offer)}
                          disabled={actionLoading === offer.id}
                          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 rounded-lg font-medium transition disabled:opacity-50"
                        >
                          Counter
                        </button>
                        <button
                          onClick={() => handleDecline(offer.id)}
                          disabled={actionLoading === offer.id}
                          className="px-4 py-2 bg-white hover:bg-gray-50 text-red-600 border border-red-300 rounded-lg font-medium transition disabled:opacity-50"
                        >
                          {actionLoading === offer.id ? 'Declining...' : 'Decline'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Counter Offer Modal */}
      {selectedOffer && (
        <CounterOfferModal
          isOpen={counterModalOpen}
          onClose={() => {
            setCounterModalOpen(false);
            setSelectedOffer(null);
          }}
          offer={selectedOffer}
          onSuccess={() => {
            setCounterModalOpen(false);
            setSelectedOffer(null);
            fetchOffers();
          }}
        />
      )}
    </>
  );
}


