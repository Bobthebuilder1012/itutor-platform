'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

type Options<T> = {
  /** The live value being edited. */
  value: T;
  /** Persists the value. Throw to surface an error and keep the value dirty. */
  save: (value: T) => Promise<void>;
  /** ms of quiet time after the last change before saving. */
  delay?: number;
  /**
   * Return a message to block the save (e.g. an empty display name). The value
   * stays in local state and is retried once it becomes valid — it is never
   * reverted and never persisted while invalid.
   */
  validate?: (value: T) => string | null;
  /** While false, nothing is saved (e.g. profile still loading, feature gated). */
  enabled?: boolean;
  /** Equality used to skip no-op saves. Defaults to JSON comparison. */
  isEqual?: (a: T, b: T) => boolean;
};

/** The display half of the hook's return value — what `<SaveStatus>` renders from. */
export type Autosave = {
  status: AutosaveStatus;
  /** Message from the last failed save. */
  error: string | null;
  /** Message from `validate` — set only while the value differs from what's saved. */
  invalid: string | null;
  /** True while there are changes that haven't reached the server. */
  dirty: boolean;
  savedAt: Date | null;
  /** Save now, skipping the debounce. Use on blur. */
  flush: () => Promise<void>;
  /** Re-attempt after a failure. */
  retry: () => Promise<void>;
};

export type AutosaveHandle<T> = Autosave & {
  /**
   * Adopt `value` as the persisted baseline without writing it. Call this when
   * hydrating fields from the server so loading a profile isn't seen as an edit.
   */
  hydrate: (value: T) => void;
};

/**
 * Debounced autosave for a single field or field group.
 *
 * Ordering is guaranteed: every change supersedes any save already in flight,
 * so a slow response carrying an older value can never overwrite a newer one
 * or report a stale status.
 */
export function useAutosave<T>({
  value,
  save,
  delay = 800,
  validate,
  enabled = true,
  isEqual,
}: Options<T>): AutosaveHandle<T> {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // `undefined` means "not hydrated yet" — the first value we see becomes the
  // baseline rather than an edit to persist.
  const baseline = useRef<T | undefined>(undefined);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const latest = useRef(value);
  const saveRef = useRef(save);
  const validateRef = useRef(validate);
  const equalRef = useRef(isEqual);
  const enabledRef = useRef(enabled);
  latest.current = value;
  saveRef.current = save;
  validateRef.current = validate;
  equalRef.current = isEqual;
  enabledRef.current = enabled;

  const matchesBaseline = useCallback((v: T) => {
    const base = baseline.current;
    if (base === undefined) return false;
    return equalRef.current ? equalRef.current(base, v) : JSON.stringify(base) === JSON.stringify(v);
  }, []);

  const run = useCallback(async () => {
    if (!enabledRef.current) return;
    const v = latest.current;
    if (validateRef.current?.(v)) return;
    if (matchesBaseline(v)) return;

    const ticket = ++seq.current;
    setStatus('saving');
    setError(null);
    try {
      await saveRef.current(v);
      if (ticket !== seq.current) return; // superseded — a newer value is authoritative
      baseline.current = v;
      setSavedAt(new Date());
      setStatus('saved');
    } catch (e: any) {
      if (ticket !== seq.current) return;
      setError(e?.message || 'Couldn’t save');
      setStatus('error');
    }
  }, [matchesBaseline]);

  useEffect(() => {
    if (!enabled) return;
    if (baseline.current === undefined) {
      baseline.current = value;
      return;
    }
    if (matchesBaseline(value)) return;
    if (validateRef.current?.(value)) {
      setStatus('idle');
      return;
    }

    // Invalidate any in-flight save so its response can't land after this one.
    seq.current += 1;
    setStatus('pending');
    timer.current = setTimeout(() => {
      timer.current = null;
      void run();
    }, delay);

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [value, enabled, delay, run, matchesBaseline]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await run();
  }, [run]);

  const hydrate = useCallback((v: T) => {
    baseline.current = v;
    setStatus('idle');
    setError(null);
  }, []);

  const dirty = enabled && baseline.current !== undefined && !matchesBaseline(value);
  const invalid = dirty ? validate?.(value) ?? null : null;

  // Guard the window between the last keystroke and the debounce firing.
  const unsaved = status === 'pending' || status === 'saving' || status === 'error';
  useEffect(() => {
    if (!unsaved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [unsaved]);

  return { status, error, invalid, dirty, savedAt, flush, retry: flush, hydrate };
}
