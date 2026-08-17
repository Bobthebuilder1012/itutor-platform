/**
 * Class Match Week for teachers — moved into My Business.
 *
 * The campaign surface now lives as a tab at /tutor/business?tab=class-match-week,
 * beside the promotions and pricing a teacher already manages. This route stays
 * as a redirect rather than being deleted: it is the destination baked into the
 * landing page's teacher path, into /class-match-week/teach, and into anything
 * already sent to a teacher, and a 404 for a campaign we are actively recruiting
 * for is the one outcome worth avoiding.
 */

import { redirect } from 'next/navigation';

export default function TutorClassMatchWeekPage() {
  redirect('/tutor/business?tab=class-match-week');
}
