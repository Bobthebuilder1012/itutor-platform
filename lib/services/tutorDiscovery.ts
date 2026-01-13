// =====================================================
// TUTOR DISCOVERY HELPERS
// =====================================================
// Helper functions for tutor search with verification ranking

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Build tutor search query with verification ranking
 * Verified tutors always appear first
 */
export function buildTutorSearchQuery(
  supabase: SupabaseClient,
  filters: {
    subject?: string;
    minRating?: number;
    maxPrice?: number;
    searchTerm?: string;
  } = {}
) {
  let query = supabase
    .from('profiles')
    .select('*, tutor_subjects(*), session_types(*)')
    .eq('role', 'tutor');

  // Apply filters
  if (filters.subject) {
    query = query.contains('tutor_subjects', { subject_id: filters.subject });
  }

  if (filters.minRating) {
    query = query.gte('rating', filters.minRating);
  }

  if (filters.searchTerm) {
    query = query.or(
      `full_name.ilike.%${filters.searchTerm}%,display_name.ilike.%${filters.searchTerm}%`
    );
  }

  // CRITICAL: Sort by verification status first (verified tutors at top)
  // Then sort by other criteria
  query = query
    .order('tutor_verification_status', { ascending: false }) // VERIFIED comes before others alphabetically
    .order('rating', { ascending: false })
    .order('created_at', { ascending: false });

  return query;
}

/**
 * Alternative: Use raw SQL for more control over sorting
 * VERIFIED tutors explicitly at top
 */
export async function searchVerifiedTutorsFirst(
  supabase: SupabaseClient,
  filters: {
    subject?: string;
    limit?: number;
  } = {}
) {
  // This ensures VERIFIED status is prioritized
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'tutor')
    .order('(tutor_verification_status = \'VERIFIED\')', { ascending: false })
    .order('rating', { ascending: false })
    .limit(filters.limit || 20);

  return { data, error };
}

// TODO: Integrate into tutor search/discovery pages
// Example usage:
//
// import { buildTutorSearchQuery } from '@/lib/services/tutorDiscovery';
//
// const query = buildTutorSearchQuery(supabase, {
//   subject: selectedSubject,
//   minRating: 4.0,
//   searchTerm: searchInput
// });
//
// const { data: tutors } = await query;
// // Verified tutors will automatically appear first!













