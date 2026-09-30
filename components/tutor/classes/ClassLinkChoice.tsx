'use client';

/**
 * How students get into a class's online sessions. Used in three places: step 2
 * of the scheduling pop-up (ScheduleSessionsModal), the strip at the top of the
 * Sessions tab, and Settings → Class link.
 *
 * A class has ONE link, in groups.meeting_link, and one of two modes
 * (groups.meeting_link_mode, migration 262):
 *
 *   generated  What every class did before. POST /api/groups/[id]/meeting-link
 *              creates a Google Meet (or Zoom) meeting on the tutor's connected
 *              account the first time Join is pressed, and reuses it for 30
 *              days. Nothing is created at scheduling time, which is why the
 *              schedule can be saved before Google Meet is connected.
 *   custom     The tutor's own room. Every Join button — the tutor's and every
 *              student's — opens it as-is, and nothing is ever generated.
 *              The link itself may still be missing (migration 263): the
 *              scheduling pop-up lets a tutor choose this and add the link
 *              later. Until they do, their Join answers 422 no_class_link and
 *              students see "Link not shared yet".
 *
 * A tutor's own room is usually permanent, so a student who leaves the class
 * keeps a working link. The only fix is a new room, which is why every custom
 * surface here asks for a new link each month, and LinkRotationBanner below
 * nags at month end (the rule is in lib/classes/linkRotation.ts).
 *
 * Every write goes through PATCH /api/classes/[id]/settings, which honours
 * meeting_link only when meeting_link_mode is in the same body. That is what
 * stops the Settings form (or a stale tab) from clobbering a link it never
 * meant to touch, so saveClassLink below always sends the mode.
 *
 * The own-link option is hidden when the class row has no meeting_link_mode
 * key at all (an environment without migration 262): the server would answer
 * 409 link_mode_unavailable, and offering a choice that can only fail is worse
 * than not offering it.
 */

import { useEffect, useId, useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Link as LinkIcon, Pencil, RefreshCw, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';
import { normalizeClassLinkUrl } from '@/lib/utils/meetingLink';
import { inRotationWindow, isRotationDue, rotationWindowStart } from '@/lib/classes/linkRotation';
import { trinidadToday } from '@/lib/payments/secureSpot';
import type { MeetingLinkMode } from '@/lib/types/groups';

// ── Video provider connection ───────────────────────────────────────────────

export type VideoProvider = 'google_meet' | 'zoom';

export type VideoConnection = {
  /**
   * 'unknown' means "don't say anything": the viewer is not the class's tutor
   * (a superadmin acting as tutor), or the read failed. Nagging an admin to
   * connect THEIR Google account to someone else's class would be wrong, and
   * the server answers the question for real when Join is pressed.
   */
  status: 'loading' | 'connected' | 'not_connected' | 'unknown';
  provider: VideoProvider | null;
};

function asProvider(raw: unknown): VideoProvider | null {
  return raw === 'zoom' ? 'zoom' : raw === 'google_meet' ? 'google_meet' : null;
}

export function providerLabel(provider: VideoProvider | null | undefined): string {
  return provider === 'zoom' ? 'Zoom' : 'Google Meet';
}

/**
 * Is the class's tutor connected to Google Meet or Zoom?
 *
 * Counts a connection as live on is_active + connection_status alone. The
 * video-setup page also treats a past token_expires_at as disconnected, but an
 * access token expiring is routine — the refresh token renews it on the next
 * Join — so using that rule here would tell most connected tutors they are not.
 *
 * getSession() rather than getUser(): this only decides which hint to show.
 * RLS on tutor_video_provider_connections is what actually limits the read.
 */
export function useVideoConnection(tutorId: string | null | undefined): VideoConnection {
  const [state, setState] = useState<VideoConnection>({ status: 'loading', provider: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!tutorId) {
        if (alive) setState({ status: 'unknown', provider: null });
        return;
      }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!alive) return;
        if (!session?.user || session.user.id !== tutorId) {
          setState({ status: 'unknown', provider: null });
          return;
        }
        const { data, error } = await supabase
          .from('tutor_video_provider_connections')
          .select('provider, is_active, connection_status')
          .eq('tutor_id', tutorId);
        if (!alive) return;
        if (error) {
          setState({ status: 'unknown', provider: null });
          return;
        }
        const rows = (data ?? []) as Array<{ provider: string | null; is_active: boolean | null; connection_status: string | null }>;
        const live = rows.find((r) => r.is_active === true && r.connection_status === 'connected');
        setState(
          live
            ? { status: 'connected', provider: asProvider(live.provider) ?? 'google_meet' }
            : { status: 'not_connected', provider: asProvider(rows[0]?.provider) },
        );
      } catch {
        if (alive) setState({ status: 'unknown', provider: null });
      }
    })();
    return () => { alive = false; };
  }, [tutorId]);

  return state;
}

