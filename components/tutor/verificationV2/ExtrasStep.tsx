'use client';

import { useState } from 'react';
import { MAX_EXTRAS, type VerificationV2StateDto } from '@/lib/verificationV2/constants';
import { Card, ErrorBanner, PrimaryButton, SecondaryButton, STEP_META, inputClass, readError } from './ui';

interface Props {
  state: VerificationV2StateDto;
  onChange: () => Promise<void>;
  onBack?: () => void;
  /** The teacher is already verified: extras can be edited freely (they are not checked by iTutor). */
  afterVerified?: boolean;
}

const INPUT = inputClass;

export default function ExtrasStep({ state, onChange, onBack, afterVerified = false }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const full = state.extras.length >= MAX_EXTRAS;

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tutor/verification-v2/extras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, linkUrl }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not save the extra'));
      setTitle('');
      setDescription('');
      setLinkUrl('');
      await onChange();
    } catch (e) {
      setError((e as Error).message);
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/tutor/verification-v2/extras?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) setError(await readError(res, 'Could not remove the extra'));
    await onChange();
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/tutor/verification-v2/submit', { method: 'POST' });
      if (!res.ok) throw new Error(await readError(res, 'Could not submit'));
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card
      title={STEP_META[4].title}
      subtitle={STEP_META[4].subtitle}
      state={afterVerified ? undefined : state.extras.length > 0 ? 'complete' : 'optional'}
    >
      <p className="mb-5 text-sm text-muted-foreground">
        Add up to {MAX_EXTRAS} things that show who you are as a teacher, such as a course, an award or a
        project. These are shown publicly once you are verified.
      </p>

      {state.extras.length > 0 && (
        <ul className="mb-6 divide-y divide-border rounded-xl border border-border">
          {state.extras.map((x) => (
            <li key={x.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{x.title}</p>
                <p className="text-muted-foreground">{x.description}</p>
                {x.linkUrl && <p className="break-all text-xs text-muted-foreground">{x.linkUrl}</p>}
              </div>
              {state.editable && (
                <button onClick={() => remove(x.id)} className="text-xs font-semibold text-red-600 hover:underline">
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {state.editable && (
        <div className="space-y-3 rounded-xl border border-border bg-muted p-4">
          <p className="text-xs font-medium text-muted-foreground">
            {state.extras.length} of {MAX_EXTRAS} used
          </p>
          {full ? (
            <p className="text-sm text-ink">You have added the maximum. Remove one to add another.</p>
          ) : (
            <>
              <input className={INPUT} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
              <textarea
                className={INPUT}
                placeholder="Short description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={280}
              />
              <input className={INPUT} placeholder="Link (optional)" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} maxLength={500} />
              <PrimaryButton onClick={add} busy={busy}>
                Add extra
              </PrimaryButton>
            </>
          )}
        </div>
      )}

      <div className="mt-6">
        <ErrorBanner message={error} />
        {!afterVerified && onBack && (
          <div className="flex gap-3">
            <SecondaryButton onClick={onBack}>Back</SecondaryButton>
            {state.editable && (
              <PrimaryButton onClick={submit} busy={submitting}>
                Submit for review
              </PrimaryButton>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
