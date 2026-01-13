// =====================================================
// VERIFICATION PROCESSING API
// =====================================================
// Processes uploaded document with OCR and generates system recommendation

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ocrProvider } from '@/lib/ocr/ocrProvider';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const requestId = params.id;

    // Use service role client to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get verification request
    const { data: verificationRequest, error: requestError } = await supabase
      .from('tutor_verification_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (requestError || !verificationRequest) {
      console.error('Verification request not found:', requestError);
      return NextResponse.json(
        { error: 'Verification request not found' },
        { status: 404 }
      );
    }

    // Check if already processed
    if (verificationRequest.status !== 'SUBMITTED') {
      return NextResponse.json(
        {
          error: `Request already in status: ${verificationRequest.status}`,
        },
        { status: 400 }
      );
    }

    // Update status to PROCESSING
    await supabase
      .from('tutor_verification_requests')
      .update({
        status: 'PROCESSING',
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    // Update profile status
    await supabase
      .from('profiles')
      .update({ tutor_verification_status: 'PROCESSING' })
      .eq('id', verificationRequest.tutor_id);

    // Log event
    await supabase.from('tutor_verification_events').insert({
      request_id: requestId,
      event_type: 'OCR_STARTED',
      payload: {
        file_path: verificationRequest.file_path,
        file_type: verificationRequest.file_type,
      },
    });

    // Get tutor profile for name matching
    const { data: tutorProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, display_name')
      .eq('id', verificationRequest.tutor_id)
      .single();

    if (profileError) {
      console.error('Error fetching tutor profile:', profileError);
      throw new Error('Tutor profile not found');
    }

    // Process document with OCR
    console.log('🔍 Processing document with OCR...');
    const ocrResult = await ocrProvider.processDocument(
      verificationRequest.file_path,
      verificationRequest.file_type
    );

    // Log OCR completion
    await supabase.from('tutor_verification_events').insert({
      request_id: requestId,
      event_type: 'OCR_DONE',
      payload: {
        confidence_score: ocrResult.confidenceScore,
        extracted_fields: ocrResult.extractedJson,
      },
    });

    // Generate system recommendation
    const recommendation = ocrProvider.generateRecommendation(
      ocrResult,
      tutorProfile
    );

    // Log system recommendation
    await supabase.from('tutor_verification_events').insert({
      request_id: requestId,
      event_type: 'SYSTEM_RECOMMENDED',
      payload: {
        recommendation: recommendation.recommendation,
        reason: recommendation.reason,
        confidence_score: ocrResult.confidenceScore,
      },
    });

    // Update verification request with OCR results and recommendation
    const { error: updateError } = await supabase
      .from('tutor_verification_requests')
      .update({
        status: 'READY_FOR_REVIEW',
        extracted_text: ocrResult.extractedText,
        extracted_json: ocrResult.extractedJson,
        confidence_score: ocrResult.confidenceScore,
        system_recommendation: recommendation.recommendation,
        system_reason: recommendation.reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Error updating verification request:', updateError);
      throw updateError;
    }

    console.log('✅ Verification processing complete:', {
      requestId,
      recommendation: recommendation.recommendation,
      confidence: ocrResult.confidenceScore,
    });

    return NextResponse.json({
      success: true,
      requestId,
      status: 'READY_FOR_REVIEW',
      ocrResult: {
        extractedText: ocrResult.extractedText.substring(0, 200) + '...',
        extractedJson: ocrResult.extractedJson,
        confidenceScore: ocrResult.confidenceScore,
      },
      systemRecommendation: recommendation.recommendation,
      systemReason: recommendation.reason,
    });
  } catch (error: any) {
    console.error('Verification processing error:', error);

    // Try to update request to failed state
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      await supabase
        .from('tutor_verification_requests')
        .update({
          status: 'SUBMITTED', // Reset to allow retry
          notes: { error: error.message, timestamp: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.id);
    } catch (updateError) {
      console.error('Error resetting request status:', updateError);
    }

    return NextResponse.json(
      { error: 'Processing failed', details: error.message },
      { status: 500 }
    );
  }
}













