'use client';

/**
 * /admin/referrals — the referral credit programme.
 *
 * Students and parents earn TT$ credits when friends they referred pay real
 * cash for a group class. This page holds every number that programme runs
 * on (credit_settings, migration 268), what it has cost so far, who is
 * earning from it, and the cases that need a human.
 *
 * Data: /api/admin/credits/{settings,report,adjust}. Suspending uses the
 * existing /api/admin/accounts/[userId]/suspend.
 */

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import { Card, Pill, Stat } from '@/components/admin/demand/DemandUi';
import type { CreditSettings, CreditSource } from '@/lib/credits/types';

type Totals = {
  granted: number;
  spent: number;
  reserved: number;
  outstanding: number;
  pending: number;
  clawed_back: number;
  expired: number;
  removed: number;
};

type Friend = {
  referral_id: string;
  name: string;
  status: string;
  sibling: boolean;
  payer: string | null;
  fingerprint: string | null;
  cash_paid_ttd: number | null;
  converted_at: string | null;
  rejected_reason: string | null;
};

type Referrer = {
  user_id: string;
  name: string;
  email: string | null;
  is_suspended: boolean;
  signed_up: number;
  converted: number;
  rejected: number;
  rewards: number;
  flagged: boolean;
  friends?: Friend[];
};

type Report = {
  settings: CreditSettings;
  totals: { all: Totals; bySource: Record<CreditSource, Totals> };
  referrers: Referrer[];
  rejected: Array<{ referral_id: string; referrer: string; friend: string; reason: string | null; at: string | null }>;
  review: Array<{ kind: string; user: string; user_id: string; amount_ttd: number; note: string | null; at: string }>;
};

