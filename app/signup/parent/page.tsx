import { redirect } from 'next/navigation';

// Parent signup now runs through the main signup flow (choose the parent role
// on /signup). This legacy entry just forwards there.
export default function ParentSignupPage() {
  redirect('/signup');
}
