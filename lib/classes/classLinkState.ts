/**
 * A class's join link, read and gated in one place.
 *
 * Server-only: takes a service-role Supabase client.
 *
 * Two rules every route that touches groups.meeting_link follows:
 *
 * 1. Read the link through readClassLinkState, never by adding
 *    meeting_link_mode to a resolveGroupActor columns string. That helper turns
 *    a select error into notFound, so on a database without migration 262 the
 *    whole route would answer 404. Here a missing column just means the class
 *    is in 'generated' mode, which is all any class was before 262.
 *
 * 2. Hand the link only to someone canSeeClassLink admits: the tutor, a
 *    superadmin acting as tutor, or a student enrolled in the class. A tutor's
 *    own link is usually a permanent room, so it must not ride along in
 *    payloads that strangers browsing a class can read.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isSuperAdmin } from '@/lib/auth/adminAccess';
import { isEnrolledInGroup } from '@/lib/server/attendance';
import type { MeetingLinkMode } from '@/lib/types/groups';

export type ClassLinkState = {
  found: boolean;
  tutorId: string | null;
  mode: MeetingLinkMode;
  link: string | null;
  generatedAt: string | null;
  /** When the current custom link was saved (migration 263); null if unknown. */
  setAt: string | null;
  /** False when the database predates migration 262 — custom mode can't be stored. */
  modeColumn: boolean;
  /** False when the database predates migration 263 — no link timestamp to write. */
  setAtColumn: boolean;
};

function isSchemaMismatch(error: any): boolean {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '').toLowerCase();
  return (
    code === '42703' || code === 'PGRST204' ||
    msg.includes('does not exist') || msg.includes('could not find')
  );
}

const TIERS = [
  'tutor_id, meeting_link, meeting_link_generated_at, meeting_link_mode, meeting_link_set_at',
  'tutor_id, meeting_link, meeting_link_generated_at, meeting_link_mode',
  'tutor_id, meeting_link, meeting_link_generated_at',
  'tutor_id, meeting_link',
] as const;

export async function readClassLinkState(
  service: SupabaseClient,
  groupId: string,
): Promise<ClassLinkState> {
  for (const cols of TIERS) {
    const { data, error } = await service.from('groups').select(cols).eq('id', groupId).maybeSingle();
    if (error) {
      if (isSchemaMismatch(error)) continue;
      throw error;
    }
    const row = (data ?? null) as Record<string, any> | null;
    return {
      found: !!row,
      tutorId: row?.tutor_id ?? null,
      mode: row?.meeting_link_mode === 'custom' ? 'custom' : 'generated',
      link: row?.meeting_link ?? null,
      generatedAt: row?.meeting_link_generated_at ?? null,
      setAt: row?.meeting_link_set_at ?? null,
      modeColumn: cols.includes('meeting_link_mode'),
      setAtColumn: cols.includes('meeting_link_set_at'),
    };
  }
  return {
    found: false, tutorId: null, mode: 'generated', link: null, generatedAt: null,
    setAt: null, modeColumn: false, setAtColumn: false,
  };
}

/**
 * Whether this viewer may be given the class link. The owner is checked first
 * so the tutor's own pages cost no extra queries.
 */
export async function canSeeClassLink(
  service: SupabaseClient,
  viewer: { userId: string | null | undefined; email?: string | null },
  group: { groupId: string; tutorId: string | null | undefined },
): Promise<boolean> {
  if (!viewer.userId) return false;
  if (group.tutorId && viewer.userId === group.tutorId) return true;
  if (isSuperAdmin(viewer.email)) return true;
  return isEnrolledInGroup(service, viewer.userId, group.groupId);
}
