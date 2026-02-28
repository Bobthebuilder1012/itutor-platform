'use client';

import { useCallback, useEffect, useState } from 'react';
import AnnouncementItem, { type Announcement } from './AnnouncementItem';

interface AnnouncementBoardProps {
  groupId: string;
  isTutor: boolean;
}

export default function AnnouncementBoard({ groupId, isTutor }: AnnouncementBoardProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/announcements`);
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data.announcements ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/groups/${groupId}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (!res.ok) throw new Error();
      setBody('');
      fetchAnnouncements();
    } catch {
      setError('Could not post announcement. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Tutor composer */}
      {isTutor && (
        <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50">
          <p className="text-xs font-semibold text-emerald-700 mb-2 uppercase tracking-wide">
            Post Announcement
          </p>
          <form onSubmit={handlePost} className="space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share an update, schedule change, or important notice with your group…"
              rows={3}
              disabled={submitting}
              className="w-full resize-none border border-emerald-200 bg-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
            <div className="flex items-center justify-between">
              {error ? (
                <p className="text-xs text-red-500">{error}</p>
              ) : (
                <p className="text-xs text-gray-400">Only tutors can post announcements</p>
              )}
              <button
                type="submit"
                disabled={submitting || !body.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {submitting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Announcements list */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <div className="text-4xl mb-3">📣</div>
          <p className="text-sm font-medium text-gray-600">No announcements yet</p>
          {isTutor ? (
            <p className="text-xs text-gray-400 mt-1">Post your first announcement above to notify your group.</p>
          ) : (
            <p className="text-xs text-gray-400 mt-1">Your tutor hasn't posted any announcements yet.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {!isTutor && (
            <p className="text-xs text-gray-400 text-center pb-1">
              Only tutors can post in this channel
            </p>
          )}
          {announcements.map((a) => (
            <AnnouncementItem
              key={a.id}
              announcement={a}
              isTutor={isTutor}
              groupId={groupId}
              onUpdated={fetchAnnouncements}
            />
          ))}
        </div>
      )}
    </div>
  );
}
