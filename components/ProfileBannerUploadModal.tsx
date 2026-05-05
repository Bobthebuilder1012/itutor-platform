'use client';

import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from '@/lib/utils/imageCrop';
import { validateImageFile } from '@/lib/utils/imageCrop';

type ProfileBannerUploadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (imageSrc: string, croppedArea: Area) => Promise<void>;
  uploading: boolean;
  currentBannerUrl?: string | null;
  onRemove?: () => Promise<void>;
};

/** Wide crop for tutor discovery cards (~3:1). */
const BANNER_ASPECT = 3;

export default function ProfileBannerUploadModal({
  isOpen,
  onClose,
  onUpload,
  uploading,
  currentBannerUrl,
  onRemove,
}: ProfileBannerUploadModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    try {
      await onUpload(imageSrc, croppedAreaPixels);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const handleClose = () => {
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Profile banner</h2>
            <button
              type="button"
              onClick={handleClose}
              disabled={uploading}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            This image appears at the top of your profile and on tutor discovery cards. Use a wide photo (recommended 3:1).
          </p>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              <p className="text-sm">{error}</p>
            </div>
          )}

          {!imageSrc ? (
            <div className="space-y-4">
              <label className="flex h-56 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 transition hover:bg-gray-100">
                <div className="flex flex-col items-center justify-center pb-6 pt-5">
                  <svg className="mb-3 h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p className="mb-2 text-sm text-gray-500">
                    <span className="font-semibold">Click to upload</span> a banner image
                  </p>
                  <p className="text-xs text-gray-500">PNG, JPG, or WebP (max 5MB)</p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
              </label>

              {onRemove && currentBannerUrl && (
                <div className="space-y-3">
                  <div className="relative flex items-center">
                    <div className="flex-grow border-t border-gray-200" />
                    <span className="mx-3 flex-shrink text-xs font-semibold uppercase tracking-widest text-gray-400">Actions</span>
                    <div className="flex-grow border-t border-gray-200" />
                  </div>
                  <button
                    type="button"
                    onClick={async () => { await onRemove(); handleClose(); }}
                    disabled={uploading}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Remove Banner
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative h-72 w-full overflow-hidden rounded-lg bg-gray-100">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={BANNER_ASPECT}
                  cropShape="rect"
                  showGrid
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Zoom</label>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-itutor-green"
                  disabled={uploading}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setImageSrc(null)}
                  disabled={uploading}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Choose different image
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-itutor-green to-emerald-600 px-4 py-2 font-medium text-white transition hover:from-emerald-600 hover:to-itutor-green disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                      <span>Uploading…</span>
                    </>
                  ) : (
                    'Save banner'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
