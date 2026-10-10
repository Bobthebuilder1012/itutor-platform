'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import type { Attribution } from '@/lib/analytics/attribution';
import {
  describeTouch,
  linkName,
  platformName,
  type CampaignLink,
  type CampaignLinksPayload,
} from '@/lib/analytics/campaignLinks';

type Signup = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  created_at: string;
  first_touch: Attribution | null;
  last_touch: Attribution | null;
};

/** Set by /admin/link-tracking's "see who signed up" links. */
type SourceFilter = { kind: 'ref'; value: string } | { kind: 'platform'; value: string } | null;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-TT', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminSignupsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(null);
  // Null until loaded; an empty list when link tracking is not set up here.
  const [links, setLinks] = useState<CampaignLink[] | null>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      const platform = params.get('platform');
      if (ref) setSourceFilter({ kind: 'ref', value: ref });
      else if (platform) setSourceFilter({ kind: 'platform', value: platform });
    } catch {
      /* no filter */
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/login'); return; }
      if (isEmailManagementOnlyAdmin(profile.email)) { router.replace('/admin/emails'); return; }
      setAuthLoading(false);
    })();
  }, [router]);

  // The tracking links, to name a signup's source. Optional: the table still
  // renders (with raw sources) where link tracking is unavailable.
  useEffect(() => {
    if (authLoading) return;
    (async () => {
      try {
        const res = await fetch('/api/admin/campaign-links', { cache: 'no-store' });
        const json = (await res.json()) as Partial<CampaignLinksPayload> & { unavailable?: boolean };
        if (!res.ok || json.unavailable || !json.platforms) { setLinks([]); return; }
        setLinks([...json.platforms.flatMap((p) => p.links), ...(json.other ?? [])]);
      } catch {
        setLinks([]);
      }
    })();
  }, [authLoading]);

  const linksByCode = useMemo(() => new Map((links ?? []).map((l) => [l.code, l])), [links]);

  // A platform filter queries by that platform's codes, so it waits for the
  // links; every other view queries straight away and does not re-run when
  // they arrive.
  const platformCodes = useMemo(() => {
    if (sourceFilter?.kind !== 'platform' || links === null) return null;
    return links.filter((l) => l.platform === sourceFilter.value).map((l) => l.code);
  }, [sourceFilter, links]);
  const platformCodesKey = platformCodes?.join(',') ?? null;

  useEffect(() => {
    if (authLoading) return;
    if (sourceFilter?.kind === 'platform' && platformCodesKey === null) return;
    (async () => {
      setLoading(true);
      let query = supabase
        .from('profiles')
        .select('id, full_name, email, role, created_at, first_touch, last_touch')
        .order('created_at', { ascending: false })
        .limit(100);
      if (roleFilter !== 'all') query = query.eq('role', roleFilter);
      if (sourceFilter?.kind === 'ref') {
        query = query.eq('first_touch->>ref', sourceFilter.value);
      } else if (sourceFilter?.kind === 'platform') {
        const codes = platformCodesKey ? platformCodesKey.split(',') : [];
        if (codes.length === 0) { setSignups([]); setLoading(false); return; }
        query = query.in('first_touch->>ref', codes);
      }
      const { data } = await query;
      setSignups((data as Signup[]) ?? []);
      setLoading(false);
    })();
  }, [authLoading, roleFilter, sourceFilter, platformCodesKey]);

  const clearSourceFilter = () => {
    setSourceFilter(null);
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch {
      /* URL sync is a convenience */
    }
  };

  const sourceFilterLabel = !sourceFilter
    ? null
    : sourceFilter.kind === 'platform'
      ? `All ${platformName(sourceFilter.value)} links`
      : linksByCode.has(sourceFilter.value)
        ? linkName(linksByCode.get(sourceFilter.value)!)
        : `/r/${sourceFilter.value}`;

  if (authLoading) {
    return (
      <DashboardLayout role="admin" userName="Admin">
        <div className="flex items-center justify-center py-20 text-gray-400">Loading…</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="max-w-6xl mx-auto">
        <AdminBreadcrumb items={[{ label: 'Operations' }, { label: 'Signups & Onboarding' }]} />
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Signups &amp; Onboarding</h1>
            <p className="text-gray-600 mt-1">The most recent account registrations across all roles.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/link-tracking"
              className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Link tracking →
            </Link>
            <Link
              href="/admin/emails"
              className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Manage onboarding emails →
            </Link>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {['all', 'student', 'parent', 'tutor'].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                roleFilter === r ? 'bg-itutor-green text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {r === 'all' ? 'All roles' : r + 's'}
            </button>
          ))}
          {sourceFilterLabel ? (
            <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              Came from {sourceFilterLabel}
              <button
                type="button"
                onClick={clearSourceFilter}
                aria-label="Clear source filter"
                className="text-emerald-700 hover:text-emerald-900"
              >
                ✕
              </button>
            </span>
          ) : null}
        </div>

        <div className="rounded-xl border border-gray-200 overflow-x-auto bg-white shadow-sm">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left" title="The first tracked link or campaign this person arrived from">Source</th>
                <th className="px-4 py-3 text-left" title="The most recent tracked link or campaign before they signed up">Last touch</th>
                <th className="px-4 py-3 text-left">Joined</th>
                <th className="px-4 py-3 text-right">Account</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Loading signups…</td></tr>
              ) : signups.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No signups found.</td></tr>
              ) : (
                signups.map((s) => {
                  const first = describeTouch(s.first_touch, linksByCode);
                  const last = describeTouch(s.last_touch, linksByCode);
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{s.full_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{s.email || '—'}</td>
                      <td className="px-4 py-3 capitalize text-gray-700">{s.role || '—'}</td>
                      <td className="px-4 py-3">
                        {first ? (
                          <span className={first.tracked ? 'font-medium text-gray-900' : 'text-gray-600'}>{first.text}</span>
                        ) : (
                          <span className="text-gray-400" title="No tracked link or campaign was recorded for this account">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {!last ? (
                          <span className="text-gray-400">—</span>
                        ) : first && last.text === first.text ? (
                          <span className="text-gray-400">Same</span>
                        ) : (
                          <span className={last.tracked ? 'font-medium text-gray-900' : 'text-gray-600'}>{last.text}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 tabular-nums">{fmtDate(s.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/accounts/${s.id}`} className="text-itutor-green hover:text-emerald-600 font-semibold">
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
