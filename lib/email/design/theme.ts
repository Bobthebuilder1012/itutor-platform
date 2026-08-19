/**
 * The iTutor email design system — tokens and the fourteen families.
 *
 * Every transactional email the platform sends is one of fourteen shapes. That
 * is not a simplification for tidiness: it is what the audit found. "Session
 * booked", "tutor booking notice", "class joined" and "spot secured" are the
 * same email with different words, and were four separate hand-written HTML
 * strings that had drifted apart in padding, button colour, footer text and
 * company name. Naming the family makes the difference between them copy, which
 * is where it belongs.
 *
 * WHY INLINE STYLES AND TABLES. Email clients are not browsers. Outlook renders
 * through Word, Gmail strips <style> blocks in some contexts and rewrites
 * classes, and flexbox and grid are unavailable across enough of the install
 * base to be unusable. So layout is tables with role="presentation" and every
 * declaration is inline. The one <style> block carries the mobile media query
 * and nothing that matters if dropped.
 *
 * WHY NO WEB FONT. A font request from an email is blocked by most clients and
 * silently ignored by the rest, and a face that loads for some readers and not
 * others is worse than one that never loads. The gallery is set in Inter; this
 * asks for it first and falls through a system stack that looks close.
 */

/** Neutral and brand colours. Hex only — email clients are unreliable with modern colour syntax. */
export const palette = {
  /** The page behind the card. */
  canvas: '#f3f6f4',
  /** Header and footer bands, and body text at full strength. */
  ink: '#0b0d0b',
  inkSoft: '#152019',
  /** Body copy. */
  body: '#4f5d53',
  /** Captions, fine print, label columns. */
  muted: '#66736a',
  faint: '#8a968d',
  card: '#ffffff',
  /** Panel fills and hairlines. */
  panel: '#f7faf8',
  border: '#dce6df',
  borderStrong: '#c9d6cd',
  /** iTutor green. `brand` is the button; `brandInk` is green text on white. */
  brand: '#32d270',
  brandInk: '#13884a',
  brandWash: '#e6f9ed',
  white: '#ffffff',
} as const;

/**
 * A tone is the semantic colour of one email, and of the panels inside it.
 *
 * Four of them, matched to what the reader has to do: `success` for something
 * that worked, `alert` for something that needs securing, `warning` for money
 * that did not go through, `info` for a change to something already agreed, and
 * `neutral` for a fact with no action attached.
 */
export type Tone = 'success' | 'alert' | 'warning' | 'info' | 'neutral';

export type ToneColours = {
  /** The rule across the top of the card. */
  accent: string;
  /** Eyebrow text, and the glyph in the badge. */
  ink: string;
  /** Badge circle and panel fills. */
  wash: string;
  /** Panel hairline. */
  edge: string;
};

export const tones: Record<Tone, ToneColours> = {
  success: { accent: palette.brand, ink: palette.brandInk, wash: palette.brandWash, edge: '#bfe9cf' },
  alert:   { accent: '#e5484d',     ink: '#c62a30',        wash: '#fdf0f0',        edge: '#f5cdcf' },
  warning: { accent: '#f0932b',     ink: '#a85c07',        wash: '#fdf6ec',        edge: '#f4dcbb' },
  info:    { accent: '#2f6fed',     ink: '#1f56c4',        wash: '#eef3fe',        edge: '#c9d9fb' },
  neutral: { accent: palette.ink,   ink: palette.inkSoft,  wash: palette.panel,    edge: palette.border },
};

export const fontStack =
  "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

/** Monospace, for verification codes and receipt numbers. */
export const monoStack = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

/** The card is 600px wide — the widest that fits Outlook's reading pane without scaling. */
export const cardWidth = 600;

// ── Brand assets and links ───────────────────────────────────────────────────
//
// Absolute URLs, always. An email has no origin to resolve a relative path
// against, and NEXT_PUBLIC_APP_URL is a preview or localhost host in every
// environment except production — a logo that 404s in the reader's inbox is the
// result. These point at the production host on purpose, in every environment.

const SITE = 'https://myitutor.com';

export const brandAssets = {
  /** The wordmark for a dark band. */
  logoOnDark: `${SITE}/assets/logo/itutor-logo-dark.png`,
  logoWidth: 108,
  logoHeight: 32,
  site: SITE,
  termsUrl: `${SITE}/terms`,
  privacyUrl: `${SITE}/privacy`,
  supportEmail: 'hello@myitutor.com',
} as const;

/**
 * Footer socials. Icons are served by icons8 in white, because an email cannot
 * inline an SVG and every client that blocks images will fall back to the alt
 * text, which is the network's name.
 *
 * URLs match components/landing/Footer.tsx. The older email templates carried a
 * different Facebook share id and an instagram.com/myitutor handle that both
 * predate the current accounts; the footer on the site is the one that gets
 * checked, so it is the source of truth.
 */
export const socialLinks = [
  { label: 'Facebook',  href: 'https://www.facebook.com/share/18tvYgPa8J/?mibextid=wwXIfr', icon: 'https://img.icons8.com/ios-filled/50/ffffff/facebook-new.png' },
  { label: 'Instagram', href: 'https://www.instagram.com/itutor.site?igsh=MXgyNjdrMTR1ampyag%3D%3D&utm_source=qr', icon: 'https://img.icons8.com/ios-filled/50/ffffff/instagram-new.png' },
  { label: 'TikTok',    href: 'https://www.tiktok.com/@itutor.site?_r=1&_t=ZS-96r391xYFq0', icon: 'https://img.icons8.com/ios-filled/50/ffffff/tiktok.png' },
  { label: 'LinkedIn',  href: 'https://www.linkedin.com/company/myitutor/', icon: 'https://img.icons8.com/ios-filled/50/ffffff/linkedin.png' },
] as const;

