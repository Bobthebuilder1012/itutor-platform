'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getCroppedImg, resizeImage, type Area } from '@/lib/utils/imageCrop';

const BANNER_MAX_W = 1200;
const BANNER_MAX_H = 400;

export function useProfileBannerUpload(userId: string) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadBanner = async (imageSrc: string, croppedArea: Area) => {
    setUploading(true);
    setError(null);

    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedArea, BANNER_MAX_W, BANNER_MAX_H);
      const resizedBlob = await resizeImage(croppedBlob, BANNER_MAX_W, BANNER_MAX_H);

      const path = `${userId}/profile-banner.jpg`;
      await supabase.storage.from('avatars').remove([path]);

      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, resizedBlob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const bannerUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ profile_banner_url: bannerUrl })
        .eq('id', userId);

      if (updateError) throw updateError;

      setUploading(false);
      return { success: true, bannerUrl };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload banner';
      setError(errorMessage);
      setUploading(false);
      return { success: false, error: errorMessage };
    }
  };

  const deleteBanner = async () => {
    setUploading(true);
    setError(null);

    try {
      const path = `${userId}/profile-banner.jpg`;
      await supabase.storage.from('avatars').remove([path]);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ profile_banner_url: null })
        .eq('id', userId);

      if (updateError) throw updateError;

      setUploading(false);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove banner';
      setError(errorMessage);
      setUploading(false);
      return { success: false, error: errorMessage };
    }
  };

  return { uploadBanner, deleteBanner, uploading, error };
}
