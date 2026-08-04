'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types/database';
import CountrySelect from '@/components/CountrySelect';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import InstitutionAutocomplete from '@/components/InstitutionAutocomplete';
import type { Institution } from '@/lib/hooks/useInstitutionsSearch';
import { ensureSchoolCommunityAndMembership } from '@/lib/actions/community';

type EditProfileModalProps = {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile;
  onSuccess: () => void;
};

export default function EditProfileModal({
  isOpen,
  onClose,
  profile,
  onSuccess
}: EditProfileModalProps) {
  const [displayName, setDisplayName] = useState(profile.display_name || profile.full_name || '');
  const [school, setSchool] = useState(profile.school || '');
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);
  const [country, setCountry] = useState(profile.country || '');
  const [subjects, setSubjects] = useState<string[]>(profile.subjects_of_study || []);
  const [biography, setBiography] = useState(profile.bio || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDisplayName(profile.display_name || profile.full_name || '');
      setSchool(profile.school || '');
      setCountry(profile.country || '');
      setSubjects(profile.subjects_of_study || []);
      setBiography(profile.bio || '');
      setError(null);

      if (profile.institution_id) {
        supabase
          .from('institutions')
          .select('id, name, normalized_name, country_code, island, institution_level, institution_type, denomination, is_active')
          .eq('id', profile.institution_id)
          .single()
          .then(({ data }) => {
            if (data) setSelectedInstitution(data as Institution);
          });
      } else {
        setSelectedInstitution(null);
      }
    }
  }, [isOpen, profile]);

  const handleSave = async () => {
    if (!displayName.trim()) {
      setError('Display name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          institution_id: selectedInstitution?.id ?? null,
          school: (selectedInstitution?.name ?? school.trim()) || null,
          country: country || null,
          subjects_of_study: subjects.length > 0 ? subjects : null,
          bio: biography.trim() || null
        })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      await ensureSchoolCommunityAndMembership(profile.id);

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const charCount = biography.length;
  const maxChars = 1000;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-itutor-green/5 to-emerald-50">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Edit Profile</h2>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-500 hover:text-gray-900 transition disabled:opacity-50"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] bg-gray-50">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg">
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-5">
            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Display Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How you want to be known"
                maxLength={100}
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400"
              />
            </div>

            {/* School */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                School
              </label>
              <InstitutionAutocomplete
                selectedInstitution={selectedInstitution}
                onChange={setSelectedInstitution}
                placeholder="Type to search your school..."
              />
            </div>

            {/* Country */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Country
              </label>
              <CountrySelect 
                value={country} 
                onChange={setCountry}
              />
            </div>

            {/* Subjects */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subjects {profile.role === 'tutor' ? '(You Teach)' : '(You Study)'}
              </label>
              <SubjectMultiSelect
                selectedSubjects={subjects}
                onChange={setSubjects}
                placeholder="Select your subjects..."
              />
            </div>

            {/* Biography */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Biography
              </label>
              <textarea
                value={biography}
                onChange={(e) => setBiography(e.target.value)}
                placeholder="Tell others about yourself, your interests, and goals... Emojis welcome! 😊"
                rows={6}
                maxLength={maxChars}
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400 resize-none"
              />
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-gray-600">
                  Tip: Share your learning style, favorite subjects, or what you're working towards!
                </p>
                <p className={`text-xs ${charCount > maxChars * 0.9 ? 'text-orange-600' : 'text-gray-500'}`}>
                  {charCount}/{maxChars}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-white flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-6 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !displayName.trim()}
            className="px-6 py-2.5 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Saving...</span>
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
