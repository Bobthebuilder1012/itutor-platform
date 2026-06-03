'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, Star, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import AppealModal from './AppealModal';

type StrikeRow = {
  id: string;
  reason: string;
  notes: string | null;
  issued_at: string;
  expires_at: string;
  appeal_status: 'pending' | 'upheld' | 'overturned' | null;
  appeal_text: string | null;
  appealed_at: string | null;
  appeal_decided_at: string | null;
  appeal_decision_notes: string | null;
};

type RatingRow = {
  id: string;
  stars: number;
  system_reason: string | null;
  is_active: boolean;
  appeal_status: 'pending' | 'upheld' | 'overturned' | null;
  appeal_text: string | null;
  appealed_at: string | null;
  appeal_decided_at: string | null;
  appeal_decision_notes: string | null;
  created_at: string;
};

type TutorData = {
  strikes: StrikeRow[];
  system_ratings: RatingRow[];
  strike_state: {
    active_strikes: number;
    warning_threshold: number;
    suspension_threshold: number;
  };
};

type StudentData = {
  strikes: StrikeRow[];
  strike_state: {
    active_strikes: number;
    warning_threshold: number;
    suspension_threshold: number;
  };
  cancel_state: {
    count_30d: number;
    is_warned: boolean;
    warning_issued_at: string | null;
    late_cancel_fee_applies: boolean;
  };
};

interface Props {
  role: 'tutor' | 'student';
}

