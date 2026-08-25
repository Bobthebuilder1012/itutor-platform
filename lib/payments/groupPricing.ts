// One answer to "does this class cost money?", so the join path and the
// checkout cannot disagree about it.
//
// THE TRAP: pricing_model is 'MONTHLY' on every group row — it is the default,
// and it describes the SHAPE of the pricing (a recurring class), not whether a
// price was ever set. Reading it as "paid" makes every free class look paid.
// A free class on staging is exactly this: pricing_model 'MONTHLY',
// price_monthly 0.00. The parent join route treated that as paid and answered
// "This class is paid. Use the subscribe flow" on a class the page had just
// shown as Free — for every free class, not one misconfigured row.
//
// The only honest test is the one the checkout itself can act on: a MONTHLY
// class with a price above zero. Nothing else can be charged for, so nothing
// else may be refused as paid.

export type GroupPricingFields = {
  pricing_model?: string | null;
  /** numeric from PostgREST, so it can arrive as the string "0.00". */
  price_monthly?: number | string | null;
  price_per_session?: number | string | null;
  price_per_course?: number | string | null;
};

const positive = (v: number | string | null | undefined): boolean => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0;
};

/** Subscribable: exactly what createGroupSubscriptionCheckout can charge for. */
export function isPaidGroup(group: GroupPricingFields | null | undefined): boolean {
  if (!group) return false;
  return (group.pricing_model ?? null) === 'MONTHLY' && positive(group.price_monthly);
}

/**
 * Any price at all, whatever the model. Wider than isPaidGroup on purpose: a
 * route that hands out a seat for nothing needs to refuse everything priced,
 * not only what the monthly checkout happens to cover.
 */
export function hasAnyPrice(group: GroupPricingFields | null | undefined): boolean {
  if (!group) return false;
  return (
    positive(group.price_monthly) ||
    positive(group.price_per_session) ||
    positive(group.price_per_course)
  );
}
