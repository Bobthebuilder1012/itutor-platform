export const TEACHER_ACTIVATION_DISABLED_MESSAGE =
  'Class invites are not available right now.';

export function isTeacherActivationEnabled(): boolean {
  // Default to ENABLED so staging, previews and local development get the
  // invite flow without configuration. Production sets
  // TEACHER_ACTIVATION_ENABLED=false to hold it back.
  //
  // No NEXT_PUBLIC_ prefix, deliberately. The browser learns the state from
  // /api/tutor/activation answering rather than from a bundled env var, so
  // flipping the flag cannot be defeated by a stale bundle or a saved URL.
  //
  // Turning this off stops NEW invites being created or sent. It deliberately
  // does NOT gate fulfilment, the reconciler cron or the admin metric: someone
  // who already holds an invitation must still be able to accept it and be
  // counted, or flipping the switch would strand real people mid-flow and blind
  // the numbers at the same time.
  const val = (process.env.TEACHER_ACTIVATION_ENABLED ?? 'true').toLowerCase();
  return val !== 'false';
}
