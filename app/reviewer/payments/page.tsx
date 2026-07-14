import { redirect } from 'next/navigation';

// Merged into the canonical Finance overview at /admin/payments. The richer
// per-session transaction view now lives at /admin/payments/one-on-one.
// Kept as a redirect so existing bookmarks and email links keep working.
export default function Page() {
  redirect('/admin/payments');
}
