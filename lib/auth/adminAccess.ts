const EMAIL_MANAGEMENT_ONLY_ADMIN = 'marketing.itutor@myitutor.com';

export type AdminAccessScope = 'full' | 'email-management';

function normalizeEmail(email?: string | null) {
  return (email || '').trim().toLowerCase();
}

export function isEmailManagementOnlyAdmin(email?: string | null) {
  return normalizeEmail(email) === EMAIL_MANAGEMENT_ONLY_ADMIN;
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
