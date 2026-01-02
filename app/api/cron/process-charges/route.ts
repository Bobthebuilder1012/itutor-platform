import { NextRequest, NextResponse } from 'next/server';
import { processScheduledCharges } from '@/lib/services/sessionService';

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized calls
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await processScheduledCharges();
    
    return NextResponse.json({ 
      success: true,
      timestamp: new Date().toISOString()
    }, { status: 200 });
  } catch (error) {
    console.error('Error processing charges:', error);
    return NextResponse.json(
      { error: 'Failed to process charges' },
      { status: 500 }
    );
  }
}




