export const USD_PAYOUTS_DISABLED_MESSAGE =
  'USD payouts are not available right now.';

export function isUsdPayoutsEnabled(): boolean {
  // Default OFF. This moves real money in a second currency, so it must be
  // switched on deliberately with USD_PAYOUTS_ENABLED=true.
  //
  // Turning it off stops tutors ELECTING USD. It deliberately does not
  // touch rows already stamped USD in payout_ledger or the rate cron: money
  // earned under USD is still owed in USD, and flipping the switch must not
  // strand it or re-price it.
  return (process.env.USD_PAYOUTS_ENABLED ?? 'false').toLowerCase() === 'true';
}
