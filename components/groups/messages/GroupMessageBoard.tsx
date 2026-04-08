'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GroupMessage } from '@/lib/types/groups';
import GroupMessageItem from './GroupMessageItem';
import GroupMessageComposer from './GroupMessageComposer';

interface GroupMessageBoardProps {
  groupId: string;
  isTutor: boolean;
  currentUserId: string;
  whatsappLink?: string;
  memberCount?: number;
  onWhatsAppSave?: (link: string) => Promise<void>;
}

export default function GroupMessageBoard({
  groupId,
  isTutor,
  currentUserId,
  whatsappLink,
  memberCount,
  onWhatsAppSave,
}: GroupMessageBoardProps) {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [waInput, setWaInput] = useState(whatsappLink ?? '');
  const [waSaving, setWaSaving] = useState(false);
  const [waSaved, setWaSaved] = useState(false);
  const [waRedirectUrl, setWaRedirectUrl] = useState('');
  const [waTokenState, setWaTokenState] = useState<'loading' | 'ready' | 'hidden' | 'error'>('loading');

  useEffect(() => { setWaInput(whatsappLink ?? ''); }, [whatsappLink]);

  useEffect(() => {
    if (isTutor || !groupId) return;
    (async () => {
      try {
        const res = await fetch(`/api/groups/${groupId}/wa-token`, { method: 'POST' });
        if (res.status === 403 || res.status === 404) { setWaTokenState('hidden'); return; }
        if (!res.ok) throw new Error();
        const data = await res.json();
        setWaRedirectUrl(data.redirectUrl);
        setWaTokenState('ready');
      } catch { setWaTokenState('error'); }
    })();
  }, [groupId, isTutor]);

  const handleWaSave = async () => {
    if (!onWhatsAppSave) return;
    setWaSaving(true);
    try {
      await onWhatsAppSave(waInput.trim());
      setWaSaved(true);
      setTimeout(() => setWaSaved(false), 3000);
    } catch {} finally { setWaSaving(false); }
  };

  const fetchMessages = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`/api/groups/${groupId}/messages`);
      if (!res.ok) throw new Error('Failed to load messages');
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {
      setError('Could not load messages. Try refreshing.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  const waLogo = (
    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366" />
      <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" stroke="#25D366" strokeWidth="1.5" fill="none" />
    </svg>
  );

  const whatsAppSection = isTutor ? (
    <div className="mb-4 rounded-xl border border-[#d1fae5] bg-gradient-to-r from-[#ecfdf5] to-[#d1fae5]/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        {waLogo}
        <h4 className="text-[13px] font-bold text-[#166534]">WhatsApp Group</h4>
      </div>
      <div className="flex gap-2">
        <input
          type="url"
          value={waInput}
          onChange={(e) => setWaInput(e.target.value)}
          placeholder="https://chat.whatsapp.com/..."
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
        />
        <button
          onClick={handleWaSave}
          disabled={waSaving || waInput.trim() === (whatsappLink ?? '')}
          className="px-4 py-2 rounded-lg bg-[#25D366] hover:bg-[#1fb855] text-white text-[12px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
        >
          {waSaving ? (
            <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : waSaved ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
          )}
          {waSaved ? 'Saved' : 'Save'}
        </button>
      </div>
      {waSaved && (
        <p className="mt-2 text-[11px] text-emerald-600 font-medium flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>
          WhatsApp link saved. Approved members can now join.
        </p>
      )}
      <p className="mt-2 text-[10.5px] text-gray-500">
        Paste your WhatsApp group invite link. Only approved members will see the join button.
        {memberCount !== undefined && memberCount > 0 && (
          <span className="ml-1 font-medium text-emerald-700">{memberCount} member{memberCount !== 1 ? 's' : ''} in this class.</span>
        )}
      </p>
    </div>
  ) : waTokenState === 'ready' ? (
    <div className="mb-4 rounded-xl border border-[#d1fae5] bg-gradient-to-r from-[#ecfdf5] to-[#d1fae5]/40 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {waLogo}
          <div>
            <h4 className="text-[13px] font-bold text-[#166534]">WhatsApp Group</h4>
            <p className="text-[10.5px] text-gray-500">Chat with your classmates</p>
          </div>
        </div>
        <a
          href={waRedirectUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#25D366] hover:bg-[#1fb855] text-white text-[12px] font-semibold transition-all hover:-translate-y-0.5 shadow-sm"
        >
          Join Group
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M7 17l9.2-9.2M17 17V8H8" /></svg>
        </a>
      </div>
      {memberCount !== undefined && memberCount > 0 && (
        <div className="mt-3 flex items-center gap-1.5 text-[10.5px] text-gray-500">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
          {memberCount} member{memberCount !== 1 ? 's' : ''} in this class
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="flex flex-col h-full min-h-0 flex-1 pb-2 px-2">
      {whatsAppSection}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Lesson Chat</h3>
        <button
          onClick={fetchMessages}
          className="text-xs text-gray-400 hover:text-emerald-600 transition-colors flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Message thread */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-1 mb-2">
        {messages.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            <div className="text-3xl mb-2">💬</div>
            No messages yet. Start the conversation.
          </div>
        ) : (
          messages.map((msg) => (
            <GroupMessageItem
              key={msg.id}
              message={msg}
              groupId={groupId}
              isTutor={isTutor}
              currentUserId={currentUserId}
              onRefresh={fetchMessages}
            />
          ))
        )}
      </div>

      {/* Composer */}
      <div className="flex-shrink-0">
        <GroupMessageComposer
          groupId={groupId}
          onSent={fetchMessages}
        />
      </div>
    </div>
  );
}
