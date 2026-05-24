export type LessonKind = 'group-recurring' | 'group-oneoff' | '1on1-recurring' | '1on1-oneoff';
export type LessonStatus = 'draft' | 'published' | 'full' | 'completed' | 'cancelled';
export type BillingModel = 'per-session' | 'per-month' | 'prepaid';
export type PromotionKind = 'early-bird' | 'time-limited' | 'open-ended';
export type ParentFeedbackMode = 'off' | 'included' | 'paid';
export type MemberStatus = 'invited' | 'active' | 'suspended' | 'removed';
export type PaymentCellStatus = 'paid' | 'pending' | 'overdue' | 'n/a';

export type ClassPromotion = {
  kind: PromotionKind;
  originalPrice: number;
  discountedPrice: number;
  endsAt?: string;
  seatCap?: number;
  label?: string;
};

export type EnrolledStudent = {
  studentId: string;
  name: string;
  paymentStatus: 'paid' | 'pending' | 'overdue';
  status?: MemberStatus;
  outstandingTtd?: number;
  joinedAt?: string;
};

export type TutorLesson = {
  id: string;
  title: string;
  kind: LessonKind;
  subject: string;
  level: string;
  description: string;
  bio?: string;
  startDate: string;
  recurrenceRule?: string;
  durationMin: number;
  pricingMode: 'per-session' | 'per-block' | 'per-student';
  rateTtd: number;
  capacity: number;
  enrollments: EnrolledStudent[];
  materialsCount: number;
  notes: string;
  status: LessonStatus;
  thumbnailGradient?: string;
  visibility?: 'public' | 'private' | 'unlisted';
  approvalRequired?: boolean;
  waitlistEnabled?: boolean;
  archived?: boolean;
  whatsappLink?: string;
  classroomLink?: string;
  videoProvider?: 'zoom' | 'google-meet' | 'itutor';
  totalSessionsRun?: number;
  earningsTtd?: number;
  avgAttendance?: number;
  retention?: number;
  rating?: number | null;
  reviewCount?: number;
  billingModel?: BillingModel;
  memberServiceFee?: number;
  autoSuspend?: boolean;
  graceWindowDays?: number;
  joinRequests?: boolean;
  primaryChannel?: 'native' | 'whatsapp' | 'classroom';
  parentFeedbackMode?: ParentFeedbackMode;
  parentFeedbackPrice?: number;
  promotion?: ClassPromotion | null;
};

export type RecurringRequest = {
  id: string;
  studentId: string;
  studentName: string;
  initials: string;
  subject: string;
  level: string;
  preferredTime: string;
  message: string;
  receivedAt: string;
};

export type FeedbackDraft = {
  id: string;
  studentId: string;
  studentName: string;
  initials: string;
  lessonId: string;
  lessonName: string;
  month: string;
  status: 'pending' | 'approved' | 'sent';
  stats: { attendance: string; sessionsAttended: number; sessionsScheduled: number };
  body: string;
  refinedByAi?: boolean;
};

export type StreamPost = {
  id: string;
  kind: 'announcement' | 'attachment' | 'link' | 'ai-recap';
  title: string;
  body: string;
  at: string;
  pinned?: boolean;
  attachmentName?: string;
  linkUrl?: string;
};

export type ClassState = 'open' | 'approval-required' | 'full' | 'awaiting-approval' | 'awaiting-consent' | 'recurring-1on1';

export type MarketClass = {
  id: string;
  title: string;
  subject: string;
  level: string;
  formLevel: string;
  tutorId: string;
  tutorName: string;
  tutorHue: number;
  tutorRating: number;
  tutorReviews: number;
  emoji: string;
  bannerFrom: string;
  bannerTo: string;
  price: number;
  originalPrice?: number;
  discountLabel?: string;
  billing: 'per-month' | 'per-session' | 'prepaid';
  billingDescription: string;
  schedule: string;
  cadence: string;
  seatsTaken: number;
  seatsTotal: number;
  includesParentFeedback: boolean;
  approvalRequired: boolean;
  kind: 'group' | 'recurring-1on1';
  shortBlurb: string;
  longDescription: string;
  whatsIncluded: string[];
  startDate: string;
};

export type EnrollmentStatus = 'active' | 'awaiting-consent' | 'awaiting-approval' | 'cancelled';

