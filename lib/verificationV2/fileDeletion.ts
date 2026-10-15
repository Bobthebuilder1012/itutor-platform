// Deletes a teacher's verification files from Supabase Storage. Never throws:
// every problem is returned, so callers (an admin decision, a retention sweep,
// account deletion) can report it without being broken by it.
//
// Scope:
//   'v2'  the new flow's proof bucket only (a v2 application was rejected)
//   'all' every verification bucket (verified status revoked, account deleted)
//
// What "delete" covers beyond the files: OCR text and extracted fields that came
// from a document are cleared, and credentials keep their claim but lose the
// proof (proof_deleted_at, migration 255) so what was reviewed stays on record.

import { getServiceClient } from '@/lib/supabase/server';
import type { Db } from '@/lib/verification/setStatus';

export const V2_BUCKETS = ['tutor-credential-proofs'] as const;
export const ALL_BUCKETS = [
  'tutor-credential-proofs',
  'tutor-verifications',
  'verification_uploads',
  'degree-documents',
] as const;

export type DeletionReason = 'rejection' | 'revocation' | 'account_deletion' | 'retention';
export type DeletionScope = 'v2' | 'all';

export interface DeletionResult {
  ok: boolean;
  deleted: number;
  byBucket: Record<string, number>;
  errors: string[];
}

/** Every file under `prefix`, descending into folders. */
async function listAll(db: Db, bucket: string, prefix: string, out: string[] = []): Promise<string[]> {
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: pageSize, offset });
    if (error) throw new Error(`${bucket}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      // A folder has no id in the Storage list response.
      if (entry.id === null || entry.id === undefined) await listAll(db, bucket, path, out);
      else out.push(path);
    }
    if (data.length < pageSize) break;
  }
  return out;
}

export async function deleteVerificationFiles(opts: {
  tutorId: string;
  scope: DeletionScope;
  reason: DeletionReason;
  db?: Db;
  /** Account deletion removes the rows by cascade, so it skips the row clean-up. */
  skipRowCleanup?: boolean;
}): Promise<DeletionResult> {
  const result: DeletionResult = { ok: true, deleted: 0, byBucket: {}, errors: [] };
  let db: Db;
  try {
    db = opts.db ?? (getServiceClient() as Db);
  } catch (err) {
    return { ok: false, deleted: 0, byBucket: {}, errors: [(err as Error).message] };
  }

  const buckets = opts.scope === 'v2' ? V2_BUCKETS : ALL_BUCKETS;

  for (const bucket of buckets) {
    try {
      const paths = await listAll(db, bucket, opts.tutorId);
      let n = 0;
      for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        const { error } = await db.storage.from(bucket).remove(chunk);
        if (error) throw new Error(`${bucket}: ${error.message}`);
        n += chunk.length;
      }
      result.byBucket[bucket] = n;
      result.deleted += n;
    } catch (err) {
      result.ok = false;
      result.errors.push((err as Error).message);
    }
  }

  // Only clear the database side once every file is gone, so a half-failed
  // delete can be retried and nothing points at a file that still exists.
  if (result.ok && !opts.skipRowCleanup) {
    try {
      await clearRows(db, opts.tutorId, opts.scope);
    } catch (err) {
      result.ok = false;
      result.errors.push(`rows: ${(err as Error).message}`);
    }
  }

  if (!result.ok) {
    console.error(`[verification-v2/files] ${opts.reason}: incomplete for tutor ${opts.tutorId} (${result.errors.length} errors)`);
  }
  return result;
}

async function clearRows(db: Db, tutorId: string, scope: DeletionScope) {
  const now = new Date().toISOString();

  const creds = await db
    .from('tutor_credentials_v2')
    .update({ proof_path: null, proof_filename: null, proof_deleted_at: now })
    .eq('tutor_id', tutorId)
    .not('proof_path', 'is', null);
  if (creds.error) throw new Error(creds.error.message);

  const v2 = await db
    .from('tutor_verification_v2')
    .update({ files_deleted_at: now })
    .eq('tutor_id', tutorId);
  if (v2.error) throw new Error(v2.error.message);

  if (scope !== 'all') return;

  // Old flow: forget the file path and the text read from the document.
  const reqs = await db
    .from('tutor_verification_requests')
    .update({ file_path: '', extracted_text: null, extracted_json: null })
    .eq('tutor_id', tutorId)
    .neq('file_path', '');
  if (reqs.error) throw new Error(reqs.error.message);

  const { data: degrees, error: dErr } = await db.from('degrees').select('id').eq('user_id', tutorId);
  if (dErr) throw new Error(dErr.message);
  const ids = (degrees ?? []).map((d: any) => d.id);
  if (ids.length > 0) {
    const docs = await db.from('degree_documents').delete().in('degree_id', ids);
    if (docs.error) throw new Error(docs.error.message);
  }
}

/** One rejected old-flow request: its single file, and the text read from it. */
export async function deleteRequestFile(opts: {
  requestId: string;
  filePath: string;
  db?: Db;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = opts.db ?? (getServiceClient() as Db);
    const buckets = ['tutor-verifications', 'verification_uploads'];
    for (const bucket of buckets) {
      const { error } = await db.storage.from(bucket).remove([opts.filePath]);
      if (error) throw new Error(`${bucket}: ${error.message}`);
    }
    const { error } = await db
      .from('tutor_verification_requests')
      .update({ file_path: '', extracted_text: null, extracted_json: null })
      .eq('id', opts.requestId);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
