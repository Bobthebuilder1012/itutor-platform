'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import DashboardLayout from '@/components/DashboardLayout';
import ReportModal from '@/components/communities/ReportModal';
import ModeratorMenu from '@/components/communities/ModeratorMenu';
import type { QuestionDetailResponse, RateLimitInfo } from '@/lib/types/community';
import { formatDistanceToNow } from 'date-fns';

export default function QuestionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const communityId = params.communityId as string;
  const questionId = params.questionId as string;
  const { profile, loading: profileLoading } = useProfile();

  const [data, setData] = useState<QuestionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [answerBody, setAnswerBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: 'question' | 'answer'; id: string } | null>(null);

  useEffect(() => {
    if (!profileLoading && !profile) {
      router.push('/login');
    } else if (profile) {
      fetchQuestion();
    }
  }, [profile, profileLoading, router]);

  const fetchQuestion = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/communities/${communityId}/questions/${questionId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          router.push(`/communities/${communityId}`);
          return;
        }
        throw new Error('Failed to fetch question');
      }

      const questionData = await response.json();
      setData(questionData);
    } catch (error) {
      console.error('Error fetching question:', error);
      alert('Failed to load question');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answerBody.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/communities/${communityId}/questions/${questionId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: answerBody.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to post answer');
      }

      const result = await response.json();
      setRateLimit(result.rate_limit);

      // Clear form and refresh
      setAnswerBody('');
      await fetchQuestion();
    } catch (error: any) {
      alert(error.message || 'Failed to post answer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReport = (type: 'question' | 'answer', id: string) => {
    setReportTarget({ type, id });
    setShowReportModal(true);
  };

  const handleSubmitReport = async (reportData: { reason: any; details?: string }) => {
    if (!reportTarget) return;

    try {
      const response = await fetch(`/api/communities/${communityId}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: reportTarget.type,
          target_id: reportTarget.id,
          ...reportData,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit report');
      }

      alert('Report submitted successfully. Moderators will review it.');
      setShowReportModal(false);
      setReportTarget(null);
    } catch (error: any) {
      throw error;
    }
  };

  const handleModeratorAction = async (action: string) => {
    try {
      const response = await fetch(`/api/communities/${communityId}/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to perform action');
        return;
      }

      await fetchQuestion();
    } catch (error) {
      console.error('Error performing moderator action:', error);
      alert('Failed to perform action');
    }
  };

  const handleMarkBestAnswer = async (answerId: string) => {
    try {
      const response = await fetch(`/api/communities/${communityId}/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_best_answer', answer_id: answerId }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to mark best answer');
        return;
      }

      await fetchQuestion();
    } catch (error) {
      console.error('Error marking best answer:', error);
      alert('Failed to mark best answer');
    }
  };

  if (profileLoading || !profile || loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  const { question, answers, user_membership } = data;
  const isModerator = user_membership?.role === 'moderator' || user_membership?.role === 'admin';
  const isAuthor = question.author_id === profile.id;
  const canPost = user_membership?.status === 'active';

  return (
    <DashboardLayout role={profile.role} userName={profile.full_name || 'User'}>
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-6">
          <button onClick={() => router.push('/communities')} className="hover:text-itutor-green">
            Communities
          </button>
          <span>›</span>
          <button onClick={() => router.push(`/communities/${communityId}`)} className="hover:text-itutor-green">
            {question.community?.name || 'Community'}
          </button>
          <span>›</span>
          <span className="text-gray-900">Question</span>
        </div>

        {/* Question */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                {question.is_pinned && (
                  <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 3a1 1 0 011 1v5h3a1 1 0 110 2h-3v7a1 1 0 11-2 0v-7H6a1 1 0 110-2h3V4a1 1 0 011-1z" />
                  </svg>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  question.status === 'answered' ? 'bg-green-100 text-green-700' :
                  question.status === 'locked' ? 'bg-gray-100 text-gray-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {question.status === 'answered' ? 'Answered' : question.status === 'locked' ? 'Locked' : 'Open'}
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
              <h1 className="text-2xl font-bold text-gray-900 mb-4">{question.title}</h1>
              <p className="text-gray-700 whitespace-pre-wrap">{question.body}</p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>
                by <span className="font-medium">{question.author?.username}</span>
              </span>
              <span>•</span>
              <span>{formatDistanceToNow(new Date(question.created_at), { addSuffix: true })}</span>
              <span>•</span>
              <span>{question.views_count} views</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleReport('question', question.id)}
                className="text-sm text-gray-600 hover:text-red-600 transition-colors"
              >
                Report
              </button>
              {isModerator && (
                <ModeratorMenu
                  onAction={handleModeratorAction}
                  actions={[
                    { value: question.is_pinned ? 'unpin' : 'pin', label: question.is_pinned ? 'Unpin' : 'Pin' },
                    { value: question.status === 'locked' ? 'unlock' : 'lock', label: question.status === 'locked' ? 'Unlock' : 'Lock' },
                    { value: 'remove', label: 'Remove', variant: 'danger' },
                  ]}
                />
              )}
            </div>
          </div>
        </div>

        {/* Answers */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {answers.length} {answers.length === 1 ? 'Answer' : 'Answers'}
          </h2>

          {answers.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <p className="text-gray-600">No answers yet. Be the first to answer!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {answers.map((answer) => (
                <div
                  key={answer.id}
                  className={`bg-white rounded-lg border p-6 ${
                    answer.is_best ? 'border-itutor-green bg-green-50/30' : 'border-gray-200'
                  }`}
                >
                  {answer.is_best && (
                    <div className="flex items-center gap-2 text-itutor-green font-semibold mb-3">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Best Answer
                    </div>
                  )}
                  <p className="text-gray-700 whitespace-pre-wrap mb-4">{answer.body}</p>
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span>by <span className="font-medium">{answer.author?.username}</span></span>
                      <span>•</span>
                      <span>{formatDistanceToNow(new Date(answer.created_at), { addSuffix: true })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!answer.is_best && (isModerator || isAuthor) && (
                        <button
                          onClick={() => handleMarkBestAnswer(answer.id)}
                          className="text-sm text-itutor-green hover:text-emerald-600 transition-colors"
                        >
                          Mark as Best
                        </button>
                      )}
                      <button
                        onClick={() => handleReport('answer', answer.id)}
                        className="text-sm text-gray-600 hover:text-red-600 transition-colors"
                      >
                        Report
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Answer Form */}
        {question.status !== 'locked' && canPost && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Your Answer</h2>
            {rateLimit && !rateLimit.allowed && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4 text-sm text-red-700">
                You have reached the daily limit of {rateLimit.limit} answers.
              </div>
            )}
            <form onSubmit={handleSubmitAnswer}>
              <textarea
                value={answerBody}
                onChange={(e) => setAnswerBody(e.target.value)}
                placeholder="Write your answer..."
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-itutor-green resize-none mb-4"
                disabled={isSubmitting || (rateLimit && !rateLimit.allowed)}
              />
              <button
                type="submit"
                disabled={isSubmitting || !answerBody.trim() || (rateLimit && !rateLimit.allowed)}
                className="px-4 py-2 bg-itutor-green text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Posting...' : 'Post Answer'}
              </button>
            </form>
          </div>
        )}

        {question.status === 'locked' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
            <p className="text-yellow-800">This question has been locked by moderators. No new answers can be added.</p>
          </div>
        )}

        {!canPost && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <p className="text-red-800">You cannot post in this community.</p>
          </div>
        )}

        {/* Report Modal */}
        {reportTarget && (
          <ReportModal
            isOpen={showReportModal}
            onClose={() => {
              setShowReportModal(false);
              setReportTarget(null);
            }}
            onSubmit={handleSubmitReport}
            targetType={reportTarget.type}
          />
        )}
      </div>
    </DashboardLayout>
  );
}



