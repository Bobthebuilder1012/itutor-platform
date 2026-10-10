// /api/admin/campaign-links — the tracking links behind /admin/link-tracking.
//
//   GET   ?days=30        every link with its clicks / visitors / signups
//   POST  {platform, label?, code?, landing_path?, primary?}   add a link
//   PATCH {code, label?, landing_path?, active?}               edit or retire one
//
// A link's code is permanent once created: it is the URL people have already
// posted. There is no DELETE for the same reason — retiring keeps the URL
// working and keeps its history named. See migration 267.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import {
  EMPTY_STATS,
  LINK_CODE_PATTERN,
  LINK_PLATFORMS,
  isLinkPlatform,
  isSafeLandingPath,
  type CampaignLink,
  type CampaignLinksPayload,
  type LinkStats,
} from '@/lib/analytics/campaignLinks';

export const dynamic = 'force-dynamic';

const LINK_COLUMNS = 'code, platform, label, is_primary, landing_path, active, created_at';

interface StatsRow {
  level: 'link' | 'platform' | 'total';
  platform: string | null;
  code: string | null;
  clicks: number | string;
  visitors: number | string;
  signups: number | string;
}

/** campaign_codes or campaign_link_stats absent — migration 267 not applied. */
function isMissingSchema(error: { code?: unknown; message?: unknown } | null): boolean {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42883' ||
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find')
  );
}

function toStats(row: StatsRow | undefined): LinkStats {
  if (!row) return { ...EMPTY_STATS };
  // bigint arrives as a number or a string depending on size; normalise both.
  return {
    clicks: Number(row.clicks) || 0,
    visitors: Number(row.visitors) || 0,
    signups: Number(row.signups) || 0,
  };
}

/** Null for "no change"/absent, '' for "clear", otherwise the trimmed value. */
function readText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  return value.trim().slice(0, max);
}

function readLandingPath(value: unknown): { ok: true; path: string | null | undefined } | { ok: false } {
  if (value === undefined) return { ok: true, path: undefined };
  if (value === null || value === '') return { ok: true, path: null };
  if (typeof value !== 'string') return { ok: false };
  const path = value.trim();
  if (!path) return { ok: true, path: null };
  return isSafeLandingPath(path) ? { ok: true, path } : { ok: false };
}

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const service = getServiceClient();

  const daysParam = Number(req.nextUrl.searchParams.get('days'));
  const days = Number.isInteger(daysParam) && daysParam > 0 ? daysParam : null;
  const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : null;

  const [linksRes, statsRes] = await Promise.all([
    service
      .from('campaign_codes')
      .select(LINK_COLUMNS)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true }),
    service.rpc('campaign_link_stats', { p_since: since }),
  ]);

  if (linksRes.error || statsRes.error) {
    const error = linksRes.error ?? statsRes.error;
    if (isMissingSchema(error)) {
      return NextResponse.json({ unavailable: true });
    }
    console.error('[admin/campaign-links] load failed:', error?.message);
    return NextResponse.json({ error: 'Could not load tracking links' }, { status: 500 });
  }

  const rows = (statsRes.data ?? []) as StatsRow[];
  const byCode = new Map(rows.filter((r) => r.level === 'link').map((r) => [r.code, r]));
  const byPlatform = new Map(rows.filter((r) => r.level === 'platform').map((r) => [r.platform, r]));
  const total = rows.find((r) => r.level === 'total');

  const links: CampaignLink[] = (linksRes.data ?? []).map((link) => ({
    ...(link as Omit<CampaignLink, keyof LinkStats>),
    ...toStats(byCode.get(link.code as string)),
  }));

  const payload: CampaignLinksPayload = {
    days,
    platforms: LINK_PLATFORMS.map(({ id }) => ({
      platform: id,
      ...toStats(byPlatform.get(id)),
      links: links.filter((l) => l.platform === id),
    })),
    total: toStats(total),
    other: links.filter((l) => !isLinkPlatform(l.platform)),
  };

  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  const { error: authError, profile } = await requireAdmin();
  if (authError) return authError;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const platform = body?.platform;
  if (!isLinkPlatform(platform)) {
    return NextResponse.json({ error: 'Choose Instagram, TikTok or Facebook.' }, { status: 400 });
  }

  const primary = body?.primary === true;
  const label = readText(body?.label, 120) || null;
  if (!primary && !label) {
    return NextResponse.json({ error: 'Give the link a name, like "Bio link".' }, { status: 400 });
  }

  const code = (typeof body?.code === 'string' && body.code.trim() ? body.code : primary ? platform : '')
    .trim()
    .toLowerCase();
  if (!LINK_CODE_PATTERN.test(code)) {
    return NextResponse.json(
      { error: 'The link ending can use lowercase letters, numbers, - and _ (up to 64).' },
      { status: 400 }
    );
  }

  const landing = readLandingPath(body?.landing_path);
  if (!landing.ok) {
    return NextResponse.json({ error: 'The destination must be a path on this site, like /search.' }, { status: 400 });
  }

  const service = getServiceClient();
  const { data, error } = await service
    .from('campaign_codes')
    .insert({
      code,
      platform,
      label: primary ? null : label,
      is_primary: primary,
      kind: 'social',
      landing_path: landing.path ?? null,
      created_by: profile?.id ?? null,
    })
    .select(LINK_COLUMNS)
    .single();

  if (error) {
    if (String(error.code) === '23505') {
      const message = primary
        ? `${platform} already has a main link.`
        : `/r/${code} is already taken. Choose a different ending.`;
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error('[admin/campaign-links] create failed:', error.message);
    return NextResponse.json({ error: 'Could not create the link' }, { status: 500 });
  }

  return NextResponse.json({ link: { ...data, ...EMPTY_STATS } }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const code = typeof body?.code === 'string' ? body.code.trim().toLowerCase() : '';
  if (!LINK_CODE_PATTERN.test(code)) {
    return NextResponse.json({ error: 'Unknown link' }, { status: 400 });
  }

  const service = getServiceClient();
  const { data: existing, error: readError } = await service
    .from('campaign_codes')
    .select('code, is_primary')
    .eq('code', code)
    .maybeSingle();
  if (readError) {
    console.error('[admin/campaign-links] read failed:', readError.message);
    return NextResponse.json({ error: 'Could not update the link' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'Unknown link' }, { status: 404 });

  const update: Record<string, unknown> = {};

  const label = readText(body?.label, 120);
  if (label !== undefined) {
    if (existing.is_primary) {
      return NextResponse.json({ error: 'The main link is named after its platform.' }, { status: 400 });
    }
    if (!label) return NextResponse.json({ error: 'A sub-link needs a name.' }, { status: 400 });
    update.label = label;
  }

  const landing = readLandingPath(body?.landing_path);
  if (!landing.ok) {
    return NextResponse.json({ error: 'The destination must be a path on this site, like /search.' }, { status: 400 });
  }
  if (landing.path !== undefined) update.landing_path = landing.path;

  if (typeof body?.active === 'boolean') update.active = body.active;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await service
    .from('campaign_codes')
    .update(update)
    .eq('code', code)
    .select(LINK_COLUMNS)
    .single();

  if (error) {
    console.error('[admin/campaign-links] update failed:', error.message);
    return NextResponse.json({ error: 'Could not update the link' }, { status: 500 });
  }

  return NextResponse.json({ link: data });
}
