import { redirect } from 'next/navigation';

export default function OnboardingStudentRedirect() {
  redirect('/signup');
}
