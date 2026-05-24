'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Star, Flame, FileText, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  MARKET_CLASSES,
  SUBJECTS,
  LOW_STOCK_THRESHOLD,
  classState,
  type MarketClass,
} from '@/lib/mock';
import ParentShell from '@/components/parent/ParentShell';

function ClassCard({ c }: { c: MarketClass }) {
  const state = classState(c);
  const remaining =
    c.kind === 'group' && c.seatsTotal !== undefined && c.seatsTaken !== undefined
      ? c.seatsTotal - c.seatsTaken
      : null;
  const isLowStock = remaining !== null && remaining > 0 && remaining <= LOW_STOCK_THRESHOLD;
  const isFull = state === 'full';

  const ctaText =
    state === 'full'
      ? 'Join waitlist'
      : state === 'approval-required'
        ? 'Request to join'
        : state === 'recurring-1on1'
          ? 'Confirm terms'
          : 'Enrol my child';

  return (
    <Link
      href={`/parent/classes/${c.id}`}
      className="group relative rounded-3xl border border-border bg-card overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col"
    >
      {isFull && (
        <div className="absolute inset-0 z-10 bg-ink/60 rounded-3xl flex items-start justify-end p-3">
          <span className="bg-ink text-white text-xs font-semibold px-3 py-1 rounded-full">
            Class Full · Waitlist
          </span>
        </div>
      )}

      <div
        className={cn(
          'relative h-24 bg-gradient-to-br flex items-end px-4 pb-3',
          c.bannerFrom,
          c.bannerTo,
        )}
      >
        {c.discountLabel && (
          <span className="absolute top-3 left-3 bg-coral text-white text-[11px] font-bold px-2 py-0.5 rounded-full z-20">
            {c.discountLabel}
          </span>
        )}
        <div className="size-12 rounded-2xl bg-white/20 backdrop-blur grid place-items-center text-2xl">
          {c.emoji}
        </div>
      </div>

      <div className="flex-1 flex flex-col p-4 gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-ink text-sm leading-snug">{c.title}</h3>
          <div className="flex items-center gap-1 shrink-0">
            <Star className="size-3 fill-coral text-coral" />
            <span className="text-xs font-semibold text-ink">{c.tutorRating}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-snug">
          by {c.tutorName} · {c.subject} · {c.level}
        </p>

        <span className="self-start bg-muted text-muted-foreground text-[11px] font-medium px-2 py-0.5 rounded-full">
          {c.formLevel}
        </span>

        <div className="flex flex-wrap gap-1.5">
          {c.includesParentFeedback && (
            <span className="inline-flex items-center gap-1 bg-brand-soft text-brand-deep text-[11px] font-medium px-2 py-0.5 rounded-full">
              <FileText className="size-3" /> Parent reports
            </span>
          )}
          {c.approvalRequired && (
            <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground text-[11px] font-medium px-2 py-0.5 rounded-full">
              <Lock className="size-3" /> Approval required
            </span>
          )}
        </div>

        {isLowStock && (
          <div className="inline-flex items-center gap-1 text-coral text-xs font-semibold">
            <Flame className="size-3" />
            Only {remaining} spot{remaining === 1 ? '' : 's'} left
          </div>
        )}

        <p className="text-xs text-muted-foreground">{c.schedule}</p>

        {c.kind === 'group' && c.seatsTotal !== undefined && c.seatsTaken !== undefined && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {c.seatsTaken}/{c.seatsTotal} enrolled
            </p>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  isLowStock ? 'bg-coral' : 'bg-brand',
                )}
                style={{ width: `${(c.seatsTaken / c.seatsTotal) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-auto pt-2 flex items-center justify-between border-t border-border">
          <div>
            <span className="font-bold text-ink text-sm">TT${c.price}</span>
            <span className="text-xs text-muted-foreground">/{c.billing === 'per-month' ? 'mo' : 'session'}</span>
          </div>
          <span
            className={cn(
              'text-xs font-semibold',
              isFull ? 'text-muted-foreground' : 'text-brand-deep',
            )}
          >
            {ctaText} →
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function ParentClassesPage() {
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('All');

  const filtered = useMemo(() => {
    return MARKET_CLASSES.filter((c) => {
      const matchesSubject = subject === 'All' || c.subject === subject;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        c.title.toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q) ||
        c.tutorName.toLowerCase().includes(q);
      return matchesSubject && matchesQuery;
    });
  }, [query, subject]);

  return (
    <ParentShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Find Classes</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Browse and enrol your child in a recurring group class or private 1:1 session.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search classes, subjects, tutors…"
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-muted border border-transparent focus:bg-background focus:border-brand focus:outline-none text-sm"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
          {SUBJECTS.map((s) => (
            <button
              key={s}
              onClick={() => setSubject(s)}
              className={cn(
                'shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors',
                s === subject
                  ? 'bg-ink text-white border-ink'
                  : 'bg-background border-border text-muted-foreground hover:border-ink/30',
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          {filtered.length} class{filtered.length !== 1 ? 'es' : ''}
          {query.trim() ? ` matching "${query.trim()}"` : ''}
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full flex flex-col items-center py-20 text-center gap-3">
              <div className="size-14 rounded-2xl bg-muted grid place-items-center text-2xl">🔍</div>
              <p className="font-semibold text-ink">
                No classes found{query ? ` for "${query}"` : ''}
              </p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Try a different subject or clear the search.
              </p>
            </div>
          ) : (
            filtered.map((c) => <ClassCard key={c.id} c={c} />)
          )}
        </div>
      </div>
    </ParentShell>
  );
}
