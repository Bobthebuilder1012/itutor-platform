# The iTutor email design system

Every transactional email the platform sends is one of **fourteen families**.
Nothing writes email markup by hand any more.

```ts
import { renderEmail } from '@/lib/email/design';

const { subject, html, text } = renderEmail({
  family: 'booking-confirmation',
  subject: 'You are booked for CSEC Mathematics',
  heading: "You're booked for Mathematics",
  intro: 'Everything is confirmed. Here are your session details.',
  blocks: [
    { kind: 'details', rows: [
      { label: 'Tutor', value: 'Ms. Tricia Singh' },
      { label: 'Date',  value: 'Wednesday, 19 August 2026' },
    ] },
    { kind: 'paragraph', text: 'We will send you a reminder before it begins.' },
  ],
  cta: { label: 'View my booking', href: url },
});

await sendEmail({ to, subject, html, text });
```

**Always pass `text`.** Some readers are configured for text only and see an
empty message without it, and a missing text part costs deliverability with every
major filter.

## See them

`/api/email-gallery` renders all fourteen with sample content, from the same code
that sends them. Open it against any deployment. `?family=<key>` for one,
`&format=text` for its plain-text alternative.

## Pick a family

| Key | Covers |
| --- | --- |
| `authentication-action` | signup confirmation, password reset, email change, magic link, reauthentication, admin invitations |
| `verification-code` | email verification codes, future two-factor codes |
| `security-alert` | password / email / phone changes, suspicious activity, **and anything that changes who can spend money on an account** |
| `verification-outcome` | approved, rejected, more-information-required tutor verification |
| `booking-confirmation` | session booked, tutor booking notice, class joined, spot secured |
| `session-reminder` | today, 24-hour, one-hour and ten-minute reminders |
| `payment-receipt` | session, subscription and tutor payout receipts |
| `payment-problem` | failed charges, failed renewals, failed payouts |
| `refund-cancellation` | refund issued, session / class / subscription cancelled, a request declined |
| `schedule-change` | rescheduled, class time changed, class delayed, place lapsed, class paused |
| `welcome-onboarding` | student, parent and tutor welcome sequences, activation nudges |
| `invitation` | parent-child connections, platform invitations, referrals |
| `service-announcement` | outages, delays, apologies, resolutions, feedback notices, admin bulk sends |
| `marketing-campaign` | promotions, launches, product updates, seasonal campaigns |

If the email you are writing looks like one of the gallery samples with different
words, use that family. Do not add a fifteenth without a reason that survives
being said out loud.

The family sets the accent colour, the eyebrow, the badge glyph and whether the
footer calls the mail essential. Every one of those is overridable — a reminder
sets `badge: '24h'`, the approval request overrides `tone: 'warning'` because
nothing is held yet.

## Tones

Five, matched to what the reader has to do, not to a palette:

- `success` — something worked
- `alert` — something needs securing
- `warning` — money that did not go through, or a window that is closing
- `info` — a change to something already agreed
- `neutral` — a fact with no action attached

## Blocks

`paragraph`, `details`, `notice`, `code`, `card`, `steps`, `person`, `compare`,
`divider`, `fineprint`, and `html`.

Everything is escaped on the way in. **`html` is the one exception** — it exists
for content that genuinely is not a paragraph or a row (a tutor's written
feedback sections; the shared receipt fragment). Its name says so at the call
site so every use can be found with one search. Escape what you put in it.

## Two things that are not automatic

**Supabase Auth templates.** Nine emails — confirm signup, reset password, magic
link, change email, reauthentication, invite, and three "something changed"
notices — are sent by Supabase from HTML pasted into its dashboard. Nothing here
deploys them.

```bash
node scripts/render-email-templates.js          # write email-templates/*.html
node scripts/render-email-templates.js --check   # fail if stale (for CI)
```

Then paste each file into Supabase → Authentication → Emails, **for every
environment**. `{{ .ConfirmationURL }}` passes through the renderer untouched;
that is what `safeHref` in `render.ts` is for, and encoding it would leave every
confirmation link pointing at a dead path.

**Onboarding sequence rows.** The cron and the welcome-email route read
`email_templates` in the database, which is what admins edit in `/admin/emails`.
A stored row is a deliberate override and wins. A *missing* row falls back to
`lib/email-templates`, so restyling code changes what is sent only where no row
exists. To push the code versions over stored rows:

```bash
node scripts/sync-onboarding-email-templates.js --dry-run
node scripts/sync-onboarding-email-templates.js
```

It overwrites admin edits, which is why it is a separate command and why it
prints the Supabase project it is pointed at first.

## Constraints worth not relearning

- **Tables and inline styles.** Outlook renders through Word, Gmail rewrites
  classes, flexbox is unavailable across too much of the install base. The single
  `<style>` block carries only the mobile media query; nothing in it matters if a
  client drops it.
- **No web font.** Blocked by most clients, ignored by the rest. Inter is asked
  for first and falls through a system stack.
- **Absolute asset URLs, always production.** An email has no origin to resolve a
  relative path against, and `NEXT_PUBLIC_APP_URL` is a preview host everywhere
  but production — a logo that 404s in the inbox is the result.
- **`EMAIL_ALLOWLIST`** suppresses sends to anyone not listed. Staging is a
  branch of production and carries real customer addresses; set it before
  exercising anything that sends.
