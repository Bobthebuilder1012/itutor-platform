/**
 * Client-side guards for tutor verification document uploads.
 *
 * The browser PUTs the file straight to a signed Supabase Storage URL, so the
 * only thing enforcing a limit is the `verification_uploads` bucket itself:
 * a hard 10MB `file_size_limit` and a MIME allow-list. When either is
 * breached, Storage answers 413/400 with its own wording and the upload page
 * used to collapse that into a bare "Failed to upload file" — which told the
 * tutor nothing about what to change.
 *
 * These constants mirror the bucket configuration. If the bucket is ever
 * retuned, change them here and the "max 10MB" copy follows automatically.
 */
export const VERIFICATION_MAX_BYTES = 10 * 1024 * 1024;
export const VERIFICATION_MAX_LABEL = '10MB';

export const VERIFICATION_ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

/** "12.4MB", "812KB" — for telling a tutor how far over the limit they are. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/**
 * Checks a file before anything is sent. Returns a message to show the tutor,
 * or null when the file is acceptable.
 *
 * Running before the request is created matters for more than speed: the
 * upload flow creates a verification_requests row first and only then PUTs the
 * file, so a rejected upload would otherwise leave a row behind with nothing
 * attached to it.
 */
export function checkVerificationFile(file: File): string | null {
  if (file.size > VERIFICATION_MAX_BYTES) {
    return `That file is ${formatFileSize(file.size)} — over the ${VERIFICATION_MAX_LABEL} limit. Compress it, or photograph the document instead of scanning it at full resolution, then try again.`;
  }
  if (file.size === 0) {
    return 'That file is empty. Pick the scan or photo of your document and try again.';
  }
  // An empty type means the browser could not tell; let Storage be the judge
  // rather than blocking a file that may well be fine.
  if (file.type && !(VERIFICATION_ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return `${file.type} files are not accepted. Upload a PDF, JPG, PNG or WEBP.`;
  }
  return null;
}

/**
 * Turns a failed Storage PUT into something actionable. Storage is the final
 * authority — a file can pass the checks above and still be refused, e.g. if
 * the bucket limit is lowered — so this stays a distinct message rather than
 * falling back to the generic one.
 */
export async function describeStorageUploadFailure(res: Response): Promise<string> {
  let detail = '';
  try {
    const body = await res.clone().json();
    detail = String(body?.message ?? body?.error ?? '');
  } catch {
    try { detail = await res.clone().text(); } catch { /* body already consumed or empty */ }
  }
  const lower = detail.toLowerCase();

  if (res.status === 413 || lower.includes('maximum allowed size') || lower.includes('payload too large')) {
    return `That file is over the ${VERIFICATION_MAX_LABEL} limit. Compress it, or photograph the document instead of scanning it at full resolution, then try again.`;
  }
  if (res.status === 415 || lower.includes('mime type') || lower.includes('invalid_mime_type')) {
    return 'That file type is not accepted. Upload a PDF, JPG, PNG or WEBP.';
  }
  if (res.status === 401 || res.status === 403) {
    return 'The upload link expired before the file finished. Try uploading again.';
  }
  return 'Failed to upload file. Check your connection and try again.';
}
