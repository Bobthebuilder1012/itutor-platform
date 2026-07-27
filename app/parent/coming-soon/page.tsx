import { redirect } from 'next/navigation';

// Parent accounts are LIVE. This legacy "coming soon" URL now forwards to the
// parent dashboard so any stale bookmark / history entry / old link resolves
// correctly instead of showing the retired coming-soon screen.
export default function ParentComingSoonPage() {
  redirect('/parent/dashboard');
}
