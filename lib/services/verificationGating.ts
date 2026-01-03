// =====================================================
// VERIFICATION GATING HELPERS
// =====================================================
// Helper functions to check verification status for gated features

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Check if a tutor is verified
 * Returns true if verified, false otherwise
 */
export async function isTutorVerified(
  supabase: SupabaseClient,
  tutorId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('tutor_verification_status')
    .eq('id', tutorId)
    .single();

  if (error || !data) {
    return false;
  }

  return data.tutor_verification_status === 'VERIFIED';
}

/**
 * Check if a tutor can be liked
 * Throws error with message if not allowed
 */
export async function checkCanLikeTutor(
  supabase: SupabaseClient,
  tutorId: string
): Promise<void> {
  const isVerified = await isTutorVerified(supabase, tutorId);

  if (!isVerified) {
    throw new Error('Tutor must be verified to be liked');
  }
}

/**
 * Get verification status for a tutor
 * Returns status and verification date
 */
export async function getTutorVerificationStatus(
  supabase: SupabaseClient,
  tutorId: string
): Promise<{
  status: string;
  verified_at: string | null;
  is_verified: boolean;
}> {
  const { data, error } = await supabase
    .from('profiles')
    .select('tutor_verification_status, tutor_verified_at')
    .eq('id', tutorId)
    .single();

  if (error || !data) {
    return {
      status: 'UNVERIFIED',
      verified_at: null,
      is_verified: false,
    };
  }

  return {
    status: data.tutor_verification_status,
    verified_at: data.tutor_verified_at,
    is_verified: data.tutor_verification_status === 'VERIFIED',
  };
}

// TODO: Integrate into like API endpoint
// Example usage in like API route:
//
// import { checkCanLikeTutor } from '@/lib/services/verificationGating';
//
// export async function POST(request: NextRequest) {
//   const { tutorId } = await request.json();
//   
//   // Check verification before allowing like
//   try {
//     await checkCanLikeTutor(supabase, tutorId);
//   } catch (error) {
//     return NextResponse.json(
//       { error: error.message },
//       { status: 403 }
//     );
//   }
//   
//   // Proceed with creating like...
// }






