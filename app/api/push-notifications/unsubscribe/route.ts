import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { userId, platform } = await request.json();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();
    
    // Delete push subscriptions for this user and platform
    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('platform', platform || 'web');

    if (error) {
      console.error('Error deleting push subscription:', error);
      throw error;
    }

    return NextResponse.json({ 
      success: true,
      message: 'Push subscription removed'
    });
  } catch (error: any) {
    console.error('Error in unsubscribe endpoint:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
