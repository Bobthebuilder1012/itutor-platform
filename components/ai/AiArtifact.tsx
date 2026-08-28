'use client';

/**
 * Renders what a job produced.
 *
 * One component for three artifact kinds because they share the same frame —
 * title, actions, body — and differ only in how the body is laid out. The full
 * treatments the brief specifies (an .ics/PDF/CSV export and drag-reorder on
 * the plan, a print-accurate A4 preview on the sheet, Google Forms delivery on
 * the quiz) are the remaining flow work; this renders the content faithfully
 * and honestly stops short of claiming those.
 *
 * Nothing here is editable yet. Showing an edit affordance that discards the
 * edit on reload would be worse than showing none.
 */

import { CalendarRange, FileText, ListChecks, Printer, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SheetSection {
  heading: string;
  kind: 'FORMULAE' | 'WORKED_EXAMPLE' | 'PRACTICE' | 'CHECKLIST';
  items: string[];
}

interface PlanSession {
  index: number;
  week: number;
  topic: string;
  objective: string;
  homework?: string;
  weak_area?: boolean;
}

interface QuizQuestion {
  number: number;
  prompt: string;
  type: 'MCQ' | 'SHORT' | 'EXTENDED';
  marks: number;
  options?: string[];
  correct_answer?: string;
  worked_solution?: string;
}

export interface AiArtifactData {
  kind?: 'STUDY_SHEET' | 'LESSON_PLAN' | 'QUIZ';
  title?: string;
  subtitle?: string;
  summary?: string;
  sections?: SheetSection[];
  sessions?: PlanSession[];
  questions?: QuizQuestion[];
}

const ICON = {
  STUDY_SHEET: FileText,
  LESSON_PLAN: CalendarRange,
  QUIZ: ListChecks,
};

const SECTION_LABEL: Record<SheetSection['kind'], string> = {
  FORMULAE: 'Key formulae',
  WORKED_EXAMPLE: 'Worked example',
  PRACTICE: 'Practice',
  CHECKLIST: 'Before you hand this in',
};

export default function AiArtifact({
  data,
  onStartOver,
}: {
  data: AiArtifactData;
  onStartOver: () => void;
}) {
  const kind = data.kind ?? 'STUDY_SHEET';
  const Icon = ICON[kind] ?? FileText;

  return (
    <div className="w-full max-w-[680px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="size-9 shrink-0 rounded-xl bg-brand-light text-brand-dark grid place-items-center">
          <Icon className="size-[18px]" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-[20px] font-bold tracking-tight truncate">
            {data.title ?? 'Your result'}
          </h1>
          {(data.subtitle || data.summary) && (
            <p className="text-[13px] text-ink-muted truncate">{data.subtitle ?? data.summary}</p>
          )}
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-surface-border bg-background text-sm font-medium text-ink-muted hover:text-ink hover:border-ink/30 transition-all duration-200 active:scale-95"
        >
          <Printer className="size-3.5" /> Print
        </button>
      </div>

      <div className="mt-5 rounded-2xl border-2 border-surface-border bg-background overflow-hidden shadow-card">
        {/* ── Study sheet ─────────────────────────────────────────────── */}
        {data.sections?.map((section, i) => (
          <section key={i} className="px-[18px] py-4 border-b border-surface-border last:border-0">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
              {SECTION_LABEL[section.kind] ?? section.heading}
            </h2>
            <h3 className="mt-1 font-display text-[15px] font-bold tracking-tight">
              {section.heading}
            </h3>
            <ul
              className={cn(
                'mt-2.5 space-y-2 text-[13.5px] leading-relaxed',
                section.kind === 'PRACTICE' && 'list-decimal pl-5',
                section.kind === 'CHECKLIST' && 'list-disc pl-5'
              )}
            >
              {section.items.map((item, j) => (
                <li key={j} className={cn(section.kind === 'FORMULAE' && 'font-mono text-[13px]')}>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* ── Lesson plan ─────────────────────────────────────────────── */}
        {data.sessions && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-surface-border">
                  {['#', 'Week', 'Topic', 'Objective'].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-muted whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((s) => (
                  <tr key={s.index} className="border-b border-surface-border last:border-0 align-top">
                    <td className="px-3 py-3 text-[13px] tabular-nums text-ink-muted">{s.index}</td>
                    <td className="px-3 py-3 text-[13px] tabular-nums text-ink-muted whitespace-nowrap">
                      {s.week}
                    </td>
                    <td className="px-3 py-3 text-[13.5px] font-semibold">
                      {s.topic}
                      {s.weak_area && (
                        <span className="ml-2 px-1.5 py-px rounded-full bg-warning-bg text-warning-fg text-[9.5px] font-bold uppercase tracking-[0.05em]">
                          Weak area
                        </span>
                      )}
                      {s.homework && (
                        <div className="mt-1 text-[12px] font-normal text-ink-muted">
                          Homework: {s.homework}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[13px] text-ink-muted">{s.objective}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Quiz ────────────────────────────────────────────────────── */}
        {data.questions?.map((q) => (
          <section key={q.number} className="px-[18px] py-4 border-b border-surface-border last:border-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-bold tabular-nums">{q.number}.</span>
              <span className="flex-1 text-[13.5px] leading-relaxed">{q.prompt}</span>
              <span className="text-[11.5px] text-ink-muted whitespace-nowrap">
                [{q.marks} {q.marks === 1 ? 'mark' : 'marks'}]
              </span>
            </div>

            {q.options && (
              <ul className="mt-2 ml-6 space-y-1 text-[13px]">
                {q.options.map((opt, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-ink-muted">{String.fromCharCode(65 + i)})</span>
                    <span>{opt}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* The answer is for the tutor. A student never sees this view —
                delivery is the quiz flow's job, not this renderer's. */}
            {(q.correct_answer || q.worked_solution) && (
              <details className="mt-2.5 ml-6">
                <summary className="text-[12px] font-semibold text-brand-dark cursor-pointer">
                  Answer
                </summary>
                <div className="mt-1.5 text-[13px] text-ink-muted leading-relaxed">
                  {q.correct_answer && <div className="font-semibold text-ink">{q.correct_answer}</div>}
                  {q.worked_solution && <div className="mt-1">{q.worked_solution}</div>}
                </div>
              </details>
            )}
          </section>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={onStartOver}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-surface-border bg-background text-sm font-medium text-ink-muted hover:text-ink hover:border-ink/30 transition-all duration-200 active:scale-95"
        >
          <RotateCcw className="size-3.5" /> Start over
        </button>
      </div>

      <p className="mt-4 text-[12px] text-ink-muted leading-relaxed">
        Generated by iTutor AI. Check it before you hand it to a student — it can be wrong.
      </p>
    </div>
  );
}