export default function ReliabilityPanel({ role }: Props) {
  const [data, setData] = useState<TutorData | StudentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [appealTarget, setAppealTarget] = useState<{
    endpoint: string;
    title: string;
    context: string;
  } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/${role}/reliability`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [role]);

  if (loading || !data) return null;

  const strikes = data.strikes || [];
  const isTutor = role === 'tutor';
  const tutorData = isTutor ? (data as TutorData) : null;
  const studentData = !isTutor ? (data as StudentData) : null;

  const ratings = tutorData?.system_ratings || [];
  const activeStrikes = data.strike_state?.active_strikes ?? 0;
  const warnAt = data.strike_state?.warning_threshold ?? 3;
  const susAt = data.strike_state?.suspension_threshold ?? 5;

  const nothingToShow =
    activeStrikes === 0 &&
    ratings.length === 0 &&
    (!studentData || (studentData.cancel_state.count_30d === 0 && !studentData.cancel_state.is_warned));

  if (nothingToShow) {
    return null;
  }

  const pct = Math.min(100, warnAt > 0 ? (activeStrikes / warnAt) * 100 : 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-ink flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            Reliability
          </h2>
          {!collapsed && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Strikes and system-issued items on your account.
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Active strikes</div>
            <div className={`text-xl font-bold ${activeStrikes >= warnAt ? 'text-red-600' : 'text-amber-600'}`}>
              {activeStrikes}
              <span className="text-xs text-muted-foreground font-normal"> / {warnAt}</span>
            </div>
          </div>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-xs text-muted-foreground hover:text-ink border border-border rounded-lg px-2.5 py-1 transition"
          >
            {collapsed ? 'Show' : 'Hide'}
          </button>
        </div>
      </header>

      {/* Always-visible compact bar */}
      <div className="space-y-1">
        <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
          <div
            className={`h-full transition-all ${activeStrikes >= warnAt ? 'bg-red-500' : 'bg-amber-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {activeStrikes >= warnAt
            ? 'Reliability warning threshold reached — pending admin review.'
            : `${warnAt - activeStrikes} more strike${warnAt - activeStrikes === 1 ? '' : 's'} until reliability warning.`}
        </p>
      </div>

      {collapsed ? null : (<>

      {studentData && studentData.cancel_state.count_30d > 0 && (
        <div className="rounded-xl border bg-amber-50 border-amber-200 p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold text-amber-900">
              {studentData.cancel_state.count_30d} cancellation
              {studentData.cancel_state.count_30d === 1 ? '' : 's'} in the last 30 days
            </div>
            <div className="text-xs text-amber-800 mt-0.5">
              {studentData.cancel_state.is_warned
                ? 'Late cancellations (under 12 hours before start) will incur a 50% fee.'
                : 'After 3 cancellations in 30 days you may receive a reliability warning.'}
            </div>
          </div>
        </div>
      )}

      {strikes.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Strikes</h3>
          <ul className="space-y-2">
            {strikes.map((s) => (
              <li key={s.id} className="rounded-xl border bg-gray-50 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{labelForStrike(s.reason)}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Issued {new Date(s.issued_at).toLocaleDateString()} - expires{' '}
                      {new Date(s.expires_at).toLocaleDateString()}
                    </div>
                    {s.notes && (
                      <div className="text-xs text-gray-600 mt-1 italic">{s.notes}</div>
                    )}
                    {s.appeal_status && (
                      <div className="mt-2 text-xs">
                        <AppealStatusPill status={s.appeal_status} />
                        {s.appeal_decision_notes && (
                          <div className="text-gray-600 mt-1">{s.appeal_decision_notes}</div>
                        )}
                      </div>
                    )}
                  </div>
                  {!s.appeal_status && (
                    <button
                      onClick={() =>
                        setAppealTarget({
                          endpoint: `/api/${role}/strikes/${s.id}/appeal`,
                          title: `Appeal strike: ${labelForStrike(s.reason)}`,
                          context: `This strike was issued ${new Date(s.issued_at).toLocaleDateString()}. Provide context for an admin to review.`,
                        })
                      }
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex-shrink-0"
                    >
                      Appeal
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tutorData && ratings.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
            System-issued ratings
          </h3>
          <ul className="space-y-2">
            {ratings.map((r) => (
              <li
                key={r.id}
                className={`rounded-xl border p-3 text-sm ${r.is_active ? 'bg-gray-50' : 'bg-gray-100 opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${i < r.stars ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                        />
                      ))}
                      {!r.is_active && (
                        <span className="text-xs text-gray-500">(removed from average)</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {labelForRatingReason(r.system_reason)} -{' '}
                      {new Date(r.created_at).toLocaleDateString()}
                    </div>
                    {r.appeal_status && (
                      <div className="mt-2 text-xs">
                        <AppealStatusPill status={r.appeal_status} />
                        {r.appeal_decision_notes && (
                          <div className="text-gray-600 mt-1">{r.appeal_decision_notes}</div>
                        )}
                      </div>
                    )}
                  </div>
                  {!r.appeal_status && r.is_active && (
                    <button
                      onClick={() =>
                        setAppealTarget({
                          endpoint: `/api/tutor/ratings/${r.id}/appeal`,
                          title: `Appeal ${r.stars}-star rating`,
                          context: `${labelForRatingReason(r.system_reason)}. Issued ${new Date(r.created_at).toLocaleDateString()}.`,
                        })
                      }
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex-shrink-0"
                    >
                      Appeal
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      </>)}

      <AppealModal
        open={!!appealTarget}
        title={appealTarget?.title ?? ''}
        context={appealTarget?.context ?? ''}
        endpoint={appealTarget?.endpoint ?? ''}
        onClose={() => setAppealTarget(null)}
        onSubmitted={() => void load()}
      />
    </div>
  );
}

function AppealStatusPill({ status }: { status: 'pending' | 'upheld' | 'overturned' }) {
  if (status === 'pending')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
        <Clock className="w-3 h-3" /> Appeal under review
      </span>
    );
  if (status === 'overturned')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-medium">
        <CheckCircle2 className="w-3 h-3" /> Appeal upheld
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-xs font-medium">
      Appeal denied
    </span>
  );
}

function labelForStrike(reason: string): string {
  switch (reason) {
    case 'tutor_cancelled':
      return 'Tutor cancellation';
    case 'tutor_super_late_cancel':
      return 'Cancelled within 15 min of start';
    case 'tutor_noshow':
      return 'Tutor no-show (admin verdict)';
    case 'student_noshow':
      return 'Student no-show (admin verdict)';
    case 'admin_manual':
      return 'Admin-issued strike';
    default:
      return reason;
  }
}

function labelForRatingReason(reason: string | null): string {
  switch (reason) {
    case 'tutor_noshow':
      return 'Auto-issued for no-show';
    case 'tutor_super_late_cancel':
      return 'Auto-issued for late cancellation';
    default:
      return reason || 'System-issued';
  }
}
