// =====================================================
// CURRICULUM SERVICE
// =====================================================
// Data access layer for CXC syllabuses

import { supabase } from '@/lib/supabase/client';
import type { 
  Syllabus, 
  SyllabusWithSubject, 
  TutorCurriculumData,
  SyllabusCategory 
} from '@/lib/types/curriculum';

/**
 * Get all syllabuses for subjects a tutor teaches
 * Returns syllabuses with subject details, sorted by qualification and category
 */
export async function getTutorSyllabuses(tutorId: string): Promise<SyllabusWithSubject[]> {
  try {
    // First, get the tutor's subject IDs
    const { data: tutorSubjects, error: subjectsError } = await supabase
      .from('tutor_subjects')
      .select('subject_id')
      .eq('tutor_id', tutorId);

    if (subjectsError) {
      console.error('Error fetching tutor subjects:', subjectsError);
      return [];
    }

    if (!tutorSubjects || tutorSubjects.length === 0) {
      console.log('Tutor has no subjects');
      return [];
    }

    // Extract subject IDs
    const subjectIds = tutorSubjects.map(ts => ts.subject_id);

    // Now fetch syllabuses for those subjects
    const { data, error } = await supabase
      .from('syllabuses')
      .select(`
        *,
        subjects:subject_id (
          name,
          curriculum,
          level
        )
      `)
      .in('subject_id', subjectIds)
      .order('qualification', { ascending: true })
      .order('category', { ascending: true })
      .order('title', { ascending: true });

    if (error) {
      console.error('Error fetching tutor syllabuses:', error);
      return [];
    }

    if (!data) {
      return [];
    }

    // Transform data to include subject details at top level
    const syllabuses: SyllabusWithSubject[] = data.map((item: any) => ({
      id: item.id,
      subject_id: item.subject_id,
      qualification: item.qualification,
      category: item.category,
      title: item.title,
      version: item.version,
      effective_year: item.effective_year,
      pdf_url: item.pdf_url,
      notes: item.notes,
      created_at: item.created_at,
      updated_at: item.updated_at,
      subject_name: item.subjects?.name || 'Unknown Subject',
      subject_curriculum: item.subjects?.curriculum || '',
      subject_level: item.subjects?.level || '',
    }));

    return syllabuses;
  } catch (error) {
    console.error('Exception in getTutorSyllabuses:', error);
    return [];
  }
}

/**
 * Get a single syllabus by ID with subject details
 */
export async function getSyllabusById(syllabusId: string): Promise<SyllabusWithSubject | null> {
  try {
    const { data, error } = await supabase
      .from('syllabuses')
      .select(`
        *,
        subjects:subject_id (
          name,
          curriculum,
          level
        )
      `)
      .eq('id', syllabusId)
      .single();

    if (error) {
      console.error('Error fetching syllabus by ID:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    const syllabus: SyllabusWithSubject = {
      id: data.id,
      subject_id: data.subject_id,
      qualification: data.qualification,
      category: data.category,
      title: data.title,
      version: data.version,
      effective_year: data.effective_year,
      pdf_url: data.pdf_url,
      notes: data.notes,
      created_at: data.created_at,
      updated_at: data.updated_at,
      subject_name: data.subjects?.name || 'Unknown Subject',
      subject_curriculum: data.subjects?.curriculum || '',
      subject_level: data.subjects?.level || '',
    };

    return syllabus;
  } catch (error) {
    console.error('Exception in getSyllabusById:', error);
    return null;
  }
}

/**
 * Get ALL syllabuses (not filtered by tutor)
 * For reference library view
 */
export async function getAllSyllabuses(): Promise<SyllabusWithSubject[]> {
  try {
    const { data, error } = await supabase
      .from('syllabuses')
      .select(`
        *,
        subjects:subject_id (
          name,
          curriculum,
          level
        )
      `)
      .order('qualification', { ascending: true })
      .order('category', { ascending: true })
      .order('title', { ascending: true });

    if (error) {
      console.error('Error fetching all syllabuses:', error);
      return [];
    }

    if (!data) {
      return [];
    }

    // Transform data
    const syllabuses: SyllabusWithSubject[] = data.map((item: any) => ({
      id: item.id,
      subject_id: item.subject_id,
      qualification: item.qualification,
      category: item.category,
      title: item.title,
      version: item.version,
      effective_year: item.effective_year,
      pdf_url: item.pdf_url,
      notes: item.notes,
      created_at: item.created_at,
      updated_at: item.updated_at,
      subject_name: item.subjects?.name || 'Unknown Subject',
      subject_curriculum: item.subjects?.curriculum || '',
      subject_level: item.subjects?.level || '',
    }));

    return syllabuses;
  } catch (error) {
    console.error('Exception in getAllSyllabuses:', error);
    return [];
  }
}

/**
 * Get tutor's curriculum grouped by qualification and category
 * Ready for UI rendering
 */
export async function getTutorCurriculumGrouped(tutorId: string): Promise<TutorCurriculumData[]> {
  try {
    const syllabuses = await getTutorSyllabuses(tutorId);

    if (syllabuses.length === 0) {
      return [];
    }

    return groupSyllabusesByQualificationAndCategory(syllabuses);
  } catch (error) {
    console.error('Exception in getTutorCurriculumGrouped:', error);
    return [];
  }
}

/**
 * Get ALL syllabuses grouped by qualification and category
 */
export async function getAllCurriculumGrouped(): Promise<TutorCurriculumData[]> {
  try {
    const syllabuses = await getAllSyllabuses();

    if (syllabuses.length === 0) {
      return [];
    }

    return groupSyllabusesByQualificationAndCategory(syllabuses);
  } catch (error) {
    console.error('Exception in getAllCurriculumGrouped:', error);
    return [];
  }
}

/**
 * Helper: Group syllabuses by qualification and category
 */
function groupSyllabusesByQualificationAndCategory(syllabuses: SyllabusWithSubject[]): TutorCurriculumData[] {
  // Group by qualification (CSEC, CAPE)
  const qualificationGroups = new Map<string, SyllabusWithSubject[]>();
  
  syllabuses.forEach(syllabus => {
    const qual = syllabus.qualification;
    if (!qualificationGroups.has(qual)) {
      qualificationGroups.set(qual, []);
    }
    qualificationGroups.get(qual)!.push(syllabus);
  });

  // For each qualification, group by category
  const result: TutorCurriculumData[] = [];

  qualificationGroups.forEach((syllabusesInQual, qualification) => {
    const categoryGroups = new Map<SyllabusCategory, SyllabusWithSubject[]>();
    
    syllabusesInQual.forEach(syllabus => {
      const cat = syllabus.category;
      if (!categoryGroups.has(cat)) {
        categoryGroups.set(cat, []);
      }
      categoryGroups.get(cat)!.push(syllabus);
    });

    const categories = Array.from(categoryGroups.entries()).map(([category, syllabuses]) => ({
      category,
      syllabuses: syllabuses.sort((a, b) => a.subject_name.localeCompare(b.subject_name))
    }));

    // Sort categories alphabetically
    categories.sort((a, b) => a.category.localeCompare(b.category));

    result.push({
      qualification: qualification as 'CSEC' | 'CAPE',
      categories
    });
  });

  // Sort qualifications: CSEC first, then CAPE
  result.sort((a, b) => {
    if (a.qualification === 'CSEC' && b.qualification === 'CAPE') return -1;
    if (a.qualification === 'CAPE' && b.qualification === 'CSEC') return 1;
    return 0;
  });

  return result;
}

