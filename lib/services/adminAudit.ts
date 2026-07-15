import { getServiceClient } from '@/lib/supabase/server';

export interface AdminAuditEntry {
  action: string;                 // e.g. 'account.update', 'class.archive'
  targetType?: string;            // 'account' | 'class' | 'banner' | ...
  targetId?: string | null;
  targetLabel?: string | null;
  details?: Record<string, unknown>;
  reason?: string | null;
}

export interface AuditActor {
  id?: string | null;
  email?: string | null;
}

/**
 * Write one admin audit row. Best-effort: a logging failure must never break the
 * action it records, so this swallows errors (after logging them) and never
 * throws. Always call it from server code with the service client available.
 */
export async function logAdminAction(actor: AuditActor, entry: AdminAuditEntry): Promise<void> {
  try {
    const admin = getServiceClient();
    const { error } = await admin.from('admin_audit_log').insert({
      actor_id: actor.id ?? null,
      actor_email: actor.email ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      target_label: entry.targetLabel ?? null,
      details: entry.details ?? {},
      reason: entry.reason ?? null,
    });
    if (error) console.error('[adminAudit] insert failed:', error.message);
  } catch (e) {
    console.error('[adminAudit] unexpected error:', e);
  }
}
