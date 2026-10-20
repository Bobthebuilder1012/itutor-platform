'use client';

// DEV ONLY. Building blocks for /dev/verification-states.

import type { ReactNode } from 'react';

export function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-12 scroll-mt-20">
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      {note && <p className="mb-4 mt-1 text-sm text-gray-600">{note}</p>}
      <div className="mt-4 grid gap-5 md:grid-cols-2">{children}</div>
    </section>
  );
}

export function Cell({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'md:col-span-2' : ''} data-state={label}>
      <p className="mb-2 inline-block rounded bg-gray-800 px-2 py-0.5 font-mono text-[11px] text-white">{label}</p>
      {children}
    </div>
  );
}
