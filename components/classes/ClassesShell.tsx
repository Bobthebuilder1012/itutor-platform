'use client';

import { ReactNode } from 'react';

export function ClassesShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}
