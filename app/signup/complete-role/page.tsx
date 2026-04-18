import { redirect } from 'next/navigation';

export default function CompleteRoleRedirect() {
  redirect('/signup');
}
