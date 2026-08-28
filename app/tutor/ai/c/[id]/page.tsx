'use client';

/**
 * One conversation.
 *
 * Was a 15-line "not built yet" placeholder with no input of any kind, which is
 * what E1(b) was about: once inside a flow a tutor could only tap chips. This is
 * the real surface — transcript, streaming replies, and a composer that takes
 * free text.
 *
 * If the conversation produced an artifact, it is rendered above the transcript
 * so "make it harder" has something visible to refer to.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import TutorShell from '@/components/tutor/TutorShell';
import AiChat, { type ChatMessage } from '@/components/ai/AiChat';
import AiArtifact, { type AiArtifactData } from '@/components/ai/AiArtifact';

interface ConversationMeta {
  id: string;
  title: string;
  task_type: string;
  artifact_type: string | null;
  artifact_id: string | null;
}

/**
 * Next requires useSearchParams to sit inside a Suspense boundary, or the
 * build fails during prerender. The fallback matches the loading skeleton
 * below so the boundary is invisible.
 */
export default function AiConversationPage() {
  return (
    <Suspense
      fallback={
        <TutorShell>
          <div className="w-full max-w-[680px] mx-auto h-40" aria-busy />
        </TutorShell>
      }
    >
      <ConversationView />
    </Suspense>
  );
}

function ConversationView() {
  const params = useParams();
  const searchParams = useSearchParams();
  const conversationId = String(params?.id ?? '');
  // Carried from the hub composer so the question is not retyped on arrival.
  const ask = searchParams?.get('ask') ?? undefined;

  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [artifact, setArtifact] = useState<AiArtifactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!conversationId) return;
    try {
      const res = await fetch(`/api/ai/conversations/${conversationId}/messages`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) return;

      const json = await res.json();
      setMeta(json.conversation);
      setMessages(json.messages ?? []);

      // The artifact this conversation is about, if it made one.
      const artifactId = json.conversation?.artifact_id;
      if (artifactId) {
        const jobRes = await fetch(`/api/ai/jobs/${artifactId}`);
        if (jobRes.ok) {
          const { job } = await jobRes.json();
          if (job?.output_ref) setArtifact(job.output_ref as AiArtifactData);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <TutorShell>
        <div className="w-full max-w-[680px] mx-auto space-y-3" aria-busy>
          {[92, 78, 86, 64].map((w, i) => (
            <div
              key={i}
              className="h-3.5 rounded-md bg-muted animate-pulse"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      </TutorShell>
    );
  }

  if (notFound) {
    return (
      <TutorShell>
        <div className="w-full max-w-[680px] mx-auto text-center py-16">
          <h1 className="font-display text-[20px] font-bold tracking-tight">
            That conversation isn&apos;t here
          </h1>
          <p className="mt-2 text-[13.5px] text-ink-muted">
            It may have been removed, or it belongs to another account.
          </p>
        </div>
      </TutorShell>
    );
  }

  return (
    <TutorShell>
      <AiChat
        conversationId={conversationId}
        title={meta?.title}
        initialMessages={messages}
        autoSend={ask}
        header={
          artifact ? (
            <AiArtifact data={artifact} onStartOver={() => undefined} showActions={false} />
          ) : undefined
        }
      />
    </TutorShell>
  );
}
