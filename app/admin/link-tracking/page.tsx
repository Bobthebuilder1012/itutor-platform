'use client';

/**
 * /admin/link-tracking — which social media links bring people in.
 *
 * One main link per platform (Instagram, TikTok, Facebook) for the bio, plus
 * optional sub-links for a specific post, story or ad. Every link is
 * /r/<code>: the redirect records the click and stamps the code onto the
 * visitor, and the account they create later carries it in first_touch.
 *
 * A platform's numbers include ALL of its links, main link included. Its
 * visitor count is de-duplicated across them, not summed (migration 267).
 *
 * The data comes from /api/admin/campaign-links; this file only draws it.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import { Card, Pill, Segmented, Stat } from '@/components/admin/demand/DemandUi';
import PlatformIcon from '@/components/admin/link-tracking/PlatformIcon';
import {
  LINK_DESTINATIONS,
  LINK_CODE_PATTERN,
  conversionRate,
  destinationLabel,
  platformName,
  suggestLinkCode,
  type CampaignLink,
  type CampaignLinksPayload,
  type LinkStats,
  type PlatformSummary,
} from '@/lib/analytics/campaignLinks';

type Range = '7' | '30' | '90' | 'all';

function fmtNumber(value: number): string {
  return value.toLocaleString('en-TT');
}

/** Signups per visitor. One decimal under 10%, where the differences live. */
function fmtRate(stats: LinkStats): string {
  const rate = conversionRate(stats);
  if (rate === null) return '—';
  const pct = rate * 100;
  return `${pct === 0 || pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API is refused on non-secure origins and some embedded browsers.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

async function sendJson(method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch('/api/admin/campaign-links', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const json = await res.json().catch(() => null);
    return json?.error ?? 'Something went wrong. Try again.';
  } catch {
    return 'Could not reach the server. Try again.';
  }
}

// ---------------------------------------------------------------------------

function CopyButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      type="button"
      onClick={async () => {
        setState((await copyText(text)) ? 'copied' : 'failed');
        setTimeout(() => setState('idle'), 2000);
      }}
      className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
        state === 'copied'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </button>
  );
}

/** Destination select, with a free path for anything not in the presets. */
function DestinationPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (path: string | null) => void;
}) {
  const isPreset = LINK_DESTINATIONS.some((d) => d.path === value);
  const [custom, setCustom] = useState(!isPreset);
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <select
        value={custom ? '__custom' : value ?? '__default'}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__custom') {
            setCustom(true);
            onChange(isPreset ? '' : value);
          } else {
            setCustom(false);
            onChange(v === '__default' ? null : v);
          }
        }}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
      >
        {LINK_DESTINATIONS.map((d) => (
          <option key={d.path ?? '__default'} value={d.path ?? '__default'}>
            {d.label}
          </option>
        ))}
        <option value="__custom">Another page…</option>
      </select>
      {custom ? (
        <input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/search"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900"
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PlatformCard({
  summary,
  host,
  origin,
  onCreateMain,
}: {
  summary: PlatformSummary;
  host: string;
  origin: string;
  onCreateMain: (platform: string) => void;
}) {
  const main = summary.links.find((l) => l.is_primary);
  const subCount = summary.links.length - (main ? 1 : 0);
  return (
    <section className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <PlatformIcon platform={summary.platform} />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">{platformName(summary.platform)}</h2>
          <p className="text-xs text-gray-600">
            Main link{subCount > 0 ? ` + ${subCount} sub-link${subCount === 1 ? '' : 's'}` : ''}
          </p>
        </div>
      </div>

      {main ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
          <span className="min-w-0 flex-1 truncate font-mono text-sm text-gray-900">
            {host}/r/{main.code}
          </span>
          <CopyButton text={`${origin}/r/${main.code}`} label="Copy" />
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600">
          No main link yet
          <button
            type="button"
            onClick={() => onCreateMain(summary.platform)}
            className="font-semibold text-itutor-green hover:text-emerald-600"
          >
            Create it
          </button>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        {(
          [
            ['Clicks', fmtNumber(summary.clicks)],
            ['Visitors', fmtNumber(summary.visitors)],
            ['Signups', fmtNumber(summary.signups)],
            ['Conversion', fmtRate(summary)],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</dt>
            <dd className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>

      {summary.signups > 0 ? (
        <Link
          href={`/admin/signups?platform=${summary.platform}`}
          className="mt-4 text-sm font-semibold text-itutor-green hover:text-emerald-600"
        >
          See who signed up →
        </Link>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------

function AddLinkForm({
  platform,
  host,
  onDone,
  onCancel,
}: {
  platform: string;
  host: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState('');
  const [code, setCode] = useState(platform);
  const [codeEdited, setCodeEdited] = useState(false);
  const [landing, setLanding] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!label.trim()) return setError('Give the link a name, like "Bio link".');
    if (!LINK_CODE_PATTERN.test(code)) {
      return setError('The link ending can use lowercase letters, numbers, - and _.');
    }
    setSaving(true);
    const failure = await sendJson('POST', { platform, label: label.trim(), code, landing_path: landing });
    setSaving(false);
    if (failure) return setError(failure);
    onDone();
  };

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-gray-900">Name</span>
          <input
            autoFocus
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              if (!codeEdited) setCode(suggestLinkCode(platform, e.target.value));
            }}
            placeholder="e.g. Story, tutor recruitment"
            maxLength={120}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-900">Link</span>
          <div className="mt-1 flex items-center rounded-lg border border-gray-300 bg-white text-sm">
            <span className="whitespace-nowrap pl-3 font-mono text-gray-500">{host}/r/</span>
            <input
              value={code}
              onChange={(e) => {
                setCodeEdited(true);
                setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''));
              }}
              maxLength={64}
              className="min-w-0 flex-1 rounded-r-lg py-2 pr-3 font-mono text-gray-900 outline-none"
            />
          </div>
          <span className="mt-1 block text-xs text-gray-600">Can&apos;t be changed after it&apos;s created.</span>
        </label>
      </div>
      <div className="mt-4">
        <span className="text-sm font-medium text-gray-900">Sends people to</span>
        <div className="mt-1">
          <DestinationPicker value={landing} onChange={setLanding} />
        </div>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="rounded-lg bg-itutor-green px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
        >
          {saving ? 'Creating…' : 'Create link'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function LinkRow({
  link,
  host,
  origin,
  onChanged,
}: {
  link: CampaignLink;
  host: string;
  origin: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(link.label ?? '');
  const [landing, setLanding] = useState<string | null>(link.landing_path);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (patch: Record<string, unknown>) => {
    setError(null);
    setSaving(true);
    const failure = await sendJson('PATCH', { code: link.code, ...patch });
    setSaving(false);
    if (failure) {
      setError(failure);
      return;
    }
    setEditing(false);
    onChanged();
  };

  const toggleActive = () => {
    if (
      link.active &&
      !window.confirm(
        `Retire ${host}/r/${link.code}?\n\nThe link keeps working wherever it is already posted, and keeps its numbers, but it will send people to the default page.`
      )
    ) {
      return;
    }
    void save({ active: !link.active });
  };

  return (
    <>
      <tr className={link.active ? '' : 'bg-gray-50'}>
        <td className="px-4 py-3 align-top">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{link.is_primary ? 'Main link' : link.label}</span>
            {!link.active ? <Pill>Retired</Pill> : null}
          </div>
          <div className="mt-1 truncate font-mono text-xs text-gray-600">
            {host}/r/{link.code}
          </div>
          <div className="mt-0.5 text-xs text-gray-500">→ {destinationLabel(link.landing_path)}</div>
        </td>
        <td className="px-4 py-3 text-right align-top tabular-nums text-gray-900">{fmtNumber(link.clicks)}</td>
        <td className="px-4 py-3 text-right align-top tabular-nums text-gray-900">{fmtNumber(link.visitors)}</td>
        <td className="px-4 py-3 text-right align-top tabular-nums">
          {link.signups > 0 ? (
            <Link
              href={`/admin/signups?ref=${encodeURIComponent(link.code)}`}
              className="font-semibold text-itutor-green hover:text-emerald-600"
            >
              {fmtNumber(link.signups)}
            </Link>
          ) : (
            <span className="text-gray-900">0</span>
          )}
        </td>
        <td className="px-4 py-3 text-right align-top tabular-nums text-gray-900">{fmtRate(link)}</td>
        <td className="px-4 py-3 align-top">
          <div className="flex justify-end gap-2">
            <CopyButton text={`${origin}/r/${link.code}`} label="Copy" />
            <button
              type="button"
              onClick={() => {
                setLabel(link.label ?? '');
                setLanding(link.landing_path);
                setError(null);
                setEditing((v) => !v);
              }}
              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Edit
            </button>
          </div>
        </td>
      </tr>
      {editing ? (
        <tr className="bg-gray-50">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              {!link.is_primary ? (
                <label className="block">
                  <span className="text-sm font-medium text-gray-900">Name</span>
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    maxLength={120}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                </label>
              ) : null}
              <div className={link.is_primary ? 'md:col-span-2' : ''}>
                <span className="text-sm font-medium text-gray-900">Sends people to</span>
                <div className="mt-1">
                  <DestinationPicker value={landing} onChange={setLanding} />
                </div>
              </div>
            </div>
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  save(link.is_primary ? { landing_path: landing } : { label, landing_path: landing })
                }
                className="rounded-lg bg-itutor-green px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              {!link.is_primary ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={toggleActive}
                  className="ml-auto rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {link.active ? 'Retire link' : 'Reactivate link'}
                </button>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function PlatformLinks({
  summary,
  host,
  origin,
  onChanged,
}: {
  summary: PlatformSummary;
  host: string;
  origin: string;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const name = platformName(summary.platform);
  return (
    <Card
      title={`${name} links`}
      subtitle={`The ${name} totals add up every link below.`}
      action={
        !adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            + Add sub-link
          </button>
        ) : null
      }
    >
      {adding ? (
        <AddLinkForm
          platform={summary.platform}
          host={host}
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            onChanged();
          }}
        />
      ) : null}

      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-y border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <th className="px-4 py-2.5 text-left">Link</th>
              <th className="px-4 py-2.5 text-right">Clicks</th>
              <th className="px-4 py-2.5 text-right">Visitors</th>
              <th className="px-4 py-2.5 text-right">Signups</th>
              <th className="px-4 py-2.5 text-right">Conversion</th>
              <th className="px-4 py-2.5" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {summary.links.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No {name} links yet.
                </td>
              </tr>
            ) : (
              summary.links.map((link) => (
                <LinkRow key={link.code} link={link} host={host} origin={origin} onChanged={onChanged} />
              ))
            )}
          </tbody>
          {summary.links.length > 1 ? (
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-semibold">
                <td className="px-4 py-3 text-gray-900">All {name} links</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-900">{fmtNumber(summary.clicks)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-900">{fmtNumber(summary.visitors)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-900">{fmtNumber(summary.signups)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-900">{fmtRate(summary)}</td>
                <td />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export default function AdminLinkTrackingPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CampaignLinksPayload | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState<Range>('all');
  const [origin, setOrigin] = useState('');
  const [mainError, setMainError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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
    })();
  }, [router]);

  const load = useCallback(async (r: Range, quiet = false) => {
    if (!quiet) setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/campaign-links${r === 'all' ? '' : `?days=${r}`}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'failed');
      if (json.unavailable) {
        setUnavailable(true);
        setData(null);
      } else {
        setUnavailable(false);
        setData(json as CampaignLinksPayload);
      }
    } catch {
      setFailed(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void load(range);
  }, [authLoading, load, range]);

  const reload = () => void load(range, true);

  const createMain = async (platform: string) => {
    setMainError(null);
    const failure = await sendJson('POST', { platform, primary: true });
    if (failure) setMainError(failure);
    reload();
  };

  if (authLoading) {
    return (
      <DashboardLayout role="admin" userName="Admin">
        <div className="flex items-center justify-center py-20 text-gray-500">Loading…</div>
      </DashboardLayout>
    );
  }

  const host = origin.replace(/^https?:\/\//, '');

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <AdminBreadcrumb items={[{ label: 'Operations' }, { label: 'Link Tracking' }]} />

        <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Link Tracking</h1>
            <p className="mt-1 max-w-2xl text-gray-600">
              One link per platform for your bio, plus optional sub-links for a specific post,
              story or ad. See how many people each one brings in, and how many of them create
              an account.
            </p>
          </div>
          <Segmented<Range>
            value={range}
            onChange={setRange}
            options={[
              ['7', '7 days'],
              ['30', '30 days'],
              ['90', '90 days'],
              ['all', 'All time'],
            ]}
          />
        </header>

        <div className="mt-6">
          {unavailable ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Link tracking is not set up on this environment yet. Migration 267 creates the
              links table.
            </div>
          ) : failed ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Could not load the links.{' '}
              <button type="button" onClick={() => load(range)} className="font-semibold underline">
                Try again
              </button>
            </div>
          ) : loading || !data ? (
            <div className="py-20 text-center text-gray-500">Loading links…</div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Clicks" value={fmtNumber(data.total.clicks)} hint="Every tap on a tracked link" />
                <Stat label="Visitors" value={fmtNumber(data.total.visitors)} hint="Different people who tapped" />
                <Stat label="Signups" value={fmtNumber(data.total.signups)} hint="Accounts created from a link" />
                <Stat label="Conversion" value={fmtRate(data.total)} hint="Signups per visitor" />
              </div>

              {mainError ? <p className="text-sm text-red-600">{mainError}</p> : null}

              <div className="grid gap-4 lg:grid-cols-3">
                {data.platforms.map((summary) => (
                  <PlatformCard
                    key={summary.platform}
                    summary={summary}
                    host={host}
                    origin={origin}
                    onCreateMain={createMain}
                  />
                ))}
              </div>

              {data.platforms.map((summary) => (
                <PlatformLinks
                  key={summary.platform}
                  summary={summary}
                  host={host}
                  origin={origin}
                  onChanged={reload}
                />
              ))}

              <Card title="How these are counted">
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700">
                  <li>
                    <strong>Clicks</strong> count every tap. Preview cards that Instagram, Facebook
                    and WhatsApp draw for a link are not counted.
                  </li>
                  <li>
                    <strong>Visitors</strong> count different people, by browser. Someone who taps
                    two Instagram links is one Instagram visitor, so a platform&apos;s visitors can be
                    fewer than its links&apos; visitors added up.
                  </li>
                  <li>
                    <strong>Signups</strong> are accounts whose first tracked link was this one, up to
                    90 days after the tap. Each account counts once, for one link. The time range
                    filters signups by when the account was created.
                  </li>
                  <li>
                    <strong>Conversion</strong> is signups divided by visitors.
                  </li>
                  <li>
                    Someone who taps a link on their phone and signs up later on a different device
                    cannot be connected to the link.
                  </li>
                </ul>
              </Card>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
