'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useProfile } from '@/lib/hooks/useProfile';

type RatingCommentProps = {
  rating: {
    id: string;
    stars: number;
    comment: string | null;
    created_at: string;
    student_name: string;
    helpful_count: number;
  };
  onReactionUpdate?: () => void;
};

export default function RatingComment({ rating, onReactionUpdate }: RatingCommentProps) {
  const { profile } = useProfile();
  const [userReaction, setUserReaction] = useState<'like' | 'dislike' | null>(null);
  const [helpfulCount, setHelpfulCount] = useState(rating.helpful_count || 0);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      fetchUserReaction();
    }
  }, [profile?.id, rating.id]);

  async function fetchUserReaction() {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from('rating_reactions')
        .select('reaction_type')
        .eq('rating_id', rating.id)
        .eq('user_id', profile.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned (which is fine)
        console.error('Error fetching user reaction:', error);
        return;
      }

      setUserReaction(data?.reaction_type || null);
    } catch (err) {
      console.error('Error fetching user reaction:', err);
    }
  }

  async function handleReaction(reactionType: 'like' | 'dislike') {
    if (!profile?.id || isProcessing) return;

    setIsProcessing(true);
    try {
      const response = await fetch(`/api/ratings/${rating.id}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reactionType })
      });

      if (!response.ok) {
        throw new Error('Failed to process reaction');
      }

      // Update UI optimistically
      if (userReaction === reactionType) {
        // Toggle off - removing reaction
        setUserReaction(null);
        setHelpfulCount(prev => prev + (userReaction === 'like' ? -1 : 1));
      } else if (userReaction) {
        // Switching reaction
        setUserReaction(reactionType);
        setHelpfulCount(prev => prev + (reactionType === 'like' ? 2 : -2));
      } else {
        // Adding new reaction
        setUserReaction(reactionType);
        setHelpfulCount(prev => prev + (reactionType === 'like' ? 1 : -1));
      }

      if (onReactionUpdate) {
        onReactionUpdate();
      }
    } catch (error) {
      console.error('Error handling reaction:', error);
      alert('Failed to process reaction. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }

  if (!rating.comment) return null;

  return (
    <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-900 text-sm">{rating.student_name}</span>
        <div className="flex text-sm">
          {[1, 2, 3, 4, 5].map(star => (
            <span
              key={star}
              className={star <= rating.stars ? 'text-yellow-500' : 'text-gray-300'}
            >
              ★
            </span>
          ))}
        </div>
      </div>
      
      <p className="text-sm text-gray-700 mb-3">{rating.comment}</p>
      
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {new Date(rating.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })}
        </p>

        {/* Like/Dislike Buttons */}
        {profile && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleReaction('like')}
              disabled={isProcessing}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                userReaction === 'like'
                  ? 'bg-green-500 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:border-green-500 hover:bg-green-50'
              } ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
              </svg>
              <span>{helpfulCount > 0 ? helpfulCount : ''}</span>
            </button>

            <button
              onClick={() => handleReaction('dislike')}
              disabled={isProcessing}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                userReaction === 'dislike'
                  ? 'bg-red-500 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:border-red-500 hover:bg-red-50'
              } ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}



