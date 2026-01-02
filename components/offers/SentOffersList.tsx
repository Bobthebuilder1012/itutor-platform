'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { LessonOffer } from '@/lib/types/lessonOffers';
import { getDisplayName } from '@/lib/utils/displayName';

type SentOffersListProps = {
  tutorId: string;
};

export default function SentOffersList({ tutorId }: SentOffersListProps) {
  const [offers, setOffers] = useState<LessonOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchOffers();
  }, [tutorId]);

  async function fetchOffers() {
    try {
      const { data, error } = await supabase
        .from('lesson_offers')
        .select(`
          *,
          student:student_id (
            id,
            username,
            display_name,
            full_name,
            avatar_url,
            school,
            country
          ),
          subject:subject_id (
            id,
            name,
            label
          )
        `)
        .eq('tutor_id', tutorId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOffers(data || []);
    } catch (err) {
      console.error('Error fetching sent offers:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAcceptCounter(offerId: string) {
    setActionLoading(offerId);
    try {
      // Check if tutor has a video provider connected
      const { data: videoProvider, error: vpError } = await supabase
        .from('tutor_video_provider_connections')
        .select('id')
        .eq('tutor_id', tutorId)
        .limit(1)
        .single();

      if (vpError || !videoProvider) {
        alert('❌ You must connect Google Meet or Zoom before accepting offers.\n\nPlease go to Settings > Video Provider to connect your video account.');
        setActionLoading(null);
        return;
      }

      // Get the offer details
      const offer = offers.find(o => o.id === offerId);
      if (!offer) throw new Error('Offer not found');

      // Update offer status to accepted
      const { error: offerError } = await supabase
        .from('lesson_offers')
        .update({ status: 'accepted' })
        .eq('id', offerId);

      if (offerError) throw offerError;

      // Use counter-proposed time if available, otherwise use original
      const startTime = offer.counter_proposed_start_at || offer.proposed_start_at;
      
      // Create a booking from the accepted counter-offer
      const { data: newBooking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          student_id: offer.student_id,
          tutor_id: offer.tutor_id,
          subject_id: offer.subject_id,
          requested_start_at: startTime,
          requested_end_at: new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString(), // 1 hour session
          confirmed_start_at: startTime,
          confirmed_end_at: new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString(),
          status: 'CONFIRMED',
          price_ttd: 100, // Default price - adjust as needed
          student_notes: offer.tutor_note || null,
          last_action_by: 'tutor'
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
          alert('✅ Counter offer accepted and booking created!\n⚠️ Session creation pending - check video provider connection.');
        } else {
          alert('✅ Counter offer accepted! Booking and session created successfully.');
        }
      } catch (sessionError) {
        console.error('Error creating session:', sessionError);
        alert('✅ Counter offer accepted and booking created!\n⚠️ Session will be created when ready.');
      }

      fetchOffers(); // Refresh list
    } catch (err) {
      console.error('Error accepting counter:', err);
      alert('Failed to accept counter offer: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeclineCounter(offerId: string) {
    setActionLoading(offerId);
    try {
      const { error } = await supabase
        .from('lesson_offers')
        .update({ status: 'declined' })
        .eq('id', offerId);

      if (error) throw error;
      fetchOffers(); // Refresh list
    } catch (err) {
      console.error('Error declining counter:', err);
      alert('Failed to decline counter offer');
    } finally {
      setActionLoading(null);
    }
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
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Sent Offers</h2>
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
    <div className="bg-white border-2 border-blue-200 rounded-2xl p-6 shadow-lg mb-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Sent Offers</h2>
      
      {pendingOffers.length === 0 && counteredOffers.length === 0 ? (
        <p className="text-gray-600">No pending offers</p>
      ) : (
        <div className="space-y-4">
          {[...pendingOffers, ...counteredOffers].map((offer: any) => (
            <div
              key={offer.id}
              className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-4 hover:border-blue-400 transition-all"
            >
              <div className="flex items-start gap-4">
                {/* Student Avatar */}
                {offer.student?.avatar_url ? (
                  <img
                    src={offer.student.avatar_url}
                    alt={getDisplayName(offer.student)}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                    {getDisplayName(offer.student).charAt(0)}
                  </div>
                )}

                <div className="flex-1">
                  {/* Student Info */}
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-gray-900">{getDisplayName(offer.student)}</p>
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                      offer.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      offer.status === 'countered' ? 'bg-blue-100 text-blue-800' :
                      offer.status === 'accepted' ? 'bg-green-100 text-green-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {offer.status === 'countered' ? 'Counter Received' : offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
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
                      Your note: "{offer.tutor_note}"
                    </p>
                  )}

                  {/* Counter Proposal Info */}
                  {offer.status === 'countered' && offer.counter_proposed_start_at && (
                    <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-2">
                      <p className="text-sm text-blue-900 font-medium mb-1">
                        Student's counter: {formatDateTime(offer.counter_proposed_start_at)}
                      </p>
                      {offer.counter_tutor_note && (
                        <p className="text-xs text-blue-700 italic">"{offer.counter_tutor_note}"</p>
                      )}

                      {/* Counter Actions */}
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleAcceptCounter(offer.id)}
                          disabled={actionLoading === offer.id}
                          className="px-4 py-2 bg-itutor-green hover:bg-emerald-600 text-black font-semibold rounded-lg transition disabled:opacity-50 text-sm"
                        >
                          {actionLoading === offer.id ? 'Accepting...' : 'Accept Counter'}
                        </button>
                        <button
                          onClick={() => handleDeclineCounter(offer.id)}
                          disabled={actionLoading === offer.id}
                          className="px-4 py-2 bg-white hover:bg-gray-50 text-red-600 border border-red-300 rounded-lg font-medium transition disabled:opacity-50 text-sm"
                        >
                          {actionLoading === offer.id ? 'Declining...' : 'Decline'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Waiting Status */}
                  {offer.status === 'pending' && (
                    <p className="text-xs text-gray-500 mt-2">Waiting for student response...</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


