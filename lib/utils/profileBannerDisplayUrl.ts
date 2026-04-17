export const DEFAULT_PROFILE_BANNER_SRC = '/assets/banners/default-profile-banner.png';

/** Public URL for display; falls back to default banner when none is set. Cache-bust custom uploads with `version` (e.g. profiles.updated_at). */
export function profileBannerDisplayUrl(
  url: string | null | undefined,
  version?: string | null
): string {
  const trimmed = url?.trim();
  const hasCustom = Boolean(trimmed);
  const base = hasCustom ? trimmed!.split(/[?#]/)[0] : DEFAULT_PROFILE_BANNER_SRC;
  if (!hasCustom) return base;
  if (!version) return base;
  return `${base}?v=${encodeURIComponent(String(version))}`;
}
