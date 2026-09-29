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
import { AlertTriangle, Check, Copy, ExternalLink, Link as LinkIcon, Pencil, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';
import { normalizeClassLinkUrl } from '@/lib/utils/meetingLink';
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

/** Would saving `next` change anything? Generated → generated never does. */
export function classLinkChanged(
  next: { mode: MeetingLinkMode; url: string },
  current: { mode: MeetingLinkMode; url: string },
): boolean {
  if (next.mode !== current.mode) return true;
  return next.mode === 'custom' && next.url !== current.url;
}

export type SaveClassLinkResult =
  | { ok: true; mode: MeetingLinkMode; url: string }
  | { ok: false; message: string };

/**
 * Save the class's link mode (and, for custom, the link). The server
 * normalises the link again and is the one that decides, so the result carries
 * the stored values back rather than echoing what was sent — switching custom →
 * generated clears the link, and a generated → generated save returns whatever
 * Meet link is already there.
 */
export async function saveClassLink(
  groupId: string,
  next: { mode: MeetingLinkMode; url: string },
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
    const url: string = typeof row.meeting_link === 'string' ? row.meeting_link : mode === 'custom' ? next.url : '';
    return { ok: true, mode, url };
  } catch {
    return { ok: false, message: 'Network error. Check your connection and try again.' };
  }
}

/** "zoom.us/j/123" — the link without its scheme, for display only. */
export function displayLink(url: string): string {
  return url.replace(/^https:\/\//i, '');
}

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
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                A permanent room link can&apos;t be taken back: a student who leaves the class can still open it.
                If that matters, change the room&apos;s link in Zoom or Teams and paste the new one here.
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
  onSaved: (mode: MeetingLinkMode, url: string) => void;
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
      onSaved(r.mode, r.url);
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

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
          {mode === 'custom'
            ? <LinkIcon className="size-3.5 shrink-0 text-brand-deep" />
            : <Video className="size-3.5 shrink-0 text-brand-deep" />}
          <span className="min-w-0 flex-1">
            {mode === 'custom' ? (
              url ? (
                <>Students join with your own link · <span className="font-medium text-ink break-all">{displayLink(url)}</span></>
              ) : (
                <span className="font-medium text-rose-600">
                  This class uses your own link, but none is saved yet — Join won&apos;t work until you add it.
                </span>
              )
            ) : (
              <>
                Join links are generated with {provider} the first time you press Join, then reused for 30 days.
                {notConnected}
              </>
            )}
          </span>
          {mode === 'custom' && copyButton}
          {!editing && editButton}
        </div>
        {editor}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!editing ? (
        <div className="rounded-xl border border-border p-4 flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="size-9 rounded-xl bg-brand/10 text-brand-deep grid place-items-center shrink-0">
            {mode === 'custom' ? <LinkIcon className="size-4" /> : <Video className="size-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">
              {mode === 'custom' ? 'Your own class link' : `Generated ${provider} links`}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {mode === 'custom'
                ? 'Every Join button for this class — yours and your students\' — opens this link.'
                : 'A link is created the first time you press Join, then reused for 30 days.'}
              {notConnected}
            </div>
            {url ? (
              <div className="mt-2 text-xs font-medium text-ink break-all">{url}</div>
            ) : mode === 'custom' ? (
              <div className="mt-2 text-xs font-medium text-rose-600">No link saved yet — Join won&apos;t work until you add one.</div>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {copyButton}
            {editButton}
          </div>
        </div>
      ) : (
        editor
      )}
    </div>
  );
}
