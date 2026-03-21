import crypto from 'crypto';
import { getServiceClient } from '@/lib/supabase/server';

type MeetingPlatform = 'ZOOM' | 'GOOGLE_MEET' | 'INTERNAL';

export async function generateMeetingLink(params: {
  platform: MeetingPlatform;
  sessionId: string;
  scheduledAt: Date;
  durationMinutes: number;
  tutorName: string;
  groupTitle: string;
}): Promise<string> {
  const { platform, sessionId } = params;

  if (platform === 'GOOGLE_MEET') {
    // In production, replace with Google Calendar API integration.
    const hash = crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 10).toLowerCase();
    const formatted = `${hash.slice(0, 3)}-${hash.slice(3, 7)}-${hash.slice(7, 10)}`;
    return `https://meet.google.com/${formatted}`;
  }

  if (platform === 'ZOOM') {
    // In production, replace with Zoom API integration.
    const numeric = BigInt(`0x${crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 12)}`)
      .toString()
      .slice(0, 11);
    return `https://zoom.us/j/${numeric}`;
  }

  return `https://itutor.com/classroom/${sessionId}`;
}

export async function assignMeetingLinksToGroup(groupId: string): Promise<void> {
  const service = getServiceClient();

  const { data: group, error: groupError } = await service
    .from('groups')
    .select('id, name')
    .eq('id', groupId)
    .single();

  if (groupError || !group) {
    throw new Error('Group not found');
  }

  const { data: sessions, error } = await service
    .from('group_session_occurrences')
    .select(`
      id, scheduled_start_at, meeting_link,
      session:group_sessions!inner(id, title, duration_minutes, meeting_platform, group_id),
      group:groups!inner(id, tutor_id, tutor:profiles!groups_tutor_id_fkey(full_name))
    `)
    .eq('session.group_id', groupId)
    .is('meeting_link', null);

  if (error) throw new Error(error.message);

  for (const row of sessions ?? []) {
    const meetingPlatform = (row as any).session?.meeting_platform ?? 'INTERNAL';
    const tutorName = (row as any).group?.tutor?.full_name ?? 'Tutor';
    const groupTitle = (row as any).session?.title ?? group.name ?? 'Group Session';

    const link = await generateMeetingLink({
      platform: meetingPlatform,
      sessionId: row.id,
      scheduledAt: new Date(row.scheduled_start_at),
      durationMinutes: (row as any).session?.duration_minutes ?? 60,
      tutorName,
      groupTitle,
    });

    await service
      .from('group_session_occurrences')
      .update({
        meeting_link: link,
        meeting_platform: meetingPlatform,
      })
      .eq('id', row.id);
  }
}

