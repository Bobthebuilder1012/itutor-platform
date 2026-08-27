'use client';

import TutorShell from '@/components/tutor/TutorShell';
import AiNotBuiltYet from '@/components/ai/AiNotBuiltYet';

export default function AiConversationPage() {
  return (
    <TutorShell>
      <AiNotBuiltYet
        title="Reopening a conversation"
        description="Your history is being recorded now, so nothing is lost. Opening a past plan, sheet or quiz back up arrives with the flows themselves."
      />
    </TutorShell>
  );
}
