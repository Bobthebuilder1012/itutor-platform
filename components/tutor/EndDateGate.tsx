'use client';

// =====================================================
// CLASS END-DATE GATE
// =====================================================
// Blocks class-management and payout routes until every class the tutor
// owns has an end date.
//
// SCOPE IS DELIBERATE. This wraps /tutor/classes and /tutor/business
// only — NOT the whole site. A tutor logging in to answer a message or
// join a lesson starting in five minutes must not be handed a form
// instead. Messaging, sessions and the dashboard stay reachable.
//
// Classes created before migration 200 have end_date IS NULL. New
// classes can't be created without one, so this list only ever shrinks
// and the gate stops firing permanently once it's empty.
// =====================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type PendingClass = {
  id: string;
  name: string;
  subject: string | null;
  created_at: string;
};

export default function EndDateGate({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingClass[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/classes/end-dates', { cache: 'no-store' });
      if (!res.ok) {
        // Never trap the tutor because the check itself failed.
        setPending([]);
        return;
      }
      const d = await res.json();
      setPending(d.classes ?? []);
    } catch {
      setPending([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Still checking — render nothing rather than flashing the gate.
  if (pending === null) return null;
  if (pending.length === 0) return <>{children}</>;

  const allFilled = pending.every((c) => values[c.id]);

  async function save() {
    setSaving(true);
    setError('');
    setFieldErrors({});
    try {
      const res = await fetch('/api/tutor/classes/end-dates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: pending!.map((c) => ({ id: c.id, end_date: values[c.id] })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Could not save end dates');

      if (d.failed?.length) {
        const fe: Record<string, string> = {};
        d.failed.forEach((f: { id: string; error: string }) => {
          fe[f.id] = f.error;
        });
        setFieldErrors(fe);
        setError('Some classes could not be saved.');
        return;
      }
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not save end dates');
    } finally {
      setSaving(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const maxDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 2);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">
            Add end dates to your classes
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Classes now need a date they finish, so students stop being billed
            once the class ends. Please set one for{' '}
            {pending.length === 1 ? 'this class' : `these ${pending.length} classes`}{' '}
            to continue managing classes and payouts.
          </p>

          <div className="mt-6 space-y-4">
            {pending.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-gray-200 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-900">{c.name}</div>
                  <div className="text-xs text-gray-500">
                    {c.subject || 'No subject'} · created{' '}
                    {new Date(c.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                  {fieldErrors[c.id] && (
                    <div className="mt-1 text-xs text-red-600">{fieldErrors[c.id]}</div>
                  )}
                </div>
                <input
                  type="date"
                  min={today}
                  max={maxDate}
                  value={values[c.id] ?? ''}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [c.id]: e.target.value }))
                  }
                  className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:mt-0 sm:w-44"
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <button
            onClick={save}
            disabled={!allFilled || saving}
            className="mt-6 w-full rounded-xl bg-itutor-green py-3 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save end dates'}
          </button>

          <p className="mt-4 text-center text-xs text-gray-500">
            Need to do something else first?{' '}
            <Link href="/tutor/dashboard" className="underline">
              Dashboard
            </Link>
            {', '}
            <Link href="/tutor/messages" className="underline">
              messages
            </Link>{' '}
            and your live sessions are still available.
          </p>
        </div>
      </div>
    </div>
  );
}
