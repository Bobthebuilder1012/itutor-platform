'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { createCommunityAction, updateCommunityAvatarAction } from '@/lib/communities/actions';

interface CreateCommunityModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateCommunityModal({ open, onClose }: CreateCommunityModalProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSubmitting(true);
    try {
      const result = await createCommunityAction({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error ?? 'Failed to create community');
        setSubmitting(false);
        return;
      }
      const communityId = result.communityId!;
      if (file) {
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${communityId}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('community-avatars')
          .upload(path, file, { contentType: file.type, upsert: true });
        if (!uploadError) {
          const { data } = supabase.storage.from('community-avatars').getPublicUrl(path);
          await updateCommunityAvatarAction(communityId, data.publicUrl);
        }
      }
      onClose();
      setName('');
      setDescription('');
      setFile(null);
      router.push(`/communities/${communityId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
    setSubmitting(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-community-title"
      >
        <h2 id="create-community-title" className="text-lg font-semibold text-gray-900 mb-4">
          Create community
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          <div>
            <label htmlFor="create-name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              id="create-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-900 focus:border-itutor-green focus:ring-1 focus:ring-itutor-green"
              placeholder="Community name"
              required
            />
          </div>
          <div>
            <label htmlFor="create-desc" className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <textarea
              id="create-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-900 focus:border-itutor-green focus:ring-1 focus:ring-itutor-green"
              placeholder="What's this community about?"
              rows={2}
            />
          </div>
          <div>
            <label htmlFor="create-avatar" className="block text-sm font-medium text-gray-700 mb-1">
              Avatar (optional)
            </label>
            <input
              id="create-avatar"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-gray-600 file:mr-2 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-gray-700"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-itutor-green text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
