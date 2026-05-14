import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { userId, subscription, platform } = await request.json();
    const authClient = await getServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    const effectiveUserId = user?.id || userId;
    
    if (!effectiveUserId || !subscription) {
      return NextResponse.json(
        { error: 'Missing authenticated user or subscription' },
        { status: 400 }
      );
    }

    if (user && userId && userId !== user.id) {
      return NextResponse.json(
        { error: 'Cannot register a subscription for another user' },
        { status: 403 }
      );
    }

    const supabase = getServiceClient();
    
    // Store web push subscription
    // The subscription object contains endpoint, keys, etc.
    const { error } = await supabase
      .from('push_tokens')
      .upsert({
        user_id: effectiveUserId,
        token: JSON.stringify(subscription),
        platform: platform || 'web',
        last_used_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,token'
      });

    if (error) {
      console.error('Error storing push subscription:', error);
      throw error;
    }

    return NextResponse.json({ 
      success: true,
      message: 'Push subscription saved'
    });
  } catch (error: any) {
    console.error('Error in subscribe endpoint:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
