import { Profile } from './database';

// ============================
// ENUMS / UNION TYPES
// ============================

export type GroupMemberStatus = 'pending' | 'approved' | 'denied' | 'invited' | 'removed' | 'suspended' | 'banned';
export type RecurrenceType = 'none' | 'weekly' | 'daily';
export type OccurrenceStatus = 'upcoming' | 'cancelled';
export type GroupDifficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type GroupFormLevel = 'FORM_1' | 'FORM_2' | 'FORM_3' | 'FORM_4' | 'FORM_5' | 'CSEC' | 'CAPE' | 'UNIVERSITY' | 'ADULT';
export type GroupPricingModel = 'PER_SESSION' | 'MONTHLY' | 'FREE';
export type GroupPricingMode = 'PER_SESSION' | 'PER_COURSE' | 'FREE';
export type GroupPublishStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type GroupRecurrenceTypeV2 = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type GroupEnrollmentType = 'SUBSCRIPTION' | 'SINGLE_SESSION';
export type GroupEnrollmentStatus = 'ACTIVE' | 'CANCELLED' | 'WAITLISTED' | 'COMPLETED' | 'PENDING_PAYMENT' | 'GRACE' | 'SUSPENDED' | 'ACTIVATION_FAILED';
export type GroupPaymentStatus = 'PENDING' | 'PAID' | 'REFUNDED' | 'FREE' | 'PARTIALLY_REFUNDED' | 'OVERDUE' | 'ACTIVATION_FAILED';
export type GroupAttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE';
export type GroupWaitlistStatus = 'waiting' | 'offered' | 'expired' | 'accepted' | 'removed';
export type SubscriptionPaymentType = 'subscription_initial' | 'subscription_renewal' | 'subscription_reactivation';
export type SubscriptionPaymentStatus = 'PENDING' | 'PAID' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'ACTIVATION_FAILED' | 'expired';
export type GroupRemovalStatus = 'auto_processed' | 'pending_review' | 'approved' | 'overturned';
export type GroupVisibility = 'public' | 'unlisted' | 'private';

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
  difficulty?: GroupDifficulty | null;
  form_level?: GroupFormLevel | null;
  topic?: string | null;
  goals?: string | null;
  session_length_minutes?: number | null;
  session_frequency?: string | null;
  price_per_session?: number | null;
  price_per_course?: number | null;
  price_monthly?: number | null;
  pricing_model?: GroupPricingModel;
  pricing_mode?: GroupPricingMode;
  availability_window?: string | null;
  media_gallery?: string[] | null;
  recurrence_type?: GroupRecurrenceTypeV2;
  recurrence_rule?: string | null;
  timezone?: string;
  max_students?: number;
  cover_image?: string | null;
  header_image?: string | null;
  content_blocks?: unknown;
  status?: GroupPublishStatus;
  visibility?: GroupVisibility;
  require_join_requests?: boolean;
  grace_period_days?: number;
  auto_suspend_missed_payment?: boolean;
  created_at: string;
  updated_at?: string;
  archived_at: string | null;
  archived_reason?: string | null;
}

export interface GroupWithTutor extends Group {
  tutor: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'rating_average' | 'rating_count'>;
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
  profile?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> & { role?: string | null };
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
  recurrence_rule?: string | null;
  timezone?: string;
  meeting_platform?: 'ZOOM' | 'GOOGLE_MEET' | 'INTERNAL' | null;
  created_at: string;
  updated_at?: string;
}

export interface GroupSessionWithOccurrences extends GroupSession {
  occurrences: GroupOccurrence[];
}

