'use client';

/**
 * The shared elicitation component — three questions, then an editable summary
 * card. Used by Plan a Lesson, Study Sheets and Create a Quiz.
 *
 * The whole design rests on one decision: ask three things, infer the rest, and
 * show the inferences somewhere they can be corrected. Six sequential questions
 * would collect the same information and feel like a form. The summary card is
 * what makes it fast, and it only works if the AI-suggested values are visibly
 * labelled as suggestions — a tutor who cannot tell what they said from what was
 * guessed has to re-read everything, which costs more than the questions saved.
 *
 * Every question takes a tappable chip *or* free text. The chips are the common
 * cases, not the permitted ones; a tutor teaching something not on the list must
 * never be stuck.
 */

import { useState } from 'react';
import { ArrowLeft, Check, Pencil, RotateCcw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ElicitationQuestion {
  key: string;
  prompt: string;
  /** Common answers. Tappable, never exhaustive. */
  chips: string[];
  /** Placeholder for the free-text fallback. */
  freeform: string;
}

export interface SummaryFieldSpec {
  id: string;
  label: string;
  /**
   * True when the tutor answered this in the questions. Drives the
   * "you said" / "AI-suggested" label — the distinction the card exists for.
   */
  said?: boolean;
  /** When present the field edits as chips; otherwise as free text. */
  options?: string[];
}

export interface ElicitationFlow {
  title: string;
  questions: ElicitationQuestion[];
  /** Lead sentence above the summary card. */
  lead: string;
  summaryTitle: string;
  /** Label for the primary action, e.g. "Generate plan". */
  generateLabel: string;
  fields: SummaryFieldSpec[];
  /** Sensible starting values for the fields the tutor was not asked about. */
  defaults: Record<string, string>;
}

interface AiElicitationProps {
  flow: ElicitationFlow;
  /** One line under the card: "24 sessions · 3 Mar – 21 May · 14 weeks to exam". */
  footerSummary?: (answers: Record<string, string>) => string;
  onGenerate: (answers: Record<string, string>) => void;
  onBack: () => void;
  /** Optional extra control rendered inside the card, e.g. the sheet balance. */
  children?: (answers: Record<string, string>, set: (k: string, v: string) => void) => React.ReactNode;
}

export default function AiElicitation({
  flow,
  footerSummary,
  onGenerate,
  onBack,
  children,
}: AiElicitationProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({ ...flow.defaults });
  const [questionIndex, setQuestionIndex] = useState(0);
  const [freeText, setFreeText] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldDraft, setFieldDraft] = useState('');

  const askingDone = questionIndex >= flow.questions.length;
  const current = flow.questions[questionIndex];

  const setValue = (key: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const answer = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setValue(current.key, trimmed);
    setFreeText('');
    setQuestionIndex((i) => i + 1);
  };

  const restart = () => {
    setAnswers({ ...flow.defaults });
    setQuestionIndex(0);
    setFreeText('');
    setEditingField(null);
  };

  const commitField = (id: string) => {
    const next = fieldDraft.trim();
    if (next) setValue(id, next);
    setEditingField(null);
  };

  return (
    <div className="w-full max-w-[680px] mx-auto">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink transition-colors"
      >
        <ArrowLeft className="size-4" /> {flow.title}
      </button>

      {/* ── The questions answered so far, kept on screen ────────────────────
          A tutor who has answered three questions should be able to see all
          three; scrolling back to check what you told it is a small failure
          that happens constantly. */}
      <div className="mt-5 space-y-4">
        {flow.questions.slice(0, questionIndex).map((q) => (
          <div key={q.key} className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-ink-muted">{q.prompt}</div>
              <div className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-light text-brand-deep text-[13px] font-semibold">
                <Check className="size-3.5" />
                {answers[q.key]}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── The current question ─────────────────────────────────────────── */}
      {!askingDone && current && (
        <div className="mt-6">
          <div className="font-display text-[19px] font-bold tracking-tight leading-snug">
            {current.prompt}
          </div>

          <div className="mt-3.5 flex flex-wrap gap-2">
            {current.chips.map((chip) => (
              <button
                key={chip}
                onClick={() => answer(chip)}
                className="px-3.5 py-2 rounded-full border-[1.5px] border-surface-border bg-background text-[13px] font-semibold hover:border-brand hover:bg-brand-light hover:text-brand-dark transition-all duration-200 active:scale-95"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* The fallback is a peer of the chips, not a hidden "other" option. */}
          <div className="mt-3 flex items-center gap-2">
            <input
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') answer(freeText);
              }}
              placeholder={current.freeform}
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-muted border border-transparent focus:bg-background focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light text-[13.5px]"
            />
            <button
              onClick={() => answer(freeText)}
              disabled={!freeText.trim()}
              className="px-5 py-2.5 rounded-lg bg-ink text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ink/90 transition-all duration-200 active:scale-95 disabled:active:scale-100"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── The summary card ─────────────────────────────────────────────── */}
      {askingDone && (
        <div className="mt-6">
          <p className="text-[14px] text-ink-muted leading-relaxed">{flow.lead}</p>

          <div className="mt-4 rounded-2xl border-2 border-surface-border bg-background overflow-hidden shadow-card">
            <div className="flex items-center gap-2 px-[18px] py-3 border-b border-surface-border">
              <Sparkles className="size-4 text-brand-dark" />
              <div className="flex-1 font-display text-[15px] font-bold tracking-tight">
                {flow.summaryTitle}
              </div>
              <div className="text-[11.5px] text-ink-muted">Click any value to change it</div>
            </div>

            <div className="divide-y divide-surface-border">
              {flow.fields.map((field) => {
                const editing = editingField === field.id;
                const value = answers[field.id] || '—';

                return (
                  <div key={field.id} className="bg-background px-[18px] py-[13px]">
                    <div className="flex items-baseline gap-2">
                      <div className="w-[132px] shrink-0">
                        <div className="text-[12.5px] font-semibold text-ink">{field.label}</div>
                        {/* The label the whole card turns on. */}
                        <div className="text-[10.5px] text-ink-muted">
                          {field.said ? 'you said' : 'AI-suggested'}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        {!editing && (
                          <button
                            onClick={() => {
                              setEditingField(field.id);
                              setFieldDraft(answers[field.id] ?? '');
                            }}
                            className="group inline-flex items-center gap-1.5 text-left text-[13.5px] font-semibold hover:text-brand-dark transition-colors"
                          >
                            {value}
                            <Pencil className="size-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                          </button>
                        )}

                        {editing && field.options && (
                          <div className="flex flex-wrap gap-1.5">
                            {field.options.map((option) => {
                              const on = answers[field.id] === option;
                              return (
                                <button
                                  key={option}
                                  onClick={() => {
                                    setValue(field.id, option);
                                    setEditingField(null);
                                  }}
                                  className={cn(
                                    'px-3 py-1.5 rounded-full text-[12.5px] font-semibold border-[1.5px] transition-all duration-200 active:scale-95',
                                    on
                                      ? 'border-brand bg-brand-light text-brand-dark'
                                      : 'border-surface-border bg-background hover:border-brand'
                                  )}
                                >
                                  {option}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {editing && !field.options && (
                          <input
                            autoFocus
                            value={fieldDraft}
                            onChange={(e) => setFieldDraft(e.target.value)}
                            onBlur={() => commitField(field.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitField(field.id);
                              if (e.key === 'Escape') setEditingField(null);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border-2 border-brand outline-none ring-2 ring-brand-light text-[13.5px] font-semibold"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {children && (
              <div className="px-[18px] py-[13px] border-t border-surface-border">
                {children(answers, setValue)}
              </div>
            )}

            {footerSummary && (
              <div className="px-[18px] py-3 bg-surface-soft border-t border-surface-border text-[12.5px] font-semibold text-ink-muted">
                {footerSummary(answers)}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={restart}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-surface-border bg-background text-sm font-medium text-ink-muted hover:text-ink hover:border-ink/30 transition-all duration-200 active:scale-95"
            >
              <RotateCcw className="size-3.5" /> Start over
            </button>
            <div className="flex-1" />
            <button
              onClick={() => onGenerate(answers)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brand-dark transition-all duration-200 active:scale-95"
            >
              <Sparkles className="size-4" /> {flow.generateLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
