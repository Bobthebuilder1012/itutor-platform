'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { CheckCircle2, AlertTriangle, Scale } from 'lucide-react';

type ClaimWithSession = {
  id: string;
  status: 'awaiting_response' | 'pending_admin' | 'resolved';
  admin_verdict: 'tutor_noshow' | 'student_noshow' | 'tie' | null;
  admin_decided_at: string | null;
  admin_notes: string | null;
  created_at: string;
  response_deadline: string;
  session_id: string;
  defendant_id: string;
  session: { id: string; scheduled_start_at: string; charge_amount_ttd: number } | null;
  payment_refund_ttd: number | null;
  payment_retained_ttd: number | null;
};

export default function ClaimResultPage() {
  const params = useParams();
  const claimId = params.claimId as string;
  const [claim, setClaim] = useState<any>(null);
  const [refund, setRefund] = useState<{ refund_amount_ttd: number; retained_amount_ttd: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('noshow_claims')
        .select(
          'id, status, admin_verdict, admin_decided_at, admin_notes, created_at, response_deadline, session_id, defendant_id, booking_id, written_explanation'
        )
        .eq('id', claimId)
        .maybeSingle();

      if (!data) {
        setLoading(false);
        return;
      }
      setClaim(data);

      // Load session financials.
      const { data: session } = await supabase
        .from('sessions')
        .select('id, scheduled_start_at, charge_amount_ttd')
        .eq('id', (data as any).session_id)
        .maybeSingle();
      (data as any).session = session;

      // Load the refund row for the booking if any.
      if ((data as any).booking_id) {
        const { data: payment } = await supabase
          .from('payments')
          .select('refund_amount_ttd, retained_amount_ttd')
          .eq('booking_id', (data as any).booking_id)
          .in('status', ['refunded', 'partially_refunded'])
          .order('refunded_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (payment) {
          setRefund({
            refund_amount_ttd: Number(payment.refund_amount_ttd || 0),
            retained_amount_ttd: Number(payment.retained_amount_ttd || 0),
          });
        }
      }

      setLoading(false);
    })();
  }, [claimId]);

  if (loading) return <div className="p-10 text-center text-gray-500">Loading…</div>;
  if (!claim) return <div className="p-10 text-center text-red-600">Claim not found.</div>;

  if (claim.status !== 'resolved') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white border border-blue-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-blue-600 text-white px-6 py-5">
            <h1 className="text-xl font-bold">Claim in progress</h1>
            <p className="text-sm opacity-90">{claim.status === 'awaiting_response' ? 'Awaiting tutor response.' : 'Under admin review.'}</p>
          </div>
          <div className="p-6">
            <Link href="/student/disputes" className="text-itutor-green hover:underline text-sm">
              ← All claims
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (claim.admin_verdict === 'tutor_noshow') {
    return <TutorNoShowResolved claim={claim} refund={refund} />;
  }
  if (claim.admin_verdict === 'student_noshow') {
    return <StudentNoShowResolved claim={claim} refund={refund} />;
  }
  return <TieResolved claim={claim} refund={refund} />;
}

