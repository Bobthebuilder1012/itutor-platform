// =====================================================
// CURRICULUM TYPES
// =====================================================
// TypeScript types for CXC syllabuses and curriculum data

export type SyllabusQualification = 'CSEC' | 'CAPE';

export type SyllabusCategory = 
  | 'Sciences'
  | 'Mathematics'
  | 'Languages'
  | 'Business'
  | 'Social Studies'
  | 'Arts'
  | 'Technical'
  | 'Other';

export interface Syllabus {
  id: string;
  subject_id: string;
  qualification: SyllabusQualification;
  category: SyllabusCategory;
  title: string;
  version: string | null;
  effective_year: number | null;
  pdf_url: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyllabusWithSubject extends Syllabus {
  subject_name: string;
  subject_curriculum: string;
  subject_level: string;
}

export interface TutorCurriculumData {
  qualification: SyllabusQualification;
  categories: {
    category: SyllabusCategory;
    syllabuses: SyllabusWithSubject[];
  }[];
}






