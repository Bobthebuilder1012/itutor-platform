'use client';

import { Oswald } from 'next/font/google';
import { useEffect } from 'react';

const oswald = Oswald({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export default function LogoutConfirmModal({ open, onClose, onConfirm }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`${oswald.className} fixed inset-0 z-[200] flex items-center justify-center p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-modal-title"
      aria-describedby="logout-modal-desc"
    >
      <div
        className="absolute inset-0 z-0 cursor-pointer bg-gradient-to-br from-[#050605]/93 via-[#0c1210]/95 to-[#080a09]/93 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      >
        <span className="pointer-events-none absolute h-[400px] w-[400px] -left-[100px] -top-[100px] rounded-full bg-[#e8f5ef] opacity-[0.14] blur-[80px] motion-safe:animate-logout-drift" />
        <span
          className="pointer-events-none absolute h-[300px] w-[300px] -bottom-[80px] -right-[80px] rounded-full bg-[#ecfdf5] opacity-[0.12] blur-[80px] motion-safe:animate-logout-drift [-webkit-animation-delay:-3s] [animation-delay:-3s]"
        />
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-[250px] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f0fdf4] opacity-[0.1] blur-[80px] motion-safe:animate-logout-drift [-webkit-animation-delay:-5s] [animation-delay:-5s]" />
      </div>

      <div className="relative z-10 w-full max-w-[360px] rounded-[20px] border border-[#f0fdf4]/14 bg-[rgb(10_14_12_/_0.88)] px-10 py-9 text-center shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_32px_80px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(240,253,244,0.08)] backdrop-blur-[40px]">
        <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-full border border-[#d1fae5]/25 bg-[rgba(236,253,245,0.08)]">
          <LogoutIcon className="h-[22px] w-[22px] text-[#bbf7d0]" />
        </div>
        <h3 id="logout-modal-title" className="mb-2 text-lg font-bold text-[#f0fdf4]">
          Log out?
        </h3>
        <p id="logout-modal-desc" className="mb-7 text-sm leading-relaxed text-[#9ca89e]">
          You&apos;ll be signed out of your account. Any unsaved changes will be lost.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 cursor-pointer rounded-full border border-[#f0fdf4]/14 bg-black/35 px-3 py-3 text-sm font-semibold text-[#e8f5ef]/85 backdrop-blur-md transition-all hover:border-[#ecfdf5]/22 hover:bg-black/45 hover:text-[#f7fef9]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="group relative flex-1 isolate cursor-pointer overflow-hidden rounded-full border border-itutor-green/50 bg-itutor-green/25 px-3 py-3 text-sm font-semibold text-[#f0fdf4] backdrop-blur-md transition-all hover:border-[#a7f3d0]/45 hover:bg-itutor-green/40 hover:text-white hover:shadow-[0_0_24px_rgba(25,147,86,0.35)]"
          >
            <span
              className="pointer-events-none absolute inset-[-2px] -z-10 rounded-full opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100 motion-safe:group-hover:animate-spin"
              style={{
                background:
                  'conic-gradient(from 180deg at 50% 50%, rgba(240,253,244,0.28), rgba(25,147,86,0.32), rgba(209,250,229,0.24), rgba(240,253,244,0.28))',
              }}
            />
            Yes, log out
          </button>
        </div>
      </div>
    </div>
  );
}

