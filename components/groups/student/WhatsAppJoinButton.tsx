'use client';

import { useEffect, useState, useCallback } from 'react';

interface Props {
  groupId: string;
}

type BtnState = 'loading' | 'ready' | 'error' | 'hidden';

export default function WhatsAppJoinButton({ groupId }: Props) {
  const [state, setState] = useState<BtnState>('loading');
  const [redirectUrl, setRedirectUrl] = useState('');

  const fetchToken = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch(`/api/groups/${groupId}/wa-token`, { method: 'POST' });
      // 403 = not a member, 404 = no link configured → hide silently
      if (res.status === 403 || res.status === 404) {
        setState('hidden');
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRedirectUrl(data.redirectUrl);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [groupId]);

  useEffect(() => { fetchToken(); }, [fetchToken]);

  if (state === 'hidden') return null;

  const isClickable = state === 'ready';

  return (
    <div className="border-t border-gray-100 pt-3 mt-1">
      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest px-3 mb-2">Community</p>

      <a
        href={isClickable ? redirectUrl : '#'}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          if (isClickable) {
            // Refresh token after click so the button still works if they return to the page
            setTimeout(() => fetchToken(), 2000);
          }
        }}
        className={[
          'mx-3 flex items-center gap-2.5 p-2.5 rounded-xl transition-all duration-150 no-underline',
          isClickable
            ? 'bg-[#dcfce7] hover:bg-[#bbf7d0] hover:-translate-y-0.5 cursor-pointer'
            : 'bg-gray-50 pointer-events-none opacity-60',
        ].join(' ')}
      >
        {/* WhatsApp logo */}
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <path
            d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"
            fill="#25D366"
          />
          <path
            d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"
            stroke="#25D366"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>

        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[12px] font-semibold text-[#166534] leading-tight truncate">
            {state === 'loading' ? 'Loading…' : state === 'error' ? 'Unavailable' : 'Join WhatsApp group'}
          </span>
          <span className="text-[10px] text-gray-500 mt-0.5">
            {state === 'error' ? 'Try refreshing the page' : 'Chat with your classmates'}
          </span>
        </div>

        {isClickable && (
          <svg
            className="w-3 h-3 text-gray-400 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M7 17l9.2-9.2M17 17V8H8" />
          </svg>
        )}
      </a>

      <div className="flex items-center gap-1 mt-1.5 px-3">
        <svg className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <p className="text-[10px] text-gray-400">Only visible to approved members</p>
      </div>
    </div>
  );
}
