'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { CheckCircle2, AlertTriangle, Scale } from 'lucide-react';

type Claim = {
  id: string;
  status: 'awaiting_response' | 'pending_admin' | 'resolved';
  admin_verdict: 'tutor_noshow' | 'student_noshow' | 'tie' | null;
  admin_decided_at: string | null;
  created_at: string;
  response_deadline: string;
  session_id: string;
};

export default function StudentDisputesIndexPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('noshow_claims')
        .select('id, status, admin_verdict, admin_decided_at, created_at, response_deadline, session_id')
        .eq('claimant_id', user.id)
        .order('created_at', { ascending: false });
      setClaims((data as Claim[]) || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-6">My no-show claims</h1>

      {loading && <div className="text-sm text-gray-500">Loading…</div>}
      {!loading && claims.length === 0 && (
        <div className="text-sm text-gray-500">You haven't filed any claims.</div>
      )}

      <div className="space-y-3">
        {claims.map((c) => (
          <Link
            key={c.id}
            href={`/student/disputes/${c.id}/result`}
            className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-itutor-green transition"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-mono text-xs text-gray-500">{c.id.slice(0, 8)}…</div>
                <div className="text-sm font-semibold mt-1">{labelForStatus(c)}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Filed {new Date(c.created_at).toLocaleString()}
                </div>
              </div>
              {iconForStatus(c)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function labelForStatus(c: Claim) {
  if (c.status === 'awaiting_response') return 'Awaiting tutor response';
  if (c.status === 'pending_admin') return 'Under admin review';
  if (c.admin_verdict === 'tutor_noshow') return 'Resolved — tutor no-show confirmed';
  if (c.admin_verdict === 'student_noshow') return 'Resolved — claim denied';
  if (c.admin_verdict === 'tie') return 'Resolved — inconclusive';
  return 'Resolved';
}

function iconForStatus(c: Claim) {
  if (c.admin_verdict === 'tutor_noshow') return <CheckCircle2 className="w-6 h-6 text-green-600" />;
  if (c.admin_verdict === 'student_noshow') return <AlertTriangle className="w-6 h-6 text-red-600" />;
  if (c.admin_verdict === 'tie') return <Scale className="w-6 h-6 text-indigo-600" />;
  return <CheckCircle2 className="w-6 h-6 text-blue-600" />;
}
