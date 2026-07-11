import { getServiceClient } from '@/lib/supabase/server';

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Extract the storage object path from either a Supabase public storage URL
 * (…/storage/v1/object/public/{bucket}/{path}) or a bare path already scoped
 * to the bucket. Returns null when neither shape matches.
 */
export function extractStoragePath(bucket: string, urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;
  const marker = `/object/public/${bucket}/`;
  const idx = urlOrPath.indexOf(marker);
  if (idx !== -1) return decodeURIComponent(urlOrPath.slice(idx + marker.length));
  if (!urlOrPath.startsWith('http')) return urlOrPath;
  return null;
}

/**
 * Sign a single stored attachment URL/path for time-limited access. Returns
 * the ORIGINAL value (not null) on any failure so callers degrade gracefully
 * to today's behavior instead of the attachment silently disappearing —
 * relevant while the bucket is still public and signing is best-effort.
 */
export async function signAttachmentUrl(
  bucket: string,
  urlOrPath: string | null | undefined,
  expiresInSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string | null | undefined> {
  const path = extractStoragePath(bucket, urlOrPath);
  if (!path) return urlOrPath;
  try {
    const service = getServiceClient();
    const { data, error } = await service.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
    if (error || !data?.signedUrl) return urlOrPath;
    return data.signedUrl;
  } catch {
    return urlOrPath;
  }
}

/** Sign every attachment's file_url in a list, in parallel, preserving shape/order. */
export async function signAttachmentList<T extends { file_url?: string | null }>(
  bucket: string,
  attachments: T[],
  expiresInSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<T[]> {
  return Promise.all(
    attachments.map(async (a) => ({ ...a, file_url: await signAttachmentUrl(bucket, a.file_url, expiresInSeconds) }))
  );
}
