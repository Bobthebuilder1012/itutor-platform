import { redirect } from 'next/navigation';

export default function CurriculumRedirect() {
  redirect('/student/classes');
}
