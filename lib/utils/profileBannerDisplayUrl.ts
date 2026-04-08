/** Stable public URL in DB; use version (e.g. profiles.updated_at) to bust CDN/browser cache after re-upload. */
export function profileBannerDisplayUrl(
  url: string | null | undefined,
  version?: string | null
): string | undefined {
  if (!url) return undefined;
  const base = url.split(/[?#]/)[0];
  if (!version) return base;
  return `${base}?v=${encodeURIComponent(version)}`;
}
