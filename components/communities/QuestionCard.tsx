'use client';

import Link from 'next/link';
import { Question } from '@/lib/types/community';
import { formatDistanceToNow } from 'date-fns';

interface QuestionCardProps {
  question: Question;
  communityId: string;
}

export default function QuestionCard({ question, communityId }: QuestionCardProps) {
  const getStatusColor = () => {
    switch (question.status) {
      case 'answered':
        return 'bg-green-100 text-green-700';
      case 'locked':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-blue-100 text-blue-700';
    }
  };

  const getStatusLabel = () => {
    switch (question.status) {
      case 'answered':
        return 'Answered';
      case 'locked':
        return 'Locked';
      default:
        return 'Open';
    }
  };

  return (
    <Link
      href={`/communities/${communityId}/q/${question.id}`}
      className="block bg-white rounded-lg border border-gray-200 hover:border-itutor-green/30 hover:shadow-sm transition-all p-5"
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        {question.is_pinned && (
          <div className="flex-shrink-0">
            <svg
              className="w-5 h-5 text-yellow-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M10 3a1 1 0 011 1v5h3a1 1 0 110 2h-3v7a1 1 0 11-2 0v-7H6a1 1 0 110-2h3V4a1 1 0 011-1z" />
            </svg>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 hover:text-itutor-green transition-colors mb-1">
            {question.title}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor()}`}>
              {getStatusLabel()}
            </span>
            {question.topic_tag && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                {question.topic_tag}
              </span>
            )}
            {question.level_tag && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                {question.level_tag}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body Preview */}
      <p className="text-sm text-gray-600 mb-4 line-clamp-2">
        {question.body}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {question.answer_count} {question.answer_count === 1 ? 'answer' : 'answers'}
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {question.views_count} views
          </span>
        </div>
        <div className="flex items-center gap-2">
          {question.author && (
            <span className="text-gray-600">
              by <span className="font-medium">{question.author.username}</span>
            </span>
          )}
          <span>•</span>
          <span>
            {formatDistanceToNow(new Date(question.created_at), { addSuffix: true })}
          </span>
        </div>
      </div>
    </Link>
  );
}



