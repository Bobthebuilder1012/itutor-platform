import { redirect } from 'next/navigation';

export default function AdminDegreesPage() {
  redirect('/reviewer/verification/queue');
}
