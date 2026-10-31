// ONE rule for "may we send to this person", used by every outbound email path and by
// every Customer.io call, so the answer is never re-derived at a call site.
//
//   production      EMAIL_ALLOWLIST unset or empty  -> send to everyone (unchanged)
//                   EMAIL_ALLOWLIST set             -> only the listed people (unchanged)
//   not production  EMAIL_ALLOWLIST unset or empty  -> send to NOBODY (fails closed)
//                   EMAIL_ALLOWLIST set             -> only the listed people
//
// Why: staging is a Supabase branch of production and holds real customer addresses.
// An environment that someone forgot to configure must not mail them.
//
// "Production" is VERCEL_ENV === 'production' on Vercel (staging is a preview or custom
// environment there, even though its NODE_ENV is also 'production'). Off Vercel it is
// NODE_ENV === 'production'. Anything else, including local development and tests, is
// not production.
//
// Format of EMAIL_ALLOWLIST: comma-separated; an entry beginning with `@` matches a whole
// domain; anything else must match the address exactly. Case-insensitive.

export type RecipientRefusal = 'no_allowlist_outside_production' | 'not_in_allowlist' | 'no_address';

export interface RecipientDecision {
  allowed: boolean;
  reason?: RecipientRefusal;
}

type Env = Record<string, string | undefined>;

export function isProductionRuntime(env: Env = process.env): boolean {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === 'production';
  return env.NODE_ENV === 'production';
}

export function allowlistEntries(env: Env = process.env): string[] {
  return (env.EMAIL_ALLOWLIST ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function checkRecipient(to: string | null | undefined, env: Env = process.env): RecipientDecision {
  const entries = allowlistEntries(env);
  if (entries.length === 0) {
    return isProductionRuntime(env) ? { allowed: true } : { allowed: false, reason: 'no_allowlist_outside_production' };
  }
  const recipient = (to ?? '').trim().toLowerCase();
  if (!recipient) return { allowed: false, reason: 'no_address' };
  const hit = entries.some((entry) => (entry.startsWith('@') ? recipient.endsWith(entry) : recipient === entry));
  return hit ? { allowed: true } : { allowed: false, reason: 'not_in_allowlist' };
}

/** True when outbound email may happen at all in this environment (not "to whom"). */
export function outboundEmailOpen(env: Env = process.env): boolean {
  return isProductionRuntime(env) || allowlistEntries(env).length > 0;
}

/** For logs: the domain only, never the address. */
export function domainOf(address: string | null | undefined): string {
  const at = (address ?? '').lastIndexOf('@');
  return at >= 0 ? (address as string).slice(at + 1).toLowerCase() : 'unknown';
}
