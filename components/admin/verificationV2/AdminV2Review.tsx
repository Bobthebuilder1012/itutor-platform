'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { useProfile } from '@/lib/hooks/useProfile';

export interface ReviewDetail {
  tutor: { id: string; name: string | null; email: string | null; profileStatus: string | null };
  application: {
    status: string;
    consentAt: string | null;
    identity: {
      status: string | null;
      errorCode: string | null;
      provider: string | null;
      providerCode: string | null;
      country: string | null;
      attempts: number;
      verifiedAt: string | null;
      redacted: boolean;
    };
    submittedAt: string | null;
    decisionReason: string | null;
    decidedAt: string | null;
    filesDeleted: boolean;
  };
  credentials: {
    id: string; kind: string; subject: string | null; grade: string | null; examYear: number | null;
    school: string | null; degree: string | null; field: string | null; graduationYear: number | null;
    proofUrl: string | null; proofFilename: string | null; proofLink: string | null; proofDeleted: boolean;
    evidence: { key: string; label: string; criteria: string[] }[];
  }[];
  extras: { id: string; title: string; description: string; linkUrl: string | null }[];
  decisions: { id: string; actorRole: string; action: string; from: string | null; to: string | null; profileFrom: string | null; profileTo: string | null; reason: string | null; at: string }[];
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

/** The review page's content with no fetching. Also used by the dev states gallery. */
export function ReviewView({
  detail,
  isAdmin,
  reason,
  onReason,
  busy,
  onAct,
}: {
  detail: ReviewDetail;
  isAdmin: boolean;
  reason: string;
  onReason: (v: string) => void;
  busy: boolean;
  onAct: (action: 'approve' | 'reject' | 'revoke') => void;
}) {
  const status = detail.application.status;
  const canDecide = status === 'IN_REVIEW';
  const canRevoke = isAdmin && status === 'VERIFIED';
  const id = detail.application.identity;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold">{detail.tutor.name ?? 'Unnamed teacher'}</h1>
        <p className="text-sm text-gray-600">{detail.tutor.email}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-gray-500">Application</dt><dd className="font-semibold">{status}</dd></div>
          <div><dt className="text-gray-500">Teacher status</dt><dd className="font-semibold">{detail.tutor.profileStatus ?? 'UNVERIFIED'}</dd></div>
          <div><dt className="text-gray-500">Submitted</dt><dd>{fmt(detail.application.submittedAt)}</dd></div>
          <div><dt className="text-gray-500">Consent given</dt><dd>{fmt(detail.application.consentAt)}</dd></div>
        </dl>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-bold">Identity check</h2>
        <p className="mt-1 text-sm">
          Result:{' '}
          <span className={id.status === 'verified' ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>
            {id.status ?? 'not started'}
          </span>
          {id.errorCode && <> ({id.errorCode})</>} · {id.attempts} attempt(s)
          {id.provider && (
            <> · checked by {id.provider}{id.country ? ` (document from ${id.country})` : ''}</>
          )}
        </p>
        {id.providerCode && <p className="mt-1 text-xs text-gray-500">Provider code (for coverage testing): {id.providerCode}</p>}
        <p className="mt-1 text-xs text-gray-500">
          iTutor never stores the ID or the selfie, so there is nothing to view here.
          {id.redacted ? ' The provider has redacted its copy.' : ' The provider still holds its copy until it is redacted after a decision.'}
        </p>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-bold">Credentials</h2>
        {detail.credentials.length === 0 && <p className="mt-2 text-sm text-gray-500">None.</p>}
        <ul className="mt-3 space-y-4">
          {detail.credentials.map((c) => (
            <li key={c.id} className="rounded-lg border border-gray-200 p-4 text-sm">
              <p className="font-semibold">
                {c.kind === 'DEGREE'
                  ? `${c.degree}${c.field ? `, ${c.field}` : ''} · ${c.school} · ${c.graduationYear}`
                  : `${c.kind} ${c.subject} · Grade ${c.grade} · ${c.examYear}`}
              </p>
              <p className="mt-1">
                {c.proofLink && <a className="mr-3 font-semibold text-[#199356] underline" href={c.proofLink} target="_blank" rel="noopener noreferrer">Open proof file{c.proofFilename ? ` (${c.proofFilename})` : ''}</a>}
                {c.proofUrl && <a className="font-semibold text-[#199356] underline" href={c.proofUrl} target="_blank" rel="noopener noreferrer nofollow">Teacher&apos;s proof link</a>}
                {c.proofDeleted && <span className="text-gray-500">Proof file deleted per retention policy.</span>}
              </p>
              {c.evidence.length > 0 && (
                <div className="mt-3 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase text-gray-500">Evidence to check</p>
                  {c.evidence.map((r) => (
                    <div key={r.key} className="mt-1">
                      <p className="text-xs font-semibold">{r.label}</p>
                      <ul className="list-disc pl-5 text-xs text-gray-700">
                        {r.criteria.map((line) => <li key={line}>{line}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-bold">Teacher-provided extras</h2>
        <p className="text-xs text-gray-500">Not verified by iTutor. Shown publicly with that label.</p>
        {detail.extras.length === 0 && <p className="mt-2 text-sm text-gray-500">None.</p>}
        <ul className="mt-3 space-y-3">
          {detail.extras.map((x) => (
            <li key={x.id} className="text-sm">
              <p className="font-semibold">{x.title}</p>
              <p className="text-gray-700">{x.description}</p>
              {x.linkUrl && <a className="break-all text-xs text-[#199356] underline" href={x.linkUrl} target="_blank" rel="noopener noreferrer nofollow">{x.linkUrl}</a>}
            </li>
          ))}
        </ul>
      </section>

      {(canDecide || canRevoke) && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-bold">Decision</h2>
          <textarea
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            rows={3}
            placeholder={canDecide ? 'Reason (required to reject; recorded in the audit log)' : 'Reason for revoking (required)'}
            className="mt-3 w-full rounded-lg border border-gray-300 p-3 text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            {canDecide && (
              <>
                <button onClick={() => onAct('approve')} disabled={busy} className="rounded-lg bg-[#199356] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Approve</button>
                <button onClick={() => onAct('reject')} disabled={busy} className="rounded-lg border border-red-300 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50">Reject</button>
              </>
            )}
            {canRevoke && (
              <button onClick={() => onAct('revoke')} disabled={busy} className="rounded-lg border border-red-300 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50">Revoke verification</button>
            )}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-bold">Decision history</h2>
        {detail.decisions.length === 0 && <p className="mt-2 text-sm text-gray-500">No decisions yet.</p>}
        <ul className="mt-3 space-y-2 text-sm">
          {detail.decisions.map((d) => (
            <li key={d.id} className="border-l-2 border-gray-200 pl-3">
              <p><span className="font-semibold">{d.action}</span> by {d.actorRole} · {fmt(d.at)}</p>
              <p className="text-xs text-gray-500">application {d.from ?? '—'} → {d.to ?? '—'} · teacher {d.profileFrom ?? '—'} → {d.profileTo ?? 'unchanged'}</p>
              {d.reason && <p className="text-gray-700">{d.reason}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function AdminV2Review({ tutorId }: { tutorId: string }) {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/verification-v2/${tutorId}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not load');
      setDetail(body);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tutorId]);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile || (!profile.is_reviewer && profile.role !== 'admin')) {
      router.push('/login');
      return;
    }
    void load();
  }, [profile, profileLoading, router, load]);

  async function act(action: 'approve' | 'reject' | 'revoke') {
    if ((action === 'reject' || action === 'revoke') && !reason.trim()) {
      setError('A reason is required.');
      return;
    }
    if (!confirm(`${action[0]!.toUpperCase() + action.slice(1)} this teacher?`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/verification-v2/${tutorId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed');
      setMessage(
        body.profile?.to === null && action === 'reject'
          ? 'Rejected. The teacher stays verified; use revoke to remove verified status.'
          : `Done: ${action}d.`
      );
      setReason('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (profileLoading || !profile) return null;
  const isAdmin = profile.role === 'admin';
  const displayName = profile.display_name || profile.full_name || 'Admin';

  return (
    <DashboardLayout role={isAdmin ? 'admin' : 'reviewer'} userName={displayName}>
      <div className="mx-auto max-w-3xl px-4 py-6 text-gray-900">
        <AdminBreadcrumb
          items={[{ label: 'Operations' }, { label: 'Verification v2', href: '/admin/verification-v2' }, { label: 'Review' }]}
        />
        {!detail && !error && <p className="text-sm text-gray-500">Loading…</p>}
        {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {message && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
        {detail && <ReviewView detail={detail} isAdmin={isAdmin} reason={reason} onReason={setReason} busy={busy} onAct={act} />}
      </div>
    </DashboardLayout>
  );
}
