/**
 * Whether credits may part-pay a month, with a card covering the rest.
 *
 * OFF BY DEFAULT, AND THAT IS DELIBERATE. Turning this on adds a real card
 * charge to a path that currently touches Stripe not at all, and the Stripe
 * test-mode checklist in docs/credits/STRIPE_TEST_MODE_CHECKLIST.md has never
 * been run. Ship it dark, work the checklist, then set
 * CREDIT_SUBSIDY_ENABLED=true.
 *
 * It gates scenario B only — one month of a class. It does not, and must not,
 * reach:
 *
 *   A  a renewal, which still takes credits only when they cover it whole;
 *   C  a NEW subscription, which never takes credits at all. That refusal is
 *      what stops a student with TT$100 against a TT$120 class subscribing at
 *      TT$20 and being billed TT$20 every month afterwards. A subsidised month
 *      is a ONE-OFF: it ends, and the student is invited to subscribe at the
 *      full price.
 *
 * An env flag rather than a credit_settings column on purpose. getCreditSettings
 * selects an explicit column list, so a settings column that shipped before its
 * migration was applied would break every credit read at once, not just this
 * feature.
 */
export function isCreditSubsidyEnabled(): boolean {
  return process.env.CREDIT_SUBSIDY_ENABLED === 'true';
}
