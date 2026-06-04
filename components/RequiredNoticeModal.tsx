'use client';

import { useEffect, useState } from 'react';

type NoticeSeverity = 'info' | 'success' | 'warning' | 'danger';

interface NoticeAmounts {
  refund_amount?: number;
  retained_amount?: number;
  tutor_payout?: number;
}

interface Notice {
  id: string;
  title: string;
  message: string;
  severity: NoticeSeverity;
  amounts?: NoticeAmounts;
  created_at: string;
}

const severityConfig: Record<
  NoticeSeverity,
  {
    headerBg: string;
    headerText: string;
    buttonBg: string;
    buttonHover: string;
    buttonText: string;
    icon: string;
  }
> = {
  info: {
    headerBg: 'bg-blue-500',
    headerText: 'text-white',
    buttonBg: 'bg-[#199356]',
    buttonHover: 'hover:bg-[#157a48]',
    buttonText: 'text-white',
    icon: 'ℹ',
  },
  success: {
    headerBg: 'bg-[#199356]',
    headerText: 'text-white',
    buttonBg: 'bg-[#199356]',
    buttonHover: 'hover:bg-[#157a48]',
    buttonText: 'text-white',
    icon: '✓',
  },
  warning: {
    headerBg: 'bg-amber-500',
    headerText: 'text-white',
    buttonBg: 'bg-amber-500',
    buttonHover: 'hover:bg-amber-600',
    buttonText: 'text-white',
    icon: '⚠',
  },
  danger: {
    headerBg: 'bg-red-500',
    headerText: 'text-white',
    buttonBg: 'bg-red-500',
    buttonHover: 'hover:bg-red-600',
    buttonText: 'text-white',
    icon: '✕',
  },
};

function formatAmount(value: number): string {
  return `TT$${value.toFixed(2)}`;
}

export default function RequiredNoticeModal() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    async function fetchNotices() {
      try {
        const res = await fetch('/api/required-notices');
        if (!res.ok) return;
        const data: Notice[] = await res.json();
        if (data && data.length > 0) {
          const sorted = [...data].sort(
            (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          setNotices(sorted);
          setVisible(true);
        }
      } catch {
        // Silently fail — notices are non-critical fetch errors
      } finally {
        setLoading(false);
      }
    }

    fetchNotices();
  }, []);

  async function handleAcknowledge() {
    const notice = notices[currentIndex];
    if (!notice || acknowledging) return;

    setAcknowledging(true);
    try {
      const res = await fetch(`/api/required-notices/${notice.id}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        // Still advance on error to avoid permanently blocking the user
      }
    } catch {
      // Advance regardless
    } finally {
      setAcknowledging(false);
    }

    if (currentIndex + 1 < notices.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setVisible(false);
    }
  }

  function handleContactSupport() {
    window.open('mailto:support@myitutor.com', '_blank');
  }

  if (loading || !visible || notices.length === 0) return null;

  const notice = notices[currentIndex];
  if (!notice) return null;

  const config = severityConfig[notice.severity] ?? severityConfig.info;
  const total = notices.length;
  const current = currentIndex + 1;
  const showContactSupport =
    notice.severity === 'warning' || notice.severity === 'danger';
  const hasAmounts =
    notice.amounts &&
    (notice.amounts.refund_amount !== undefined ||
      notice.amounts.retained_amount !== undefined ||
      notice.amounts.tutor_payout !== undefined);

  return (
    <>
      {/* Blocking overlay — pointer-events-none behind the card */}
      <div
        className="fixed inset-0 z-[9998] pointer-events-none"
        aria-hidden="true"
      />

      {/* Backdrop — blocks interaction with the rest of the page */}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        style={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(0,0,0,0.55)' }}
        aria-modal="true"
        role="dialog"
        aria-labelledby="notice-title"
        aria-describedby="notice-message"
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
          {/* Colored header strip */}
          <div className={`${config.headerBg} ${config.headerText} px-6 py-4 flex items-center gap-3`}>
            <span className="text-2xl font-bold leading-none" aria-hidden="true">
              {config.icon}
            </span>
            <h2
              id="notice-title"
              className="text-xl font-bold leading-snug"
            >
              {notice.title}
            </h2>
          </div>

          {/* Body */}
          <div className="px-6 py-5 flex flex-col gap-4">
            <p
              id="notice-message"
              className="text-gray-700 text-base leading-relaxed"
            >
              {notice.message}
            </p>

            {/* Financial amounts box */}
            {hasAmounts && notice.amounts && (
              <div className="bg-gray-100 rounded-xl px-4 py-3 flex flex-col gap-1.5">
                {notice.amounts.refund_amount !== undefined && (
                  <div className="flex justify-between text-sm text-gray-700">
                    <span className="font-medium">Refund amount</span>
                    <span className="font-semibold">
                      {formatAmount(notice.amounts.refund_amount)}
                    </span>
                  </div>
                )}
                {notice.amounts.retained_amount !== undefined &&
                  notice.amounts.retained_amount > 0 && (
                    <div className="flex justify-between text-sm text-gray-700">
                      <span className="font-medium">Retained amount</span>
                      <span className="font-semibold">
                        {formatAmount(notice.amounts.retained_amount)}
                      </span>
                    </div>
                  )}
                {notice.amounts.tutor_payout !== undefined && (
                  <div className="flex justify-between text-sm text-gray-700">
                    <span className="font-medium">Tutor payout</span>
                    <span className="font-semibold">
                      {formatAmount(notice.amounts.tutor_payout)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Progress indicator */}
            {total > 1 && (
              <div className="flex items-center justify-center gap-1.5 pt-1">
                {Array.from({ length: total }).map((_, i) => (
                  <span
                    key={i}
                    className={`inline-block rounded-full transition-all ${
                      i === currentIndex
                        ? 'w-4 h-2 bg-gray-500'
                        : 'w-2 h-2 bg-gray-300'
                    }`}
                    aria-hidden="true"
                  />
                ))}
                <span className="sr-only">
                  Notice {current} of {total}
                </span>
              </div>
            )}
            {total > 1 && (
              <p className="text-center text-xs text-gray-400 -mt-1">
                Notice {current} of {total}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="px-6 pb-5 flex flex-col gap-3">
            <div className={`flex gap-3 ${showContactSupport ? 'flex-col sm:flex-row' : ''}`}>
              {showContactSupport && (
                <button
                  type="button"
                  onClick={handleContactSupport}
                  className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
                >
                  Contact Support
                </button>
              )}
              <button
                type="button"
                onClick={handleAcknowledge}
                disabled={acknowledging}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${config.buttonBg} ${config.buttonHover} ${config.buttonText} transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {acknowledging ? 'Processing…' : 'I Understand'}
              </button>
            </div>

            {/* Footer note */}
            <p className="text-center text-xs text-gray-400">
              This notice is required before you can continue.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
