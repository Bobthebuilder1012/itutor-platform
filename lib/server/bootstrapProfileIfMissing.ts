import type { User } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server';

function normalizeUsernameFromEmail(email: string) {
  const prefix = email.split('@')[0] || 'user';
  return prefix.toLowerCase().replace(/[.+]/g, '_').replace(/[^a-z0-9_-]/g, '_');
}

async function findAvailableUsername(admin: ReturnType<typeof getServiceClient>, base: string) {
  let candidate = base || 'user';
  for (let i = 0; i < 6; i++) {
    const { data } = await admin.from('profiles').select('id').eq('username', candidate).maybeSingle();
    if (!data) return candidate;
    const suffix = i < 5 ? String(Math.floor(1000 + Math.random() * 9000)) : String(Date.now()).slice(-6);
    candidate = `${base}_${suffix}`;
  }
  return `${base}_${String(Date.now()).slice(-6)}`;
}

/**
 * Creates a profiles row for a new auth user (OAuth or email) when missing.
 * Matches /api/profile/ensure payload so staging DB NOT NULL constraints are satisfied.
 */
export async function bootstrapProfileIfMissing(user: User): Promise<{ error: { message: string } | null }> {
  const admin = getServiceClient();
  const { data: existing } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (existing?.id) return { error: null };

  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const email = user.email || '';
  const role = (meta.role as string | undefined) ?? null;
  const fullName =
    (meta.full_name as string | undefined) ||
    (meta.display_name as string | undefined) ||
    (meta.username as string | undefined) ||
    (email.split('@')[0] || 'User');

  const baseUsername = (meta.username as string | undefined) || (email ? normalizeUsernameFromEmail(email) : 'user');
  const username = await findAvailableUsername(admin, baseUsername);

  const now = new Date().toISOString();
  const termsAccepted = Boolean(meta.terms_accepted);

  const payload: Record<string, unknown> = {
    id: user.id,
    email: email || null,
    role,
    full_name: fullName || 'User',
    username,
    avatar_url:
      (meta.avatar_url as string | undefined) ||
      (meta.picture as string | undefined) ||
      null,
    country: (meta.country as string | undefined) || null,
    display_name: (meta.display_name as string | undefined) || null,
    terms_accepted: termsAccepted,
    terms_accepted_at: termsAccepted ? now : null,
    created_at: now,
    updated_at: now,
  };

  const { error } = await admin.from('profiles').upsert(payload, { onConflict: 'id' });
  return { error: error ? { message: error.message } : null };
}
