import { redirect } from 'next/navigation';
export default function LegacyClassRedirect({ params }: { params: { id: string } }) { redirect('/tutor/classes/' + params.id); }
