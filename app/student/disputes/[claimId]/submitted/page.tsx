'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { CheckCircle2, Clock } from 'lucide-react';

export default function ClaimSubmittedPage() {
  const params = useParams();
  const claimId = params.claimId as string;
  const [claim, setClaim] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!claimId) return;
    (async () => {
      const { data } = await supabase
        .from('noshow_claims')
        .select('id, created_at, status, response_deadline, evidence_files, written_explanation, session_id, defendant_id')
        .eq('id', claimId)
        .maybeSingle();
      setClaim(data);
      setLoading(false);
    })();
  }, [claimId]);

  if (loading) {
    return <div className="p-10 text-center text-gray-500">Loading…</div>;
  }
  if (!claim) {
    return <div className="p-10 text-center text-red-600">Claim not found.</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="bg-white border border-blue-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-blue-600 text-white px-6 py-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-7 h-7" />
            <div>
              <h1 className="text-xl font-bold">Claim submitted</h1>
              <p className="text-sm opacity-90">Your report is being reviewed.</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="rounded-xl border bg-gray-50 p-4 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Claim ID</span><span className="font-mono text-xs">{claim.id}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Filed</span><span>{new Date(claim.created_at).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="font-medium text-blue-600">Under review</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Tutor response deadline</span><span>{new Date(claim.response_deadline).toLocaleString()}</span></div>
          </div>

          <div className="rounded-xl border bg-gray-50 p-4 text-sm space-y-2">
            <div className="font-semibold text-gray-900">What happens next</div>
            <ol className="list-decimal list-inside text-gray-700 space-y-1 text-xs">
              <li><span className="text-green-600 font-semibold">✓</span> Report submitted</li>
              <li><span className="text-green-600 font-semibold">✓</span> Tutor notified — 12 hours to respond</li>
              <li><Clock className="w-3 h-3 inline mb-0.5" /> Support team reviews both accounts</li>
              <li><Clock className="w-3 h-3 inline mb-0.5" /> Resolution sent via email + in-app</li>
            </ol>
          </div>

          <div className="rounded-lg bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-gray-700">
            If the tutor doesn't respond within 12 hours, their silence weighs against them. If evidence is
            genuinely inconclusive on both sides, the session is treated as a mutual non-completion: full refund
            to you, no payment to the tutor, no penalties for either party.
          </div>

          <Link
            href="/student/bookings"
            className="block text-center px-4 py-3 rounded-xl bg-itutor-green hover:opacity-90 text-white font-semibold"
          >
            View my bookings
          </Link>
        </div>
      </div>
    </div>
  );
}
