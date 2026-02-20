'use client';

import { useState, useRef, useEffect } from 'react';
import {
  leaveCommunityAction,
  setMuteAction,
} from '@/lib/communities/actions';

type MuteOption = '1h' | '8h' | '1w' | 'until_off';

interface CommunityListMenuProps {
  communityId: string;
  communityName: string;
  muted?: boolean;
  onLeave?: () => void;
  onMuteChange?: () => void;
}

export default function CommunityListMenu({
  communityId,
  communityName,
  muted = false,
  onLeave,
  onMuteChange,
}: CommunityListMenuProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [optimisticMuted, setOptimisticMuted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isMuted = muted || optimisticMuted;

  useEffect(() => {
    if (muted) setOptimisticMuted(false);
  }, [muted]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMute = async (option: MuteOption) => {
    setLoading(option);
    const until =
      option === '1h'
        ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
        : option === '8h'
          ? new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
          : option === '1w'
            ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            : null;
    const result = await setMuteAction(communityId, true, until ?? undefined);
    setLoading(null);
    if (result.ok) setOptimisticMuted(true);
    setOpen(false);
    onMuteChange?.();
  };

  const handleUnmute = async () => {
    setLoading('unmute');
    const result = await setMuteAction(communityId, false, null);
    setLoading(null);
    if (result.ok) setOptimisticMuted(false);
    setOpen(false);
    onMuteChange?.();
  };

  const handleLeave = async () => {
    setLoading('leave');
    await leaveCommunityAction(communityId);
    setLoading(null);
    setOpen(false);
    onLeave?.();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        aria-label="Community menu"
      >
        <span className="text-lg leading-none">⋯</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 min-w-[180px] rounded-2xl border border-gray-200 bg-white shadow-lg py-1">
          <p className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Mute</p>
          <button
            type="button"
            onClick={() => handleMute('1h')}
            disabled={!!loading}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            1 hour
          </button>
          <button
            type="button"
            onClick={() => handleMute('8h')}
            disabled={!!loading}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            8 hours
          </button>
          <button
            type="button"
            onClick={() => handleMute('1w')}
            disabled={!!loading}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            1 week
          </button>
          <button
            type="button"
            onClick={() => handleMute('until_off')}
            disabled={!!loading}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Until I turn it off
          </button>
          {isMuted && (
            <button
              type="button"
              onClick={handleUnmute}
              disabled={!!loading}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Unmute
            </button>
          )}
          <div className="border-t border-gray-100 my-1" />
          <button
            type="button"
            onClick={handleLeave}
            disabled={!!loading}
            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Leave
          </button>
        </div>
      )}
    </div>
  );
}
