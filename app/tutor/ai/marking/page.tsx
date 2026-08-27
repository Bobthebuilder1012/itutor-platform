'use client';

import TutorShell from '@/components/tutor/TutorShell';
import AiNotBuiltYet from '@/components/ai/AiNotBuiltYet';

export default function MarkPapersPage() {
  return (
    <TutorShell>
      <AiNotBuiltYet
        title="Mark Papers"
        description="Upload a batch of scripts and get a suggested mark for each one, question by question, with every mark yours to change before a student or parent sees it."
        blockedOn="the CXC mark schemes and subject reports that teach it how each paper is marked"
      />
    </TutorShell>
  );
}
