'use client';

/**
 * The chat-history panel.
 *
 * Geometry is taken from the prototype rather than eyeballed: floating at
 * top:52px right:24px, 448×560px, 16px radius, 2px border, z-index 70, with the
 * header pinned and only the list scrolling. On mobile it is not a shrunken
 * panel but a 620px bottom sheet with a 22px top radius over a 35% backdrop —
 * a different component shape for a different gesture.
 *
 * Two behaviours worth keeping when this is edited:
 *
 *   The filter earns its place because the panel shows fewer rows at once than
 *   a full-height rail would. A tutor with forty plans types two letters
 *   instead of scrolling.
 *
 *   Rename is inline, never a menu. Enter commits, Escape cancels the rename
 *   *without* closing the panel — one Escape, one thing undone.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { History, Pencil, PencilLine, Search, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AiTaskType = 'LESSON_PLAN' | 'QUIZ' | 'STUDY_SHEET' | 'MARKING' | 'GENERAL';

export interface AiConversationSummary {
  id: string;
  title: string;
  task_type: AiTaskType;
  /** Secondary line: "24 sessions", "12 of 20 responses", "3 days ago". */
  meta?: string;
  /** Optional status pill: Synced, Live, Draft. */
  tag?: string;
  tone?: 'info' | 'success' | 'neutral';
}

interface AiHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  conversations: AiConversationSummary[];
  loading?: boolean;
  onOpenConversation: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onNew: () => void;
}

/**
 * Group order is fixed rather than driven by recency. The panel is a place a
 * tutor learns the shape of — headers that reshuffle between openings make it
 * something to re-read every time.
 */
const GROUP_ORDER: { type: AiTaskType; label: string }[] = [
  { type: 'LESSON_PLAN', label: 'Lessons planned' },
  { type: 'STUDY_SHEET', label: 'Study sheets' },
  { type: 'QUIZ', label: 'Quizzes created' },
  { type: 'MARKING', label: 'Papers marked' },
  { type: 'GENERAL', label: 'Other' },
];

const TAG_TONE: Record<string, string> = {
  info: 'bg-brand-light text-brand-deep',
  success: 'bg-green-100 text-green-800',
  neutral: 'bg-muted text-ink-muted',
};

function useGroups(conversations: AiConversationSummary[], query: string) {
  return useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = needle
      ? conversations.filter(
          (c) =>
            c.title.toLowerCase().includes(needle) ||
            (c.meta ?? '').toLowerCase().includes(needle)
        )
      : conversations;

    return GROUP_ORDER.map(({ type, label }) => ({
      label,
      items: matched.filter((c) => c.task_type === type),
    })).filter((g) => g.items.length > 0);
  }, [conversations, query]);
}

