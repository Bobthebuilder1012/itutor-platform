import { redirect } from 'next/navigation';

// Consolidated into the unified /admin tree. Kept as a redirect so existing
// bookmarks and email links keep working.
export default function Page({ params }: { params: { requestId: string } }) {
  redirect(`/admin/verification/${params.requestId}`);
}