const ttd = (n: number) => `TT$${n.toLocaleString('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const SOURCE_LABEL: Record<CreditSource, string> = {
  referral: 'Referral rewards',
  campaign_code: 'Campaign codes',
  admin: 'Admin adjustments',
};

const REASON_LABEL: Record<string, string> = {
  self_referral: 'Friend paid with the referrer’s own account',
  payer_is_referrer: 'The referrer paid',
  parent_child: 'Parent and child',
  shared_customer: 'Same Stripe customer as the referrer',
  shared_card: 'Same card as the referrer',
  below_minimum: 'Payment below the minimum',
  cash_payment: 'Cash payment (card only)',
  refunded: 'Payment refunded',
  not_eligible_role: 'Not a student or parent account',
};

// ---------------------------------------------------------------------------

function SettingsForm({
  settings,
  canEdit,
  onSaved,
}: {
  settings: CreditSettings;
  canEdit: boolean;
  onSaved: (s: CreditSettings) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const value = (field: keyof CreditSettings): string | boolean => {
    if (field in draft) return draft[field];
    const v = settings[field];
    if (typeof v === 'boolean') return v;
    return v === null || v === undefined ? '' : String(v);
  };
  const set = (field: keyof CreditSettings, v: string | boolean) => setDraft((d) => ({ ...d, [field]: v }));

  const save = async (patch?: Record<string, unknown>) => {
    const body = patch ?? Object.fromEntries(
      Object.entries(draft).map(([k, v]) => [k, typeof v === 'boolean' ? v : v === '' ? null : Number(v)])
    );
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/credits/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Could not save');
      setDraft({});
      onSaved(json.settings);
      setMessage({ tone: 'ok', text: 'Saved. Changes apply to the next check; credits already earned are unchanged.' });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Could not save' });
    } finally {
      setSaving(false);
    }
  };

  const numberField = (
    field: keyof CreditSettings,
    label: string,
    hint: string,
    opts: { money?: boolean; blankMeans?: string } = {}
  ) => (
    <label className="block">
      <span className="text-sm font-medium text-gray-800">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        {opts.money ? <span className="text-sm text-gray-500">TT$</span> : null}
        <input
          type="number"
          inputMode="decimal"
          step={opts.money ? '0.01' : '1'}
          min={0}
          disabled={!canEdit || saving}
          value={String(value(field))}
          placeholder={opts.blankMeans}
          onChange={(e) => set(field, e.target.value)}
          className="w-32 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 disabled:bg-gray-50"
        />
      </div>
      <span className="mt-1 block text-xs text-gray-500">{hint}</span>
    </label>
  );

  const toggle = (field: 'referrals_enabled' | 'campaign_codes_enabled', label: string, hint: string) => {
    const on = settings[field];
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{label}</span>
            <Pill tone={on ? 'green' : 'gray'}>{on ? 'On' : 'Off'}</Pill>
          </div>
          <p className="mt-0.5 max-w-xl text-xs text-gray-600">{hint}</p>
        </div>
        {canEdit ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              if (!on && !window.confirm(`Switch on ${label.toLowerCase()}? Check the accountant has signed this off first.`)) return;
              void save({ [field]: !on });
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${on ? 'border border-gray-300 text-gray-800' : 'bg-itutor-green text-white'} disabled:opacity-50`}
          >
            {on ? 'Switch off' : 'Switch on'}
          </button>
        ) : null}
      </div>
    );
  };

  const dirty = Object.keys(draft).length > 0;

  return (
    <Card
      title="Programme settings"
      subtitle={canEdit ? 'Every number in the programme. Nothing here is hard-coded.' : 'Read-only: only an admin can change these.'}
    >
      <div className="space-y-3">
        {toggle(
          'referrals_enabled',
          'Referral programme',
          'Off stops new referral links and new rewards. Existing balances stay visible and spendable.'
        )}
        {toggle(
          'campaign_codes_enabled',
          'Campaign codes',
          'Off stops new redemptions. Credits already redeemed stay spendable.'
        )}
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {numberField('referrals_required', 'Converted friends per reward', 'Lowering it pays out people already part-way there within a day.')}
        {numberField('credit_value_ttd', 'Credit value per reward', 'Copied onto each reward when issued.', { money: true })}
        {numberField('min_qualifying_cash_ttd', 'Minimum qualifying payment', 'Real cash toward the class price, excluding the processing fee.', { money: true })}
        {numberField('min_cash_charge_ttd', 'Minimum card charge when spending credits', 'Credits may not leave a card charge smaller than this. Confirm Stripe’s minimum.', { money: true })}
        {numberField('hold_days', 'Hold period (days)', 'New rewards are pending this long, so a refund can take them back before they are spent.')}
        {numberField('flag_conversions_threshold', 'Flag a referrer at', 'Converted friends before a referrer appears on the review list below.')}
        {numberField('max_rewards_per_user', 'Maximum rewards per person', 'Blank means unlimited.', { blankMeans: 'Unlimited' })}
        {numberField('expiry_days', 'Referral credits expire after (days)', 'Blank means never.', { blankMeans: 'Never' })}
        {numberField('code_attempt_limit', 'Failed code attempts before a 15-minute lockout', 'Applies to campaign codes.')}
      </div>

      {canEdit ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void save()}
            className="rounded-lg bg-itutor-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {dirty ? (
            <button type="button" onClick={() => setDraft({})} className="text-sm text-gray-600 underline">
              Discard
            </button>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <p className={`mt-3 text-sm ${message.tone === 'ok' ? 'text-itutor-green' : 'text-red-600'}`}>{message.text}</p>
      ) : null}
      <p className="mt-3 text-xs text-gray-500">
        Last changed {settings.updated_at ? new Date(settings.updated_at).toLocaleString('en-TT') : '—'}.
      </p>
    </Card>
  );
}

