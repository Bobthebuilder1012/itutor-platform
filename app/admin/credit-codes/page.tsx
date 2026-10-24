'use client';

/**
 * /admin/credit-codes — campaign codes that put TT$ credits in a student's or
 * parent's wallet (migration 269).
 *
 *   batch  N single-use codes for events, school visits and printed cards
 *   promo  one named code (BACKTOSCHOOL) that many accounts redeem once each
 *
 * Every code redeems at /redeem/<code> on whichever site issued it, by link
 * or QR — a QR made on staging stays on staging, since the code only exists
 * in that database. A QR can also record where scans came from by going
 * through a tracked link:
 * /r/<link code>?to=/redeem/<code>.
 *
 * Reviewers can look; changing anything needs role 'admin'. Data:
 * /api/admin/credit-codes and /api/admin/credits/settings.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import { Card, Pill, Stat } from '@/components/admin/demand/DemandUi';
import CreditsAdminNav from '@/components/admin/credits/CreditsAdminNav';
import { publicBase, downloadFile, renderBrandedQr, renderBrandedQrSvg } from '@/lib/qr/brandedQr';

type Campaign = {
  id: string;
  name: string;
  kind: 'batch' | 'promo';
  value_ttd: number;
  starts_at: string;
  ends_at: string | null;
  max_redemptions: number | null;
  eligibility: 'anyone' | 'new_accounts';
  credit_expiry_days: number | null;
  status: 'draft' | 'active' | 'paused' | 'ended';
  note: string | null;
  code: string | null;
  codes_issued: number;
  codes_redeemed: number;
  redemptions: number;
  value_redeemed: number;
  value_spent: number;
  value_outstanding: number;
  value_expired: number;
  value_clawed_back: number;
};

type ListPayload = {
  unavailable?: boolean;
  switches: { campaign_codes_enabled: boolean; code_attempt_limit: number };
  campaigns: Campaign[];
  high_redeemers: Array<{ user_id: string; name: string; email: string | null; is_suspended: boolean; redemptions: number; value_ttd: number }>;
};

type Detail = {
  campaign: Campaign;
  stats: Omit<Campaign, 'id' | 'name' | 'kind' | 'value_ttd' | 'starts_at' | 'ends_at' | 'max_redemptions' | 'eligibility' | 'credit_expiry_days' | 'status' | 'note' | 'code'>;
  codes: Array<{ id: string; code: string; status: string; use_count: number; max_uses: number | null; redeemed_by: string | null; redeemed_at: string | null }>;
  codes_total: number;
  page: number;
  page_size: number;
  redemptions: Array<{ id: string; user_id: string; name: string; email: string | null; amount_ttd: number; redeemed_at: string; reversed_at: string | null; reverse_reason: string | null }>;
};

const ttd = (n: number) => `TT$${n.toLocaleString('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

const STATUS_TONE: Record<Campaign['status'], 'green' | 'amber' | 'gray' | 'red'> = {
  active: 'green',
  paused: 'amber',
  draft: 'gray',
  ended: 'red',
};

/** Where a code's QR points: straight to redemption, or through a tracked link. */
function qrTarget(code: string, linkCode: string): string {
  const redeem = `/redeem/${encodeURIComponent(code)}`;
  const tracked = linkCode.trim().toLowerCase();
  return tracked ? `${publicBase()}/r/${encodeURIComponent(tracked)}?to=${encodeURIComponent(redeem)}` : `${publicBase()}${redeem}`;
}

async function sendJson(url: string, method: string, body: unknown): Promise<{ ok: boolean; json: any }> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

// ---------------------------------------------------------------------------

