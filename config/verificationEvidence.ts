// Evidence criteria a reviewer checks a credential against.
//
// ALL PLACEHOLDERS. The real criteria per subject and level are an open policy
// decision. The admin review page shows whatever matches, and falls back to the
// generic rule for the credential kind. Add routes here; no code change needed.

export type EvidenceKind = 'CSEC' | 'CAPE' | 'DEGREE';

export interface EvidenceRoute {
  key: string;
  label: string;
  kind: EvidenceKind;
  /** Empty = applies to every subject / level of that kind. Matched case-insensitively, substring. */
  subjects: string[];
  levels: string[];
  /** What the reviewer should see before approving. Shown verbatim. */
  criteria: string[];
}

export const evidenceRoutes: EvidenceRoute[] = [
  {
    key: 'csec-general',
    label: 'CSEC (general)',
    kind: 'CSEC',
    subjects: [],
    levels: [],
    criteria: [
      'TODO(policy): minimum acceptable grade for teaching this subject',
      'TODO(policy): accepted proof (results slip, CXC verification, other)',
      'The candidate name on the proof matches the teacher’s ID-checked name',
    ],
  },
  {
    key: 'cape-general',
    label: 'CAPE (general)',
    kind: 'CAPE',
    subjects: [],
    levels: [],
    criteria: [
      'TODO(policy): minimum acceptable grade/unit for teaching this subject',
      'TODO(policy): accepted proof',
      'The candidate name on the proof matches the teacher’s ID-checked name',
    ],
  },
  {
    key: 'degree-general',
    label: 'Degree (general)',
    kind: 'DEGREE',
    subjects: [],
    levels: [],
    criteria: [
      'TODO(policy): which degrees count, and for which subjects',
      'TODO(policy): accepted proof (certificate, transcript, letter)',
      'The name on the proof matches the teacher’s ID-checked name',
    ],
  },
  // Example of a subject-specific route. Delete or replace.
  {
    key: 'example-maths-csec',
    label: 'CSEC Mathematics (example placeholder)',
    kind: 'CSEC',
    subjects: ['mathematics', 'math'],
    levels: [],
    criteria: ['TODO(policy): criteria specific to Mathematics'],
  },
];

/** Routes that apply to one credential: specific routes first, then the generic one. */
export function evidenceFor(
  kind: EvidenceKind,
  subject?: string | null,
  level?: string | null,
  routes: EvidenceRoute[] = evidenceRoutes
): EvidenceRoute[] {
  const s = (subject ?? '').toLowerCase();
  const l = (level ?? '').toLowerCase();
  const matches = routes.filter(
    (r) =>
      r.kind === kind &&
      (r.subjects.length === 0 || r.subjects.some((x) => s.includes(x.toLowerCase()))) &&
      (r.levels.length === 0 || r.levels.some((x) => l.includes(x.toLowerCase())))
  );
  // More specific (has subject/level filters) first.
  return matches.sort(
    (a, b) => b.subjects.length + b.levels.length - (a.subjects.length + a.levels.length)
  );
}
