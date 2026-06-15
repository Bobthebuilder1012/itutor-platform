import { type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/middleware/adminAuth';

// Defense-in-depth: gate every /admin/* page render on the server, not just
// in middleware. Middleware is the first line, but this closes the
// page-render gap if middleware is ever bypassed (cf. CVE-2025-29927).
//
// Scope 'email-management' is the most permissive admin scope: it admits full
// admins, reviewers, and the email-management-only marketing admin (so the
// latter keeps access to /admin/emails). Per-page scope enforcement (e.g.
// restricting that account away from financial pages) stays in the pages/APIs.
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { error, user } = await requireAdmin('email-management');

  if (error) {
    redirect(user ? '/' : '/login');
  }

  return <>{children}</>;
}
