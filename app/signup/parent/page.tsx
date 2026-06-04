import { redirect } from 'next/navigation';

// Parent accounts not yet live — redirect all parent signup attempts
export default function ParentSignupPage() {
  redirect('/parent/coming-soon');
}
