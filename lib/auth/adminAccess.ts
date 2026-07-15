const EMAIL_MANAGEMENT_ONLY_ADMIN = process.env.NEXT_PUBLIC_MARKETING_ADMIN_EMAIL ?? '';

// Superadmins can perform destructive admin actions (delete accounts,
// hard-delete classes, change roles). Designated by a comma-separated env list,
// mirroring the marketing-admin pattern. Server-side only — not exposed to the
// client bundle (no NEXT_PUBLIC prefix), so isSuperAdmin() is only meaningful in
// server code. Enforce it on every destructive endpoint, never in the UI alone.
const SUPERADMIN_EMAILS = (process.env.SUPERADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export type AdminAccessScope = 'full' | 'email-management';

function normalizeEmail(email?: string | null) {
  return (email || '').trim().toLowerCase();
}

export function isSuperAdmin(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized || SUPERADMIN_EMAILS.length === 0) return false;
  return SUPERADMIN_EMAILS.includes(normalized);
}

export function isEmailManagementOnlyAdmin(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized || !EMAIL_MANAGEMENT_ONLY_ADMIN) return false;
  return normalized === EMAIL_MANAGEMENT_ONLY_ADMIN;
}

export function getAdminHomePath(email?: string | null) {
  return isEmailManagementOnlyAdmin(email) ? '/admin/emails' : '/admin/dashboard';
}

export function canAccessAdminScope(
  email: string | null | undefined,
  scope: AdminAccessScope = 'full'
) {
  if (scope === 'email-management') return true;
  return !isEmailManagementOnlyAdmin(email);
}