export interface GroupOccurrence {
  id: string;
  group_session_id: string;
  title?: string | null;
  scheduled_start_at: string;
  scheduled_end_at: string;
  status: OccurrenceStatus;
  cancelled_at: string | null;
  cancellation_note: string | null;
  meeting_provider?: string | null;
  meeting_external_id?: string | null;
  meeting_join_url?: string | null;
  meeting_created_at?: string | null;
  meeting_link?: string | null;
  meeting_platform?: 'ZOOM' | 'GOOGLE_MEET' | 'INTERNAL' | null;
  timezone?: string;
  occurrence_index?: number | null;
  is_cancelled?: boolean;
  updated_at?: string;
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

export interface GroupEnrollment {
  id: string;
  student_id: string;
  group_id: string;
  session_id: string | null;
  enrollment_type: GroupEnrollmentType;
  status: GroupEnrollmentStatus;
  payment_status: GroupPaymentStatus;
  payment_ref: string | null;
  enrolled_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  // Subscription billing columns
  plan_price_ttd?: number | null;
  original_price_ttd?: number | null;
  discount_percent?: number | null;
  discounted_price_ttd?: number | null;
  promotion_id?: string | null;
  promotion_applied_at?: string | null;
  promotion_duration_days_snapshot?: number | null;
  promotion_expires_at?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  next_payment_due_at?: string | null;
  grace_period_ends_at?: string | null;
  grace_period_days_snapshot?: number | null;
  last_paid_at?: string | null;
  activated_subscription_payment_id?: string | null;
  pending_payment_expires_at?: string | null;
  reminder_count?: number;
  last_reminder_sent_at?: string | null;
  cancel_at_period_end?: boolean;
  cancelled_at?: string | null;
  removal_reason?: string | null;
}

export interface GroupWaitlistEntry {
  id: string;
  student_id: string;
  group_id: string;
  joined_at: string;
  position: number;
  created_at: string;
  status?: GroupWaitlistStatus;
  offer_expires_at?: string | null;
  offered_at?: string | null;
  accepted_at?: string | null;
  expired_at?: string | null;
}

export interface GroupReview {
  id: string;
  reviewer_id: string;
  tutor_id: string;
  group_id: string;
  session_id: string;
  rating: number;
  comment: string | null;
  is_verified: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupAttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  status: GroupAttendanceStatus;
  marked_at: string;
  marked_by_id: string;
  created_at: string;
  updated_at: string;
}

// ============================
// REQUEST / FORM TYPES
// ============================

export interface CreateGroupInput {
  name: string;
  description?: string;
  topic?: string;
  subjects?: string[];
  subject?: string;
  difficulty?: GroupDifficulty;
  form_level?: GroupFormLevel;
  goals?: string;
  session_length_minutes?: number | null;
  session_frequency?: string | null;
  price_per_session?: number | null;
  price_per_course?: number | null;
  price_monthly?: number | null;
  pricing_model?: GroupPricingModel;
  pricing_mode?: GroupPricingMode;
  availability_window?: string | null;
  recurrence_type?: GroupRecurrenceTypeV2;
  recurrence_rule?: string | null;
  timezone?: string;
  max_students?: number;
  cover_image?: string | null;
  header_image?: string | null;
  media_gallery?: string[] | null;
  content_blocks?: unknown;
  status?: GroupPublishStatus;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string;
  subject?: string;
  difficulty?: GroupDifficulty;
  goals?: string;
  price_per_session?: number | null;
  price_monthly?: number | null;
  pricing_model?: GroupPricingModel;
  recurrence_type?: GroupRecurrenceTypeV2;
  recurrence_rule?: string | null;
  timezone?: string;
  max_students?: number;
  cover_image?: string | null;
  header_image?: string | null;
  content_blocks?: unknown;
  status?: GroupPublishStatus;
}

export interface CreateGroupSessionInput {
  title: string;
  recurrence_type: RecurrenceType;
  recurrence_days?: DayOfWeek[];
  start_time: string;
  duration_minutes: number;
  starts_on: string;
  ends_on?: string;
  timezone_offset?: number;
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
  form_level?: GroupFormLevel | '';
  min_rating?: number;
  min_price?: number;
  max_price?: number;
  session_frequency?: string;
  availability?: 'today' | 'this_week' | 'this_month' | '';
  day?: DayOfWeek;
}

// ============================
// SUBSCRIPTION ENTITIES
// ============================

export interface SubscriptionPayment {
  id: string;
  enrollment_id: string;
  group_id: string;
  student_id: string;
  type: SubscriptionPaymentType;
  amount_ttd: number;
  original_amount_ttd?: number | null;
  discount_percent?: number | null;
  promotion_id?: string | null;
  platform_fee_ttd: number;
  tutor_payout_ttd: number;
  status: SubscriptionPaymentStatus;
  period_start?: string | null;
  period_end?: string | null;
  activation_status?: 'pending' | 'succeeded' | 'failed' | null;
  activation_error?: string | null;
  lunipay_checkout_session_id?: string | null;
  lunipay_transaction_id?: string | null;
  receipt_url?: string | null;
  receipt_reference?: string | null;
  checkout_expires_at?: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  created_at: string;
}

export interface GroupRemoval {
  id: string;
  group_id: string;
  enrollment_id: string;
  student_id: string;
  tutor_id: string;
  with_cause: boolean;
  reason_category?: string | null;
  explanation?: string | null;
  evidence_url?: string | null;
  status: GroupRemovalStatus;
  admin_id?: string | null;
  admin_notes?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionRefund {
  id: string;
  payment_id: string;
  enrollment_id: string;
  group_removal_id?: string | null;
  amount_ttd: number;
  status: 'pending' | 'succeeded' | 'failed';
  lunipay_refund_id?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPaymentException {
  id: string;
  payment_id: string;
  enrollment_id: string;
  group_id: string;
  student_id: string;
  exception_type: 'activation_failed' | 'metadata_invalid' | 'enrollment_missing' | 'duplicate_payment' | 'capacity_conflict' | 'refund_required';
  status: 'open' | 'in_review' | 'resolved' | 'refunded' | 'duplicate';
  error_message?: string | null;
  admin_id?: string | null;
  admin_action?: string | null;
  admin_notes?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupAccessContext {
  has_access: boolean;
  enrollment_id?: string | null;
  status?: GroupEnrollmentStatus | null;
  payment_status?: GroupPaymentStatus | null;
  current_period_end?: string | null;
  grace_period_ends_at?: string | null;
  cancel_at_period_end?: boolean;
  next_payment_due_at?: string | null;
  waitlist_position?: number | null;
  waitlist_status?: GroupWaitlistStatus | null;
  offer_expires_at?: string | null;
  pending_payment_expires_at?: string | null;
}
