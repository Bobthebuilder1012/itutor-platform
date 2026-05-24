'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import { AlertTriangle, Clock, ShieldAlert, Star } from 'lucide-react';

interface NoshowClaim {
  id: string;
  session_id: string;
  booking_id: string | null;
  claimant_id: string;
  claimant_role: 'student' | 'tutor';
  defendant_id: string;
  evidence_files: any[] | null;
  evidence_type: string | null;
  written_explanation: string;
  defendant_response: string | null;
  defendant_evidence_files: any[] | null;
  defendant_responded_at: string | null;
  response_deadline: string;
  created_at: string;
  claimant: any | null;
  defendant: any | null;
  session: { id: string; scheduled_start_at: string; charge_amount_ttd: number } | null;
}

interface Warning {
  id: string;
  user_id: string;
  user_role: 'student' | 'tutor';
  flag_reason: string;
  trigger_count: number | null;
  flagged_at: string;
  user: any | null;
}

interface Appeal {
  id: string;
  tutor_id: string;
  stars: number;
  system_reason: string;
  appeal_text: string;
  appealed_at: string;
  session_id: string | null;
  tutor: any | null;
}

interface SuspensionCandidate {
  tutor_id: string;
  active_strikes: number;
  tutor: any | null;
}

export default function AdminDisputesPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [claims, setClaims] = useState<NoshowClaim[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [suspensionCandidates, setSuspensionCandidates] = useState<SuspensionCandidate[]>([]);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', user.id)
        .single();
      if (profile?.role !== 'admin') {
        router.push('/login');
        return;
      }
      if (isEmailManagementOnlyAdmin(profile.email)) {
        router.replace('/admin/emails');
        return;
      }
      setAuthLoading(false);
      void load();
    })();
  }, [router]);

  async function load() {
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/admin/disputes');
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Failed to load disputes');
        return;
      }
      setClaims(data.noshow_claims || []);
      setWarnings(data.warnings || []);
      setAppeals(data.appeals || []);
      setSuspensionCandidates(data.suspension_candidates || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load disputes');
    }
  }

  async function resolveClaim(
    claim: NoshowClaim,
    outcome: 'tutor_noshow' | 'student_noshow' | 'tie'
  ) {
    if (!confirm(`Resolve this claim as: ${outcome.replace('_', ' ')}?`)) return;
    setWorking(claim.id);
    setError('');
    try {
      const res = await fetch(`/api/admin/noshow/${claim.session_id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, claimId: claim.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Failed to resolve');
        return;
      }
      setMessage(`Claim resolved: ${outcome.replace('_', ' ')}`);
      await load();
    } finally {
      setWorking(null);
    }
  }

  async function decideWarning(w: Warning, decision: 'issue' | 'dismiss') {
    setWorking(w.id);
    setError('');
    try {
      const res = await fetch(`/api/admin/warnings/${w.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Failed');
        return;
      }
      setMessage(`Warning ${decision === 'issue' ? 'issued' : 'dismissed'}`);
      await load();
    } finally {
      setWorking(null);
    }
  }

  async function decideAppeal(a: Appeal, decision: 'upheld' | 'overturned') {
    if (!confirm(`Decide appeal as: ${decision}?`)) return;
    setWorking(a.id);
    setError('');
    try {
      const res = await fetch(`/api/admin/system-ratings/${a.id}/decide-appeal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Failed');
        return;
      }
      setMessage(`Appeal ${decision}`);
      await load();
    } finally {
      setWorking(null);
    }
  }

  async function loadEvidenceUrl(path: string) {
    if (evidenceUrls[path]) return;
    const { data } = await supabase.storage
      .from('noshow-evidence')
      .createSignedUrl(path, 60 * 10);
    if (data?.signedUrl) {
      setEvidenceUrls((prev) => ({ ...prev, [path]: data.signedUrl }));
    }
  }

  if (authLoading) {
    return <div className="p-10 text-center text-gray-500">Loading…</div>;
  }

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">Disputes & reliability</h1>
          <p className="text-sm text-gray-600 mt-1">
            No-show claims, reliability warnings, suspension candidates, and system-rating appeals.
          </p>
        </header>

        {message && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* No-show claims */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            No-show claims awaiting review
            <span className="text-xs font-normal text-gray-500 ml-1">({claims.length})</span>
          </h2>

          {claims.length === 0 ? (
            <p className="text-sm text-gray-500">No pending claims.</p>
          ) : (
            <div className="space-y-3">
              {claims.map((c) => (
                <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm text-gray-500">Claim {c.id.slice(0, 8)}…</div>
                      <div className="text-sm">
                        <span className="font-semibold">
                          {c.claimant?.display_name || c.claimant?.full_name || 'Claimant'}
                        </span>{' '}
                        ({c.claimant_role}) vs.{' '}
                        <span className="font-semibold">
                          {c.defendant?.display_name || c.defendant?.full_name || 'Defendant'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Session{' '}
                        {c.session
                          ? new Date(c.session.scheduled_start_at).toLocaleString()
                          : c.session_id.slice(0, 8)}
                        {c.session ? ` — TTD ${c.session.charge_amount_ttd}` : ''}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      Filed {new Date(c.created_at).toLocaleString()}
                      {!c.defendant_responded_at && (
                        <div className="text-red-600 mt-1">
                          <Clock className="w-3 h-3 inline mb-0.5" /> Response window expired
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-gray-50 border p-3">
                      <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">
                        Claimant account
                      </div>
                      <p className="whitespace-pre-wrap text-gray-800">{c.written_explanation}</p>
                      {Array.isArray(c.evidence_files) && c.evidence_files.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {c.evidence_files.map((f: any, i: number) => (
                            <li key={i}>
                              <button
                                onClick={() => loadEvidenceUrl(f.path)}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                {evidenceUrls[f.path] ? (
                                  <a href={evidenceUrls[f.path]} target="_blank" rel="noreferrer">
                                    Open: {f.original_name || f.path}
                                  </a>
                                ) : (
                                  <>Load: {f.original_name || f.path}</>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-lg bg-gray-50 border p-3">
                      <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">
                        Defendant response
                      </div>
                      {c.defendant_response ? (
                        <p className="whitespace-pre-wrap text-gray-800">{c.defendant_response}</p>
                      ) : (
                        <p className="text-gray-500 italic">
                          No response submitted (window expired). Silence weighs against the defendant.
                        </p>
                      )}
                      {Array.isArray(c.defendant_evidence_files) &&
                        c.defendant_evidence_files.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {c.defendant_evidence_files.map((f: any, i: number) => (
                              <li key={i}>
                                <button
                                  onClick={() => loadEvidenceUrl(f.path)}
                                  className="text-xs text-blue-600 hover:underline"
                                >
                                  {evidenceUrls[f.path] ? (
                                    <a href={evidenceUrls[f.path]} target="_blank" rel="noreferrer">
                                      Open: {f.original_name || f.path}
                                    </a>
                                  ) : (
                                    <>Load: {f.original_name || f.path}</>
                                  )}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={working === c.id}
                      onClick={() =>
                        resolveClaim(
                          c,
                          c.claimant_role === 'student' ? 'tutor_noshow' : 'student_noshow'
                        )
                      }
                      className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      Confirm claim (claimant wins)
                    </button>
                    <button
                      disabled={working === c.id}
                      onClick={() =>
                        resolveClaim(
                          c,
                          c.claimant_role === 'student' ? 'student_noshow' : 'tutor_noshow'
                        )
                      }
                      className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      Reject claim (defendant wins)
                    </button>
                    <button
                      disabled={working === c.id}
                      onClick={() => resolveClaim(c, 'tie')}
                      className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Inconclusive — full refund, no penalty
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Reliability warnings */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            Warning candidates
            <span className="text-xs font-normal text-gray-500 ml-1">({warnings.length})</span>
          </h2>
          {warnings.length === 0 ? (
            <p className="text-sm text-gray-500">No pending warnings.</p>
          ) : (
            <div className="space-y-2">
              {warnings.map((w) => (
                <div
                  key={w.id}
                  className="bg-white border border-amber-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-sm font-semibold">
                      {w.user?.display_name || w.user?.full_name || w.user?.email}
                    </div>
                    <div className="text-xs text-gray-600">
                      {labelForWarning(w.flag_reason)}
                      {w.trigger_count != null ? ` — trigger count: ${w.trigger_count}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={working === w.id}
                      onClick={() => decideWarning(w, 'issue')}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      Issue warning
                    </button>
                    <button
                      disabled={working === w.id}
                      onClick={() => decideWarning(w, 'dismiss')}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Suspension candidates */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            Tutors at ≥5 active strikes
            <span className="text-xs font-normal text-gray-500 ml-1">
              ({suspensionCandidates.length})
            </span>
          </h2>
          {suspensionCandidates.length === 0 ? (
            <p className="text-sm text-gray-500">No tutors over the suspension threshold.</p>
          ) : (
            <div className="space-y-2">
              {suspensionCandidates.map((s) => (
                <div
                  key={s.tutor_id}
                  className="bg-white border border-red-300 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-sm font-semibold">
                      {s.tutor?.display_name || s.tutor?.full_name || s.tutor?.email}
                    </div>
                    <div className="text-xs text-red-600">{s.active_strikes} active strikes</div>
                  </div>
                  <a
                    href={`/admin/payouts?tutorId=${s.tutor_id}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View tutor →
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* System rating appeals */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            System-rating appeals
            <span className="text-xs font-normal text-gray-500 ml-1">({appeals.length})</span>
          </h2>
          {appeals.length === 0 ? (
            <p className="text-sm text-gray-500">No pending appeals.</p>
          ) : (
            <div className="space-y-2">
              {appeals.map((a) => (
                <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm">
                      <span className="font-semibold">
                        {a.tutor?.display_name || a.tutor?.full_name || a.tutor?.email}
                      </span>{' '}
                      — {a.stars}-star{' '}
                      <span className="text-xs text-gray-500">({a.system_reason})</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Appealed {new Date(a.appealed_at).toLocaleString()}
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap rounded-lg bg-gray-50 border p-3">
                    {a.appeal_text}
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={working === a.id}
                      onClick={() => decideAppeal(a, 'overturned')}
                      className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      Overturn (remove rating)
                    </button>
                    <button
                      disabled={working === a.id}
                      onClick={() => decideAppeal(a, 'upheld')}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Uphold (rating stays)
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

function labelForWarning(flag: string): string {
  switch (flag) {
    case 'student_cancellation_threshold':
      return 'Student hit 3+ cancellations in last 30 days.';
    case 'tutor_strike_threshold':
      return 'Tutor hit 3+ active strikes in last 90 days.';
    case 'tutor_suspension_threshold':
      return 'Tutor hit 5+ active strikes — suspension recommended.';
    case 'student_noshow_repeat':
      return 'Student has multiple no-shows in rolling window.';
    case 'admin_manual':
      return 'Admin-flagged manually.';
    default:
      return flag;
  }
}
