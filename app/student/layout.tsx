import { StudentShell } from '@/components/student/StudentShell';
import type { ReactNode } from 'react';

export default function StudentLayout({ children }: { children: ReactNode }) {
  return <StudentShell>{children}</StudentShell>;
}
