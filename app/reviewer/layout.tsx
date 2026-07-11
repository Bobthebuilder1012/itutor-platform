import { type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/middleware/adminAuth';

// Defense-in-depth: gate every /reviewer/* page render on the server, not just
// in middleware. Closes the page-render gap if middleware is ever bypassed
// (cf. CVE-2025-29927). requireAdmin() admits reviewers (is_reviewer) and full
// admins; the email-management-only marketing admin has no reviewer access and
// is correctly blocked here.
export const dynamic = 'force-dynamic';

export default async function ReviewerLayout({ children }: { children: ReactNode }) {
  const { error, user } = await requireAdmin();

  if (error) {
    redirect(user ? '/' : '/login');
  }

  return <>{children}</>;
}