export type ChildEnrollment = {
  classId: string;
  classTitle: string;
  classEmoji: string;
  tutorName: string;
  subject: string;
  level: string;
  schedule: string;
  price: number;
  billing: 'per-month' | 'per-session' | 'prepaid';
  status: EnrollmentStatus;
  paidThrough?: string;
  nextSession?: string;
  enrolledSince: string;
};

export type FeedbackReport = {
  id: string;
  childId: string;
  classId: string;
  classTitle: string;
  tutorName: string;
  month: string;
  deliveredAt: string;
  stats: { attendance: string; sessionsAttended: number; sessionsScheduled: number; enrollmentLength: string };
  body: string;
};

export type Child = {
  id: string;
  name: string;
  initials: string;
  hue: number;
  ageLabel: string;
  school?: string;
  enrollments: ChildEnrollment[];
  feedback: FeedbackReport[];
};

export type PaymentEntry = {
  id: string;
  date: string;
  childName: string;
  classTitle: string;
  kind: 'consent' | 'renewal' | 'refund' | 'one-off';
  amount: number;
  status: 'paid' | 'pending-consent' | 'overdue' | 'refunded';
  method: string;
  note?: string;
};

// ── Meta ──────────────────────────────────────────────────────────────────────

export const LESSON_KIND_META: Record<LessonKind, { label: string; short: string; chip: string }> = {
  'group-recurring': { label: 'Group · Recurring', short: 'Group', chip: 'bg-brand-soft text-brand-deep' },
  'group-oneoff': { label: 'Group · One-off', short: 'One-off', chip: 'bg-lavender text-ink' },
  '1on1-recurring': { label: '1:1 · Recurring', short: '1:1', chip: 'bg-sky text-ink' },
  '1on1-oneoff': { label: '1:1 · Diagnostic', short: 'Diagnostic', chip: 'bg-peach text-ink' },
};

export const PROMO_INFO: Record<PromotionKind, { title: string; blurb: string }> = {
  'early-bird': { title: 'Early-bird', blurb: 'Discounted price for the first N students. Full price kicks in once seats are taken.' },
  'time-limited': { title: 'Time-limited', blurb: 'Discounted price until a set date. After that it reverts to full price automatically.' },
  'open-ended': { title: 'Open-ended discount', blurb: 'A permanent discount with no expiry. Good for loyalty pricing or long-term referrals.' },
};

export const SUBJECTS = ['All', 'Mathematics', 'Physics', 'Chemistry', 'English', 'Biology', 'Accounts'];
export const LOW_STOCK_THRESHOLD = 4;

export function classState(c: MarketClass): ClassState {
  if (c.kind === 'recurring-1on1') return 'recurring-1on1';
  if (c.seatsTaken >= c.seatsTotal) return 'full';
  if (c.approvalRequired) return 'approval-required';
  return 'open';
}

// ── Placeholder data ──────────────────────────────────────────────────────────

const iso = (offsetH: number) => new Date(Date.now() + offsetH * 36e5).toISOString();

