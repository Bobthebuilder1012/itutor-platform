// Hand validation, matching the rest of the verification routes.

import type { CredentialKind } from './constants';
import { MAX_PROOF_BYTES, PROOF_TYPES } from './constants';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, ' ');
  if (!t || t.length > max) return null;
  return t;
}

function optionalStr(v: unknown, max: number): Result<string | null> {
  if (v === undefined || v === null || v === '') return { ok: true, value: null };
  const s = str(v, max);
  return s ? { ok: true, value: s } : { ok: false, error: 'too long or invalid' };
}

function year(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/** http(s) only. Anything else (javascript:, data:, file:) is refused. */
export function cleanLink(v: unknown): Result<string | null> {
  if (v === undefined || v === null || v === '') return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, error: 'Link must be text' };
  const t = v.trim();
  if (t.length > 500) return { ok: false, error: 'Link is too long (500 characters max)' };
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: 'Link must start with http:// or https://' };
    }
    return { ok: true, value: u.toString() };
  } catch {
    return { ok: false, error: 'Link is not a valid web address' };
  }
}

/** Strips path parts and anything outside a conservative set. For display only. */
export function sanitizeFilename(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 100);
  return cleaned || null;
}

export interface CredentialInput {
  kind: CredentialKind;
  subject: string | null;
  grade: string | null;
  exam_year: number | null;
  school: string | null;
  degree: string | null;
  field: string | null;
  graduation_year: number | null;
  proof_url: string | null;
  proofPath: string | null;
  proof_filename: string | null;
}

export function validateCredential(body: any): Result<CredentialInput> {
  const thisYear = new Date().getFullYear();
  const kind = body?.kind;
  if (kind !== 'CSEC' && kind !== 'CAPE' && kind !== 'DEGREE') {
    return { ok: false, error: 'Choose CSEC, CAPE or Degree' };
  }

  const link = cleanLink(body?.proofUrl);
  if (!link.ok) return link;
  const proofPath = typeof body?.proofPath === 'string' && body.proofPath ? body.proofPath : null;
  const filename = sanitizeFilename(body?.proofFilename);

  const base = {
    kind: kind as CredentialKind,
    subject: null as string | null,
    grade: null as string | null,
    exam_year: null as number | null,
    school: null as string | null,
    degree: null as string | null,
    field: null as string | null,
    graduation_year: null as number | null,
    proof_url: link.value,
    proofPath,
    proof_filename: proofPath ? filename : null,
  };

  if (kind === 'DEGREE') {
    const school = str(body?.school, 150);
    const degree = str(body?.degree, 150);
    const field = optionalStr(body?.field, 150);
    const gy = year(body?.graduationYear, 1950, thisYear);
    if (!school) return { ok: false, error: 'Enter the school or university' };
    if (!degree) return { ok: false, error: 'Enter the degree' };
    if (!field.ok) return { ok: false, error: 'Field of study is too long' };
    if (gy === null) return { ok: false, error: `Enter a graduation year between 1950 and ${thisYear}` };
    if (!proofPath) return { ok: false, error: 'Upload a proof file for your degree' };
    return {
      ok: true,
      value: { ...base, school, degree, field: field.value, graduation_year: gy, proof_url: null },
    };
  }

  const subject = str(body?.subject, 100);
  const grade = str(body?.grade, 20);
  const ey = year(body?.examYear, 1950, thisYear);
  if (!subject) return { ok: false, error: 'Enter the subject' };
  if (!grade) return { ok: false, error: 'Enter the grade' };
  if (ey === null) return { ok: false, error: `Enter an exam year between 1950 and ${thisYear}` };
  if (!link.value && !proofPath) {
    return { ok: false, error: 'Add a proof link or upload a proof file' };
  }
  return { ok: true, value: { ...base, subject, grade, exam_year: ey } };
}

export interface ExtraInput {
  title: string;
  description: string;
  link_url: string | null;
}

export function validateExtra(body: any): Result<ExtraInput> {
  const title = str(body?.title, 80);
  const description = str(body?.description, 280);
  const link = cleanLink(body?.linkUrl);
  if (!title) return { ok: false, error: 'Enter a title (80 characters max)' };
  if (!description) return { ok: false, error: 'Enter a short description (280 characters max)' };
  if (!link.ok) return link;
  return { ok: true, value: { title, description, link_url: link.value } };
}

export function validateUploadRequest(
  body: any
): Result<{ ext: string; contentType: string }> {
  const contentType = typeof body?.contentType === 'string' ? body.contentType : '';
  const size = typeof body?.size === 'number' ? body.size : NaN;
  const ext = PROOF_TYPES[contentType];
  if (!ext) return { ok: false, error: 'Proof files must be PDF, JPG or PNG' };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'File size is missing' };
  if (size > MAX_PROOF_BYTES) return { ok: false, error: 'Proof files can be at most 10MB' };
  return { ok: true, value: { ext, contentType } };
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** A proof path must be exactly {tutorId}/{uuid}.{pdf|jpg|png}. */
export function isOwnProofPath(path: string, tutorId: string): boolean {
  return new RegExp(`^${tutorId}/${UUID}\\.(pdf|jpg|png)$`, 'i').test(path);
}
