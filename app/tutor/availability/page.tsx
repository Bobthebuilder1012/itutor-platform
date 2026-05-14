'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import {
  getTutorAvailabilityRules,
  upsertAvailabilityRule,
  deleteAvailabilityRule,
} from '@/lib/services/bookingService';
import { TutorAvailabilityRule } from '@/lib/types/booking';
import TutorShell from '@/components/tutor/TutorShell';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 23 }, (_, i) => i + 1); // 1am–11pm

type Slot = { day: number; hour: number };

function rulesToSlots(rules: TutorAvailabilityRule[]): Slot[] {
  const slots: Slot[] = [];
  for (const rule of rules) {
    const startHour = parseInt(rule.start_time.split(':')[0]);
    const endHour = parseInt(rule.end_time.split(':')[0]);
    for (let h = startHour; h < endHour; h++) {
      slots.push({ day: rule.day_of_week, hour: h });
    }
  }
  return slots;
}

function slotsToRules(slots: Slot[]): { day_of_week: number; start_time: string; end_time: string }[] {
  const byDay = new Map<number, number[]>();
  for (const s of slots) {
    if (!byDay.has(s.day)) byDay.set(s.day, []);
    byDay.get(s.day)!.push(s.hour);
  }
  const rules: { day_of_week: number; start_time: string; end_time: string }[] = [];
  for (const [day, hours] of byDay.entries()) {
    const sorted = [...new Set(hours)].sort((a, b) => a - b);
    let start = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      const h = sorted[i];
      if (h === prev + 1) {
        prev = h;
      } else {
        rules.push({
          day_of_week: day,
          start_time: `${String(start).padStart(2, '0')}:00`,
          end_time: `${String(prev + 1).padStart(2, '0')}:00`,
        });
        start = h;
        prev = h;
      }
    }
  }
  return rules;
}

export default function TutorAvailabilityPage() {
  return (
    <TutorShell>
      <AvailabilityContent />
    </TutorShell>
  );
}

function AvailabilityContent() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  
  const [slots, setSlots] = useState<Slot[]>([]);
  const [existingRules, setExistingRules] = useState<TutorAvailabilityRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'tutor') { router.push('/login'); return; }
    loadRules(profile.id);
  }, [profile, loading, router]);

  async function loadRules(tutorId: string) {
    setDataLoading(true);
    try {
      const rules = await getTutorAvailabilityRules(tutorId);
      setExistingRules(rules);
      setSlots(rulesToSlots(rules));
    } finally {
      setDataLoading(false);
    }
  }

  const toggleSlot = (day: number, hour: number) => {
    setSlots((prev) =>
      prev.some((s) => s.day === day && s.hour === hour)
        ? prev.filter((s) => !(s.day === day && s.hour === hour))
        : [...prev, { day, hour }]
    );
    setSaved(false);
  };

  const copyMonToWeekdays = () => {
    const monSlots = slots.filter((s) => s.day === 1).map((s) => s.hour);
    setSlots((prev) => {
      const base = prev.filter((s) => s.day === 0 || s.day === 6 || s.day === 1);
      const added = [2, 3, 4, 5].flatMap((d) => monSlots.map((h) => ({ day: d, hour: h })));
      return [...base, ...added];
    });
    setSaved(false);
  };

  async function save() {
    if (!profile) return;
    if (slots.length === 0) { setSaveError('Please select at least one time slot before saving.'); return; }
    setSaveError('');
    setSaving(true);
    try {
      await Promise.all(existingRules.map((r) => deleteAvailabilityRule(r.id)));
      const newRules = slotsToRules(slots);
      await Promise.all(
        newRules.map((r) =>
          upsertAvailabilityRule({ tutor_id: profile.id, ...r, slot_minutes: 60, buffer_minutes: 0, is_active: true })
        )
      );
      await loadRules(profile.id);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (loading || dataLoading || !profile) {
    return <div className="min-h-[400px] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink">Weekly availability</h1>
        <p className="text-sm text-muted-foreground mt-1">Click slots to mark when you're available to teach. Timezone: AST (Trinidad).</p>
      </header>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex justify-end">
          <button onClick={copyMonToWeekdays} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:bg-brand/10 px-2 py-1 rounded">
            <Copy className="size-3" /> Copy Monday to all weekdays
              </button>
            </div>

        <div className="overflow-x-auto -mx-1">
          <div className="min-w-[520px] px-1">
            <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-1">
              <div />
              {DAYS.map((d) => <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>)}
              {HOURS.map((h) => (
                <Fragment key={`row-${h}`}>
                  <div className="text-[10px] text-muted-foreground tabular-nums text-right pr-2 leading-7">
                    {h % 12 === 0 ? 12 : h % 12}{h < 12 ? 'am' : 'pm'}
                  </div>
                  {DAYS.map((_, d) => {
                    const on = slots.some((s) => s.day === d && s.hour === h);
                    return (
                  <button
                        key={`${d}-${h}`}
                        onClick={() => toggleSlot(d, h)}
                        className={cn('h-7 rounded transition', on ? 'bg-brand hover:bg-brand/90' : 'bg-muted hover:bg-brand/20')}
                        aria-label={`${DAYS[d]} ${h}:00`}
                      />
                    );
                  })}
                </Fragment>
              ))}
                      </div>
                    </div>
                  </div>

        {saveError && <p className="text-sm text-red-500 pt-1">{saveError}</p>}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-sm text-muted-foreground">{slots.length} slot{slots.length === 1 ? '' : 's'} selected</span>
          <div className="flex items-center gap-3">
            {saved && <span className="text-sm text-brand-deep font-medium">Saved!</span>}
                  <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save availability'}
                      </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-ink mb-2">Current schedule</h3>
        {existingRules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No availability set. Select slots above and save.</p>
        ) : (
          <ul className="space-y-1">
            {existingRules.map((r) => {
              const fmtHour = (t: string) => {
                const h = parseInt(t.split(':')[0]);
                return `${h === 0 ? 12 : h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
              };
              return (
                <li key={r.id} className="text-sm text-muted-foreground">
                  <span className="font-medium text-ink">{DAYS[r.day_of_week]}</span>: {fmtHour(r.start_time)} – {fmtHour(r.end_time)}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