export const PLACEHOLDER_LESSONS: TutorLesson[] = [
  {
    id: 'l1',
    title: 'CSEC Maths Crash Course',
    kind: 'group-recurring',
    subject: 'Mathematics',
    level: 'CSEC',
    description: '',
    bio: 'A 6-week sprint built around past-paper drills.',
    startDate: iso(48),
    recurrenceRule: 'Weekly · Sat 10:00 AM AST',
    durationMin: 90,
    pricingMode: 'per-session',
    rateTtd: 120,
    capacity: 12,
    thumbnailGradient: 'from-orange-500 to-amber-400',
    visibility: 'public',
    totalSessionsRun: 12,
    earningsTtd: 1440,
    avgAttendance: 92,
    retention: 85,
    rating: 4.8,
    reviewCount: 9,
    billingModel: 'per-session',
    memberServiceFee: 5,
    autoSuspend: true,
    graceWindowDays: 7,
    joinRequests: false,
    primaryChannel: 'native',
    parentFeedbackMode: 'included',
    parentFeedbackPrice: 0,
    promotion: {
      kind: 'early-bird',
      originalPrice: 150,
      discountedPrice: 120,
      endsAt: iso(24 * 14),
      label: 'Early-bird · ends in 2 weeks',
    },
    enrollments: [
      { studentId: 'u1', name: 'Aliyah Mohammed', paymentStatus: 'paid', status: 'active', joinedAt: iso(-24 * 40) },
      { studentId: 'u4', name: 'Sade Williams', paymentStatus: 'overdue', status: 'active', outstandingTtd: 180, joinedAt: iso(-24 * 30) },
    ],
    materialsCount: 6,
    notes: '',
    status: 'published',
  },
  {
    id: 'l2',
    title: 'CAPE Pure Maths – Unit 1',
    kind: 'group-recurring',
    subject: 'Pure Mathematics',
    level: 'CAPE',
    description: '',
    bio: 'Full Unit 1 coverage with weekly past-paper sets.',
    startDate: iso(72),
    recurrenceRule: 'Weekly · Tue 5:00 PM AST',
    durationMin: 120,
    pricingMode: 'per-block',
    rateTtd: 180,
    capacity: 8,
    thumbnailGradient: 'from-fuchsia-500 to-purple-500',
    visibility: 'public',
    totalSessionsRun: 18,
    earningsTtd: 3240,
    avgAttendance: 88,
    retention: 91,
    rating: 4.9,
    reviewCount: 14,
    billingModel: 'per-month',
    memberServiceFee: 5,
    autoSuspend: false,
    graceWindowDays: 7,
    joinRequests: true,
    primaryChannel: 'native',
    parentFeedbackMode: 'off',
    enrollments: [
      { studentId: 'u1', name: 'Aliyah Mohammed', paymentStatus: 'paid' },
      { studentId: 'u3', name: 'Keshawn Boodoo', paymentStatus: 'paid' },
    ],
    materialsCount: 9,
    notes: '',
    status: 'published',
  },
  {
    id: 'l3',
    title: 'Physics 1:1 – Devon',
    kind: '1on1-recurring',
    subject: 'Physics',
    level: 'CSEC',
    description: '',
    startDate: iso(26),
    recurrenceRule: 'Weekly · Wed 4:00 PM AST',
    durationMin: 60,
    pricingMode: 'per-session',
    rateTtd: 200,
    capacity: 1,
    thumbnailGradient: 'from-sky-500 to-cyan-400',
    visibility: 'private',
    totalSessionsRun: 7,
    earningsTtd: 1190,
    rating: 5,
    reviewCount: 2,
    billingModel: 'per-session',
    memberServiceFee: 0,
    autoSuspend: false,
    graceWindowDays: 7,
    joinRequests: false,
    primaryChannel: 'native',
    parentFeedbackMode: 'paid',
    parentFeedbackPrice: 50,
    enrollments: [{ studentId: 'u2', name: 'Devon Charles', paymentStatus: 'pending' }],
    materialsCount: 3,
    notes: '',
    status: 'published',
  },
  {
    id: 'l4',
    title: 'SBA Trial Run – Group',
    kind: 'group-oneoff',
    subject: 'Mathematics',
    level: 'Form 5',
    description: '',
    startDate: iso(120),
    durationMin: 120,
    pricingMode: 'per-student',
    rateTtd: 90,
    capacity: 10,
    thumbnailGradient: 'from-emerald-500 to-teal-400',
    visibility: 'public',
    totalSessionsRun: 0,
    earningsTtd: 90,
    rating: null,
    reviewCount: 0,
    billingModel: 'per-session',
    memberServiceFee: 5,
    enrollments: [{ studentId: 'u1', name: 'Aliyah Mohammed', paymentStatus: 'paid' }],
    materialsCount: 2,
    notes: '',
    status: 'published',
  },
];

export type TutorSession = {
  id: string;
  lessonId?: string;
  student: string;
  studentId?: string;
  subject: string;
  date: string;
  durationMin: number;
  type: '1-on-1' | 'Group';
  status: 'upcoming' | 'past' | 'pending';
  paymentStatus?: 'paid' | 'pending' | 'overdue';
  attendance?: 'attended' | 'no-show' | 'cancelled';
  reviewed?: boolean;
};

