'use client';

/**
 * The waiting state, per the prototype: a checklist of steps that tick over,
 * above shimmering skeleton rows.
 *
 * The steps are honest about being an estimate rather than a trace — a job runs
 * as one provider call, so there is nothing real to report progress against.
 * They advance on a timer to show the thing is alive. What is NOT faked is
 * completion: the step list never reaches "done" on its own, because the job
 * finishing is what ends this component.
 */

import { useEffect, useState } from 'react';
import { Check, Loader2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS: Record<string, string[]> = {
  lesson: [
    'Reading the CSEC syllabus',
    'Ordering topics for teaching',
    'Writing objectives and homework',
    'Laying out the schedule',
  ],
  sheet: [
    'Reading the CSEC syllabus',
    'Selecting worked examples',
    'Writing practice questions',
    'Setting the page for print',
  ],
  quiz: [
    'Reading the CSEC syllabus',
    'Drafting the questions',
    'Checking answer keys',
    'Allocating marks',
  ],
};

const LEAD: Record<string, string> = {
  lesson: 'Building your plan…',
  sheet: 'Writing the sheet…',
  quiz: 'Writing the quiz…',
};

export default function AiGenerating({ flow }: { flow: string }) {
  const steps = STEPS[flow] ?? STEPS.sheet;
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Stops one short of the end. Claiming the last step is complete while the
    // job is still running would be a lie the user can see through.
    const timers = [900, 2200, 4000].map((ms, i) =>
      setTimeout(() => setStep(i + 1), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="w-full max-w-[680px] mx-auto">
      <div className="font-display text-[19px] font-bold tracking-tight">{LEAD[flow] ?? 'Working…'}</div>

      <div className="mt-5 space-y-2.5">
        {steps.map((label, i) => {
          const done = i < step;
          const now = i === step;
          return (
            <div key={label} className="flex items-center gap-2.5">
              <span
                className={cn(
                  'size-[18px] rounded-full grid place-items-center shrink-0',
                  done ? 'bg-brand text-white' : 'bg-surface-border text-ink-muted',
                  now && 'animate-pulse'
                )}
              >
                {done ? (
                  <Check className="size-3" />
                ) : now ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Circle className="size-2" />
                )}
              </span>
              <span className={cn('text-[13.5px]', done || now ? 'text-ink' : 'text-ink-muted')}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-7 space-y-3" aria-hidden>
        {[92, 100, 84, 96, 78, 90].map((w, i) => (
          <div
            key={i}
            className="h-3.5 rounded-md bg-muted animate-pulse"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>

      <p className="mt-6 text-[12.5px] text-ink-muted">
        This usually takes under a minute. You can leave this page — it will be in your history.
      </p>
    </div>
  );
}