function TutorNoShowResolved({ claim, refund }: { claim: any; refund: any }) {
  const total = (refund?.refund_amount_ttd ?? 0) + (refund?.retained_amount_ttd ?? 0);
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="bg-white border border-green-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-green-600 text-white px-6 py-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-7 h-7" />
            <div>
              <h1 className="text-xl font-bold">No-show confirmed</h1>
              <p className="text-sm opacity-90">The tutor did not attend your session.</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="rounded-xl bg-green-50 border border-green-200 p-5">
            <div className="text-xs text-green-700 font-semibold uppercase tracking-wide">Refund amount</div>
            <div className="text-3xl font-bold text-green-700 mt-1">
              TTD {(refund?.refund_amount_ttd ?? total).toFixed(2)}
            </div>
            <div className="text-xs text-gray-600 mt-2">
              Returned to your original payment method within 2–5 business days.
            </div>
          </div>

          <div className="rounded-xl border bg-gray-50 p-4 text-sm space-y-1">
            <div className="font-semibold text-gray-900 mb-2">Action taken against the tutor</div>
            <ul className="list-disc list-inside text-gray-700 space-y-1 text-xs">
              <li>The tutor received no payment for this session.</li>
              <li>A strike was recorded on their 90-day reliability record.</li>
              <li>A 1-star system rating was applied to their profile (appealable by them).</li>
            </ul>
          </div>

          <div className="rounded-lg bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-gray-700">
            You have not been penalised. If you'd like to find a different tutor, browse the Explore page.
          </div>

          <div className="flex gap-2 pt-2">
            <Link href="/student/find-tutors" className="flex-1 text-center px-4 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold">
              Find another tutor
            </Link>
            <Link href="/student/bookings" className="flex-1 text-center px-4 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50">
              My bookings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentNoShowResolved({ claim, refund }: { claim: any; refund: any }) {
  const total = (refund?.refund_amount_ttd ?? 0) + (refund?.retained_amount_ttd ?? 0);
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="bg-white border border-red-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-red-600 text-white px-6 py-5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-7 h-7" />
            <div>
              <h1 className="text-xl font-bold">No-show confirmed</h1>
              <p className="text-sm opacity-90">You were marked as absent for this session.</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="rounded-xl bg-amber-50 border border-amber-300 p-5 space-y-2 text-sm">
            <div className="flex justify-between text-gray-700">
              <span>Session price</span>
              <span className="font-medium">TTD {total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-red-700">
              <span>No-show charge (50%)</span>
              <span className="font-medium">− TTD {(refund?.retained_amount_ttd ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-amber-300 pt-2 mt-2">
              <span className="font-semibold">Refunded to you</span>
              <span className="text-2xl font-bold text-amber-700">
                TTD {(refund?.refund_amount_ttd ?? 0).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="rounded-xl border bg-gray-50 p-4 text-sm space-y-1">
            <div className="font-semibold text-gray-900 mb-2">Penalties applied</div>
            <ul className="list-disc list-inside text-gray-700 space-y-1 text-xs">
              <li>50% of the session fee has been retained.</li>
              <li>This is recorded in your no-show history.</li>
            </ul>
          </div>

          {claim.admin_notes && (
            <div className="rounded-lg bg-gray-50 border-l-4 border-gray-400 p-3 text-xs text-gray-700">
              <div className="font-semibold mb-1">Admin notes</div>
              {claim.admin_notes}
            </div>
          )}

          <Link href="/student/bookings" className="block text-center px-4 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50">
            My bookings
          </Link>
        </div>
      </div>
    </div>
  );
}

function TieResolved({ claim, refund }: { claim: any; refund: any }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="bg-white border border-indigo-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-indigo-600 text-white px-6 py-5">
          <div className="flex items-center gap-3">
            <Scale className="w-7 h-7" />
            <div>
              <h1 className="text-xl font-bold">Claim resolved</h1>
              <p className="text-sm opacity-90">Evidence was inconclusive.</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="rounded-xl bg-green-50 border border-green-200 p-5">
            <div className="text-xs text-green-700 font-semibold uppercase tracking-wide">Refund</div>
            <div className="text-3xl font-bold text-green-700 mt-1">
              TTD {(refund?.refund_amount_ttd ?? 0).toFixed(2)}
            </div>
            <div className="text-xs text-gray-600 mt-2">Full refund — neither party was penalised.</div>
          </div>

          <div className="rounded-xl border bg-gray-50 p-4 text-sm space-y-1">
            <div className="font-semibold text-gray-900 mb-2">Outcome</div>
            <ul className="list-disc list-inside text-gray-700 space-y-1 text-xs">
              <li>Full refund within 2–5 business days.</li>
              <li>Tutor is not paid for this session.</li>
              <li>No strike, fee, or rating penalty for either side.</li>
              <li>This does not count toward your no-show record.</li>
            </ul>
          </div>

          <div className="rounded-lg bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-gray-700">
            For future sessions, save the meeting attendance report as evidence if any issues arise.
          </div>

          <Link href="/student/bookings" className="block text-center px-4 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50">
            My bookings
          </Link>
        </div>
      </div>
    </div>
  );
}
