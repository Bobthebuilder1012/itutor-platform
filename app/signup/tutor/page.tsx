/**
 * /signup/tutor — a legacy URL, forwarded with the role intact.
 *
 * This was a CLIENT component doing `router.replace('/signup')` in an effect,
 * which meant three things went wrong at once: it needed JavaScript, it rendered
 * null (so a visible blank flash), and — the real bug — it DROPPED THE ROLE. A
 * tutor arriving here was asked "What brings you here?" on the very next screen,
 * one step after choosing "Teach on iTutor".
 *
 * A server redirect carrying `?role=tutor` fixes all three. SignupCard reads that
 * param into `presetRole` and skips its role step entirely.
 *
 * The picker at /start links straight to `/signup?role=tutor` rather than here.
 * This route survives only because the URL is already in the wild.
 */

import { redirect } from 'next/navigation';

export default function TutorSignupRedirect() {
  redirect('/signup?role=tutor');
}
