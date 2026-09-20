'use client';

/**
 * Inviting people.
 *
 * ONE INPUT, NOT TWO MODES. "Invite one" and "invite several" are the same
 * code path: a chips field that accepts commas, newlines, semicolons and
 * "Name <addr>" straight out of a mail client. Building them separately is how
 * the two drift, and pasting twenty addresses is the case that actually
 * matters when somebody is migrating a class they already teach.
 *
 * The CSV upload is a second SOURCE for that same field, not a second flow —
 * the file is parsed here, its addresses land in the same chips, and the
 * teacher can see and edit them before anything is sent. A separate import
 * wizard would have its own preview table, its own validation vocabulary and
 * its own bugs.
 *
 * THE MODAL DOES NOT CLOSE ON SUBMIT. It becomes a result list, because a
 * teacher who pasted twenty addresses needs to see which three failed. Closing
 * on success is what makes an import feel like it worked when it half did.
 */

import { useCallback, useRef, useState } from 'react';
import { X, Upload, Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { extractRecipients, CSV_TEMPLATE } from '@/lib/classInvites/parseCsv';
import { MAX_CSV_ROWS, MAX_CSV_BYTES } from '@/lib/classInvites/limits';
import { notifyLaunchGoalUpdated } from '@/lib/hooks/useTeacherLaunchGoal';

type Recipient = { email: string; name: string | null; valid: boolean };
type Result = { email: string; outcome: string; message?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OUTCOME_COPY: Record<string, { label: string; good: boolean }> = {
  created: { label: 'Invitation sent', good: true },
  duplicate: { label: 'Already invited', good: false },
  already_member: { label: 'Already in your class', good: false },
  invalid_email: { label: 'Invalid address', good: false },
  self: { label: 'Your own address', good: false },
  send_failed: { label: "Couldn't send", good: false },
  suppressed: { label: 'Not delivered', good: false },
};

function splitInput(raw: string): Recipient[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const angled = entry.match(/^(.*?)<([^>]+)>$/);
      const email = (angled ? angled[2] : entry).trim().toLowerCase();
      const name = angled ? angled[1].trim().replace(/^["']|["']$/g, '') : '';
      return { email, name: name || null, valid: EMAIL_RE.test(email) };
    });
}

export default function InviteModal({
  open,
  onClose,
  classes,
  defaultGroupId,
  allowParent,
}: {
  open: boolean;
  onClose: () => void;
  classes: Array<{ groupId: string; name: string }>;
  defaultGroupId?: string | null;
  /** From the API, not an env var — the flag has no NEXT_PUBLIC_ prefix. */
  allowParent: boolean;
}) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'student' | 'parent'>('student');
  const [groupId, setGroupId] = useState<string>(defaultGroupId ?? '');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const recipients = splitInput(text);
  const validCount = recipients.filter((r) => r.valid).length;
  const invalidCount = recipients.length - validCount;

  const onFile = useCallback(async (file: File) => {
    setError(null);
    if (file.size > MAX_CSV_BYTES) {
      setError(`That file is larger than ${Math.round(MAX_CSV_BYTES / 1024)} KB. Split it and try again.`);
      return;
    }
    const content = await file.text();
    const parsed = extractRecipients(content);
    if (parsed.rows.length === 0) {
      setError('No email addresses found in that file.');
      return;
    }
    if (parsed.rows.length > MAX_CSV_ROWS) {
      setError(`That file has ${parsed.rows.length} addresses, more than the ${MAX_CSV_ROWS} allowed at once. Split it and try again.`);
      return;
    }
    setText((prev) => {
      const existing = prev.trim();
      const added = parsed.rows
        .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
        .join('\n');
      return existing ? `${existing}\n${added}` : added;
    });
    setFileNote(
      `${parsed.rows.length} address${parsed.rows.length === 1 ? '' : 'es'} from ${file.name}` +
        (parsed.skipped.length ? ` · ${parsed.skipped.length} line${parsed.skipped.length === 1 ? '' : 's'} had no address` : '')
    );
  }, []);

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/tutor/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: recipients.filter((r) => r.valid).map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)),
          groupId: groupId || null,
          kind: allowParent ? kind : 'student',
          note: note.trim() || null,
          source: fileNote ? 'csv' : 'single',
        }),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) {
        setError(body?.error ?? 'That did not send.');
        return;
      }
      setResults(body.data.results as Result[]);
      notifyLaunchGoalUpdated();
    } catch {
      setError('That did not send. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'itutor-invite-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 sm:p-8 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-ink">
            {results ? 'What happened' : 'Invite students'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="size-8 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {results ? (
          <div className="px-5 py-4 space-y-3">
            <ul className="space-y-1.5 max-h-80 overflow-y-auto">
              {results.map((r) => {
                const copy = OUTCOME_COPY[r.outcome] ?? { label: r.outcome, good: false };
                return (
                  <li key={r.email} className="flex items-start gap-2 text-sm">
                    {copy.good ? (
                      <CheckCircle2 className="size-4 text-green-600 mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle className="size-4 text-amber-600 mt-0.5 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-ink">{r.email}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {r.message ?? copy.label}
                    </span>
                  </li>
                );
              })}
            </ul>
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-ink text-white py-2 text-sm font-semibold hover:bg-ink/90"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {allowParent && (
              <div>
                <div className="text-xs font-semibold text-ink mb-1.5">Who are you inviting?</div>
                <div className="inline-flex rounded-lg border border-border p-0.5">
                  {(['student', 'parent'] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setKind(k)}
                      className={cn(
                        'px-3 py-1.5 text-sm font-medium rounded-md transition',
                        kind === k ? 'bg-ink text-white' : 'text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {k === 'student' ? 'Student' : 'Parent or guardian'}
                    </button>
                  ))}
                </div>
                {kind === 'parent' && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    We&apos;ll ask them to add their child, then approve the class — and show you
                    where each one has got to.
                  </p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="invite-emails" className="text-xs font-semibold text-ink">
                Email addresses
              </label>
              <textarea
                id="invite-emails"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder={'aliyah@example.com\nparent@example.com, another@example.com'}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Commas or new lines. Paste as many as you like.</span>
                <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 font-semibold text-brand-deep hover:underline">
                  <Upload className="size-3" /> Upload a CSV
                </button>
                <button onClick={downloadTemplate} className="hover:underline">
                  Download a template
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onFile(f);
                    e.target.value = '';
                  }}
                />
              </div>
              {fileNote && <p className="mt-1 text-xs text-brand-deep">{fileNote}</p>}
            </div>

            {classes.length > 0 && (
              <div>
                <label htmlFor="invite-class" className="text-xs font-semibold text-ink">
                  Add to a class
                </label>
                <select
                  id="invite-class"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
                >
                  <option value="">No class yet — just get them onto iTutor</option>
                  {classes.map((c) => (
                    <option key={c.groupId} value={c.groupId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="invite-note" className="text-xs font-semibold text-ink">
                A note, if you like
              </label>
              <input
                id="invite-note"
                value={note}
                maxLength={140}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Looking forward to seeing you in class!"
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
              <Info className="size-3.5 mt-0.5 shrink-0" />
              <span>
                {validCount === 0
                  ? 'Add at least one address.'
                  : `${validCount} ${validCount === 1 ? 'person' : 'people'} will get an email from iTutor on your behalf.`}
                {invalidCount > 0 && ` ${invalidCount} address${invalidCount === 1 ? '' : 'es'} did not look right and will be skipped.`}
              </span>
            </div>

            <button
              onClick={submit}
              disabled={sending || validCount === 0}
              className="w-full rounded-lg bg-ink text-white py-2.5 text-sm font-semibold hover:bg-ink/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {sending && <Loader2 className="size-4 animate-spin" />}
              {sending ? 'Sending…' : `Send ${validCount || ''} invitation${validCount === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
