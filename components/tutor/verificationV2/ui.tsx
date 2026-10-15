'use client';

import type { ReactNode } from 'react';

export const SUPPORT_EMAIL = 'hello@myitutor.com';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-6 text-gray-900 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {message}
    </div>
  );
}

export function PrimaryButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }
) {
  const { busy, children, className = '', disabled, ...rest } = props;
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`rounded-lg bg-[#199356] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#147a47] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {busy ? 'Please wait…' : children}
    </button>
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props;
  return (
    <button
      {...rest}
      className={`rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    />
  );
}

/** Shown when the automatic check cannot continue. There is no manual identity review. */
export function SupportNote({ reason }: { reason: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">{reason}</p>
      <p className="mt-1">
        Please contact us at{' '}
        <a className="underline" href={`mailto:${SUPPORT_EMAIL}?subject=Teacher%20identity%20check`}>
          {SUPPORT_EMAIL}
        </a>{' '}
        and we will help.
      </p>
    </div>
  );
}

/** Reads an API error body without throwing on non-JSON. */
export async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.error === 'string' ? body.error : fallback;
  } catch {
    return fallback;
  }
}