function TotalsCard({ totals }: { totals: Report['totals'] }) {
  const cols: Array<[keyof Totals, string]> = [
    ['granted', 'Granted'],
    ['spent', 'Spent'],
    ['reserved', 'Held at checkout'],
    ['outstanding', 'Outstanding'],
    ['pending', 'In hold'],
    ['clawed_back', 'Clawed back'],
    ['expired', 'Expired'],
    ['removed', 'Removed by admin'],
  ];
  return (
    <Card
      title="What credits have cost"
      subtitle="Company-funded: tutors are paid on the full class price. Outstanding is the liability still in wallets."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Granted" value={ttd(totals.all.granted)} />
        <Stat label="Spent (net of refunds)" value={ttd(totals.all.spent)} tone="green" />
        <Stat label="Outstanding" value={ttd(totals.all.outstanding + totals.all.pending)} hint={`${ttd(totals.all.pending)} still in hold`} tone="amber" />
        <Stat label="Clawed back" value={ttd(totals.all.clawed_back)} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3">Source</th>
              {cols.map(([k, label]) => (
                <th key={k} className="py-2 pr-3 text-right">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(SOURCE_LABEL) as CreditSource[]).map((src) => (
              <tr key={src} className="border-b border-gray-100">
                <td className="py-2 pr-3 font-medium text-gray-900">{SOURCE_LABEL[src]}</td>
                {cols.map(([k]) => (
                  <td key={k} className="py-2 pr-3 text-right tabular-nums text-gray-800">{ttd(totals.bySource[src][k])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ReferrersCard({
  referrers,
  threshold,
  onChanged,
}: {
  referrers: Referrer[];
  threshold: number;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const suspend = async (r: Referrer) => {
    const reason = window.prompt(`Suspend ${r.name}? Give a reason (shown to other admins).`);
    if (!reason || !reason.trim()) return;
    setBusy(r.user_id);
    try {
      const res = await fetch(`/api/admin/accounts/${r.user_id}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: `Referral review: ${reason.trim()}` }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) window.alert(json?.error ?? 'Could not suspend');
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const flagged = referrers.filter((r) => r.flagged);

  return (
    <Card
      title="Referrers"
      subtitle={`Flagged at ${threshold} converted friends. Rewards are unlimited; suspending is the control.`}
      action={flagged.length ? <Pill tone="amber">{flagged.length} to review</Pill> : undefined}
    >
      {referrers.length === 0 ? (
        <p className="text-sm text-gray-600">Nobody has referred a friend yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3">Referrer</th>
                <th className="py-2 pr-3 text-right">Signed up</th>
                <th className="py-2 pr-3 text-right">Paid</th>
                <th className="py-2 pr-3 text-right">Rejected</th>
                <th className="py-2 pr-3 text-right">Rewards</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {referrers.map((r) => (
                <Fragment key={r.user_id}>
                  <tr className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">{r.name}</span>
                        {r.flagged ? <Pill tone="amber">Flagged</Pill> : null}
                        {r.is_suspended ? <Pill tone="red">Suspended</Pill> : null}
                      </div>
                      {r.email ? <div className="text-xs text-gray-500">{r.email}</div> : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.signed_up}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-semibold">{r.converted}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.rejected}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.rewards}</td>
                    <td className="py-2 pr-3 text-right">
                      <div className="flex justify-end gap-2">
                        {r.friends ? (
                          <button
                            type="button"
                            onClick={() => setOpen(open === r.user_id ? null : r.user_id)}
                            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-800"
                          >
                            {open === r.user_id ? 'Hide friends' : 'Friends'}
                          </button>
                        ) : null}
                        {!r.is_suspended ? (
                          <button
                            type="button"
                            disabled={busy === r.user_id}
                            onClick={() => void suspend(r)}
                            className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 disabled:opacity-50"
                          >
                            Suspend
                          </button>
                        ) : null}
                        <Link
                          href={`/admin/accounts/${r.user_id}`}
                          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-800"
                        >
                          Account
                        </Link>
                      </div>
                    </td>
                  </tr>
                  {open === r.user_id && r.friends ? (
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td colSpan={6} className="px-3 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-gray-500">
                              <th className="py-1 pr-3">Friend</th>
                              <th className="py-1 pr-3">Status</th>
                              <th className="py-1 pr-3">Paid by</th>
                              <th className="py-1 pr-3">Card fingerprint</th>
                              <th className="py-1 pr-3 text-right">Cash</th>
                              <th className="py-1 pr-3">Converted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.friends.map((f) => (
                              <tr key={f.referral_id} className="border-t border-gray-200">
                                <td className="py-1 pr-3 text-gray-900">
                                  {f.name}
                                  {f.sibling ? <span className="ml-1 text-gray-500">(sibling)</span> : null}
                                </td>
                                <td className="py-1 pr-3">
                                  {f.status}
                                  {f.rejected_reason ? ` — ${REASON_LABEL[f.rejected_reason] ?? f.rejected_reason}` : ''}
                                </td>
                                <td className="py-1 pr-3">{f.payer ?? '—'}</td>
                                <td className="py-1 pr-3 font-mono">{f.fingerprint ?? '—'}</td>
                                <td className="py-1 pr-3 text-right tabular-nums">{f.cash_paid_ttd === null ? '—' : ttd(f.cash_paid_ttd)}</td>
                                <td className="py-1 pr-3">{date(f.converted_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AdjustCard({ canEdit, onDone }: { canEdit: boolean; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  if (!canEdit) return null;

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/credits/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, amount_ttd: Number(amount), reason, request_id: requestId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Could not adjust');
      setMessage({
        tone: 'ok',
        text: `Done. Their available balance is now ${ttd(Number(json.wallet?.available_ttd ?? 0))}.`,
      });
      setAmount('');
      setReason('');
      setRequestId(crypto.randomUUID());
      onDone();
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Could not adjust' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Adjust a balance" subtitle="Add credits (positive) or remove unspent credits (negative). Audited.">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <input
          type="email"
          placeholder="Student or parent email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
        />
        <input
          type="number"
          step="0.01"
          placeholder="TT$ (e.g. -50)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
        />
      </div>
      <textarea
        placeholder="Reason (at least 10 characters)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={busy || !email || !amount || reason.trim().length < 10}
          onClick={() => void submit()}
          className="rounded-lg bg-itutor-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Apply adjustment'}
        </button>
        {message ? (
          <span className={`text-sm ${message.tone === 'ok' ? 'text-itutor-green' : 'text-red-600'}`}>{message.text}</span>
        ) : null}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export default function AdminReferralsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<Report | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);

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
        .select('role, email, is_reviewer')
        .eq('id', user.id)
        .single();
      if (profile?.role !== 'admin' && !profile?.is_reviewer) {
        router.push('/login');
        return;
      }
      if (isEmailManagementOnlyAdmin(profile.email)) {
        router.replace('/admin/emails');
        return;
      }
      setAuthLoading(false);
    })();
  }, [router]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setFailed(false);
    try {
      const [settingsRes, reportRes] = await Promise.all([
        fetch('/api/admin/credits/settings', { cache: 'no-store' }),
        fetch('/api/admin/credits/report', { cache: 'no-store' }),
      ]);
      const settingsJson = await settingsRes.json();
      const reportJson = await reportRes.json();
      if (!settingsRes.ok || !reportRes.ok) throw new Error('failed');
      if (settingsJson.unavailable || reportJson.unavailable) {
        setUnavailable(true);
        setReport(null);
        return;
      }
      setUnavailable(false);
      setCanEdit(settingsJson.canEdit === true);
      setReport(reportJson as Report);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  if (authLoading) {
    return (
      <DashboardLayout role="admin" userName="Admin">
        <div className="flex items-center justify-center py-20 text-gray-500">Loading…</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <AdminBreadcrumb items={[{ label: 'Finance' }, { label: 'Referral Credits' }]} />

        <header className="mt-4">
          <h1 className="text-3xl font-bold text-gray-900">Referral Credits</h1>
          <p className="mt-1 max-w-3xl text-gray-600">
            Students and parents earn TT$ credits when friends they referred pay real cash for a group
            class. Credits are spent at checkout and funded by iTutor; tutors are always paid on the full
            class price. Neither programme should be switched on until the accountant has given their view.
          </p>
        </header>

        <div className="mt-6 space-y-6">
          {unavailable ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Credits are not set up on this environment yet. Migration 268 creates the tables.
            </div>
          ) : failed ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Could not load the credit report.{' '}
              <button type="button" onClick={() => void load()} className="underline">
                Try again
              </button>
            </div>
          ) : loading || !report ? (
            <div className="py-12 text-center text-gray-500">Loading…</div>
          ) : (
            <>
              <SettingsForm
                settings={report.settings}
                canEdit={canEdit}
                onSaved={(s) => setReport((r) => (r ? { ...r, settings: s } : r))}
              />
              <TotalsCard totals={report.totals} />
              <ReferrersCard
                referrers={report.referrers}
                threshold={report.settings.flag_conversions_threshold}
                onChanged={() => void load(true)}
              />

              <Card title="Needs review" subtitle="Money that could not be recovered automatically.">
                {report.review.length === 0 ? (
                  <p className="text-sm text-gray-600">Nothing to review.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {report.review.map((item, i) => (
                      <li key={i} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                        <div>
                          <div className="font-medium text-gray-900">{item.kind}</div>
                          <div className="text-gray-600">
                            {item.user}
                            {item.note ? ` — ${item.note}` : ''}
                          </div>
                        </div>
                        <div className="text-right">
                          {item.amount_ttd ? <div className="font-semibold text-red-600">{ttd(item.amount_ttd)}</div> : null}
                          <div className="text-xs text-gray-500">{date(item.at)}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Rejected referrals" subtitle="The latest 100 the checks refused.">
                {report.rejected.length === 0 ? (
                  <p className="text-sm text-gray-600">None.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                          <th className="py-2 pr-3">Referrer</th>
                          <th className="py-2 pr-3">Friend</th>
                          <th className="py-2 pr-3">Reason</th>
                          <th className="py-2 pr-3">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.rejected.map((r) => (
                          <tr key={r.referral_id} className="border-b border-gray-100">
                            <td className="py-2 pr-3 text-gray-900">{r.referrer}</td>
                            <td className="py-2 pr-3 text-gray-900">{r.friend}</td>
                            <td className="py-2 pr-3 text-gray-700">{r.reason ? REASON_LABEL[r.reason] ?? r.reason : '—'}</td>
                            <td className="py-2 pr-3 text-gray-600">{date(r.at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <AdjustCard canEdit={canEdit} onDone={() => void load(true)} />
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
