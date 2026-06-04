export const PAID_CLASSES_DISABLED_MESSAGE =
  'Paid classes will be available shortly. During our initial launch period, tutors can host free classes only.';

export function isPaidClassesEnabled(): boolean {
  // Default to ENABLED — paid classes are in production.
  // Set PAID_CLASSES_ENABLED=false to explicitly disable.
  const val = (process.env.PAID_CLASSES_ENABLED ?? 'true').toLowerCase();
  return val !== 'false';
}

