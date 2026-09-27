// =====================================================
// CUSTOMER.IO CONFIG + SAFETY GATE
// =====================================================
// Everything that decides WHETHER we talk to Customer.io lives here, so the
// answer is one function call and not a condition re-derived at each call site.
//
// Why a gate at all: Customer.io is an outbound email system, and this repo's
// staging environment holds real customer email addresses and sends to them for
// real. A profile sync is therefore not a read-only operation with a typo for a
// downside — it is the act of loading real people into a marketing tool that
// can mail them. So the integration is off unless explicitly switched on, and
// carries an allowlist for safely exercising it against a live-data database.

/** Track API regions. A US-region key silently 404s against the EU host. */
const REGIONS = {
  us: 'https://track.customer.io/api/v1',
  eu: 'https://track-eu.customer.io/api/v1',
} as const;

export type CustomerIoRegion = keyof typeof REGIONS;

export interface CustomerIoConfig {
  siteId: string;
  apiKey: string;
  baseUrl: string;
  /**
   * When non-empty, ONLY these lowercased emails are allowed to sync. This is
   * the switch that makes it safe to test against a database full of real
   * addresses: set it to your own inbox and nothing else can leave.
   */
  allowedEmails: ReadonlySet<string>;
  /** Sync accounts flagged is_dev_account. Off by default — they are noise. */
  includeDevAccounts: boolean;
}

function parseEmailList(raw: string | undefined): ReadonlySet<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map(entry => entry.trim().toLowerCase())
      .filter(entry => entry.length > 0)
  );
}

/**
 * Resolve config, or null when the integration is not fully switched on.
 *
 * Requires BOTH credentials and an explicit CUSTOMERIO_ENABLED=true. Presence
 * of credentials alone is not consent to start sending: a key pasted into an
 * env file while wiring things up should not begin mailing customers on the
 * next deploy.
 */
export function getCustomerIoConfig(): CustomerIoConfig | null {
  if (process.env.CUSTOMERIO_ENABLED !== 'true') return null;

  const siteId = process.env.CUSTOMERIO_SITE_ID?.trim();
  const apiKey = process.env.CUSTOMERIO_API_KEY?.trim();
  if (!siteId || !apiKey) return null;

  const region = (process.env.CUSTOMERIO_REGION?.trim().toLowerCase() ?? 'us') as CustomerIoRegion;

  return {
    siteId,
    apiKey,
    baseUrl: REGIONS[region] ?? REGIONS.us,
    allowedEmails: parseEmailList(process.env.CUSTOMERIO_ALLOWED_EMAILS),
    includeDevAccounts: process.env.CUSTOMERIO_INCLUDE_DEV_ACCOUNTS === 'true',
  };
}

export function isCustomerIoEnabled(): boolean {
  return getCustomerIoConfig() !== null;
}

/**
 * Whether one profile may be sent. Kept separate from getCustomerIoConfig so
 * the reconciler can report "skipped by allowlist" distinctly from "disabled",
 * which are very different things to see in a cron log.
 */
export function isProfileSyncable(
  config: CustomerIoConfig,
  profile: { email?: string | null; is_dev_account?: boolean | null }
): { allowed: boolean; reason?: string } {
  const email = profile.email?.trim().toLowerCase();

  // No email means nothing Customer.io can key a message to. Sending the row
  // anyway creates a permanently unreachable profile that still counts against
  // the plan's billable profile total.
  if (!email) return { allowed: false, reason: 'no_email' };

  if (!config.includeDevAccounts && profile.is_dev_account) {
    return { allowed: false, reason: 'dev_account' };
  }

  if (config.allowedEmails.size > 0 && !config.allowedEmails.has(email)) {
    return { allowed: false, reason: 'not_in_allowlist' };
  }

  return { allowed: true };
}

/** Basic auth header for the Track API: site id as user, api key as password. */
export function trackAuthHeader(config: CustomerIoConfig): string {
  return `Basic ${Buffer.from(`${config.siteId}:${config.apiKey}`).toString('base64')}`;
}
