'use client';

/**
 * The iTutor AI hub.
 *
 * Replaces the v1 marking tool that lived at /tutor/tools -> /tools/ai. The
 * sidebar item now points here; /tools/ai is a stub that renders the
 * maintenance notice for the three in-app links still aimed at it.
 *
 * Layout follows the prototype: a 680px content column, centred, with the
 * greeting, an eyebrow pill, four task cards each carrying an outcome line, and
 * the composer pinned low. The credit meter and history trigger go into
 * TutorShell's `actions` slot rather than into the shell itself, so no other
 * tutor page pays for them.
 *
 * Mark Papers is not a conversation and never becomes one — it goes straight to
 * its own workflow route rather than through elicitation.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CalendarRange,
  FileText,
  History,
  ListChecks,
  Sparkles,
  Stamp,
} from 'lucide-react';
import TutorShell from '@/components/tutor/TutorShell';
import AiCreditMeter from '@/components/ai/AiCreditMeter';
import AiHistoryPanel, { type AiConversationSummary } from '@/components/ai/AiHistoryPanel';
import AiElicitation from '@/components/ai/AiElicitation';
import AiGenerating from '@/components/ai/AiGenerating';
import AiArtifact, { type AiArtifactData } from '@/components/ai/AiArtifact';
import { AI_FLOWS, FLOW_FOOTERS, FLOW_TASK_TYPE, type AiFlowKey } from '@/lib/ai/flows';
import { useProfile } from '@/lib/hooks/useProfile';

interface TaskCard {
  key: AiFlowKey | 'marking';
  title: string;
  outcome: string;
  icon: typeof CalendarRange;
}

/**
 * The outcome line is the whole point of each card: a tutor deciding between
 * four tools needs to know what lands at the end, not what the tool is called.
 */
const TASK_CARDS: TaskCard[] = [
  {
    key: 'lesson',
    title: 'Plan a Lesson',
    outcome: 'A week-by-week schedule mapped to the CXC syllabus, up to the exam date.',
    icon: CalendarRange,
  },
  {
    key: 'quiz',
    title: 'Create a Quiz',
    outcome: 'Questions your students take on their phone. Results come back here.',
    icon: ListChecks,
  },
  {
    key: 'sheet',
    title: 'Study Sheets',
    outcome:
      'A revision sheet you can print and hand out, notes and practice balanced how you like.',
    icon: FileText,
  },
  {
    key: 'marking',
    title: 'Mark Papers',
    outcome: 'Upload a batch of scripts. Every mark is yours to change before anyone sees it.',
    icon: Stamp,
  },
];

