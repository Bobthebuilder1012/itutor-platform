'use client';

// Notification preferences — handover §10.6 and the design kit's preferences card.
//
// Two things this screen has to be honest about:
//
// 1. It only offers switches for things that actually send. §10.6 rules out a
//    digest, attendance and parent session reminders because none of those
//    exist — a switch a parent turns ON and then hears nothing from is worse
//    than no switch at all.
//
// 2. Turning something off does not hide it. The in-app list keeps everything,
//    which is why the header says so. A parent who muted approval outcomes and
//    then could not find out what happened to a request would have lost the
//    record rather than the noise.
//
// Toggles save immediately and optimistically. There is no Save button because
// there is nothing to batch, and a half-saved preferences grid is a worse
// failure than a single toggle that snaps back.

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

type Category = { key: string; label: string; detail: string };
type Matrix = Record<string, { push: boolean; email: boolean }>;
type Mute = { childId: string; category: string };
type Child = { id: string; name: string };

export default function NotificationPreferences() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [matrix, setMatrix] = useState<Matrix>({});
  const [mutes, setMutes] = useState<Mute[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [perChildOpen, setPerChildOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/preferences', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setCategories(json.categories ?? []);
      setMatrix(json.preferences ?? {});
      setMutes(json.mutes ?? []);
      setChildren(json.children ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleChannel = async (category: string, channel: 'push' | 'email') => {
    const next = !(matrix[category]?.[channel] ?? true);
    // Optimistic: the grid stays responsive, and a failure reverts just this cell.
    setMatrix((m) => ({ ...m, [category]: { ...m[category], [channel]: next } }));
    setError(null);
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, channel, enabled: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMatrix((m) => ({ ...m, [category]: { ...m[category], [channel]: !next } }));
      setError('That did not save. Try again.');
    }
  };

  const isMuted = (childId: string, category: string) =>
    mutes.some((m) => m.childId === childId && m.category === category);

  const toggleMute = async (childId: string, category: string) => {
    const muted = !isMuted(childId, category);
    setMutes((prev) =>
      muted
        ? [...prev, { childId, category }]
        : prev.filter((m) => !(m.childId === childId && m.category === category))
    );
    setError(null);
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, childId, muted }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMutes((prev) =>
        muted
          ? prev.filter((m) => !(m.childId === childId && m.category === category))
          : [...prev, { childId, category }]
      );
      setError('That did not save. Try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10 text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-card p-5">
      <h2 className="text-base font-bold text-white">Notifications</h2>
      <p className="mt-1 text-sm text-muted">
        Turn off what you don’t need — everything stays visible in your notifications list either
        way.
      </p>

      {error && (
        <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      <div className="mt-4 grid grid-cols-[1fr_64px_64px] items-center gap-y-1">
        <span />
        <span className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted">
          Push
        </span>
        <span className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted">
          Email
        </span>

        {categories.map((c) => (
          <div key={c.key} className="col-span-3 grid grid-cols-[1fr_64px_64px] items-center border-t border-white/5 py-3">
            <div className="pr-3">
              <div className="text-sm text-white">{c.label}</div>
              <div className="text-xs text-muted">{c.detail}</div>
            </div>
            {(['push', 'email'] as const).map((ch) => (
              <div key={ch} className="grid place-items-center">
                <Toggle
                  on={matrix[c.key]?.[ch] ?? true}
                  onToggle={() => toggleChannel(c.key, ch)}
                  label={`${c.label} ${ch}`}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* "Two children means twice the notifications" — the reason this axis
          exists at all. Hidden until asked for, since one-child families do not
          need it. */}
      {children.length > 0 && (
        <>
          <button
            onClick={() => setPerChildOpen((v) => !v)}
            className="mt-4 text-sm font-semibold text-brand"
          >
            {perChildOpen ? 'Hide per-child mutes' : 'Mute per child'}
          </button>

          {perChildOpen && (
            <div className="mt-3 grid gap-3">
              {children.map((child) => (
                <div key={child.id} className="rounded-xl border border-white/10 p-3">
                  <div className="text-sm font-bold text-white">{child.name}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {categories.map((c) => {
                      const muted = isMuted(child.id, c.key);
                      return (
                        <button
                          key={c.key}
                          onClick={() => toggleMute(child.id, c.key)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            muted
                              ? 'border-white/10 bg-white/10 text-muted line-through'
                              : 'border-white/15 text-white hover:bg-white/5'
                          }`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Struck through means muted for {child.name.split(' ')[0]}.
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onToggle}
      aria-label={label}
      aria-pressed={on}
      className={`relative h-6 w-11 rounded-full transition ${on ? 'bg-brand' : 'bg-white/15'}`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${
          on ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
