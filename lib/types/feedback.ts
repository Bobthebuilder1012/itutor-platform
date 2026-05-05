export type FeedbackFrequency = 'session' | 'weekly' | 'monthly';
export type FeedbackEntryStatus = 'pending' | 'submitted' | 'skipped';

export interface FeedbackSettings {
  id: string;
  group_id: string;
  enabled: boolean;
  frequency: FeedbackFrequency;
  deadline_days: number;
  include_ratings: boolean;
  notify_students: boolean;
  allow_parent_access: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeedbackPeriod {
  id: string;
  group_id: string;
  frequency: FeedbackFrequency;
  period_label: string;
  period_start: string;
  period_end: string;
  due_at: string;
  created_at: string;
}

export interface FeedbackEntry {
  id: string;
  period_id: string;
  group_id: string;
  student_id: string;
  tutor_id: string;
  status: FeedbackEntryStatus;
  rating_participation: number | null;
  rating_understanding: number | null;
  rating_effort: number | null;
  comment: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedbackEntryWithStudent extends FeedbackEntry {
  student: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
  sessions_attended?: number;
  sessions_total?: number;
}

export interface FeedbackPeriodWithEntries extends FeedbackPeriod {
  entries: FeedbackEntryWithStudent[];
  total: number;
  submitted: number;
  pending: number;
  skipped: number;
}

export interface StudentFeedbackCard {
  id: string;
  period_label: string;
  frequency: FeedbackFrequency;
  period_start: string;
  period_end: string;
  tutor_name: string;
  rating_participation: number | null;
  rating_understanding: number | null;
  rating_effort: number | null;
  comment: string | null;
  submitted_at: string | null;
  sessions_attended?: number;
  sessions_total?: number;
}