export const PLACEHOLDER_SESSIONS: TutorSession[] = [
  { id: 's1', lessonId: 'l3', student: 'Devon Charles', studentId: 'u2', subject: 'CSEC Physics', date: iso(4), durationMin: 60, type: '1-on-1', status: 'upcoming', paymentStatus: 'paid' },
  { id: 's2', lessonId: 'l1', student: 'Group · CSEC Maths (3)', subject: 'CSEC Maths Crash Course', date: iso(26), durationMin: 90, type: 'Group', status: 'upcoming' },
  { id: 's3', lessonId: 'l2', student: 'Group · CAPE Pure (2)', subject: 'CAPE Pure Maths', date: iso(50), durationMin: 120, type: 'Group', status: 'upcoming' },
  { id: 's4', lessonId: 'l3', student: 'Devon Charles', studentId: 'u2', subject: 'CSEC Physics', date: iso(-72), durationMin: 60, type: '1-on-1', status: 'past', attendance: 'attended', paymentStatus: 'paid', reviewed: true },
  { id: 's5', lessonId: 'l1', student: 'Aliyah Mohammed', studentId: 'u1', subject: 'CSEC Maths Crash Course', date: iso(-26), durationMin: 90, type: 'Group', status: 'past', attendance: 'attended', paymentStatus: 'paid', reviewed: true },
  { id: 's6', lessonId: 'l1', student: 'Sade Williams', studentId: 'u4', subject: 'CSEC Maths Crash Course', date: iso(-24 * 9), durationMin: 90, type: 'Group', status: 'past', attendance: 'no-show', paymentStatus: 'overdue', reviewed: false },
];

export const PLACEHOLDER_RECURRING_REQUESTS: RecurringRequest[] = [
  {
    id: 'rq1',
    studentId: 'u6',
    studentName: 'Trinity Hosein',
    initials: 'TH',
    subject: 'CSEC Add. Maths',
    level: 'CSEC',
    preferredTime: 'Sat 10:00 AM AST · weekly',
    message: "I've been struggling with algebra and need consistent weekly help before the June exams.",
    receivedAt: iso(-6),
  },
  {
    id: 'rq2',
    studentId: 'u7',
    studentName: 'Marcus Ali',
    initials: 'MA',
    subject: 'CAPE Pure Maths',
    level: 'CAPE',
    preferredTime: 'Wed 6:00 PM AST · weekly',
    message: 'Looking for Unit 1 tutoring starting this month.',
    receivedAt: iso(-26),
  },
];

export const PLACEHOLDER_FEEDBACK_DRAFTS: FeedbackDraft[] = [
  {
    id: 'fd1',
    studentId: 'u1',
    studentName: 'Aliyah Mohammed',
    initials: 'AM',
    lessonId: 'l1',
    lessonName: 'CSEC Maths Crash Course',
    month: 'May 2026',
    status: 'pending',
    stats: { attendance: '100%', sessionsAttended: 4, sessionsScheduled: 4 },
    body: '',
  },
  {
    id: 'fd2',
    studentId: 'u4',
    studentName: 'Sade Williams',
    initials: 'SW',
    lessonId: 'l1',
    lessonName: 'CSEC Maths Crash Course',
    month: 'May 2026',
    status: 'approved',
    stats: { attendance: '75%', sessionsAttended: 3, sessionsScheduled: 4 },
    body: 'Sade showed real improvement this month on quadratics. She struggled with word problems at first but by the final session was much more confident. Recommend continuing the extra problem sets.',
  },
  {
    id: 'fd3',
    studentId: 'u2',
    studentName: 'Devon Charles',
    initials: 'DC',
    lessonId: 'l3',
    lessonName: 'Physics 1:1 – Devon',
    month: 'May 2026',
    status: 'sent',
    stats: { attendance: '100%', sessionsAttended: 4, sessionsScheduled: 4 },
    body: 'Devon has been exceptional. He completed every worksheet ahead of time and scored in the top band on the May diagnostic. His SBA lab report structure has improved dramatically. Highly recommend he attempt Grade I.',
  },
];

