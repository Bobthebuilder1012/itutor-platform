// Who may see and change the credit programme from the admin panel.
//
// requireAdmin('full') admits reviewers as well as admins (is_reviewer OR
// role 'admin'). Reading the credit reports is fine for both; anything that
// moves money or changes the rules — settings, adjustments, campaign codes,
// reversals — needs role 'admin'.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';

export interface CreditAdmin {
  id: string;
  email: string | null;
  role: string | null;
  canWrite: boolean;
}

export async function requireCreditAdmin(
  opts: { write?: boolean } = {}
): Promise<{ error: NextResponse; admin: null } | { error: null; admin: CreditAdmin }> {
  const { error, profile } = await requireAdmin('full');
  if (error) return { error, admin: null };
  if (!profile) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), admin: null };
  }
  const canWrite = profile.role === 'admin';
  if (opts.write && !canWrite) {
    return {
      error: NextResponse.json({ error: 'Only an admin can change credits' }, { status: 403 }),
      admin: null,
    };
  }
  return {
    error: null,
    admin: { id: profile.id, email: profile.email ?? null, role: profile.role ?? null, canWrite },
  };
}
