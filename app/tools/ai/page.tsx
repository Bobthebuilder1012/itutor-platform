/**
 * v1 AI marking tool — retired.
 *
 * The tool that lived here was shut down on 7 July 2026 and its route handlers
 * (`app/api/ai/mark-paper`, `app/api/ai/usage`) were deleted in the iTutor AI v2
 * ground-clearing. This path is kept as a stub rather than removed because three
 * places in the app still link to it — the student sidebar in
 * `components/DashboardLayout.tsx`, and the two group-stream cards
 * (`TutorStreamView`, `AssignmentPostCard`) which push `/tools/ai?source=lesson`.
 * Deleting the route would 404 all three, plus every stale bookmark.
 *
 * Marking returns as the Mark Papers flow inside the hub at `/tutor/ai`.
 */
import AiMaintenanceNotice from '@/components/AiMaintenanceNotice';

export const metadata = { title: 'iTutor AI' };

export default function RetiredAiToolPage() {
  return <AiMaintenanceNotice />;
}
