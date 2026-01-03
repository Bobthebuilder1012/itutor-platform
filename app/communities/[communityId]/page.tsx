'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import DashboardLayout from '@/components/DashboardLayout';
import QuestionCard from '@/components/communities/QuestionCard';
import AskQuestionModal from '@/components/communities/AskQuestionModal';
import type { Community, Question, QuestionFilters, RateLimitInfo } from '@/lib/types/community';

export default function CommunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const communityId = params.communityId as string;
  const { profile, loading: profileLoading } = useProfile();

  const [community, setCommunity] = useState<Community | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'new' | 'unanswered' | 'top_today' | 'top_week'>('new');
  const [topicFilter, setTopicFilter] = useState('all');
  const [mySchoolOnly, setMySchoolOnly] = useState(false);
  const [showAskModal, setShowAskModal] = useState(false);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);

  useEffect(() => {
    if (!profileLoading && !profile) {
      router.push('/login');
    } else if (profile) {
      fetchCommunity();
      fetchQuestions();
    }
  }, [profile, profileLoading, router]);

  useEffect(() => {
    if (profile && community) {
      fetchQuestions();
    }
  }, [activeTab, topicFilter, mySchoolOnly]);

  const fetchCommunity = async () => {
    try {
      const response = await fetch(`/api/communities/${communityId}`);
      if (!response.ok) {
        if (response.status === 404) {
          router.push('/communities');
          return;
        }
        throw new Error('Failed to fetch community');
      }

      const data = await response.json();
      setCommunity(data);
    } catch (error) {
      console.error('Error fetching community:', error);
      alert('Failed to load community');
    }
  };

  const fetchQuestions = async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      params.append('sort', activeTab);
      if (topicFilter !== 'all') params.append('topic_tag', topicFilter);
      if (mySchoolOnly && profile?.institution_id) {
        params.append('author_institution_id', profile.institution_id);
      }

      const response = await fetch(`/api/communities/${communityId}/questions?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setQuestions(data.questions || []);
      }
    } catch (error) {
      console.error('Error fetching questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAskQuestion = async (data: { title: string; body: string; topic_tag?: string }) => {
    try {
      const response = await fetch(`/api/communities/${communityId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to post question');
      }

      const result = await response.json();
      setRateLimit(result.rate_limit);

      // Refresh questions
      await fetchQuestions();
      setShowAskModal(false);
    } catch (error: any) {
      throw error;
    }
  };

  if (profileLoading || !profile || !community) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  // School/Form Community View
  if (community.type === 'school' || community.type === 'school_form') {
    return (
      <DashboardLayout role={profile.role} userName={profile.full_name || 'User'}>
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <button onClick={() => router.push('/communities')} className="hover:text-itutor-green">
                Communities
              </button>
              <span>›</span>
              <span>{community.name}</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">{community.name}</h1>
            {community.description && (
              <p className="text-gray-600 mt-2">{community.description}</p>
            )}
            <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
              <span>{community.member_count} members</span>
              <span className="px-2 py-1 rounded bg-blue-100 text-blue-700">
                {community.type === 'school' ? 'School Community' : 'Form Community'}
              </span>
            </div>
          </div>

          {/* Coming Soon */}
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Coming Soon</h2>
            <p className="text-gray-600 mb-6">
              School announcements, discussions, and classmate messaging will be available here soon!
            </p>
            <button
              onClick={() => router.push('/communities')}
              className="px-4 py-2 bg-itutor-green text-white rounded-lg hover:bg-emerald-600 transition-colors"
            >
              Back to Communities
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Subject Q&A Community View
  return (
    <DashboardLayout role={profile.role} userName={profile.full_name || 'User'}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
            <button onClick={() => router.push('/communities')} className="hover:text-itutor-green">
              Communities
            </button>
            <span>›</span>
            <span>{community.name}</span>
          </div>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900">{community.name}</h1>
              {community.description && (
                <p className="text-gray-600 mt-2">{community.description}</p>
              )}
              <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
                <span>{community.member_count} members</span>
                {community.level_tag && (
                  <span className="px-2 py-1 rounded bg-gray-100">{community.level_tag}</span>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowAskModal(true)}
              className="px-4 py-2 bg-itutor-green text-white rounded-lg hover:bg-emerald-600 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Ask Question
            </button>
          </div>
        </div>

        {/* CTA Block */}
        <div className="bg-gradient-to-r from-itutor-green/10 to-emerald-100/50 rounded-lg p-6 mb-6 border border-itutor-green/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Need 1-on-1 help?</h3>
              <p className="text-sm text-gray-600">Connect with a verified iTutor for personalized support</p>
            </div>
            <button
              onClick={() => router.push('/student/find-tutors')}
              className="px-4 py-2 bg-itutor-green text-white rounded-lg hover:bg-emerald-600 transition-colors whitespace-nowrap"
            >
              Find an iTutor
            </button>
          </div>
        </div>

        {/* Tabs and Filters */}
        <div className="bg-white rounded-lg border border-gray-200 mb-6">
          <div className="border-b border-gray-200 px-6 py-3">
            <div className="flex items-center gap-1">
              {[
                { value: 'new', label: 'New' },
                { value: 'unanswered', label: 'Unanswered' },
                { value: 'top_today', label: 'Top Today' },
                { value: 'top_week', label: 'Top This Week' },
              ].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value as any)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === tab.value
                      ? 'bg-itutor-green text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-6 py-3 flex items-center gap-3">
            {profile.institution_id && (
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mySchoolOnly}
                  onChange={(e) => setMySchoolOnly(e.target.checked)}
                  className="rounded border-gray-300 text-itutor-green focus:ring-itutor-green"
                />
                My School Only
              </label>
            )}
          </div>
        </div>

        {/* Questions List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green"></div>
          </div>
        ) : questions.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No questions yet</h3>
            <p className="text-gray-600 mb-4">Be the first to ask a question in this community!</p>
            <button
              onClick={() => setShowAskModal(true)}
              className="px-4 py-2 bg-itutor-green text-white rounded-lg hover:bg-emerald-600 transition-colors"
            >
              Ask Question
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                communityId={communityId}
              />
            ))}
          </div>
        )}

        {/* Ask Question Modal */}
        <AskQuestionModal
          isOpen={showAskModal}
          onClose={() => setShowAskModal(false)}
          onSubmit={handleAskQuestion}
          rateLimit={rateLimit || undefined}
          communityName={community.name}
        />
      </div>
    </DashboardLayout>
  );
}





