import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { userId, subscription, platform } = await request.json();
    
    if (!userId || !subscription) {
      return NextResponse.json(
        { error: 'Missing userId or subscription' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();
    
    // Store web push subscription
    // The subscription object contains endpoint, keys, etc.
    const { error } = await supabase
      .from('push_tokens')
      .upsert({
        user_id: userId,
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