/**
 * Where "connect Google Meet" goes. The OAuth callback sends the tutor back to
 * `from` (validated server-side by safeReturnPath), so they land on this
 * class's Sessions tab rather than on the generic video-setup page.
 */
export function connectUrl(groupId: string): string {
  return `/api/auth/google/connect?from=${encodeURIComponent(`/tutor/classes/${groupId}?tab=sessions`)}`;
}

// ── Draft + save ────────────────────────────────────────────────────────────

/** What the tutor is editing. `input` is the raw text, normalised on save. */
export type ClassLinkDraft = { mode: MeetingLinkMode; input: string };

/**
 * A generated Meet link sitting in meeting_link is NOT the tutor's own link,
 * so it never pre-fills the own-link box — switching to custom with it would
 * pin a link that stops being reused after 30 days.
 */
export function draftFromClass(mode: MeetingLinkMode, url: string | null | undefined): ClassLinkDraft {
  return { mode, input: mode === 'custom' ? (url ?? '') : '' };
}

export type ResolvedClassLink =
  | { ok: true; mode: MeetingLinkMode; url: string }
  | { ok: false; error: string };

export function resolveClassLinkDraft(draft: ClassLinkDraft): ResolvedClassLink {
  if (draft.mode === 'generated') return { ok: true, mode: 'generated', url: '' };
  const r = normalizeClassLinkUrl(draft.input);
  return r.ok ? { ok: true, mode: 'custom', url: r.url } : { ok: false, error: r.error };
}

/**
 * Would saving `next` change anything? Generated → generated never does. A
 * null url ("add the link later") counts as no link, the same as ''.
 */
export function classLinkChanged(
  next: { mode: MeetingLinkMode; url: string | null },
  current: { mode: MeetingLinkMode; url: string },
): boolean {
  if (next.mode !== current.mode) return true;
  return next.mode === 'custom' && (next.url ?? '') !== current.url;
}

export type SaveClassLinkResult =
  /** setAt: groups.meeting_link_set_at as stored, null when unknown or no link. */
  | { ok: true; mode: MeetingLinkMode; url: string; setAt: string | null }
  | { ok: false; message: string };

/**
 * Save the class's link mode (and, for custom, the link). The server
 * normalises the link again and is the one that decides, so the result carries
 * the stored values back rather than echoing what was sent — switching custom →
 * generated clears the link, and a generated → generated save returns whatever
 * Meet link is already there.
 *
 * `url: null` with custom mode is "add the link later": it is sent as an
 * explicit meeting_link: null, which the route stores as custom-with-no-link.
 * Leaving the key out would instead keep whatever link is stored.
 */