export const PLACEHOLDER_STREAM_POSTS: StreamPost[] = [
  {
    id: 'sp1',
    kind: 'announcement',
    title: "📌 Bring past-paper booklets to Saturday's session",
    body: "Make sure you have the 2019–2023 booklet printed. We'll work Paper 2 Q1–5 together.",
    at: 'Pinned · 2 days ago',
    pinned: true,
  },
  {
    id: 'sp2',
    kind: 'ai-recap',
    title: "AI Recap · Saturday's session",
    body: 'Covered: simultaneous equations, word-problem translation, exam strategy for Paper 1 Section A. Next session: trig identities deep-dive.',
    at: 'Yesterday',
  },
  {
    id: 'sp3',
    kind: 'attachment',
    title: 'Worksheet · Trig Identities Drill',
    body: '20 questions, answer key included. Due before next session.',
    at: 'Yesterday',
    attachmentName: 'trig-drill-w8.pdf',
  },
  {
    id: 'sp4',
    kind: 'link',
    title: 'Useful video · Khan Academy Trig Identities',
    body: "10-minute primer before Saturday's class.",
    at: '3 days ago',
    linkUrl: 'https://khanacademy.org/math/trigonometry',
  },
];

export const MARKET_CLASSES: MarketClass[] = [
  {
    id: 'csec-maths-mastery',
    title: 'CSEC Maths Mastery',
    subject: 'Mathematics',
    level: 'CSEC',
    formLevel: 'Form 4–5 (14–16)',
    tutorId: 'ramdeen',
    tutorName: 'Mr. Ramdeen',
    tutorHue: 145,
    tutorRating: 4.95,
    tutorReviews: 211,
    emoji: '🧮',
    bannerFrom: 'from-brand',
    bannerTo: 'to-brand-deep',
    price: 220,
    billing: 'per-month',
    billingDescription: 'TT$220 / month · auto-renews · cancel anytime',
    schedule: 'Mondays · 5:00–7:00 PM AST',
    cadence: '4 sessions per month',
    seatsTaken: 10,
    seatsTotal: 12,
    includesParentFeedback: true,
    approvalRequired: false,
    kind: 'group',
    shortBlurb: 'Paper 1 & Paper 2 mastery with weekly past-paper drills.',
    longDescription: 'A focused weekly class taking you from algebra fundamentals through to full Paper 2 mastery.',
    whatsIncluded: [
      'Live group sessions every Monday',
      'Recordings posted within 24 hours',
      'Weekly past-paper worksheets',
      'Monthly parent feedback report',
    ],
    startDate: 'Ongoing · join anytime',
  },
  {
    id: 'physics-power-hour',
    title: 'Physics Power Hour',
    subject: 'Physics',
    level: 'CSEC',
    formLevel: 'Form 4–5 (14–16)',
    tutorId: 'ramdeen',
    tutorName: 'Mr. Ramdeen',
    tutorHue: 145,
    tutorRating: 4.9,
    tutorReviews: 128,
    emoji: '⚡',
    bannerFrom: 'from-sky',
    bannerTo: 'to-lavender',
    price: 160,
    originalPrice: 200,
    discountLabel: 'EARLY-BIRD 20% OFF',
    billing: 'per-month',
    billingDescription: 'TT$160 / month for early-bird (first 8 seats)',
    schedule: 'Wednesdays · 4:00–6:00 PM AST',
    cadence: '4 sessions per month',
    seatsTaken: 5,
    seatsTotal: 12,
    includesParentFeedback: true,
    approvalRequired: false,
    kind: 'group',
    shortBlurb: 'High-energy weekly physics with full-class problem solving.',
    longDescription: 'Two hours of focused physics: mechanics, waves, electricity, and a weekly Paper 1 sprint.',
    whatsIncluded: [
      'Live group sessions every Wednesday',
      'Notes pack + formulae sheets',
      'Recordings for missed sessions',
      'Monthly parent feedback report',
    ],
    startDate: 'Ongoing · join anytime',
  },
  {
    id: 'essay-lab',
    title: 'Essay Lab',
    subject: 'English',
    level: 'CSEC',
    formLevel: 'Form 4–5 (14–16)',
    tutorId: 'joseph',
    tutorName: 'Mr. Joseph',
    tutorHue: 20,
    tutorRating: 4.85,
    tutorReviews: 142,
    emoji: '📝',
    bannerFrom: 'from-coral',
    bannerTo: 'to-peach',
    price: 160,
    billing: 'per-month',
    billingDescription: 'TT$160 / month · includes written feedback',
    schedule: 'Tuesdays · 6:00–7:30 PM AST',
    cadence: '4 sessions per month + feedback',
    seatsTaken: 8,
    seatsTotal: 10,
    includesParentFeedback: false,
    approvalRequired: true,
    kind: 'group',
    shortBlurb: 'Build essay technique with personal written feedback every week.',
    longDescription: 'Small-group writing lab with line-by-line essay feedback.',
    whatsIncluded: [
      'Live writing workshops',
      'Personal written feedback',
      'Past-paper question bank',
      'Direct chat access',
    ],
    startDate: 'New cohort starts 1 June 2026',
  },
  {
    id: 'cape-chem-bootcamp',
    title: 'CAPE Chem Bootcamp',
    subject: 'Chemistry',
    level: 'CAPE',
    formLevel: 'Lower & Upper 6 (16–18)',
    tutorId: 'thomas',
    tutorName: 'Mr. Thomas',
    tutorHue: 165,
    tutorRating: 4.9,
    tutorReviews: 142,
    emoji: '🧪',
    bannerFrom: 'from-brand-deep',
    bannerTo: 'to-forest',
    price: 240,
    billing: 'per-month',
    billingDescription: 'TT$240 / month',
    schedule: 'Saturdays · 10:00 AM–12:00 PM AST',
    cadence: '4 sessions per month',
    seatsTaken: 12,
    seatsTotal: 12,
    includesParentFeedback: false,
    approvalRequired: false,
    kind: 'group',
    shortBlurb: 'Full CAPE Chemistry Unit 1 & 2 in one intensive cohort.',
    longDescription: 'Intensive Saturday bootcamp covering all CAPE Chemistry modules with weekly past-paper practice.',
    whatsIncluded: [
      'Live Saturday sessions',
      'Full syllabus coverage',
      'Weekly past papers',
    ],
    startDate: 'Ongoing',
  },
  {
    id: 'maths-1on1-weekly',
    title: 'Maths 1:1 – Weekly',
    subject: 'Mathematics',
    level: 'CSEC',
    formLevel: 'Form 3–5 (13–16)',
    tutorId: 'ramdeen',
    tutorName: 'Mr. Ramdeen',
    tutorHue: 145,
    tutorRating: 4.95,
    tutorReviews: 211,
    emoji: '📐',
    bannerFrom: 'from-brand',
    bannerTo: 'to-emerald-400',
    price: 200,
    billing: 'per-session',
    billingDescription: 'TT$200 / session · billed monthly',
    schedule: "Flexible · student's choice",
    cadence: 'Weekly 1:1 session',
    seatsTaken: 0,
    seatsTotal: 1,
    includesParentFeedback: true,
    approvalRequired: false,
    kind: 'recurring-1on1',
    shortBlurb: "Private weekly maths with Mr. Ramdeen. Confirm recurring terms to get started.",
    longDescription: "A dedicated weekly 1:1 slot tailored entirely to your child's weak points.",
    whatsIncluded: [
      'Dedicated 1:1 weekly session',
      'Personalised problem sets',
      'Monthly parent feedback report',
      'Direct WhatsApp access',
    ],
    startDate: 'Flexible · starts next week',
  },
];

