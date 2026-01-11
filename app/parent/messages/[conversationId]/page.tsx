'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import ConversationView from '@/components/ConversationView';
import { getDisplayName } from '@/lib/utils/displayName';

export default function ParentConversationPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const conversationId = params.conversationId as string;
  
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'parent') {
      router.push('/login');
      return;
    }

    loadConversation();
  }, [profile, profileLoading, router, conversationId]);

  async function loadConversation() {
    if (!profile) return;

    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('participant_1_id, participant_2_id')
        .eq('id', conversationId)
        .single();

      if (error) throw error;

      // Determine other user
      const other = data.participant_1_id === profile.id ? data.participant_2_id : data.participant_1_id;
      setOtherUserId(other);
    } catch (error) {
      console.error('Error loading conversation:', error);
      alert('Failed to load conversation');
      router.push('/parent/messages');
    } finally {
      setLoading(false);
    }
  }

  if (profileLoading || loading || !profile || !otherUserId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  return (
    <DashboardLayout role="parent" userName={getDisplayName(profile)}>
      <div className="px-4 py-6 sm:px-0 max-w-5xl mx-auto">
        <ConversationView
          conversationId={conversationId}
          currentUserId={profile.id}
          otherUserId={otherUserId}
        />
      </div>
    </DashboardLayout>
  );
}











