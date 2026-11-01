'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { useProfile } from '@/lib/hooks/useProfile';
import { DECISION_REASONS } from '@/lib/verificationV2/reasons';

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
      /** Does the name on the verified document match the profile name? null = not checked. */
      nameMatch?: boolean | null;
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
    /** Added after verification; waiting for an admin. */
    pending?: boolean;
    evidence: { key: string; label: string; criteria: string[] }[];
  }[];
  extras: { id: string; title: string; description: string; linkUrl: string | null }[];
  decisions: { id: string; actorRole: string; action: string; from: string | null; to: string | null; profileFrom: string | null; profileTo: string | null; reason: string | null; at: string }[];
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

const IDENTITY_SUMMARY: Record<string, string> = {
  verified: 'Passed',
  pending: 'Started',
  processing: 'In review at the provider',
  retryable_failure: 'Failed',
  not_supported: 'Could not be checked',
  consent_declined: 'Declined',
  canceled: 'Cancelled',
};

/** The review page's content with no fetching. Also used by the dev states gallery. */
export function ReviewView({
  detail,
  isAdmin,
  reason,
  onReason,
  note = '',
  onNote = () => {},
  busy,
  onAct,
  onCredential = () => {},
}: {
  detail: ReviewDetail;
  isAdmin: boolean;
  /** One of the fixed reasons (lib/verificationV2/reasons.ts), or ''. */
  reason: string;
  onReason: (v: string) => void;
  /** Internal: never shown to the teacher. */
  note?: string;
  onNote?: (v: string) => void;
  busy: boolean;
  onAct: (action: 'approve' | 'reject' | 'revoke' | 'request-info') => void;
  onCredential?: (action: 'approve' | 'reject', credentialId: string) => void;
}) {
  const status = detail.application.status;
  const canDecide = status === 'IN_REVIEW';
  const canRevoke = isAdmin && status === 'VERIFIED';
  const id = detail.application.identity;

  return (
    <div className="space-y-5">
      <section className="bg-white border-2 border-gray-200 rounded-lg p-6">
        <h1 className="text-3xl font-bold text-gray-900">{detail.tutor.name ?? 'Unnamed teacher'}</h1>
        <p className="text-sm text-gray-600">{detail.tutor.email}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-gray-500">Application</dt><dd className="font-semibold">{status}</dd></div>
          <div><dt className="text-gray-500">Teacher status</dt><dd className="font-semibold">{detail.tutor.profileStatus ?? 'UNVERIFIED'}</dd></div>
          <div><dt className="text-gray-500">Submitted</dt><dd>{fmt(detail.application.submittedAt)}</dd></div>
          <div><dt className="text-gray-500">Consent given</dt><dd>{fmt(detail.application.consentAt)}</dd></div>
        </dl>
      </section>

      <section className="bg-white border-2 border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Identity check</h2>
        <p className="mt-1 text-sm">
          Result:{' '}
          <span className={id.status === 'verified' ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>
            {id.status ? IDENTITY_SUMMARY[id.status] ?? id.status : 'Not checked'}
          </span>
          {id.errorCode && <> ({id.errorCode})</>}{id.attempts > 0 && <> · {id.attempts} {id.attempts === 1 ? 'attempt' : 'attempts'}</>}
          {id.provider && (
            <> · checked by {id.provider}{id.country ? ` (document from ${id.country})` : ''}</>
          )}
        </p>
        <p className="mt-1 text-sm">
          Name on the ID matches the profile name:{' '}
          <span className={id.nameMatch === true ? 'font-semibold text-green-700' : id.nameMatch === false ? 'font-semibold text-red-700' : 'text-gray-500'}>
            {id.nameMatch === true ? 'Yes' : id.nameMatch === false ? 'No' : 'Not checked'}
          </span>
        </p>
        {id.providerCode && <p className="mt-1 text-xs text-gray-500">Provider code (for coverage testing): {id.providerCode}</p>}
        <p className="mt-1 text-xs text-gray-500">
          iTutor never stores the ID or the selfie, so there is nothing to view here.
          {id.redacted ? ' The provider has redacted its copy.' : ' The provider still holds its copy until it is redacted after a decision.'}
        </p>
      </section>

      <section className="bg-white border-2 border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Credentials</h2>
        {detail.credentials.length === 0 && <p className="mt-2 text-sm text-gray-500">None.</p>}
        <ul className="mt-3 space-y-4">
          {detail.credentials.map((c) => (
            <li key={c.id} className="rounded-lg border border-gray-200 p-4 text-sm">
              {c.pending && (
                <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <span className="text-sm font-semibold text-amber-800">Added after verification: waiting for approval</span>
                  <button onClick={() => onCredential('approve', c.id)} disabled={busy} className="rounded-lg bg-itutor-green px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Approve credential</button>
                  <button onClick={() => onCredential('reject', c.id)} disabled={busy} className="rounded-lg border-2 border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50">Do not approve</button>
                  <span className="text-xs text-amber-800">Choose a reason below first. The teacher keeps their Verified badge either way.</span>
                </div>
              )}
              <p className="font-semibold">
                {c.kind === 'DEGREE'
                  ? `${c.degree}${c.field ? `, ${c.field}` : ''} · ${c.school} · ${c.graduationYear}`
                  : `${c.kind} ${c.subject} · Grade ${c.grade} · ${c.examYear}`}
              </p>
              <p className="mt-1">
                {c.proofLink && <a className="mr-3 font-semibold text-itutor-green underline" href={c.proofLink} target="_blank" rel="noopener noreferrer">Open proof file{c.proofFilename ? ` (${c.proofFilename})` : ''}</a>}
                {c.proofUrl && <a className="font-semibold text-itutor-green underline" href={c.proofUrl} target="_blank" rel="noopener noreferrer nofollow">Teacher&apos;s proof link</a>}
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

      <section className="bg-white border-2 border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Teacher-provided extras</h2>
        <p className="text-xs text-gray-500">Not verified by iTutor. Shown publicly with that label.</p>
        {detail.extras.length === 0 && <p className="mt-2 text-sm text-gray-500">None.</p>}
        <ul className="mt-3 space-y-3">
          {detail.extras.map((x) => (
            <li key={x.id} className="text-sm">
              <p className="font-semibold">{x.title}</p>
              <p className="text-gray-700">{x.description}</p>
              {x.linkUrl && <a className="break-all text-xs text-itutor-green underline" href={x.linkUrl} target="_blank" rel="noopener noreferrer nofollow">{x.linkUrl}</a>}
            </li>
          ))}
        </ul>
      </section>

      {(canDecide || canRevoke) && (
        <section className="bg-white border-2 border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Decision</h2>
          {/* Approving needs no reason. The other three need one from the fixed list: it is what the
              teacher is told. The note is for admins only. */}
          <label htmlFor="decision-reason" className="block text-sm font-medium text-gray-700 mb-1">
            Reason the teacher will see (needed to ask for more information, reject or revoke)
          </label>
          <select
            id="decision-reason"
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none"
          >
            <option value="">Choose a reason</option>
            {DECISION_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <label htmlFor="decision-note" className="mt-4 block text-sm font-medium text-gray-700 mb-1">
            Internal note (optional, never shown to the teacher)
          </label>
          <textarea
            id="decision-note"
            value={note}
            onChange={(e) => onNote(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full rounded-lg border-2 border-gray-300 p-3 text-sm focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none"
          />
          <div className="mt-4 flex flex-wrap gap-3">
            {canDecide && (
              <>
                <button onClick={() => onAct('approve')} disabled={busy} className="rounded-lg bg-itutor-green px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Approve</button>
                <button onClick={() => onAct('request-info')} disabled={busy} className="rounded-lg border-2 border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Ask for more info</button>
                <button onClick={() => onAct('reject')} disabled={busy} className="rounded-lg border-2 border-red-300 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50">Reject</button>
              </>
            )}
            {canRevoke && (
              <button onClick={() => onAct('revoke')} disabled={busy} className="rounded-lg border-2 border-red-300 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50">Revoke verification</button>
            )}
          </div>
        </section>
      )}

      <section className="bg-white border-2 border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Decision history</h2>
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
  const [note, setNote] = useState('');
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

  async function act(action: 'approve' | 'reject' | 'revoke' | 'request-info') {
    if (action !== 'approve' && !reason) {
      setError('Choose a reason from the list.');
      return;
    }
    const verb = action === 'request-info' ? 'Ask for more information from' : action[0]!.toUpperCase() + action.slice(1);
    if (!confirm(`${verb} this teacher?`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/verification-v2/${tutorId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, note }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed');
      setMessage(
        body.profile?.to === null && action === 'reject'
          ? 'Rejected. The teacher stays verified; use revoke to remove verified status.'
          : action === 'request-info'
            ? 'Sent back to the teacher, who has been told.'
            : `Done: ${action}d.`
      );
      setReason('');
      setNote('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function credentialAct(action: 'approve' | 'reject', credentialId: string) {
    if (action === 'reject' && !reason) {
      setError('Choose a reason from the list.');
      return;
    }
    if (!confirm(action === 'approve' ? 'Approve this credential?' : 'Do not approve this credential? It will be removed.')) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/verification-v2/${tutorId}/credentials/${credentialId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, note }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed');
      setMessage(action === 'approve' ? 'Credential approved. The teacher has been told.' : 'Credential removed. The teacher has been told.');
      setReason('');
      setNote('');
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
          items={[{ label: 'Operations' }, { label: 'Teacher verification', href: '/admin/verification-v2' }, { label: 'Review' }]}
        />
        {!detail && !error && <p className="text-sm text-gray-500">Loading…</p>}
        {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {message && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
        {detail && <ReviewView detail={detail} isAdmin={isAdmin} reason={reason} onReason={setReason} note={note} onNote={setNote} busy={busy} onAct={act} onCredential={credentialAct} />}
      </div>
    </DashboardLayout>
  );
}