export const CHILDREN: Child[] = [
  {
    id: 'aliyah',
    name: 'Aliyah Mohammed',
    initials: 'AM',
    hue: 145,
    ageLabel: 'Form 5 · 16 yrs',
    school: 'Bishop Anstey High',
    enrollments: [
      {
        classId: 'csec-maths-mastery',
        classTitle: 'CSEC Maths Mastery',
        classEmoji: '🧮',
        tutorName: 'Mr. Ramdeen',
        subject: 'Mathematics',
        level: 'CSEC',
        schedule: 'Mondays · 5:00–7:00 PM AST',
        price: 220,
        billing: 'per-month',
        status: 'active',
        paidThrough: '30 June 2026',
        nextSession: 'Mon 26 May · 5:00 PM',
        enrolledSince: 'March 2026',
      },
      {
        classId: 'essay-lab',
        classTitle: 'Essay Lab',
        classEmoji: '📝',
        tutorName: 'Mr. Joseph',
        subject: 'English',
        level: 'CSEC',
        schedule: 'Tuesdays · 6:00–7:30 PM AST',
        price: 160,
        billing: 'per-month',
        status: 'awaiting-approval',
        nextSession: '—',
        enrolledSince: 'Requested May 2026',
      },
    ],
    feedback: [
      {
        id: 'fb1',
        childId: 'aliyah',
        classId: 'csec-maths-mastery',
        classTitle: 'CSEC Maths Mastery',
        tutorName: 'Mr. Ramdeen',
        month: 'May 2026',
        deliveredAt: '2026-05-30T14:00:00Z',
        stats: { attendance: '100%', sessionsAttended: 4, sessionsScheduled: 4, enrollmentLength: '3 months' },
        body: "Aliyah had an excellent month. Strong on algebra and quadratics — she's now first to volunteer for hard questions. Keep watching multi-step word problems where she loses marks rushing the setup. Next: two timed Paper 2 mocks and trig identities.",
      },
      {
        id: 'fb2',
        childId: 'aliyah',
        classId: 'csec-maths-mastery',
        classTitle: 'CSEC Maths Mastery',
        tutorName: 'Mr. Ramdeen',
        month: 'April 2026',
        deliveredAt: '2026-04-30T14:00:00Z',
        stats: { attendance: '100%', sessionsAttended: 4, sessionsScheduled: 4, enrollmentLength: '2 months' },
        body: 'A strong month. Completed every homework. Trig is now solid. Recommended focus for May: word-problem translation and Paper 2 timing.',
      },
    ],
  },
  {
    id: 'devon',
    name: 'Devon Charles',
    initials: 'DC',
    hue: 220,
    ageLabel: 'Form 3 · 13 yrs',
    school: 'Fatima College',
    enrollments: [
      {
        classId: 'physics-power-hour',
        classTitle: 'Physics Power Hour',
        classEmoji: '⚡',
        tutorName: 'Mr. Ramdeen',
        subject: 'Physics',
        level: 'CSEC',
        schedule: 'Wednesdays · 4:00–6:00 PM AST',
        price: 160,
        billing: 'per-month',
        status: 'active',
        paidThrough: '30 June 2026',
        nextSession: 'Wed 28 May · 4:00 PM',
        enrolledSince: 'April 2026',
      },
      {
        classId: 'csec-maths-mastery',
        classTitle: 'CSEC Maths Mastery',
        classEmoji: '🧮',
        tutorName: 'Mr. Ramdeen',
        subject: 'Mathematics',
        level: 'CSEC',
        schedule: 'Mondays · 5:00–7:00 PM AST',
        price: 220,
        billing: 'per-month',
        status: 'awaiting-consent',
        nextSession: '—',
        enrolledSince: 'Requested May 2026',
      },
    ],
    feedback: [],
  },
];