export default function AiHistoryPanel({
  open,
  onClose,
  conversations,
  loading = false,
  onOpenConversation,
  onRename,
  onNew,
}: AiHistoryPanelProps) {
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const groups = useGroups(conversations, query);

  // Escape closes the panel — but only when a rename is not in flight, so the
  // first Escape cancels the rename and the second closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (renamingId) {
        setRenamingId(null);
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, renamingId, onClose]);

  // Clicking outside dismisses. Registered on mousedown rather than click so a
  // drag that starts inside the panel and ends outside does not close it.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current || panelRef.current.contains(e.target as Node)) return;
      // The trigger toggles on its own; closing here too would immediately
      // reopen it.
      if ((e.target as HTMLElement).closest('[data-ai-history-trigger]')) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose]);

  if (!open) return null;

  const startRename = (c: AiConversationSummary) => {
    setRenamingId(c.id);
    setDraft(c.title);
  };

  const commitRename = (id: string) => {
    const next = draft.trim();
    // An empty rename is a slip, not an instruction to erase the title.
    if (next && next !== conversations.find((c) => c.id === id)?.title) {
      onRename(id, next);
    }
    setRenamingId(null);
  };

  const isEmpty = !loading && conversations.length === 0;
  const noMatches = !loading && conversations.length > 0 && groups.length === 0;

  const body = (
    <>
      {/* Pinned header — filter and New stay put while the list scrolls. */}
      <div className="shrink-0 px-4 pt-3.5">
        <div className="flex items-center gap-2">
          <History className="size-4 text-ink-muted" />
          <div className="flex-1 font-display text-sm font-bold tracking-tight">History</div>
          <button
            onClick={onNew}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-ink-muted hover:bg-muted hover:text-ink transition-colors"
          >
            <Plus className="size-3.5" /> New
          </button>
          <button
            onClick={onClose}
            aria-label="Close history"
            className="lg:hidden size-8 grid place-items-center rounded-lg text-ink-muted hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="relative mt-2.5 mb-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by student, subject or name…"
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-muted border border-transparent focus:bg-background focus:border-brand focus:outline-none text-[13px]"
          />
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 pb-3">
        {loading && (
          <div className="px-2 py-6 space-y-3">
            {[92, 78, 86].map((w, i) => (
              <div key={i} className="h-3.5 rounded bg-muted animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}

        {isEmpty && (
          <div className="px-4 py-10 text-center">
            <div className="text-sm font-semibold text-ink">Nothing here yet</div>
            <div className="mt-1 text-xs text-ink-muted leading-relaxed">
              Plans, sheets and quizzes you make will collect here.
            </div>
          </div>
        )}

        {noMatches && (
          <div className="px-4 py-10 text-center">
            <div className="text-sm font-semibold text-ink">Nothing matches “{query}”</div>
            <button
              onClick={() => setQuery('')}
              className="mt-2 text-xs font-semibold text-brand-dark hover:underline"
            >
              Clear the filter
            </button>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.label}>
            {/* Sticky within the scroll container, so the header a tutor is
                reading under stays legible. */}
            <div className="sticky top-0 z-[2] px-2 pt-2.5 pb-1.5 bg-background text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
              {group.label}
            </div>

            {group.items.map((item) => (
              <div key={item.id} className="px-2 py-1.5 rounded-lg hover:bg-muted/60 transition-colors">
                {renamingId === item.id ? (
                  <div className="flex items-center gap-[7px] py-0.5">
                    <PencilLine className="size-3.5 text-ink-muted shrink-0" />
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commitRename(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(item.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border-2 border-brand outline-none text-[13.5px] font-semibold"
                    />
                    <span className="text-[10.5px] text-ink-muted whitespace-nowrap">Enter · Esc</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => onOpenConversation(item.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="text-[13.5px] font-semibold leading-tight truncate">{item.title}</div>
                      <div className="mt-[3px] text-[11.5px] text-ink-muted flex items-center gap-1.5">
                        {item.meta && <span className="truncate">{item.meta}</span>}
                        {item.tag && (
                          <span
                            className={cn(
                              'px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0',
                              TAG_TONE[item.tone ?? 'neutral']
                            )}
                          >
                            {item.tag}
                          </span>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={() => startRename(item)}
                      title="Rename"
                      className="opacity-45 hover:opacity-100 hover:bg-muted p-1.5 rounded-md shrink-0 transition-opacity"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: floating panel anchored under the top bar. */}
      <div
        ref={panelRef}
        className={cn(
          'hidden lg:flex absolute top-[52px] right-6 z-[70] w-[448px] max-h-[560px]',
          'flex-col bg-background border-2 border-surface-border rounded-2xl shadow-card overflow-hidden'
        )}
      >
        {body}
      </div>

      {/* Mobile: bottom sheet. A drag handle, not a close button, because the
          gesture people reach for on a sheet is a downward swipe. */}
      <div className="lg:hidden fixed inset-0 z-[70]">
        <div className="absolute inset-0 bg-black/35" onClick={onClose} />
        <div className="absolute inset-x-0 bottom-0 h-[620px] flex flex-col bg-background rounded-t-[22px] shadow-[0_-8px_30px_-12px_rgba(17,24,39,0.3)]">
          <div className="shrink-0 pt-2.5 pb-1 grid place-items-center">
            <div className="w-10 h-1 rounded-full bg-surface-border" />
          </div>
          {body}
        </div>
      </div>
    </>
  );
}
