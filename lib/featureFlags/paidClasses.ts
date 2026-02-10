export const PAID_CLASSES_DISABLED_MESSAGE =
  'Paid classes will be available shortly. During our initial launch period, tutors can host free classes only.';

export function isPaidClassesEnabled(): boolean {
  // Default to disabled for safety during launch.
  return (process.env.PAID_CLASSES_ENABLED || '').toLowerCase() === 'true';
}

