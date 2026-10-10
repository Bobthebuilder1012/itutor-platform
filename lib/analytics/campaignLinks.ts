// =====================================================
// CAMPAIGN LINKS — shared shape for /admin/link-tracking
// =====================================================
// Client-safe: no server imports. Used by the admin page, its API route
// (/api/admin/campaign-links) and the Source column on /admin/signups.
//
// A link is a campaign_codes row (migration 267) served at /r/<code>.
// Clicks are `ref_click` product events; signups are profiles whose
// first_touch.ref is the code.

import type { Attribution } from './attribution';

export const LINK_PLATFORMS = [
  { id: 'instagram', name: 'Instagram' },
  { id: 'tiktok', name: 'TikTok' },
  { id: 'facebook', name: 'Facebook' },
] as const;

export type LinkPlatform = (typeof LINK_PLATFORMS)[number]['id'];

export function isLinkPlatform(value: unknown): value is LinkPlatform {
  return LINK_PLATFORMS.some((p) => p.id === value);
}

export function platformName(platform: string | null | undefined): string {
  return LINK_PLATFORMS.find((p) => p.id === platform)?.name ?? (platform || 'Other');
}

/**
 * The same shape migration 267 enforces. Lowercase only: /r/ lowercases before
 * looking a code up, so an uppercase row could never be reached.
 */
export const LINK_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Suggest a code for a new sub-link: "Story, tutor recruitment" → instagram-story-tutor-recruitment. */
export function suggestLinkCode(platform: string, label: string): string {
  const slug = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${platform}${slug ? `-${slug}` : ''}`.slice(0, 64).replace(/-+$/, '');
}

/** Where a link can send people. `null` is the /r/ default (/start). */
export const LINK_DESTINATIONS: Array<{ path: string | null; label: string }> = [
  { path: null, label: 'Find your iTutor (default)' },
  { path: '/', label: 'Home page' },
  { path: '/search', label: 'Browse tutors and classes' },
  { path: '/signup?role=tutor', label: 'Teacher sign-up' },
];

export function destinationLabel(path: string | null): string {
  return LINK_DESTINATIONS.find((d) => d.path === path)?.label ?? path ?? 'Find your iTutor (default)';
}

/**
 * Same rule /r/ applies before redirecting, so the admin cannot save a
 * destination the route would then refuse.
 */
export function isSafeLandingPath(raw: string): boolean {
  return (
    raw.startsWith('/') &&
    !raw.startsWith('//') &&
    !raw.startsWith('/\\') &&
    !raw.includes('://') &&
    raw.length <= 500
  );
}

export interface LinkStats {
  clicks: number;
  visitors: number;
  signups: number;
}

export interface CampaignLink extends LinkStats {
  code: string;
  platform: string;
  label: string | null;
  is_primary: boolean;
  landing_path: string | null;
  active: boolean;
  created_at: string;
}

export interface PlatformSummary extends LinkStats {
  platform: LinkPlatform;
  links: CampaignLink[];
}

export interface CampaignLinksPayload {
  days: number | null;
  platforms: PlatformSummary[];
  total: LinkStats;
  /** Links on platforms the page does not list (none today). */
  other: CampaignLink[];
}

export const EMPTY_STATS: LinkStats = { clicks: 0, visitors: 0, signups: 0 };

/** Signups per unique visitor. Null when nobody has visited yet. */
export function conversionRate(stats: LinkStats): number | null {
  return stats.visitors > 0 ? stats.signups / stats.visitors : null;
}

/** "Instagram · Bio link", or "Instagram · Main link". */
export function linkName(link: Pick<CampaignLink, 'platform' | 'label' | 'is_primary'>): string {
  return `${platformName(link.platform)} · ${link.is_primary || !link.label ? 'Main link' : link.label}`;
}

/** utm_source values the platforms add on their own (Instagram tags bio taps `ig`). */
const UTM_SOURCE_NAMES: Record<string, string> = {
  ig: 'Instagram',
  instagram: 'Instagram',
  fb: 'Facebook',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  tt: 'TikTok',
};

/**
 * Describe a profile's first_touch / last_touch for the signups table.
 * A known tracking link wins; then utm_source; then the raw ref.
 */
export function describeTouch(
  touch: Attribution | null | undefined,
  links: Map<string, Pick<CampaignLink, 'platform' | 'label' | 'is_primary'>>
): { text: string; tracked: boolean } | null {
  if (!touch) return null;
  const ref = touch.ref?.toLowerCase();
  const link = ref ? links.get(ref) : undefined;
  if (link) return { text: linkName(link), tracked: true };

  const source = touch.utm_source?.toLowerCase();
  if (source && source !== 'ref') {
    const named = UTM_SOURCE_NAMES[source] ?? touch.utm_source!;
    return { text: touch.utm_medium ? `${named} (${touch.utm_medium})` : named, tracked: false };
  }
  if (touch.ref) return { text: `ref: ${touch.ref}`, tracked: false };
  return null;
}
