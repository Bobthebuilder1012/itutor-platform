/**
 * /start — the front door. "What brings you to iTutor?"
 *
 * The Uber equivalent: Ride / Drive / Eats is one tap, and the tap decides which
 * product you are in. Ours is one product with three relationships to it, so the
 * labels are first-person about the person rather than nouns about the app.
 *
 * A SERVER COMPONENT WITH NO CLIENT JS OF ITS OWN. Three links. It works with
 * JavaScript disabled and on a cold cache, which matters because this is now the
 * first thing a visitor from a landing CTA sees.
 *
 * IT DELIBERATELY DOES NOT ACCEPT `searchParams`. Reading them would force this
 * route dynamic, and there is nothing worth reading: attribution already rides in
 * the httpOnly cookies middleware set before this rendered, so `utm_*` and `ref`
 * need no passthrough. Campaign creative that already knows the subject should
 * link straight past this to `/find?role=student&subject=…`. Do not add
 * searchParams here later without knowing that is the cost.
 *
 * WHY A SEPARATE ROUTE RATHER THAN MAKING /find THE ENTRY. `/find` carries a URL
 * contract — `?step=n` values are the STEP map, MatchResults deep-links into
 * them, and `/r/[code]` sends printed QR traffic there. A meaning-free `/start`
 * can be re-pointed without touching any of that. `/find` still renders the same
 * picker inline when it arrives with no `?role=`, so a deep link is never a dead
 * end.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isFinderEnabled } from '@/lib/featureFlags/finder';
import { isParentAccountsEnabled } from '@/lib/featureFlags/parentAccounts';
import RolePicker from '@/components/finder/RolePicker';

export const revalidate = 3600;

export const metadata = {
  title: 'Find your iTutor',
  description:
    'Tell us what you need and see the classes that fit — no account required.',
};

export default function StartPage() {
  // Flag off returns the visitor to the marketing site, not to a dashboard: this
  // page's whole audience is people without accounts.
  if (!isFinderEnabled()) redirect('/');

  // THE FLAG IS READ HERE FOR A REASON THAT IS NOT COSMETIC.
  //
  // `SignupCard` hides its parent role card behind PARENT_ACCOUNTS_ENABLED, but
  // skips its role step entirely when a role is preset — so a preset
  // `role=parent` sails past the check and creates a parent account regardless.
  // Offering "for my child" here while the flag is off would therefore ship a
  // parent funnel the product has switched off. Two cards instead.
  const parentAccountsEnabled = isParentAccountsEnabled();

  return (
    <main className="min-h-screen bg-mint/40 px-4 pb-16 pt-10 sm:pt-16">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/"
          aria-label="iTutor home"
          className="inline-flex text-[17px] font-semibold tracking-tight text-ink"
        >
          iTutor
        </Link>

        <h1 className="mt-8 text-[30px] font-semibold leading-tight tracking-tight text-ink sm:text-[34px]">
          What brings you to iTutor?
        </h1>
        <p className="mt-2.5 text-[15px] leading-snug text-ink-muted">
          Pick the one that sounds like you.
        </p>

        <RolePicker variant="page" parentAccountsEnabled={parentAccountsEnabled} />

        {/* The promise, stated before the questions rather than after them. It is
            the whole reason this screen exists instead of a signup form. */}
        <p className="mt-8 text-center text-[14px] text-ink-muted">
          See your matches before you sign up.
        </p>
        <p className="mt-2 text-center text-[14px] text-ink-muted">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-semibold text-brand-deep underline underline-offset-2"
          >
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
