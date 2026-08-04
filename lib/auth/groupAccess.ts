import { getServiceClient } from '@/lib/supabase/server';
import { isSuperAdmin } from '@/lib/auth/adminAccess';
import { logAdminAction } from '@/lib/services/adminAudit';

/**
 * Resolves whether a caller may act as a group's tutor.
 *
 * This is authorization-WIDENING, not impersonation: the caller's real identity
 * is preserved everywhere. `actingAsTutor`/`authorized` are true when the caller
 * either owns the group OR is a superadmin (SUPERADMIN_EMAILS). For a real owner
 * the result is identical to the old `group.tutor_id === user.id` check, so
 * retrofitted routes behave byte-for-byte the same for tutors.
 *
 * Perf: takes userId/email as params (every route already holds the Supabase
 * `user`, which carries both), so there's no extra auth/profiles round-trip.
 * The single `groups` SELECT is the one the route already performed — the row is
 * returned so callers don't read `groups` twice.
 */
export interface GroupActor {
  notFound: boolean;
  authorized: boolean;       // isOwner || isAdminOverride — gate for strict routes
  isOwner: boolean;
  isAdminOverride: boolean;  // authorized purely via superadmin
  actingAsTutor: boolean;    // === authorized; drop-in replacement for the old `isTutor`
  group: any | null;         // the fetched row (base cols + any extras requested)
  actorId: string;
  actorEmail: string | null;
}

export async function resolveGroupActor(opts: {
  groupId: string;
  userId: string;
  email?: string | null;
  columns?: string;          // extra group cols the caller needs (appended to base)
}): Promise<GroupActor> {
  const service = getServiceClient();
  const base = 'id, tutor_id, name, archived_at';
  const select = opts.columns ? `${base}, ${opts.columns}` : base;
  const { data: group } = await service
    .from('groups')
    .select(select)
    .eq('id', opts.groupId)
    .maybeSingle();

  if (!group) {
    return {
      notFound: true,
      authorized: false,
      isOwner: false,
      isAdminOverride: false,
      actingAsTutor: false,
      group: null,
      actorId: opts.userId,
      actorEmail: opts.email ?? null,
    };
  }

  const isOwner = (group as any).tutor_id === opts.userId;
  const isAdminOverride = !isOwner && isSuperAdmin(opts.email);
  const authorized = isOwner || isAdminOverride;

  return {
    notFound: false,
    authorized,
    isOwner,
    isAdminOverride,
    actingAsTutor: authorized,
    group,
    actorId: opts.userId,
    actorEmail: opts.email ?? null,
  };
}

/**
 * Records an admin "acting as tutor" write to the audit log. No-ops for real
 * tutors (only fires when the caller resolved via superadmin override), so
 * routes can call it unconditionally after a successful mutation with zero
 * overhead on the owner fast path. Reuses the best-effort `logAdminAction`.
 */
export async function auditAdminOverride(
  actor: GroupActor,
  subAction: string,                       // e.g. 'stream.post.create'
  details?: Record<string, unknown>,
  reason?: string | null,
): Promise<void> {
  if (!actor.isAdminOverride) return;
  await logAdminAction(
    { id: actor.actorId, email: actor.actorEmail },
    {
      action: 'class.tutor_override',
      targetType: 'class',
      targetId: actor.group?.id ?? null,
      targetLabel: actor.group?.name ?? null,
      details: { subAction, ...(details ?? {}) },
      reason: reason ?? null,
    },
  );
}
