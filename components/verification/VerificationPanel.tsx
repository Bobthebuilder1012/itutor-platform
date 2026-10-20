'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PublicDetail } from '@/lib/verificationV2/publicView';

const LABEL_ID = 'ID checked';
const LABEL_CREDENTIALS = 'Credentials reviewed';
const LABEL_EXTRAS = 'Teacher-provided extras (not verified by iTutor)';

function credentialLine(c: PublicDetail['credentials'][number]): string {
  if (c.kind === 'DEGREE') {
    return `${c.degree ?? 'Degree'}${c.field ? `, ${c.field}` : ''} · ${c.school ?? ''} · ${c.graduationYear ?? ''}`;
  }
  return `${c.kind} ${c.subject ?? ''} · Grade ${c.grade ?? ''} · ${c.examYear ?? ''}`;
}

/** The panel's content, with no fetching. Also used by the dev states gallery. */
export function PanelBody({ detail }: { detail: PublicDetail }) {
  return (
    <div className="space-y-5 text-sm">
      {detail.verifiedAt && (
        <p className="text-gray-600">
          Verified on{' '}
          <span className="font-semibold text-gray-900">
            {new Date(detail.verifiedAt).toLocaleDateString(undefined, { dateStyle: 'long' })}
          </span>
        </p>
      )}

      {detail.idChecked && (
        <section>
          <h3 className="font-semibold">{LABEL_ID}</h3>
          <p className="mt-1 text-gray-600">
            A government ID was checked by our identity provider. iTutor does not keep a copy of the ID.
          </p>
        </section>
      )}

      {detail.credentialsReviewed && (
        <section>
          <h3 className="font-semibold">{LABEL_CREDENTIALS}</h3>
          <p className="mt-1 text-gray-600">An iTutor reviewer checked these against the proof provided.</p>
          <ul className="mt-2 space-y-1.5">
            {detail.credentials.map((c, i) => (
              <li key={i} className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900">
                {credentialLine(c)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.extras.length > 0 && (
        <section>
          <h3 className="font-semibold">{LABEL_EXTRAS}</h3>
          <p className="mt-1 text-gray-600">Added by the teacher. iTutor has not checked these.</p>
          <ul className="mt-2 space-y-2">
            {detail.extras.slice(0, 3).map((x, i) => (
              <li key={i} className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="font-medium">{x.title}</p>
                <p className="text-gray-700">{x.description}</p>
                {x.linkUrl && (
                  <a
                    href={x.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow ugc"
                    className="break-all text-xs text-emerald-700 underline"
                  >
                    {x.linkUrl}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The dialog chrome around the body: title, close button, backdrop. */
export function PanelFrame({ children, onClose, inline = false }: { children: React.ReactNode; onClose?: () => void; inline?: boolean }) {
  const dialog = (
    <div
      role="dialog"
      aria-modal={!inline}
      aria-label="Teacher verification"
      className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 text-gray-900 shadow-xl sm:rounded-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-bold">Verified teacher</h2>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="rounded-full px-2 text-xl leading-none text-gray-500 hover:text-gray-900">
            ×
          </button>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
  if (inline) return dialog;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      {dialog}
    </div>
  );
}

/**
 * The click-through panel. Rendered in a portal because the class cards it opens
 * from have transforms, which would otherwise trap a fixed overlay inside them.
 */
export default function VerificationPanel({ tutorId, onClose }: { tutorId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<PublicDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let live = true;
    fetch(`/api/public/verification-v2/${encodeURIComponent(tutorId)}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error('not available');
        return (await r.json()) as PublicDetail;
      })
      .then((d) => {
        if (live) {
          setDetail(d);
          setState('ready');
        }
      })
      .catch(() => live && setState('error'));
    return () => {
      live = false;
    };
  }, [tutorId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <PanelFrame onClose={onClose}>
      {state === 'loading' && <p className="text-sm text-gray-500">Loading…</p>}
      {state === 'error' && <p className="text-sm text-gray-600">Verification details are not available.</p>}
      {state === 'ready' && detail && <PanelBody detail={detail} />}
    </PanelFrame>,
    document.body
  );
}
