import { Profile } from './database';

// ============================
// ENUMS / UNION TYPES
// ============================

export type GroupMemberStatus = 'pending' | 'approved' | 'denied';
export type RecurrenceType = 'none' | 'weekly' | 'daily';
export type OccurrenceStatus = 'upcoming' | 'cancelled';

// Day-of-week: 0 = Sunday … 6 = Saturday (matches JS getDay())
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAY_LABELS: Record<DayOfWeek, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

// ============================
// CORE ENTITIES
// ============================

export interface Group {
  id: string;
  name: string;
  description: string | null;
  tutor_id: string;
  subject: string | null;
  pricing: string;
  created_at: string;
  archived_at: string | null;
}

export interface GroupWithTutor extends Group {
  tutor: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>;
  member_count: number;
  member_previews: Array<Pick<Profile, 'id' | 'full_name' | 'avatar_url'>>;
  current_user_membership: GroupMember | null;
  next_occurrence: GroupOccurrence | null;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  status: GroupMemberStatus;
  joined_at: string;
  profile?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>;
}

export interface GroupSession {
  id: string;
  group_id: string;
  title: string;
  recurrence_type: RecurrenceType;
  recurrence_days: DayOfWeek[];
  start_time: string;
  duration_minutes: number;
  starts_on: string;
  ends_on: string | null;
  created_at: string;
}

export interface GroupSessionWithOccurrences extends GroupSession {
  occurrences: GroupOccurrence[];
}

export interface GroupOccurrence {
  id: string;
  group_session_id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  status: OccurrenceStatus;
  cancelled_at: string | null;
  cancellation_note: string | null;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  parent_message_id: string | null;
  body: string;
  is_pinned: boolean;
  is_locked: boolean;
  created_at: string;
  sender: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>;
  replies?: GroupMessage[];
}

// ============================
// REQUEST / FORM TYPES
// ============================

export interface CreateGroupInput {
  name: string;
  description?: string;
  subject?: string;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string;
  subject?: string;
}

export interface CreateGroupSessionInput {
  title: string;
  recurrence_type: RecurrenceType;
  recurrence_days?: DayOfWeek[];
  start_time: string;
  duration_minutes: number;
  starts_on: string;
  ends_on?: string;
}

export interface PostGroupMessageInput {
  body: string;
  parent_message_id?: string;
}

export interface PatchGroupMessageInput {
  is_pinned?: boolean;
  is_locked?: boolean;
}

// ============================
// FILTER TYPES
// ============================

export interface GroupFilters {
  subjects?: string[];
  tutor_name?: string;
  day?: DayOfWeek;
}