export const PAYMENT_HISTORY: PaymentEntry[] = [
  { id: 'ph1', date: '12 May 2026', childName: 'Aliyah Mohammed', classTitle: 'CSEC Maths Mastery', kind: 'renewal', amount: 220, status: 'paid', method: 'Visa ·· 4242' },
  { id: 'ph2', date: '5 May 2026', childName: 'Aliyah Mohammed', classTitle: 'Essay Lab', kind: 'consent', amount: 0, status: 'pending-consent', method: '—', note: 'Awaiting tutor approval' },
  { id: 'ph3', date: '12 Apr 2026', childName: 'Aliyah Mohammed', classTitle: 'CSEC Maths Mastery', kind: 'renewal', amount: 220, status: 'paid', method: 'Visa ·· 4242' },
  { id: 'ph4', date: '1 Apr 2026', childName: 'Devon Charles', classTitle: 'Physics Power Hour', kind: 'consent', amount: 160, status: 'paid', method: 'Visa ·· 4242' },
  { id: 'ph5', date: '15 Mar 2026', childName: 'Aliyah Mohammed', classTitle: 'CSEC Maths Mastery', kind: 'consent', amount: 220, status: 'paid', method: 'Visa ·· 4242' },
];

export function paymentStatusForChild(c: Child): 'all-paid' | 'overdue' | 'pending' {
  const hasPending = c.enrollments.some((e) => e.status === 'awaiting-consent' || e.status === 'awaiting-approval');
  if (hasPending) return 'pending';
  return 'all-paid';
}
