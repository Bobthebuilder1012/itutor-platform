'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getCroppedImg, resizeImage, Area } from '@/lib/utils/imageCrop';

export function useAvatarUpload(userId: string) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadAvatar = async (imageSrc: string, croppedArea: Area) => {
    setUploading(true);
    setError(null);

    try {
      // Get the cropped image as a blob
      const croppedBlob = await getCroppedImg(imageSrc, croppedArea);

      // Resize to 400x400px
      const resizedBlob = await resizeImage(croppedBlob, 400, 400);

      // Delete old avatar if it exists
      const oldAvatarPath = `${userId}/avatar.jpg`;
      await supabase.storage.from('avatars').remove([oldAvatarPath]);

      // Upload new avatar
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(oldAvatarPath, resizedBlob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL with cache-busting timestamp
      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(oldAvatarPath);

      // Add timestamp to prevent browser caching
      const avatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', userId);

      if (updateError) {
        throw updateError;
      }

      setUploading(false);
      return { success: true, avatarUrl };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload avatar';
      setError(errorMessage);
      setUploading(false);
      return { success: false, error: errorMessage };
    }
  };

  const deleteAvatar = async () => {
    setUploading(true);
    setError(null);

    try {
      // Delete from storage
      const avatarPath = `${userId}/avatar.jpg`;
      await supabase.storage.from('avatars').remove([avatarPath]);

      // Update profile to remove avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', userId);

      if (updateError) {
        throw updateError;
      }

      setUploading(false);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete avatar';
      setError(errorMessage);
      setUploading(false);
      return { success: false, error: errorMessage };
    }
  };

  return { uploadAvatar, deleteAvatar, uploading, error };
}

