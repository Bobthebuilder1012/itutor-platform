// /classes/[id] — legacy public class URL.
//
// QR codes printed before the marketplace redesign encode this path, and it
// rendered an older dark-themed view that also required a session, so scanning
// one while logged out went nowhere useful. It now redirects to the canonical
// class page, which renders for signed-out visitors and prompts for sign-in
// only at the point of joining.
//
// Kept as a redirect rather than deleted: the URL is on printed material we
// cannot recall.

import { redirect } from 'next/navigation';

export default function LegacyClassRedirect({ params }: { params: { id: string } }) {
  redirect(`/student/explore/${params.id}`);
}