/** The legal footer. Astronova Technologies Ltd is the operating company. */
export const companyDetails = {
  name: 'Astronova Technologies Ltd',
  address: 'Satnarine Tr, Cunupia, Trinidad & Tobago',
  /** Kept as a function so a January send does not claim last year. */
  copyright: () => `© ${new Date().getFullYear()} Astronova Technologies Ltd. All rights reserved.`,
} as const;

// ── The fourteen families ────────────────────────────────────────────────────

export type EmailFamily =
  | 'authentication-action'
  | 'verification-code'
  | 'security-alert'
  | 'verification-outcome'
  | 'booking-confirmation'
  | 'session-reminder'
  | 'payment-receipt'
  | 'payment-problem'
  | 'refund-cancellation'
  | 'schedule-change'
  | 'welcome-onboarding'
  | 'invitation'
  | 'service-announcement'
  | 'marketing-campaign';

export type FamilyDefinition = {
  /** Human name, for the reference gallery and for error messages. */
  title: string;
  /** What belongs in this family — the audit's grouping, kept next to the code. */
  covers: string;
  tone: Tone;
  /** Small uppercase line above the heading. */
  eyebrow: string;
  /**
   * The glyph in the badge circle. A character, not an image: an icon font is
   * unavailable and a 40px PNG per family is four hundred kilobytes of assets
   * to maintain for a tick.
   */
  badge: string;
  /**
   * Whether this is mail the reader cannot opt out of. Account, booking, money
   * and security mail is essential; campaigns are not, and say so differently
   * in the footer.
   */
  essential: boolean;
};

export const families: Record<EmailFamily, FamilyDefinition> = {
  'authentication-action': {
    title: 'Authentication Action',
    covers: 'signup confirmation, password reset, email change, magic link, reauthentication, admin invitations',
    tone: 'success',
    eyebrow: 'Action required',
    badge: '✓',
    essential: true,
  },
  'verification-code': {
    title: 'Verification Code',
    covers: 'email verification codes, and future two-factor codes',
    tone: 'success',
    eyebrow: 'Verification code',
    badge: '#',
    essential: true,
  },
  'security-alert': {
    title: 'Security Alert',
    covers: 'password, email or phone changes, and suspicious account activity',
    tone: 'alert',
    eyebrow: 'Security alert',
    badge: '!',
    essential: true,
  },
  'verification-outcome': {
    title: 'Verification Outcome',
    covers: 'approved, rejected and more-information-required tutor verification decisions',
    tone: 'success',
    eyebrow: 'Verification update',
    badge: '✓',
    essential: true,
  },
  'booking-confirmation': {
    title: 'Booking Confirmation',
    covers: 'session booked, tutor booking notice, class joined, spot secured',
    tone: 'success',
    eyebrow: 'Booking confirmed',
    badge: '✓',
    essential: true,
  },
  'session-reminder': {
    title: 'Session Reminder',
    covers: 'today, 24-hour, one-hour and ten-minute session or class reminders',
    tone: 'success',
    eyebrow: 'Starting soon',
    badge: '1h',
    essential: true,
  },
  'payment-receipt': {
    title: 'Payment Receipt',
    covers: 'session receipts, subscription receipts, tutor payout receipts',
    tone: 'success',
    eyebrow: 'Payment received',
    badge: '✓',
    essential: true,
  },
  'payment-problem': {
    title: 'Payment Problem',
    covers: 'failed charges, failed renewals, failed tutor payouts',
    tone: 'warning',
    eyebrow: 'Payment issue',
    badge: '!',
    essential: true,
  },
  'refund-cancellation': {
    title: 'Refund and Cancellation',
    covers: 'refund issued, session cancelled, class cancelled, subscription cancelled',
    tone: 'neutral',
    eyebrow: 'Cancellation confirmed',
    badge: '✓',
    essential: true,
  },
  'schedule-change': {
    title: 'Schedule and Class Change',
    covers: 'session rescheduled, class time changed, class delayed, place lapsed',
    tone: 'info',
    eyebrow: 'Schedule updated',
    badge: '↻',
    essential: true,
  },
  'welcome-onboarding': {
    title: 'Welcome and Onboarding',
    covers: 'student, parent and tutor welcome sequences, and activation nudges',
    tone: 'success',
    eyebrow: 'Welcome to iTutor',
    badge: '★',
    essential: true,
  },
  'invitation': {
    title: 'Invitation',
    covers: 'parent-child connections, platform invitations, future referral invitations',
    tone: 'success',
    eyebrow: "You're invited",
    badge: '+',
    essential: true,
  },
  'service-announcement': {
    title: 'Service Announcement',
    covers: 'outages, delayed payments, service issues, apologies, resolution notices',
    tone: 'info',
    eyebrow: 'Service update',
    badge: 'i',
    essential: true,
  },
  'marketing-campaign': {
    title: 'Marketing Campaign',
    covers: 'promotions, launches, product updates, seasonal campaigns, newsletters',
    tone: 'success',
    eyebrow: 'From iTutor',
    badge: '✦',
    essential: false,
  },
};
