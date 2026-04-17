export const SHARED_CURRICULUM_ROLES = ['student', 'parent', 'reviewer', 'admin'] as const;

export type SharedCurriculumRole = (typeof SHARED_CURRICULUM_ROLES)[number];

export function isSharedCurriculumRole(role: string | undefined): role is SharedCurriculumRole {
  return Boolean(role && (SHARED_CURRICULUM_ROLES as readonly string[]).includes(role));
}