function CreateCampaign({ onCreated }: { onCreated: (id: string) => void }) {
  const [kind, setKind] = useState<'batch' | 'promo'>('batch');
  const [form, setForm] = useState({
    name: '',
    value_ttd: '',
    count: '100',
    code: '',
    starts_at: '',
    ends_at: '',
    max_redemptions: '',
    eligibility: 'anyone',
    credit_expiry_days: '',
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    const { ok, json } = await sendJson('/api/admin/credit-codes', 'POST', {
      kind,
      name: form.name,
      value_ttd: Number(form.value_ttd),
      ...(kind === 'batch' ? { count: Number(form.count) } : { code: form.code }),
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : undefined,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : undefined,
      max_redemptions: form.max_redemptions || null,
      eligibility: form.eligibility,
      credit_expiry_days: form.credit_expiry_days || null,
      note: form.note,
    });
    setBusy(false);
    if (!ok) {
      setMessage({ tone: 'error', text: json?.error ?? 'Could not create the campaign' });
      return;
    }
    setMessage({ tone: 'ok', text: `Created “${json.campaign.name}”.` });
    setForm((f) => ({ ...f, name: '', code: '', note: '' }));
    onCreated(json.campaign.id);
  };

  const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900';
  const label = 'block text-xs font-semibold text-gray-700';

  return (
    <Card title="Create a campaign" subtitle="Codes carry a fixed TT$ value. Percentage discounts are a different feature.">
      <div className="mb-4 inline-flex rounded-lg border border-gray-200 p-0.5">
        {(['batch', 'promo'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${kind === k ? 'bg-itutor-green text-white' : 'text-gray-700'}`}
          >
            {k === 'batch' ? 'Batch of single-use codes' : 'Named promo code'}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="sm:col-span-2 lg:col-span-1">
          <span className={label}>Campaign name</span>
          <input className={input} value={form.name} onChange={set('name')} placeholder="e.g. QRC school visit, Oct 2026" />
        </label>
        <label>
          <span className={label}>TT$ value per {kind === 'batch' ? 'code' : 'redemption'}</span>
          <input className={input} type="number" min={1} step="0.01" value={form.value_ttd} onChange={set('value_ttd')} />
        </label>
        {kind === 'batch' ? (
          <label>
            <span className={label}>Number of codes (max 5,000)</span>
            <input className={input} type="number" min={1} max={5000} value={form.count} onChange={set('count')} />
          </label>
        ) : (
          <label>
            <span className={label}>Code (4–24 letters, numbers, hyphens)</span>
            <input className={`${input} font-mono uppercase`} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="BACKTOSCHOOL" />
          </label>
        )}
        <label>
          <span className={label}>Starts</span>
          <input className={input} type="datetime-local" value={form.starts_at} onChange={set('starts_at')} />
        </label>
        <label>
          <span className={label}>Ends (blank = open-ended)</span>
          <input className={input} type="datetime-local" value={form.ends_at} onChange={set('ends_at')} />
        </label>
        <label>
          <span className={label}>Maximum redemptions (blank = no cap)</span>
          <input className={input} type="number" min={1} value={form.max_redemptions} onChange={set('max_redemptions')} />
        </label>
        <label>
          <span className={label}>Who can redeem</span>
          <select className={input} value={form.eligibility} onChange={set('eligibility')}>
            <option value="anyone">Any student or parent</option>
            <option value="new_accounts">New accounts only (never paid)</option>
          </select>
        </label>
        <label>
          <span className={label}>Credits expire after (days; blank = never)</span>
          <input className={input} type="number" min={1} value={form.credit_expiry_days} onChange={set('credit_expiry_days')} />
        </label>
        <label className="sm:col-span-2 lg:col-span-3">
          <span className={label}>Internal note</span>
          <input className={input} value={form.note} onChange={set('note')} placeholder="Budget, partner, who asked for it" />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !form.name || !form.value_ttd || (kind === 'promo' && !form.code)}
          onClick={() => void submit()}
          className="rounded-lg bg-itutor-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Creating…' : kind === 'batch' ? `Create ${form.count || 0} codes` : 'Create promo code'}
        </button>
        {message ? <span className={`text-sm ${message.tone === 'ok' ? 'text-itutor-green' : 'text-red-600'}`}>{message.text}</span> : null}
      </div>
    </Card>
  );
}

function CampaignDetail({ id, canEdit, onChanged }: { id: string; canEdit: boolean; onChanged: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [linkCode, setLinkCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ starts_at: string; ends_at: string; max_redemptions: string; value_ttd: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/credit-codes/${id}?q=${encodeURIComponent(q)}&page=${page}`, { cache: 'no-store' });
    if (res.ok) setDetail(await res.json());
  }, [id, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!detail) return <Card><p className="text-sm text-gray-500">Loading…</p></Card>;
  const c = detail.campaign;

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (action === 'void_unused' && !window.confirm('Void every unused code in this campaign? Used codes are kept.')) return;
    if (action === 'end' && !window.confirm('End this campaign? It cannot be restarted.')) return;
    setBusy(action);
    setMessage(null);
    const { ok, json } = await sendJson(`/api/admin/credit-codes/${id}`, 'PATCH', { action, ...extra });
    setBusy(null);
    setMessage(ok ? (action === 'void_unused' ? `Voided ${json.details?.voided ?? 0} codes.` : 'Saved.') : json?.error ?? 'Could not save');
    if (ok) {
      setEdit(null);
      await load();
      onChanged();
    }
  };

  const reverse = async (redemptionId: string) => {
    const reason = window.prompt('Reverse this redemption? Only unspent credits can be taken back. Reason (10+ characters):');
    if (!reason || reason.trim().length < 10) return;
    const { ok, json } = await sendJson(`/api/admin/credit-codes/redemptions/${redemptionId}/reverse`, 'POST', { reason });
    setMessage(
      ok
        ? `Reversed: ${ttd(Number(json.result?.clawed_back_ttd ?? 0))} taken back${Number(json.result?.already_spent_ttd ?? 0) > 0 ? `, ${ttd(Number(json.result.already_spent_ttd))} already spent` : ''}.`
        : json?.error ?? 'Could not reverse'
    );
    await load();
    onChanged();
  };

  const allCodes = async (): Promise<string[]> => {
    const res = await fetch(`/api/admin/credit-codes/${id}?all=1`, { cache: 'no-store' });
    const json = await res.json();
    return (json.codes ?? []).filter((x: { status: string }) => x.status === 'active').map((x: { code: string }) => x.code);
  };

  const fileBase = c.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  const downloadOne = async (code: string, format: 'png' | 'svg') => {
    const url = qrTarget(code, linkCode);
    if (format === 'png') {
      const png = await renderBrandedQr(url, 1024);
      if (png) downloadFile(`${code}.png`, png);
    } else {
      const svg = await renderBrandedQrSvg(url);
      if (svg) downloadFile(`${code}.svg`, svg, 'image/svg+xml');
    }
  };

  const downloadZip = async () => {
    setBusy('zip');
    try {
      const codes = await allCodes();
      const { zipSync, strToU8 } = await import('fflate');
      const files: Record<string, Uint8Array> = {};
      for (let i = 0; i < codes.length; i++) {
        const png = await renderBrandedQr(qrTarget(codes[i], linkCode), 768);
        if (png) {
          const bin = atob(png.split(',')[1]);
          const bytes = new Uint8Array(bin.length);
          for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
          files[`${codes[i]}.png`] = bytes;
        }
        if (i % 25 === 0) setProgress(`Drawing ${i + 1} of ${codes.length}…`);
      }
      files['codes.txt'] = strToU8(codes.join('\n'));
      const zip = zipSync(files, { level: 0 });
      downloadFile(`${fileBase}-qr-codes.zip`, new Blob([zip as BlobPart], { type: 'application/zip' }));
    } finally {
      setProgress(null);
      setBusy(null);
    }
  };

  const printHref = `/admin/credit-codes/${id}/print${linkCode.trim() ? `?link=${encodeURIComponent(linkCode.trim().toLowerCase())}` : ''}`;

  return (
    <Card
      title={c.name}
      subtitle={`${c.kind === 'batch' ? 'Batch' : `Promo ${c.code ?? ''}`} · ${ttd(c.value_ttd)} each · ${day(c.starts_at)} – ${c.ends_at ? day(c.ends_at) : 'open-ended'}${c.eligibility === 'new_accounts' ? ' · new accounts only' : ''}${c.credit_expiry_days ? ` · credits last ${c.credit_expiry_days} days` : ''}`}
      action={<Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill>}
    >
      {c.note ? <p className="mb-4 text-sm text-gray-600">{c.note}</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Codes redeemed" value={`${detail.stats.codes_redeemed} / ${detail.stats.codes_issued}`} />
        <Stat label="Value redeemed" value={ttd(detail.stats.value_redeemed)} />
        <Stat label="Spent" value={ttd(detail.stats.value_spent)} tone="green" />
        <Stat label="Outstanding" value={ttd(detail.stats.value_outstanding)} tone="amber" hint={detail.stats.value_clawed_back ? `${ttd(detail.stats.value_clawed_back)} reversed` : undefined} />
      </div>

      {canEdit ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {c.status === 'active' ? (
            <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold" disabled={!!busy} onClick={() => void act('pause')}>Pause</button>
          ) : null}
          {c.status === 'paused' || c.status === 'draft' ? (
            <button className="rounded-lg bg-itutor-green px-3 py-1.5 text-sm font-semibold text-white" disabled={!!busy} onClick={() => void act('resume')}>
              {c.status === 'draft' ? 'Activate' : 'Resume'}
            </button>
          ) : null}
          {c.status !== 'ended' ? (
            <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold" disabled={!!busy} onClick={() => void act('end')}>End</button>
          ) : null}
          {c.kind === 'batch' ? (
            <button className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700" disabled={!!busy} onClick={() => void act('void_unused')}>Void unused codes</button>
          ) : null}
          <button
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold"
            onClick={() =>
              setEdit({
                starts_at: toLocalInput(c.starts_at),
                ends_at: toLocalInput(c.ends_at),
                max_redemptions: c.max_redemptions ? String(c.max_redemptions) : '',
                value_ttd: String(c.value_ttd),
              })
            }
          >
            Edit dates{c.kind === 'promo' ? ', cap or value' : ' or cap'}
          </button>
        </div>
      ) : null}

      {edit ? (
        <div className="mt-3 grid gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-4">
          <label className="text-xs font-semibold text-gray-700">
            Starts
            <input type="datetime-local" className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" value={edit.starts_at} onChange={(e) => setEdit({ ...edit, starts_at: e.target.value })} />
          </label>
          <label className="text-xs font-semibold text-gray-700">
            Ends
            <input type="datetime-local" className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" value={edit.ends_at} onChange={(e) => setEdit({ ...edit, ends_at: e.target.value })} />
          </label>
          <label className="text-xs font-semibold text-gray-700">
            Max redemptions
            <input type="number" className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" value={edit.max_redemptions} onChange={(e) => setEdit({ ...edit, max_redemptions: e.target.value })} />
          </label>
          {c.kind === 'promo' ? (
            <label className="text-xs font-semibold text-gray-700">
              TT$ value (future redemptions)
              <input type="number" step="0.01" className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" value={edit.value_ttd} onChange={(e) => setEdit({ ...edit, value_ttd: e.target.value })} />
            </label>
          ) : null}
          <div className="flex items-end gap-2 sm:col-span-4">
            <button
              className="rounded-lg bg-itutor-green px-3 py-1.5 text-sm font-semibold text-white"
              onClick={() =>
                void act('edit', {
                  starts_at: edit.starts_at ? new Date(edit.starts_at).toISOString() : undefined,
                  ends_at: edit.ends_at ? new Date(edit.ends_at).toISOString() : null,
                  max_redemptions: edit.max_redemptions || null,
                  ...(c.kind === 'promo' ? { value_ttd: Number(edit.value_ttd) } : {}),
                })
              }
            >
              Save
            </button>
            <button className="text-sm text-gray-600 underline" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </div>
      ) : null}

      {message ? <p className="mt-3 text-sm text-gray-700">{message}</p> : null}

      {/* ── Downloads ───────────────────────────────────────────────── */}
      <div className="mt-5 rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900">QR codes and exports</h3>
        <p className="mt-1 text-xs text-gray-600">
          Each QR opens /redeem/&lt;code&gt; on this site, which asks before redeeming. To also count scans on Link
          Tracking, enter a tracked link code: the QR then goes through /r/&lt;link&gt; first.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={linkCode}
            onChange={(e) => setLinkCode(e.target.value)}
            placeholder="Tracked link code (optional)"
            className="w-56 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <a href={`/api/admin/credit-codes/${id}?export=csv`} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold">
            Download CSV
          </a>
          {c.kind === 'promo' && c.code ? (
            <>
              <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold" onClick={() => void downloadOne(c.code!, 'png')}>QR (PNG)</button>
              <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold" onClick={() => void downloadOne(c.code!, 'svg')}>QR (SVG)</button>
            </>
          ) : (
            <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold" disabled={busy === 'zip'} onClick={() => void downloadZip()}>
              {busy === 'zip' ? progress ?? 'Preparing…' : 'All QR codes (ZIP)'}
            </button>
          )}
          <Link href={printHref} target="_blank" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold">
            Print sheet
          </Link>
        </div>
      </div>

      {/* ── Codes ───────────────────────────────────────────────────── */}
      {c.kind === 'batch' ? (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Codes ({detail.codes_total})</h3>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search codes"
              className="w-48 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Redeemed by</th>
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {detail.codes.map((code) => (
                  <tr key={code.id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3 font-mono">{code.code}</td>
                    <td className="py-1.5 pr-3">{code.status === 'void' ? 'void' : code.use_count > 0 ? 'used' : 'unused'}</td>
                    <td className="py-1.5 pr-3">{code.redeemed_by ?? '—'}</td>
                    <td className="py-1.5 pr-3">{day(code.redeemed_at)}</td>
                    <td className="py-1.5 pr-3 text-right">
                      <button className="text-xs font-semibold text-itutor-green" onClick={() => void downloadOne(code.code, 'png')}>QR</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail.codes_total > detail.page_size ? (
            <div className="mt-2 flex items-center gap-3 text-sm">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="underline disabled:opacity-40">Previous</button>
              <span className="text-gray-600">Page {page} of {Math.ceil(detail.codes_total / detail.page_size)}</span>
              <button disabled={page * detail.page_size >= detail.codes_total} onClick={() => setPage((p) => p + 1)} className="underline disabled:opacity-40">Next</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Redemption log ──────────────────────────────────────────── */}
      <div className="mt-5">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Redemptions</h3>
        {detail.redemptions.length === 0 ? (
          <p className="text-sm text-gray-600">None yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {detail.redemptions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-medium text-gray-900">{r.name}</span>
                  {r.email ? <span className="text-gray-500"> · {r.email}</span> : null}
                  <span className="text-gray-500"> · {day(r.redeemed_at)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{ttd(r.amount_ttd)}</span>
                  {r.reversed_at ? (
                    <Pill tone="gray">reversed</Pill>
                  ) : canEdit ? (
                    <button className="text-xs font-semibold text-red-700" onClick={() => void reverse(r.id)}>Reverse</button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export default function AdminCreditCodesPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [data, setData] = useState<ListPayload | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [switchBusy, setSwitchBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      const { data: profile } = await supabase.from('profiles').select('role, email, is_reviewer').eq('id', user.id).single();
      if (profile?.role !== 'admin' && !profile?.is_reviewer) {
        router.push('/login');
        return;
      }
      if (isEmailManagementOnlyAdmin(profile.email)) {
        router.replace('/admin/emails');
        return;
      }
      setCanEdit(profile.role === 'admin');
      setAuthLoading(false);
    })();
  }, [router]);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/credit-codes', { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (json.unavailable) {
      setUnavailable(true);
      return;
    }
    if (res.ok) setData(json);
  }, []);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  const toggleSwitch = async () => {
    if (!data) return;
    const on = data.switches.campaign_codes_enabled;
    if (!on && !window.confirm('Switch on campaign codes? Check the accountant has signed this off first.')) return;
    setSwitchBusy(true);
    await sendJson('/api/admin/credits/settings', 'PATCH', { campaign_codes_enabled: !on });
    setSwitchBusy(false);
    await load();
  };

  const setAttemptLimit = async () => {
    const v = window.prompt('Failed attempts before a 15-minute lockout:', String(data?.switches.code_attempt_limit ?? 5));
    if (!v) return;
    await sendJson('/api/admin/credits/settings', 'PATCH', { code_attempt_limit: Number(v) });
    await load();
  };

  const suspend = async (userId: string, name: string) => {
    const reason = window.prompt(`Suspend ${name}? Give a reason.`);
    if (!reason?.trim()) return;
    const { ok, json } = await sendJson(`/api/admin/accounts/${userId}/suspend`, 'POST', { reason: `Credit codes review: ${reason.trim()}` });
    if (!ok) window.alert(json?.error ?? 'Could not suspend');
    await load();
  };

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
        <AdminBreadcrumb items={[{ label: 'Credits' }, { label: 'Campaign codes' }]} />
        <CreditsAdminNav />
        <header className="mt-4">
          <h1 className="text-3xl font-bold text-gray-900">Campaign codes</h1>
          <p className="mt-1 max-w-3xl text-gray-600">
            Codes for iTutor’s own campaigns. Students and parents redeem them by typing the code, opening its link or
            scanning its QR, and the credits land in the same wallet as referral rewards.
          </p>
        </header>

        <div className="mt-6 space-y-6">
          {unavailable ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Credit codes are not set up on this environment yet. Migrations 268 and 269 create the tables.
            </div>
          ) : !data ? (
            <div className="py-12 text-center text-gray-500">Loading…</div>
          ) : (
            <>
              <Card title="Programme">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">Campaign codes</span>
                    <Pill tone={data.switches.campaign_codes_enabled ? 'green' : 'gray'}>
                      {data.switches.campaign_codes_enabled ? 'On' : 'Off'}
                    </Pill>
                    <span className="text-sm text-gray-600">
                      · lockout after {data.switches.code_attempt_limit} wrong codes
                    </span>
                  </div>
                  {canEdit ? (
                    <div className="flex gap-2">
                      <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold" onClick={() => void setAttemptLimit()}>
                        Change lockout
                      </button>
                      <button
                        disabled={switchBusy}
                        onClick={() => void toggleSwitch()}
                        className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${data.switches.campaign_codes_enabled ? 'border border-gray-300' : 'bg-itutor-green text-white'}`}
                      >
                        {data.switches.campaign_codes_enabled ? 'Switch off' : 'Switch on'}
                      </button>
                    </div>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Off stops new redemptions; credits already redeemed stay spendable. Keep it off until the accountant has
                  given their view.
                </p>
              </Card>

              {canEdit ? <CreateCampaign onCreated={(id) => { setSelected(id); void load(); }} /> : null}

              <Card title="Campaigns">
                {data.campaigns.length === 0 ? (
                  <p className="text-sm text-gray-600">No campaigns yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                          <th className="py-2 pr-3">Campaign</th>
                          <th className="py-2 pr-3">Value</th>
                          <th className="py-2 pr-3">Dates</th>
                          <th className="py-2 pr-3">Status</th>
                          <th className="py-2 pr-3 text-right">Redeemed</th>
                          <th className="py-2 pr-3 text-right">Value redeemed</th>
                          <th className="py-2 pr-3 text-right">Spent</th>
                          <th className="py-2 pr-3 text-right">Outstanding</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.campaigns.map((c) => (
                          <tr
                            key={c.id}
                            onClick={() => setSelected(c.id)}
                            className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${selected === c.id ? 'bg-gray-50' : ''}`}
                          >
                            <td className="py-2 pr-3">
                              <div className="font-medium text-gray-900">{c.name}</div>
                              <div className="text-xs text-gray-500">{c.kind === 'promo' ? <span className="font-mono">{c.code}</span> : `${c.codes_issued} codes`}</div>
                            </td>
                            <td className="py-2 pr-3">{ttd(c.value_ttd)}</td>
                            <td className="py-2 pr-3 text-xs text-gray-600">{day(c.starts_at)} – {c.ends_at ? day(c.ends_at) : 'open'}</td>
                            <td className="py-2 pr-3"><Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill></td>
                            <td className="py-2 pr-3 text-right tabular-nums">{c.kind === 'batch' ? `${c.codes_redeemed}/${c.codes_issued}` : c.redemptions}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{ttd(c.value_redeemed)}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{ttd(c.value_spent)}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{ttd(c.value_outstanding)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {selected ? <CampaignDetail key={selected} id={selected} canEdit={canEdit} onChanged={() => void load()} /> : null}

              <Card title="High redeemers" subtitle="Accounts by number of redemptions across every campaign.">
                {data.high_redeemers.length === 0 ? (
                  <p className="text-sm text-gray-600">No redemptions yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {data.high_redeemers.map((h) => (
                      <li key={h.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span>
                          <span className="font-medium text-gray-900">{h.name}</span>
                          {h.email ? <span className="text-gray-500"> · {h.email}</span> : null}
                          {h.is_suspended ? <span className="ml-2"><Pill tone="red">Suspended</Pill></span> : null}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="tabular-nums">{h.redemptions} · {ttd(h.value_ttd)}</span>
                          {canEdit && !h.is_suspended ? (
                            <button className="text-xs font-semibold text-red-700" onClick={() => void suspend(h.user_id, h.name)}>Suspend</button>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