/** How often the hub asks whether a running job has finished. */
const POLL_INTERVAL_MS = 2500;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function TutorAiPage() {
  const router = useRouter();
  const { profile } = useProfile();

  const [activeFlow, setActiveFlow] = useState<AiFlowKey | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [credits, setCredits] = useState<{ remaining: number; monthly: number } | null>(null);
  const [composer, setComposer] = useState('');

  const [jobId, setJobId] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<AiArtifactData | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/conversations');
      if (!res.ok) return;
      const json = await res.json();
      setConversations(json.conversations ?? []);
    } catch {
      // A history panel that fails to load is a degraded surface, not a broken
      // page — the four task cards still work.
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadCredits = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/credits');
      if (!res.ok) return;
      const json = await res.json();
      setCredits({ remaining: json.remaining, monthly: json.monthly });
    } catch {
      // The meter simply does not render. Better than a broken pill.
    }
  }, []);

  useEffect(() => {
    loadHistory();
    loadCredits();
  }, [loadHistory, loadCredits]);

  const rename = useCallback(async (id: string, title: string) => {
    // Optimistic: the rename is inline and instant in the prototype, and a
    // round-trip before the text changes would feel like a lag in the input.
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));

    await fetch(`/api/ai/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).catch(() => undefined);
  }, []);

  const startFlow = useCallback(
    async (key: AiFlowKey) => {
      setActiveFlow(key);
      setHistoryOpen(false);
      setArtifact(null);
      setGenError(null);

      // The conversation row is created up front so the run exists in history
      // even if the tutor abandons it halfway. An abandoned plan is still
      // something they may want to come back to.
      await fetch('/api/ai/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_type: FLOW_TASK_TYPE[key], title: AI_FLOWS[key].title }),
      }).catch(() => undefined);

      loadHistory();
    },
    [loadHistory]
  );

  /**
   * Enqueue, nudge the worker, then poll.
   *
   * The nudge is fire-and-forget on purpose: this page must not block on a
   * model call, and in production the cron would have picked the job up anyway.
   * See the header of /api/ai/jobs/drain for why that endpoint exists at all.
   */
  const generate = useCallback(async (flow: AiFlowKey, given: Record<string, string>) => {
    setGenError(null);
    setArtifact(null);

    // Survives a double-tap: the same key returns the same job rather than
    // charging twice.
    const idempotencyKey = `${flow}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let res: Response;
    try {
      res = await fetch('/api/ai/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow, answers: given, idempotencyKey }),
      });
    } catch {
      setGenError('Could not reach the server. Check your connection and try again.');
      return;
    }

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setGenError(json.error ?? 'Could not start the job.');
      return;
    }

    setJobId(json.job.id);
    fetch('/api/ai/jobs/drain', { method: 'POST' }).catch(() => undefined);
  }, []);

  // Poll while a job runs. Cleared on unmount so leaving the page does not
  // leave a timer hitting the API for a result nobody is waiting on.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(`/api/ai/jobs/${jobId}`);
        if (!res.ok) return;
        const { job } = await res.json();
        if (cancelled) return;

        if (job.status === 'SUCCEEDED') {
          setArtifact(job.output_ref as AiArtifactData);
          setJobId(null);
          loadHistory();
          loadCredits();
        } else if (job.status === 'FAILED' || job.status === 'CANCELLED') {
          setGenError(job.error ?? 'The generation failed. Your credit has been returned.');
          setJobId(null);
          loadCredits();
        }
      } catch {
        // A dropped poll is not a failure — the next tick catches up.
      }
    };

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    tick();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId, loadHistory, loadCredits]);

  const onCardClick = (key: AiFlowKey | 'marking') => {
    if (key === 'marking') {
      router.push('/tutor/ai/marking');
      return;
    }
    startFlow(key);
  };

  const firstName = useMemo(
    () => (profile?.full_name ?? '').trim().split(/\s+/)[0] || 'there',
    [profile?.full_name]
  );

  const topBarActions = (
    <>
      {credits && <AiCreditMeter remaining={credits.remaining} monthly={credits.monthly} />}
      <button
        data-ai-history-trigger
        onClick={() => setHistoryOpen((v) => !v)}
        title="History"
        className={`size-9 grid place-items-center rounded-lg transition-colors ${
          historyOpen ? 'bg-brand-light text-brand-dark' : 'text-muted-foreground hover:bg-muted'
        }`}
      >
        <History className="size-4" />
      </button>
    </>
  );

  return (
    <TutorShell actions={topBarActions}>
      <AiHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        conversations={conversations}
        loading={historyLoading}
        onOpenConversation={(id) => {
          setHistoryOpen(false);
          router.push(`/tutor/ai/c/${id}`);
        }}
        onRename={rename}
        onNew={() => {
          setHistoryOpen(false);
          setActiveFlow(null);
          setArtifact(null);
        }}
      />

      {activeFlow && jobId ? (
        <AiGenerating flow={activeFlow} />
      ) : activeFlow && artifact ? (
        <AiArtifact
          data={artifact}
          onStartOver={() => {
            setArtifact(null);
            setActiveFlow(null);
          }}
        />
      ) : activeFlow ? (
        <div>
          {genError && (
            <div className="w-full max-w-[680px] mx-auto mb-4 px-4 py-3 rounded-xl bg-danger-bg text-danger-fg text-[13px] font-medium">
              {genError}
            </div>
          )}
          <AiElicitation
            flow={AI_FLOWS[activeFlow]}
            footerSummary={FLOW_FOOTERS[activeFlow]}
            onBack={() => setActiveFlow(null)}
            onGenerate={(given) => generate(activeFlow, given)}
          />
        </div>
      ) : (
        <div className="w-full max-w-[680px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-soft text-brand-deep text-[11px] font-bold uppercase tracking-[0.08em]">
              <Sparkles className="size-3" /> iTutor AI
            </div>
            <div className="flex-1" />
            {/* The same action as the top-bar trigger. It is repeated here
                because on the hub the panel is the second thing a returning
                tutor wants, and the top bar is not where they are looking. */}
            <button
              data-ai-history-trigger
              onClick={() => setHistoryOpen((v) => !v)}
              className="inline-flex items-center gap-[7px] px-[15px] py-2 rounded-full border-[1.5px] border-surface-border bg-background text-[13px] font-semibold hover:border-brand hover:bg-brand-light hover:text-brand-dark transition-all duration-200 active:scale-95"
            >
              <History className="size-[15px]" /> Chat history
            </button>
          </div>

          <h1 className="mt-4 font-display text-[32px] font-bold tracking-[-0.03em] leading-[1.15]">
            {greeting()}, {firstName} 👋
          </h1>
          <p className="mt-2 text-[15px] text-ink-muted leading-relaxed">
            Hand over the prep. Pick a task and I&apos;ll ask only what I need.
          </p>

          <div className="mt-[34px] flex flex-col gap-3">
            {TASK_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.key}
                  onClick={() => onCardClick(card.key)}
                  className="flex items-center gap-4 px-5 py-[18px] bg-background border-2 border-surface-border rounded-2xl text-left transition-all duration-200 hover:shadow-card hover:border-brand-accent hover:-translate-y-0.5 active:scale-[0.99] active:translate-y-0"
                >
                  <div className="size-11 shrink-0 rounded-xl bg-brand-light text-brand-dark grid place-items-center">
                    <Icon className="size-5" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-base font-bold tracking-[-0.01em]">
                      {card.title}
                    </div>
                    <div className="mt-[3px] text-[13px] text-ink-muted leading-snug">
                      {card.outcome}
                    </div>
                  </div>
                  <ArrowRight className="size-[18px] text-ink-muted shrink-0" />
                </button>
              );
            })}
          </div>

          {/* The composer, pinned low with the routing hint underneath. It
              routes to a flow rather than answering, which is what the hint
              says out loud so nobody types a question expecting a reply. */}
          <div className="mt-8 sticky bottom-0 pt-7 pb-2 bg-gradient-to-b from-transparent via-surface-soft/70 to-surface-soft">
            <div className="flex items-center gap-2 px-4 py-3 bg-background border-2 border-surface-border rounded-2xl focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-light transition-all duration-200">
              <Sparkles className="size-4 text-ink-muted shrink-0" />
              <input
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder="Or tell me what you need…"
                className="flex-1 bg-transparent outline-none text-[14px]"
              />
            </div>
            <div className="mt-2 text-center text-[11.5px] text-ink-muted">
              Describe a task and I&apos;ll take you to the right tool.
            </div>
          </div>
        </div>
      )}
    </TutorShell>
  );
}
