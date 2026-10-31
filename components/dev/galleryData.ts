// DEV ONLY fixtures for /dev/verification-states. No backend, no real people.

import type { VerificationV2StateDto } from '@/lib/verificationV2/constants';
import type { Item } from '@/components/admin/verificationV2/AdminV2Queue';
import type { ReviewDetail } from '@/components/admin/verificationV2/AdminV2Review';
import type { PublicDetail } from '@/lib/verificationV2/publicView';
import { identityRouting } from '@/config/identityRouting';

export function mkState(
  over: Omit<Partial<VerificationV2StateDto>, 'identity'> & { identity?: Partial<VerificationV2StateDto['identity']> } = {}
): VerificationV2StateDto {
  const { identity, ...rest } = over;
  return {
    status: 'IN_PROGRESS',
    consentAt: '2026-10-01T10:00:00.000Z',
    submittedAt: null,
    decisionReason: null,
    reference: 'VR-7D3B1F42',
    editable: true,
    step: 2,
    credentials: [],
    extras: [],
    ...rest,
    identity: {
      status: null,
      reason: null,
      country: null,
      attempts: 0,
      maxAttempts: identityRouting.maxTotalAttempts,
      canRetry: false,
      furtherRoute: false,
      countries: identityRouting.countries,
      available: true,
      ...identity,
    },
  };
}

export const CREDENTIALS: VerificationV2StateDto['credentials'] = [
  { id: 'c1', kind: 'CSEC', subject: 'Mathematics', grade: 'I', examYear: 2019, school: null, degree: null, field: null, graduationYear: null, proofUrl: 'https://example.com/proof', proofFilename: null, hasProofFile: false },
  { id: 'c2', kind: 'DEGREE', subject: null, grade: null, examYear: null, school: 'University of the West Indies', degree: 'BSc', field: 'Physics', graduationYear: 2022, proofUrl: null, proofFilename: 'degree.pdf', hasProofFile: true },
];

export const EXTRAS: VerificationV2StateDto['extras'] = [
  { id: 'x1', title: 'Robotics club mentor', description: 'Ran the school robotics club for three years.', linkUrl: 'https://example.com/robotics' },
  { id: 'x2', title: 'Maths Olympiad coach', description: 'Coached two regional finalists.', linkUrl: null },
  { id: 'x3', title: 'Published study guide', description: 'CSEC Maths revision guide, 400 downloads.', linkUrl: 'https://example.com/guide' },
];

export const QUEUE_ITEMS: Item[] = [
  { tutorId: 't1', name: 'Tia Tutor', email: 'tia@example.com', status: 'IN_REVIEW', identityStatus: 'verified', submittedAt: '2026-10-02T09:00:00.000Z', decidedAt: null, credentialCount: 2, extraCount: 3 },
  { tutorId: 't2', name: 'Raj Teacher', email: 'raj@example.com', status: 'IN_REVIEW', identityStatus: 'verified', submittedAt: '2026-10-03T14:30:00.000Z', decidedAt: null, credentialCount: 1, extraCount: 0 },
];

export function mkDetail(
  over: Partial<ReviewDetail['application']> = {},
  provider: string | null = 'stripe',
  decisions: ReviewDetail['decisions'] = []
): ReviewDetail {
  return {
    tutor: { id: 't1', name: 'Tia Tutor', email: 'tia@example.com', profileStatus: 'PENDING' },
    application: {
      status: 'IN_REVIEW',
      consentAt: '2026-10-01T10:00:00.000Z',
      identity: { status: 'verified', errorCode: null, provider, providerCode: null, country: 'TT', attempts: 1, verifiedAt: '2026-10-01T10:05:00.000Z', redacted: false },
      submittedAt: '2026-10-02T09:00:00.000Z',
      decisionReason: null,
      decidedAt: null,
      filesDeleted: false,
      ...over,
    },
    credentials: [
      {
        id: 'c1', kind: 'CSEC', subject: 'Mathematics', grade: 'I', examYear: 2019, school: null, degree: null, field: null, graduationYear: null,
        proofUrl: null, proofFilename: 'results.pdf', proofLink: '#', proofDeleted: false,
        evidence: [
          { key: 'example-maths-csec', label: 'CSEC Mathematics (example placeholder)', criteria: ['TODO(policy): criteria specific to Mathematics'] },
          { key: 'csec-general', label: 'CSEC (general)', criteria: ['TODO(policy): minimum acceptable grade for teaching this subject', 'The candidate name on the proof matches the teacher’s ID-checked name'] },
        ],
      },
    ],
    extras: [{ id: 'x1', title: 'Robotics club mentor', description: 'Ran the school robotics club.', linkUrl: 'https://example.com/robotics' }],
    decisions,
  };
}

export const PANEL_DETAIL: PublicDetail = {
  idChecked: true,
  credentialsReviewed: true,
  hasExtras: true,
  verifiedAt: '2026-10-05T12:00:00.000Z',
  credentials: [
    { kind: 'CSEC', subject: 'Mathematics', grade: 'I', examYear: 2019, school: null, degree: null, field: null, graduationYear: null },
    { kind: 'DEGREE', subject: null, grade: null, examYear: null, school: 'University of the West Indies', degree: 'BSc', field: 'Physics', graduationYear: 2022 },
  ],
  extras: EXTRAS.map((e) => ({ title: e.title, description: e.description, linkUrl: e.linkUrl })),
};
