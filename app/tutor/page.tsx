import { redirect } from 'next/navigation';

export default function TutorRootRedirect() {
  redirect('/tutor/dashboard');
}
