'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getCroppedImg, resizeImage, type Area } from '@/lib/utils/imageCrop';

const BANNER_MAX_W = 1200;
const BANNER_MAX_H = 400;

export function useProfileBannerUpload(userId: string) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistBannerUrl = async (canonicalUrl: string | null) => {
    const res = await fetch('/api/profile/banner', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ bannerUrl: canonicalUrl }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(body.error || 'Failed to save banner');
  };

  const uploadBanner = async (imageSrc: string, croppedArea: Area) => {
    setUploading(true);
    setError(null);

    try {
      if (!userId) throw new Error('Not signed in');

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
      const canonicalUrl = publicUrlData.publicUrl.split(/[?#]/)[0];

      await persistBannerUrl(canonicalUrl);

      setUploading(false);
      return { success: true, bannerUrl: canonicalUrl };
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
      if (!userId) throw new Error('Not signed in');

      const path = `${userId}/profile-banner.jpg`;
      await supabase.storage.from('avatars').remove([path]);

      await persistBannerUrl(null);

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
