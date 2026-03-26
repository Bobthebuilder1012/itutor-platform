'use client';

import { useState } from 'react';

export interface Announcement {
  id: string;
  body: string;
  is_pinned: boolean;
  edited_at: string | null;
  created_at: string;
  author: { id: string; full_name: string; avatar_url: string | null };
}

interface AnnouncementItemProps {
  announcement: Announcement;
  isTutor: boolean;
  groupId: string;
  onUpdated: () => void;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function AnnouncementItem({
  announcement,
  isTutor,
  groupId,
  onUpdated,
}: AnnouncementItemProps) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(announcement.body);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!editBody.trim() || editBody === announcement.body) { setEditing(false); return; }
    setSaving(true);
    await fetch(`/api/groups/${groupId}/announcements/${announcement.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: editBody.trim() }),
    });
    setSaving(false);
    setEditing(false);
    onUpdated();
  };

  const handleTogglePin = async () => {
    await fetch(`/api/groups/${groupId}/announcements/${announcement.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_pinned: !announcement.is_pinned }),
    });
    onUpdated();
  };

  const handleDelete = async () => {
    if (!confirm('Delete this announcement?')) return;
    setDeleting(true);
    await fetch(`/api/groups/${groupId}/announcements/${announcement.id}`, { method: 'DELETE' });
    setDeleting(false);
    onUpdated();
  };

  return (
    <div className={`rounded-xl border p-4 transition-colors ${announcement.is_pinned ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'}`}>
      {announcement.is_pinned && (
        <div className="flex items-center gap-1 mb-2">
          <svg className="w-3 h-3 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 2v6l2 2-2 6H8l-2-6 2-2V2h8zm-4 18a2 2 0 01-2-2h4a2 2 0 01-2 2z" />
          </svg>
          <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Pinned</span>
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Avatar */}
        {announcement.author.avatar_url ? (
          <img src={announcement.author.avatar_url} alt={announcement.author.full_name} className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
            {getInitials(announcement.author.full_name)}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">{announcement.author.full_name}</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">Tutor</span>
              <span className="text-xs text-gray-400">{timeAgo(announcement.created_at)}</span>
              {announcement.edited_at && (
                <span className="text-[10px] text-gray-400 italic">edited</span>
              )}
            </div>

            {/* Tutor actions */}
            {isTutor && !editing && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTogglePin}
                  className={`text-[11px] font-medium transition-colors ${announcement.is_pinned ? 'text-amber-500 hover:text-amber-700' : 'text-gray-400 hover:text-amber-500'}`}
                  title={announcement.is_pinned ? 'Unpin' : 'Pin to top'}
                >
                  {announcement.is_pinned ? '📌 Unpin' : '📌 Pin'}
                </button>
                <button
                  onClick={() => { setEditing(true); setEditBody(announcement.body); }}
                  className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-[11px] text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* Body */}
          {editing ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={3}
                autoFocus
                className="w-full resize-none border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{announcement.body}</p>
          )}
        </div>
      </div>
    </div>
  );
}
