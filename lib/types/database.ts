export type UserRole = 'student' | 'parent' | 'tutor' | 'admin';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  phone_number?: string;
  dob?: string;
  gender?: string;
  country?: string;
  country_code?: string;
  region?: string;
  school?: string;
  form_level?: string;
  subjects_of_study?: string[];
  tutor_subjects?: string[];
  teaching_levels?: string[];
  billing_mode?: 'parent_required' | 'self_allowed';
  tutor_type?: 'professional_teacher' | 'university_tutor' | 'graduate_tutor';
  teaching_mode?: 'online' | 'in_person' | 'both';
  response_time_minutes?: number;
  attendance_rate?: number;
  rating_average?: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
}

export interface ParentChildLink {
  id: string;
  parent_id: string;
  child_id: string;
  created_at: string;
}

export interface Subject {
  id: string;
  name: string;
  curriculum: 'CSEC' | 'CAPE';
  level: string;
  code?: string;
  created_at: string;
}

export interface TutorSubject {
  id: string;
  tutor_id: string;
  subject_id: string;
  price_per_hour_ttd: number;
  mode: 'online' | 'in_person' | 'either';
  created_at: string;
}

export interface Session {
  id: string;
  student_id: string;
  tutor_id: string;
  subject_id: string;
  payer_id: string;
  status: 'booked' | 'in_progress' | 'completed' | 'cancelled';
  payment_status: 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded';
  scheduled_start: string;
  scheduled_end: string;
  duration_minutes: number;
  price_per_hour_ttd: number;
  amount_ttd: number;
  created_at: string;
  updated_at: string;
}

export interface Rating {
  id: string;
  session_id: string;
  student_id: string;
  tutor_id: string;
  stars: number;
  comment?: string;
  created_at: string;
}

export interface TutorVerification {
  id: string;
  tutor_id: string;
  status: 'pending' | 'approved' | 'rejected';
  uploaded_doc_url: string;
  created_at: string;
  verified_at?: string;
  verified_by?: string;
  notes?: string;
}
