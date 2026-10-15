// Verification clean-up for account deletion.
//
// Called by app/api/delete-account/route.ts BEFORE the profile row is deleted,
// because the cascade would remove the Stripe session ids and file ownership
// that locate this data.
//
// IT MUST NEVER BLOCK OR BREAK ACCOUNT DELETION. It cannot throw (everything is
// caught), and it gives up after a time limit, so a hanging Stripe or Storage
// call cannot hold the request. A failure is logged with the user id and the
// residue (a Stripe session, a file) then needs removing by hand or by the
// retention sweep. Runs whatever the VERIFICATION_V2_ENABLED setting: privacy
// does not depend on a feature flag.

import { redactIdentitySessions } from './redaction';
import { deleteVerificationFiles } from './fileDeletion';

const DEFAULT_TIMEOUT_MS = 8000;

export interface AccountDeletionCleanup {
  ok: boolean;
  timedOut: boolean;
  details: string[];
}

export async function cleanupVerificationDataForAccountDeletion(
  userId: string,
  opts: { timeoutMs?: number } = {}
): Promise<AccountDeletionCleanup> {
  const details: string[] = [];
  let timedOut = false;

  const work = (async () => {
    try {
      // Stripe first: the ID data is the most sensitive.
      const redaction = await redactIdentitySessions({ tutorId: userId, force: true });
      if (!redaction.ok) details.push(`stripe: ${redaction.error}`);

      // Rows go with the profile cascade, so skip the row clean-up.
      const files = await deleteVerificationFiles({
        tutorId: userId,
        scope: 'all',
        reason: 'account_deletion',
        skipRowCleanup: true,
      });
      if (!files.ok) details.push(...files.errors.map((e) => `files: ${e}`));
    } catch (err) {
      details.push(`unexpected: ${(err as Error).message}`);
    }
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve();
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  });

  try {
    await Promise.race([work, limit]);
  } catch (err) {
    details.push(`unexpected: ${(err as Error).message}`);
  } finally {
    if (timer) clearTimeout(timer);
  }

  const ok = details.length === 0 && !timedOut;
  if (!ok) {
    console.error(
      `[verification-v2/account-deletion] cleanup incomplete for user ${userId}` +
        (timedOut ? ' (timed out)' : '') +
        (details.length ? `: ${details.join(' | ')}` : '')
    );
  }
  return { ok, timedOut, details };
}
