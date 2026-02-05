'use client';

import { useState } from 'react';
import { Profile } from '@/lib/types/database';
import ShareProfileModal from '@/components/ShareProfileModal';
import { supabase } from '@/lib/supabase/client';
import { getAvatarColor } from '@/lib/utils/avatarColors';

type ProfileSnapshotCardProps = {
  profile: Profile;
  onEditProfile: () => void;
  onEditSubjects: () => void;
  onChangeAvatar: () => void;
};

export default function ProfileSnapshotCard({ 
  profile, 
  onEditProfile, 
  onEditSubjects,
  onChangeAvatar 
}: ProfileSnapshotCardProps) {
  const firstName = profile.full_name?.split(' ')[0] || 'Student';
  const hasBio = profile.bio && profile.bio.trim().length > 0;
  const [shareModalOpen, setShareModalOpen] = useState(false);
  
  // Bio editing state
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState(profile.bio || '');
  const [savingBio, setSavingBio] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const maxBioChars = 1000;

  const profileUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/student/profile/${profile.id}`;
  const profileName = profile.display_name || profile.full_name || 'Student';

  const handleSaveBio = async () => {
    setSavingBio(true);
    setBioError(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ bio: bioText.trim() || null })
        .eq('id', profile.id);

      if (error) throw error;

      profile.bio = bioText.trim();
      setEditingBio(false);
    } catch (err) {
      console.error('Error saving bio:', err);
      setBioError(err instanceof Error ? err.message : 'Failed to save bio');
    } finally {
      setSavingBio(false);
    }
  };

  const handleCancelBio = () => {
    setBioText(profile.bio || '');
    setEditingBio(false);
    setBioError(null);
  };

  return (
    <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 sm:p-6 md:p-8 shadow-md hover:shadow-lg transition-shadow">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 mb-6">
        {/* Avatar */}
        <button
          onClick={onChangeAvatar}
          className="flex-shrink-0 group relative"
        >
          {profile.avatar_url && profile.avatar_url.trim() !== '' ? (
            <img
              src={profile.avatar_url}
              alt={firstName}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-gray-200 group-hover:border-itutor-green transition-colors"
            />
          ) : (
            <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br ${getAvatarColor(profile.id)} flex items-center justify-center text-white font-bold text-2xl sm:text-3xl border-4 border-gray-200 group-hover:border-itutor-green transition-colors`}>
              {firstName.charAt(0)}
            </div>
          )}
          <div className="absolute inset-0 rounded-full bg-black bg-opacity-0 group-hover:bg-opacity-20 flex items-center justify-center transition-all">
            <svg className="h-6 w-6 sm:h-8 sm:w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </button>

        {/* Profile Info */}
        <div className="flex-1 text-center sm:text-left w-full">
          <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 truncate">
            {profile.display_name || profile.full_name || 'Student'}
          </h3>
          {profile.username && (
            <p className="text-sm text-gray-500 mb-3">@{profile.username}</p>
          )}
          <div className="flex flex-wrap justify-center sm:justify-start gap-2 sm:gap-3 text-xs sm:text-sm text-gray-600 mb-3">
            {profile.school && (
              <span className="flex items-center gap-1">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                {profile.school}
              </span>
            )}
            {profile.country && (
              <span className="flex items-center gap-1">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {profile.country}
              </span>
            )}
          </div>
          {profile.subjects_of_study && profile.subjects_of_study.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {profile.subjects_of_study.map((subject, index) => (
                <span 
                  key={index}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                >
                  {subject}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* About Me Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">About me</h4>
          {hasBio && !editingBio && (
            <button
              onClick={() => setEditingBio(true)}
              className="text-itutor-green hover:text-emerald-600 text-xs font-medium flex items-center gap-1"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
          )}
        </div>
        
        {editingBio ? (
          <div className="space-y-3">
            <textarea
              value={bioText}
              onChange={(e) => setBioText(e.target.value)}
              placeholder="Tell tutors what you're working on (e.g., 'Preparing for CSEC Maths')"
              rows={5}
              maxLength={maxBioChars}
              className="w-full px-4 py-3 bg-white border-2 border-itutor-green rounded-lg focus:ring-2 focus:ring-itutor-green focus:outline-none transition placeholder-gray-400 resize-none text-gray-900"
              autoFocus
            />
            <div className="flex justify-between items-center">
              <p className="text-xs text-gray-500">
                {bioText.length}/{maxBioChars} characters
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCancelBio}
                  disabled={savingBio}
                  className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveBio}
                  disabled={savingBio}
                  className="px-4 py-2 text-sm bg-itutor-green hover:bg-emerald-600 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-2"
                >
                  {savingBio ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
            </div>
            {bioError && (
              <p className="text-xs text-red-600">{bioError}</p>
            )}
          </div>
        ) : hasBio ? (
          <div 
            onClick={() => setEditingBio(true)}
            className="text-gray-700 leading-relaxed cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition"
          >
            {profile.bio}
          </div>
        ) : (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-4">
            <p className="text-gray-600 text-sm mb-2">
              Tell tutors what you're working on (e.g., "Preparing for CSEC Maths")
            </p>
            <button
              onClick={() => setEditingBio(true)}
              className="text-itutor-green hover:text-emerald-600 font-medium text-sm"
            >
              Add a bio →
            </button>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 pt-4 border-t border-gray-200">
        <button
          onClick={onEditProfile}
          className="w-full sm:w-auto px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2"
        >
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span>Edit Profile</span>
        </button>
        <button
          onClick={onEditSubjects}
          className="w-full sm:w-auto px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2"
        >
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <span>Edit Subjects</span>
        </button>
        <button
          onClick={() => setShareModalOpen(true)}
          className="w-full sm:w-auto px-4 py-2 bg-itutor-green hover:bg-emerald-600 text-black rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2"
        >
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span>Share Profile</span>
        </button>
      </div>

      {/* Share Profile Modal */}
      <ShareProfileModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        profileUrl={profileUrl}
        profileName={profileName}
      />
    </div>
  );
}

