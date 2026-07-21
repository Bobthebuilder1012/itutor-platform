'use client';

// On/off switch for whether a tutor is shown on the 1:1 (one-on-one) marketplace.
// Backed by profiles.pause_1on1 (migration 171) — note the inverted semantics:
// pause_1on1 = false  →  listed/visible (default). We present it positively here:
// the switch ON means "show me on the marketplace".

import { useEffect, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function OneOnOneMarketplaceToggle({ tutorId }: { tutorId: string }) {
  const [paused, setPaused] = useState<boolean | null>(null); // null = loading
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tutorId) return;
    let mounted = true;
    supabase.from('profiles').select('pause_1on1').eq('id', tutorId).single()
      .then(({ data }) => { if (mounted) setPaused(!!(data as any)?.pause_1on1); });
    return () => { mounted = false; };
  }, [tutorId]);

  const enabled = paused === false; // switch ON = listed

  async function toggle() {
    if (paused === null || saving) return;
    setSaving(true);
    const nextPaused = !paused;          // flipping the underlying pause flag
    const prev = paused;
    setPaused(nextPaused);               // optimistic
    const { error } = await supabase.from('profiles').update({ pause_1on1: nextPaused } as any).eq('id', tutorId);
    if (error) setPaused(prev);          // revert on failure
    setSaving(false);
  }

  return (
    <div className={`rounded-2xl border p-4 flex items-start justify-between gap-4 ${enabled ? 'border-brand/30 bg-brand/5' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-start gap-3">
        <div className={`size-9 rounded-xl grid place-items-center shrink-0 ${enabled ? 'bg-brand/10 text-brand-deep' : 'bg-amber-100 text-amber-700'}`}>
          <Users className="size-4" />
        </div>
        <div>
          <div className="font-semibold text-ink text-sm">Show me on the 1:1 marketplace</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {paused === null
              ? 'Loading…'
              : enabled
                ? 'You appear in the one-on-one tutor marketplace and students can book 1:1 sessions with you.'
                : 'You are hidden from the one-on-one marketplace. Students cannot book new 1:1 sessions with you.'}
          </p>
        </div>
      </div>
      <button
        disabled={saving || paused === null}
        onClick={toggle}
        role="switch"
        aria-checked={enabled}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${enabled ? 'bg-brand' : 'bg-muted-foreground/40'}`}
      >
        {saving
          ? <Loader2 className="size-3.5 animate-spin text-white mx-auto" />
          : <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />}
      </button>
    </div>
  );
}
