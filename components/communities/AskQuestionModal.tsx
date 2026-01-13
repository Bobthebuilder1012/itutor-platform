'use client';

import { useState } from 'react';
import { RateLimitInfo } from '@/lib/types/community';

interface AskQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; body: string; topic_tag?: string }) => Promise<void>;
  rateLimit?: RateLimitInfo;
  communityName: string;
}

export default function AskQuestionModal({
  isOpen,
  onClose,
  onSubmit,
  rateLimit,
  communityName,
}: AskQuestionModalProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [topicTag, setTopicTag] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Question title is required');
      return;
    }

    if (!body.trim()) {
      setError('Question body is required');
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit({
        title: title.trim(),
        body: body.trim(),
        topic_tag: topicTag.trim() || undefined,
      });
      
      // Reset form
      setTitle('');
      setBody('');
      setTopicTag('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to post question');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Ask a Question</h2>
            <p className="text-sm text-gray-600 mt-1">in {communityName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Rate Limit Warning */}
        {rateLimit && !rateLimit.allowed && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">
              You have reached the daily limit of {rateLimit.limit} questions. 
              Resets {new Date(rateLimit.reset_at || '').toLocaleDateString()}.
            </p>
          </div>
        )}

        {rateLimit && rateLimit.allowed && rateLimit.remaining <= 2 && (
          <div className="mx-6 mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-700">
              You have {rateLimit.remaining} question{rateLimit.remaining === 1 ? '' : 's'} remaining today.
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Question Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's your question?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-itutor-green"
              maxLength={200}
              disabled={isSubmitting || (rateLimit && !rateLimit.allowed)}
            />
            <p className="text-xs text-gray-500 mt-1">{title.length}/200 characters</p>
          </div>

          {/* Topic Tag */}
          <div>
            <label htmlFor="topic" className="block text-sm font-medium text-gray-700 mb-1">
              Topic (Optional)
            </label>
            <input
              type="text"
              id="topic"
              value={topicTag}
              onChange={(e) => setTopicTag(e.target.value)}
              placeholder="e.g., Kinematics, Algebra, etc."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-itutor-green"
              maxLength={50}
              disabled={isSubmitting || (rateLimit && !rateLimit.allowed)}
            />
          </div>

          {/* Body */}
          <div>
            <label htmlFor="body" className="block text-sm font-medium text-gray-700 mb-1">
              Question Details <span className="text-red-500">*</span>
            </label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Provide more details about your question..."
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-itutor-green resize-none"
              disabled={isSubmitting || (rateLimit && !rateLimit.allowed)}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (rateLimit && !rateLimit.allowed)}
              className="px-4 py-2 bg-itutor-green text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Posting...' : 'Post Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}












