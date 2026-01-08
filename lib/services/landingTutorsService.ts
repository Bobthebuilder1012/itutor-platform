import { createClient } from '@supabase/supabase-js';

export type FeaturedTutor = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  rating_average: number | null;
  rating_count: number;
  isVerified: boolean;
  subjects: { name: string; curriculum: string; price: number }[];
  priceRange: { min: number; max: number };
};

export async function getFeaturedTutors(): Promise<FeaturedTutor[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Fetch tutors with their subjects and pricing
  const { data: tutorsData, error: tutorsError } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, rating_average, rating_count')
    .eq('role', 'tutor')
    .order('rating_average', { ascending: false, nullsLast: true })
    .order('rating_count', { ascending: false })
    .limit(12);

  if (tutorsError) {
    console.error('Error fetching tutors:', tutorsError);
    return [];
  }

  if (!tutorsData || tutorsData.length === 0) {
    return [];
  }

  // Fetch tutor subjects with pricing
  const tutorIds = tutorsData.map((t) => t.id);
  const { data: subjectsData, error: subjectsError } = await supabase
    .from('tutor_subjects')
    .select(
      `
      tutor_id,
      price_per_hour_ttd,
      subject:subjects (
        name,
        curriculum
      )
    `
    )
    .in('tutor_id', tutorIds);

  if (subjectsError) {
    console.error('Error fetching subjects:', subjectsError);
  }

  // Check for verified tutors
  const { data: verifiedData, error: verifiedError } = await supabase
    .from('tutor_verified_subjects')
    .select('tutor_id')
    .in('tutor_id', tutorIds);

  if (verifiedError) {
    console.error('Error fetching verified status:', verifiedError);
  }

  const verifiedTutorIds = new Set(verifiedData?.map((v) => v.tutor_id) || []);

  // Aggregate data per tutor
  const featuredTutors: FeaturedTutor[] = tutorsData.map((tutor) => {
    const tutorSubjects = subjectsData?.filter((s) => s.tutor_id === tutor.id) || [];
    
    const subjects = tutorSubjects
      .filter((ts) => ts.subject)
      .map((ts) => ({
        name: (ts.subject as any).name,
        curriculum: (ts.subject as any).curriculum,
        price: ts.price_per_hour_ttd,
      }));

    const prices = subjects.map((s) => s.price);
    const priceRange = {
      min: prices.length > 0 ? Math.min(...prices) : 0,
      max: prices.length > 0 ? Math.max(...prices) : 0,
    };

    return {
      id: tutor.id,
      full_name: tutor.full_name,
      avatar_url: tutor.avatar_url,
      rating_average: tutor.rating_average,
      rating_count: tutor.rating_count,
      isVerified: verifiedTutorIds.has(tutor.id),
      subjects,
      priceRange,
    };
  });

  // Sort: verified first, then by rating
  return featuredTutors.sort((a, b) => {
    if (a.isVerified !== b.isVerified) {
      return a.isVerified ? -1 : 1;
    }
    const ratingA = a.rating_average || 0;
    const ratingB = b.rating_average || 0;
    if (ratingA !== ratingB) {
      return ratingB - ratingA;
    }
    return b.rating_count - a.rating_count;
  });
}

