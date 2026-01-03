import { supabase } from './client';

export type UserSubject = {
  id: string;
  user_id: string;
  subject_id: string;
  created_at: string;
  updated_at: string;
};

export type SubjectWithDetails = {
  id: string;
  level: 'CSEC' | 'CAPE';
  name: string;
  label: string;
  code: string | null;
  is_active: boolean;
};

export type UserSubjectWithDetails = UserSubject & {
  subject: SubjectWithDetails;
};

/**
 * Get all subjects for a user with full subject details
 */
export async function getUserSubjects(userId: string) {
  const { data, error } = await supabase
    .from('user_subjects')
    .select(`
      id,
      user_id,
      subject_id,
      created_at,
      updated_at,
      subject:subjects(
        id,
        level,
        name,
        label,
        code,
        is_active
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching user subjects:', error);
    return { data: null, error };
  }

  return { data: data as unknown as UserSubjectWithDetails[], error: null };
}

/**
 * Get subject IDs for a user (returns array of UUIDs)
 */
export async function getUserSubjectIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_subjects')
    .select('subject_id')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching user subject IDs:', error);
    return [];
  }

  return data.map((item) => item.subject_id);
}

/**
 * Get subject labels for a user (returns array of strings like "CSEC Mathematics")
 */
export async function getUserSubjectLabels(userId: string): Promise<string[]> {
  const { data, error } = await getUserSubjects(userId);

  if (error || !data) {
    return [];
  }

  return data.map((item) => item.subject.label);
}

/**
 * Get all subjects from the subjects table
 */
export async function getAllSubjects() {
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('is_active', true)
    .order('level', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching all subjects:', error);
    return { data: null, error };
  }

  return { data: data as SubjectWithDetails[], error: null };
}

/**
 * Get subjects by their labels
 */
export async function getSubjectsByLabels(labels: string[]) {
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .in('label', labels);

  if (error) {
    console.error('Error fetching subjects by labels:', error);
    return { data: null, error };
  }

  return { data: data as SubjectWithDetails[], error: null };
}

/**
 * Add subjects for a user (replaces existing subjects)
 * @param userId - The user's UUID
 * @param subjectLabels - Array of subject labels (e.g. ["CSEC Mathematics", "CAPE Physics"])
 */
export async function setUserSubjects(userId: string, subjectLabels: string[]) {
  // First, get the subject IDs from labels
  const { data: subjects, error: fetchError } = await getSubjectsByLabels(subjectLabels);

  if (fetchError || !subjects) {
    return { error: fetchError || new Error('Failed to fetch subjects') };
  }

  // Delete existing user_subjects for this user
  const { error: deleteError } = await supabase
    .from('user_subjects')
    .delete()
    .eq('user_id', userId);

  if (deleteError) {
    console.error('Error deleting existing user subjects:', deleteError);
    return { error: deleteError };
  }

  // Insert new user_subjects
  if (subjects.length > 0) {
    const userSubjects = subjects.map((subject) => ({
      user_id: userId,
      subject_id: subject.id,
    }));

    const { error: insertError } = await supabase
      .from('user_subjects')
      .insert(userSubjects);

    if (insertError) {
      console.error('Error inserting user subjects:', insertError);
      return { error: insertError };
    }
  }

  return { error: null };
}

/**
 * Add a single subject for a user (does not remove existing)
 */
export async function addUserSubject(userId: string, subjectLabel: string) {
  const { data: subjects, error: fetchError } = await getSubjectsByLabels([subjectLabel]);

  if (fetchError || !subjects || subjects.length === 0) {
    return { error: fetchError || new Error('Subject not found') };
  }

  const { error } = await supabase
    .from('user_subjects')
    .insert({
      user_id: userId,
      subject_id: subjects[0].id,
    });

  if (error) {
    console.error('Error adding user subject:', error);
    return { error };
  }

  return { error: null };
}

/**
 * Remove a subject from a user
 */
export async function removeUserSubject(userId: string, subjectId: string) {
  const { error } = await supabase
    .from('user_subjects')
    .delete()
    .eq('user_id', userId)
    .eq('subject_id', subjectId);

  if (error) {
    console.error('Error removing user subject:', error);
    return { error };
  }

  return { error: null };
}

/**
 * Check if a user has a specific subject
 */
export async function userHasSubject(userId: string, subjectId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_subjects')
    .select('id')
    .eq('user_id', userId)
    .eq('subject_id', subjectId)
    .single();

  return !error && !!data;
}