export async function saveClassLink(
  groupId: string,
  next: { mode: MeetingLinkMode; url: string | null },
): Promise<SaveClassLinkResult> {
  try {
    const res = await fetch(`/api/classes/${groupId}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meeting_link_mode: next.mode,
        ...(next.mode === 'custom' ? { meeting_link: next.url } : {}),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      return {
        ok: false,
        // `error` is a machine code; the human sentence is in details or message.
        message: json?.details?.[0]?.message ?? json?.message ?? json?.error ?? `Save failed (${res.status})`,
      };
    }
    const row = json?.class ?? {};
    const mode: MeetingLinkMode =
      row.meeting_link_mode === 'custom' ? 'custom' : row.meeting_link_mode === 'generated' ? 'generated' : next.mode;
    // A row that carries meeting_link as null has no link — only a row with
    // no such key at all falls back to what was sent.
    const url: string =
      typeof row.meeting_link === 'string'
        ? row.meeting_link
        : 'meeting_link' in row || mode !== 'custom'
          ? ''
          : (next.url ?? '');
    // Absent on a database without migration 263, where the page doesn't show
    // the rotation reminder at all, so null is only ever read as "unknown".
    const setAt: string | null = typeof row.meeting_link_set_at === 'string' ? row.meeting_link_set_at : null;
    return { ok: true, mode, url, setAt };
  } catch {
    return { ok: false, message: 'Network error. Check your connection and try again.' };
  }
}

/** "zoom.us/j/123" — the link without its scheme, for display only. */
export function displayLink(url: string): string {
  return url.replace(/^https:\/\//i, '');
}

/**
 * Said wherever a class uses the tutor's own link, with or without one saved:
 * the editor, the Sessions strip and the Settings card. One string so the
 * three can't drift apart.
 */
const ROTATION_NOTE =
  "Rotate your class link every month. At the end of each month, create a new meeting link in Zoom, Teams or Meet and paste it here — students who have left the class can't keep joining with the old one.";

// ── The choice ──────────────────────────────────────────────────────────────

export default function ClassLinkChoice({
  value,
  onChange,
  linkModeAvailable,
  connection,
  onSaveAndConnect,
  busy,
  showErrors,
}: {
  value: ClassLinkDraft;
  onChange: (next: ClassLinkDraft) => void;
  linkModeAvailable: boolean;
  connection: VideoConnection;
  /** The secondary "Save & connect Google Meet" action. Omitted = not offered. */
  onSaveAndConnect?: () => void;
  busy?: boolean;
  /** Show "Enter your class link." for an empty box — set once Save is pressed. */
  showErrors?: boolean;
}) {
  const inputId = useId();
  const connectedProvider = connection.status === 'connected' ? connection.provider : null;
  const generatedName = providerLabel(connectedProvider);

  const normalised = value.mode === 'custom' ? normalizeClassLinkUrl(value.input) : null;
  const linkError =
    normalised && !normalised.ok && (showErrors || value.input.trim() !== '') ? normalised.error : null;

  // Built as a value, not inline `&&` chains, so a card with nothing extra to
  // say gets no children — and so no empty padded strip under its title.
  let generatedExtra: React.ReactNode = null;
  if (value.mode === 'generated' && connection.status === 'connected') {
    generatedExtra = (
      <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-deep">
        <Check className="size-3.5" /> {generatedName} is connected.
      </div>
    );
  } else if (value.mode === 'generated' && connection.status === 'not_connected') {
    generatedExtra = (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
          <span>
            Google Meet isn&apos;t connected yet. Your schedule will still be saved — connect before your
            first class so Join can create the link.
          </span>
        </div>
        {onSaveAndConnect && (
          <button
            type="button"
            onClick={onSaveAndConnect}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-background px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            <Video className="size-3.5" /> Save &amp; connect Google Meet
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2" role="radiogroup" aria-label="How students join">
      <OptionCard
        selected={value.mode === 'generated'}
        onSelect={() => onChange({ ...value, mode: 'generated' })}
        disabled={busy}
        icon={Video}
        title={`Generate session links with ${generatedName}`}
        body="A link is created the first time you press Join, then reused for 30 days. Your students' Join buttons open the same link."
      >
        {generatedExtra}
      </OptionCard>

      {linkModeAvailable && (
        <OptionCard
          selected={value.mode === 'custom'}
          onSelect={() => onChange({ ...value, mode: 'custom' })}
          disabled={busy}
          icon={LinkIcon}
          title="Use my own class link"
          body="Paste the link to your own Zoom, Teams or Meet room. Every Join button for this class opens it."
        >
          {value.mode === 'custom' ? (
            <div>
              <label htmlFor={inputId} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Class link <span className="text-rose-600">*</span>
              </label>
              <input
                id={inputId}
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                required
                aria-invalid={linkError ? true : undefined}
                value={value.input}
                disabled={busy}
                onChange={(e) => onChange({ ...value, input: e.target.value })}
                placeholder="https://zoom.us/j/…"
                className={cn(
                  'mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2',
                  linkError ? 'border-rose-300 focus:ring-rose-300' : 'border-border focus:ring-brand',
                )}
              />
              {linkError && <p className="mt-1.5 text-xs text-rose-600">{linkError}</p>}
              {normalised?.ok && (
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                  <Check className="size-3.5 shrink-0 text-brand-deep" />
                  <span className="min-w-0 truncate">
                    Students will open <span className="font-medium text-ink">{normalised.url}</span>
                  </span>
                  {/* rel=noopener noreferrer: the link is the tutor's own, but
                      the page it opens gets no handle back to this one. */}
                  <a
                    href={normalised.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 font-semibold text-brand-deep hover:underline"
                  >
                    Open to test <ExternalLink className="size-3" />
                  </a>
                </div>
              )}
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <RefreshCw className="size-3 mt-0.5 shrink-0" />
                <span>{ROTATION_NOTE}</span>
              </p>
            </div>
          ) : null}
        </OptionCard>
      )}
    </div>
  );
}

function OptionCard({
  selected,
  onSelect,
  disabled,
  icon: Icon,
  title,
  body,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  icon: any;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-xl border transition-colors', selected ? 'border-brand bg-brand/5' : 'border-border bg-background')}>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        disabled={disabled}
        className="w-full flex items-start gap-3 p-3 text-left disabled:cursor-not-allowed"
      >
        <span
          className={cn(
            'mt-0.5 size-4 shrink-0 rounded-full border-2 grid place-items-center',
            selected ? 'border-brand' : 'border-border',
          )}
        >
          {selected && <span className="size-2 rounded-full bg-brand" />}
        </span>
        <Icon className="size-4 mt-0.5 shrink-0 text-brand-deep" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{title}</span>
          <span className="block text-xs text-muted-foreground mt-0.5">{body}</span>
        </span>
      </button>
      {children ? <div className="px-3 pb-3">{children}</div> : null}
    </div>
  );
}

// ── Current state, with Copy and Edit ───────────────────────────────────────

/**
 * The class's current link, as a card (Settings) or a one-line strip
 * (`compact`, the Sessions tab).
 *
 * With `onEdit`, Edit hands off to the caller — the Sessions tab opens the
 * scheduling pop-up straight at its link step, so there is one editor there.
 * Without it the panel edits in place with its own Save, which is how Settings
 * keeps the link out of its draft and its unsaved-changes bar.
 *
 * Custom mode with no link yet ("add link later" in the pop-up) is shown as
 * something to do, in amber, with Add link as its one action — not as an
 * error, because the tutor chose it.
 */
export function ClassLinkPanel({
  groupId,
  tutorId,
  mode,
  url,
  linkModeAvailable,
  compact,
  onEdit,
  onSaved,
}: {
  groupId: string;
  tutorId?: string | null;
  mode: MeetingLinkMode;
  url: string;
  linkModeAvailable: boolean;
  compact?: boolean;
  onEdit?: () => void;
  onSaved: (mode: MeetingLinkMode, url: string, setAt: string | null) => void;
}) {
  const connection = useVideoConnection(tutorId);
  const provider = providerLabel(connection.status === 'connected' ? connection.provider : null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ClassLinkDraft>(() => draftFromClass(mode, url));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [copied, setCopied] = useState(false);

  // Changing a generated class to... generated is the only thing left to do
  // when the own-link option is unavailable, so there is nothing to edit.
  const canEdit = linkModeAvailable || mode === 'custom';

  const startEdit = () => {
    if (onEdit) { onEdit(); return; }
    setDraft(draftFromClass(mode, url));
    setError('');
    setShowErrors(false);
    setEditing(true);
  };

  const save = async (thenConnect: boolean) => {
    const resolved = resolveClassLinkDraft(draft);
    if (!resolved.ok) {
      setShowErrors(true);
      setError(resolved.error);
      return;
    }
    if (classLinkChanged(resolved, { mode, url })) {
      setSaving(true);
      setError('');
      const r = await saveClassLink(groupId, resolved);
      setSaving(false);
      if (!r.ok) { setError(r.message); return; }
      onSaved(r.mode, r.url, r.setAt);
    }
    setEditing(false);
    if (thenConnect) window.location.href = connectUrl(groupId);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the link is on screen to copy by hand */
    }
  };

  const copyButton = url ? (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background text-xs font-semibold text-ink hover:bg-muted"
    >
      {copied ? <Check className="size-3.5 text-brand-deep" /> : <Copy className="size-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  ) : null;

  const editButton = canEdit ? (
    <button
      type="button"
      onClick={startEdit}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background text-xs font-semibold text-ink hover:bg-muted"
    >
      <Pencil className="size-3.5" /> {mode === 'custom' ? 'Edit' : 'Change'}
    </button>
  ) : null;

  const notConnected =
    mode === 'generated' && connection.status === 'not_connected' ? (
      <span className="text-amber-700">
        {' '}Google Meet isn&apos;t connected yet —{' '}
        <a href={connectUrl(groupId)} className="font-semibold text-brand-deep hover:underline">connect it</a>
        {' '}before your first class.
      </span>
    ) : null;

  const editor = editing && (
    <div className="space-y-3">
      <ClassLinkChoice
        value={draft}
        onChange={(next) => { setDraft(next); setError(''); }}
        linkModeAvailable={linkModeAvailable}
        connection={connection}
        onSaveAndConnect={() => save(true)}
        busy={saving}
        showErrors={showErrors}
      />
      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => save(false)}
          disabled={saving}
          className="px-4 py-1.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save class link'}
        </button>
      </div>
    </div>
  );

  // Own link chosen, none saved yet. Join can't work, so this is the one thing
  // the panel asks for — Add link replaces Edit rather than sitting beside it.
  const pending = mode === 'custom' && !url;
  const pendingText = "Add your class link — students can't join until you do.";
  const addLinkButton = (
    <button
      type="button"
      onClick={startEdit}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700"
    >
      <LinkIcon className="size-3.5" /> Add link
    </button>
  );

  if (compact) {
    return (
      <div className="space-y-3">
        {pending ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-center gap-2 flex-wrap">
            <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
            <span className="min-w-0 flex-1 font-semibold">{pendingText}</span>
            {!editing && addLinkButton}
            <RotationNoteLine className="text-amber-800" />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
            {mode === 'custom'
              ? <LinkIcon className="size-3.5 shrink-0 text-brand-deep" />
              : <Video className="size-3.5 shrink-0 text-brand-deep" />}
            <span className="min-w-0 flex-1">
              {mode === 'custom' ? (
                <>Students join with your own link · <span className="font-medium text-ink break-all">{displayLink(url)}</span></>
              ) : (
                <>
                  Join links are generated with {provider} the first time you press Join, then reused for 30 days.
                  {notConnected}
                </>
              )}
            </span>
            {mode === 'custom' && copyButton}
            {!editing && editButton}
            {mode === 'custom' && <RotationNoteLine />}
          </div>
        )}
        {editor}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!editing ? (
        <div
          className={cn(
            'rounded-xl border p-4 flex flex-col sm:flex-row sm:items-start gap-3',
            pending ? 'border-amber-200 bg-amber-50' : 'border-border',
          )}
        >
          <div
            className={cn(
              'size-9 rounded-xl grid place-items-center shrink-0',
              pending ? 'bg-amber-100 text-amber-700' : 'bg-brand/10 text-brand-deep',
            )}
          >
            {pending ? <AlertTriangle className="size-4" /> : mode === 'custom' ? <LinkIcon className="size-4" /> : <Video className="size-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className={cn('text-sm font-semibold', pending ? 'text-amber-900' : 'text-ink')}>
              {pending ? pendingText : mode === 'custom' ? 'Your own class link' : `Generated ${provider} links`}
            </div>
            <div className={cn('text-xs mt-0.5', pending ? 'text-amber-800' : 'text-muted-foreground')}>
              {mode === 'custom'
                ? pending
                  ? 'This class uses your own Zoom, Teams or Meet room. Every Join button — yours and your students\' — will open it once it\'s added.'
                  : 'Every Join button for this class — yours and your students\' — opens this link.'
                : 'A link is created the first time you press Join, then reused for 30 days.'}
              {notConnected}
            </div>
            {url && <div className="mt-2 text-xs font-medium text-ink break-all">{url}</div>}
            {mode === 'custom' && <RotationNoteLine className={cn('mt-2', pending && 'text-amber-800')} />}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {pending ? addLinkButton : (
              <>
                {copyButton}
                {editButton}
              </>
            )}
          </div>
        </div>
      ) : (
        editor
      )}
    </div>
  );
}

/**
 * The always-on monthly rotation reminder, as one small line. In the compact
 * strip it is a flex child that takes a full row of its own (basis-full), so it
 * sits under the link and its buttons rather than squeezing between them.
 */
function RotationNoteLine({ className }: { className?: string }) {
  return (
    <p className={cn('basis-full flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground', className)}>
      <RefreshCw className="size-3 mt-0.5 shrink-0" />
      <span>{ROTATION_NOTE}</span>
    </p>
  );
}

// ── Month-end rotation banner ───────────────────────────────────────────────

/** Per class, so "Not now" on one class doesn't silence another. */
function rotationDismissKey(groupId: string): string {
  return `itutor:link-rotation-dismissed:${groupId}`;
}

/**
 * "Time to rotate your class link", at the top of the Sessions tab.
 *
 * Shown for a custom-mode class with a link saved, once isRotationDue says the
 * link predates the latest month-end window, and until a new link is saved —
 * the caller passes the fresh meeting_link_set_at from the save, so it goes
 * away the moment the tutor rotates. The caller decides whether the class has
 * a link to rotate at all: an in-person-only class, or a database without
 * migration 263 (where every setAt reads as unknown, i.e. due forever), must
 * not render this.
 *
 * "Not now" is remembered per class in localStorage as the window it was
 * dismissed in (rotationWindowStart), so it stays quiet for the rest of that
 * window and comes back when the next one opens. Storage can throw (private
 * windows, blocked site data); the banner then just can't remember, and "Not
 * now" still hides it for as long as this component is mounted.
 *
 * Renders nothing until mounted: both the stored dismissal and "today" are
 * browser-only facts, and reading them during the first render would differ
 * from a server render.
 */
export function LinkRotationBanner({
  groupId,
  mode,
  url,
  setAt,
  onRotate,
}: {
  groupId: string;
  mode: MeetingLinkMode;
  url: string;
  setAt: string | null;
  /** Opens the link editor — the same action as Edit on the Class link strip. */
  onRotate: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [dismissedWindow, setDismissedWindow] = useState<string | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(rotationDismissKey(groupId));
    } catch {
      /* storage unavailable — nothing remembered */
    }
    setDismissedWindow(stored);
    setMounted(true);
  }, [groupId]);

  if (!mounted || mode !== 'custom' || !url || !isRotationDue(setAt)) return null;

  const today = trinidadToday();
  const windowStart = rotationWindowStart(today);
  if (dismissedWindow === windowStart) return null;

  const dismiss = () => {
    setDismissedWindow(windowStart);
    try {
      window.localStorage.setItem(rotationDismissKey(groupId), windowStart);
    } catch {
      /* storage unavailable — hidden until the tab remounts */
    }
  };

  // Due stays due past the window until a new link is saved, and a link from
  // before migration 263 has no date at all, so "it's the end of the month"
  // is only said when it is.
  const body = inRotationWindow(today)
    ? "It's the end of the month. Create a new meeting link in Zoom, Teams or Meet and paste it here, so students who have left the class can no longer join."
    : "This class is still using a link from before the last month end. Create a new meeting link in Zoom, Teams or Meet and paste it here, so students who have left the class can no longer join.";

  return (
    <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="size-9 rounded-xl bg-amber-100 grid place-items-center shrink-0">
          <RefreshCw className="size-4 text-amber-700" />
        </div>
        <div className="text-sm text-amber-900 min-w-0">
          <div className="font-semibold">Time to rotate your class link</div>
          <div className="text-xs text-amber-800 mt-0.5">{body}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 sm:justify-end">
        <button
          type="button"
          onClick={dismiss}
          className="px-3 py-2 rounded-lg text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={onRotate}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700"
        >
          <LinkIcon className="size-3.5" /> Paste new link
        </button>
      </div>
    </div>
  );
}
