/**
 * Class Match Week for teachers — moved into My Classes.
 *
 * The campaign surface is now the second tab of /tutor/classes, beside the
 * classes it depends on. This route stays as a redirect rather than being
 * deleted: it is the destination baked into the landing page's teacher path,
 * into /class-match-week/teach, and into anything already sent to a teacher,
 * and a 404 for a campaign we are actively recruiting for is the one outcome
 * worth avoiding.
 *
 * /tutor/business?tab=class-match-week, the previous home, forwards here too —
 * see the redirect effect in app/tutor/business/page.tsx.
 */

import { redirect } from 'next/navigation';

export default function TutorClassMatchWeekPage() {
  redirect('/tutor/classes?tab=class-match-week');
}
