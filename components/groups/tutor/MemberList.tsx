'use client';

import { useState, useMemo } from 'react';
import type { GroupMember } from '@/lib/types/groups';
import UserAvatar from '@/components/UserAvatar';

const AVATAR_COLORS = [
  '#0d9668', '#6366f1', '#f59e0b', '#e11d48', '#0891b2',
  '#7c3aed', '#dc2626', '#059669', '#2563eb', '#ca8a04',
  '#9333ea', '#0d9488',
];

function hashCode(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function avatarColor(id: string) {
  return AVATAR_COLORS[hashCode(id) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

interface MemberListProps {
  groupId: string;
  members: GroupMember[];
  currentUserId: string;
  tutorId: string;
  isTutor: boolean;
  inviteUrl?: string;
  onRefresh: () => void;
}

const COLLAPSED_COUNT = 5;

export default function MemberList({
  groupId,
  members,
  currentUserId,
  tutorId,
  isTutor,
  inviteUrl,
  onRefresh,
}: MemberListProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const pending = members.filter((m) => m.status === 'pending');
  const approved = members.filter((m) => m.status === 'approved');
  const totalCount = approved.length + 1;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return approved;
    return approved.filter((m) => (m.profile?.full_name ?? '').toLowerCase().includes(q));
  }, [approved, search]);

  const modalFiltered = useMemo(() => {
    const q = modalSearch.toLowerCase();
    if (!q) return approved;
    return approved.filter((m) => (m.profile?.full_name ?? '').toLowerCase().includes(q));
  }, [approved, modalSearch]);

  const displayMembers = expanded ? filtered : filtered.slice(0, COLLAPSED_COUNT);
  const hasMore = filtered.length > COLLAPSED_COUNT;

  const handleDecide = async (userId: string, status: 'approved' | 'denied') => {
    setActionLoading(userId);
    try {
      await fetch(`/api/groups/${groupId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      onRefresh();
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!confirm('Remove this member?')) return;
    setActionLoading(userId);
    try {
      await fetch(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' });
      onRefresh();
    } finally {
      setActionLoading(null);
    }
  };

  const copyLink = () => {
    const url = inviteUrl ?? (typeof window !== 'undefined' ? window.location.href : '');
    void navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const renderMember = (m: GroupMember, opts?: { showRemove?: boolean; showDate?: boolean }) => {
    const name = m.profile?.full_name ?? 'Member';
    const isMe = m.user_id === currentUserId;
    const isMemberTutor = m.user_id === tutorId;

    return (
      <div key={m.id} className="group flex items-center gap-2.5 py-[7px] px-2 rounded-[10px] hover:bg-[#f5f7fa] transition-colors">
        <div className="relative flex-shrink-0">
          {m.profile?.avatar_url ? (
            <UserAvatar avatarUrl={m.profile.avatar_url} name={name} size={32} />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
              style={{ background: avatarColor(m.user_id) }}
            >
              {getInitials(name)}
            </div>
          )}
          <span className={`absolute -bottom-px -right-px w-[10px] h-[10px] rounded-full border-2 border-white ${isMemberTutor ? 'bg-[#0d9668]' : 'bg-[#d1d5db]'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-semibold truncate">{name}</p>
          <p className="text-[10px] text-[#6b7280]">
            {isMemberTutor
              ? 'Head Tutor'
              : opts?.showDate
              ? `Joined ${new Date(m.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
              : `Joined ${new Date(m.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
          </p>
        </div>
        {isMemberTutor ? (
          <span className="px-[7px] py-[2px] rounded text-[9px] font-semibold bg-[#d1fae5] text-[#047857] flex-shrink-0">Tutor</span>
        ) : isMe ? (
          <span className="px-[7px] py-[2px] rounded text-[9px] font-semibold bg-[#6366f1] text-white opacity-70 flex-shrink-0">You</span>
        ) : opts?.showRemove && isTutor ? (
          <button
            onClick={() => handleRemove(m.user_id)}
            disabled={actionLoading === m.user_id}
            className="w-6 h-6 rounded-md border-none bg-transparent cursor-pointer flex items-center justify-center text-[#6b7280] opacity-0 group-hover:opacity-100 hover:bg-[#f5f7fa] hover:text-[#ef4444] transition-all flex-shrink-0 disabled:opacity-40"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <>
      {/* Pending requests */}
      {isTutor && pending.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-[.07em] text-amber-600 mb-2">
            Pending Requests ({pending.length})
          </p>
          <div className="space-y-2">
            {pending.map((m) => (
              <div key={m.id} className="bg-amber-50 border border-amber-100 rounded-[10px] p-2.5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="relative flex-shrink-0">
                    {m.profile?.avatar_url ? (
                      <UserAvatar avatarUrl={m.profile.avatar_url} name={m.profile?.full_name ?? 'Member'} size={32} />
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: avatarColor(m.user_id) }}>
                        {getInitials(m.profile?.full_name ?? 'M')}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold truncate">{m.profile?.full_name ?? 'Unknown'}</p>
                    <p className="text-[10px] text-[#6b7280]">Requested to join</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleDecide(m.user_id, 'approved')}
                    disabled={actionLoading === m.user_id}
                    className="w-full py-1.5 bg-[#0d9668] hover:bg-[#047857] text-white text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleDecide(m.user_id, 'denied')}
                    disabled={actionLoading === m.user_id}
                    className="w-full py-1.5 bg-white hover:bg-red-50 border border-[#e4e8ee] hover:border-red-300 text-[#6b7280] hover:text-red-500 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-2">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9ca3af] pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            type="text"
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full py-[7px] pl-8 pr-3 border border-[#e4e8ee] rounded-lg text-[12px] font-medium outline-none bg-[#f5f7fa] focus:border-[#0d9668] focus:bg-white transition-colors placeholder:text-[#9ca3af]"
          />
        </div>
      </div>

      {/* Member list */}
      <div className={`relative ${!expanded && hasMore ? 'max-h-[232px] overflow-hidden' : 'max-h-[320px] overflow-y-auto'}`}>
        {!expanded && hasMore && (
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent pointer-events-none z-[1]" />
        )}
        {displayMembers.map((m) => renderMember(m, { showRemove: true }))}
        {filtered.length === 0 && (
          <p className="text-[11px] text-[#9ca3af] text-center py-3">No members found.</p>
        )}
      </div>

      {/* See all / collapse */}
      {hasMore && (
        <div className="mt-1.5">
          <button
            onClick={() => setExpanded((p) => !p)}
            className="w-full py-2 rounded-[10px] border border-[#e4e8ee] bg-white text-[12px] font-semibold text-[#6b7280] hover:border-[#0d9668] hover:text-[#0d9668] hover:bg-[#d1fae5] transition-colors flex items-center justify-center gap-1.5"
          >
            <span>{expanded ? 'Show less' : `See all ${totalCount} members`}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={`transition-transform ${expanded ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        </div>
      )}

      {/* Invite link */}
      <div
        onClick={copyLink}
        className="flex items-center gap-2 mt-3 py-2.5 px-2.5 bg-[#f5f7fa] rounded-[10px] cursor-pointer hover:bg-[#d1fae5] transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9668" strokeWidth={2} className="flex-shrink-0"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
        <span className="flex-1 text-[11px] text-[#6b7280] truncate">
          {inviteUrl ?? (typeof window !== 'undefined' ? window.location.href : 'itutor.com')}
        </span>
        <span className="text-[11px] font-semibold text-[#0d9668] whitespace-nowrap">{linkCopied ? 'Copied!' : 'Copy link'}</span>
      </div>

      {/* Full members modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[3px]" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-[14px] w-[420px] max-w-[92vw] max-h-[80vh] flex flex-col shadow-[0_4px_14px_rgba(0,0,0,0.06)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-[18px] border-b border-[#e4e8ee] flex items-center justify-between flex-shrink-0">
              <div className="flex items-baseline gap-2">
                <h3 className="text-[16px] font-bold">Members</h3>
                <span className="text-[12px] text-[#6b7280] font-medium">{totalCount} members</span>
              </div>
              <button onClick={() => setModalOpen(false)} className="w-[30px] h-[30px] rounded-lg border-none bg-transparent cursor-pointer flex items-center justify-center text-[#6b7280] hover:bg-[#f5f7fa] hover:text-[#111827] transition-colors text-[18px]">&times;</button>
            </div>
            <div className="px-5 py-3 border-b border-[#e4e8ee] flex-shrink-0">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9ca3af] pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="w-full py-[9px] pl-[34px] pr-3 border border-[#e4e8ee] rounded-[10px] text-[13px] font-medium outline-none bg-[#f5f7fa] focus:border-[#0d9668] focus:bg-white transition-colors placeholder:text-[#9ca3af]"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-1.5">
              {modalFiltered.map((m) => {
                const name = m.profile?.full_name ?? 'Member';
                const isMe = m.user_id === currentUserId;
                const isMemberTutor = m.user_id === tutorId;
                return (
                  <div key={m.id} className="flex items-center gap-2.5 py-[9px] px-2.5 rounded-[10px] hover:bg-[#f5f7fa] transition-colors">
                    <div className="relative flex-shrink-0">
                      {m.profile?.avatar_url ? (
                        <UserAvatar avatarUrl={m.profile.avatar_url} name={name} size={34} />
                      ) : (
                        <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[12px] font-bold text-white" style={{ background: avatarColor(m.user_id) }}>
                          {getInitials(name)}
                        </div>
                      )}
                      <span className={`absolute -bottom-px -right-px w-[10px] h-[10px] rounded-full border-2 border-white ${isMemberTutor ? 'bg-[#0d9668]' : 'bg-[#d1d5db]'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate">{name}</p>
                      <p className="text-[11px] text-[#6b7280]">{isMemberTutor ? 'Head Tutor' : 'Student'}</p>
                    </div>
                    {isMemberTutor ? (
                      <span className="px-[7px] py-[2px] rounded text-[9px] font-semibold bg-[#d1fae5] text-[#047857] flex-shrink-0">Tutor</span>
                    ) : isMe ? (
                      <span className="text-[10px] text-[#6b7280] flex-shrink-0">
                        {new Date(m.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#6b7280] flex-shrink-0">
                        {new Date(m.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                );
              })}
              {modalFiltered.length === 0 && (
                <p className="text-[12px] text-[#9ca3af] text-center py-4">No members found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
