'use client';

import { useCallback, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { ImagePlus, Loader2, Move, ZoomIn } from 'lucide-react';
import { useAvatarUpload } from '@/lib/hooks/useAvatarUpload';
import { validateImageFile, type Area } from '@/lib/utils/imageCrop';

type Props = {
  userId: string;
  /** Tailors the subtitle copy. */
  role?: 'tutor' | 'student';
  /** Called after the photo is uploaded and the profile row updated. */
  onSaved: () => void;
  /** Called when the user chooses to move on without a photo. */
  onSkip: () => void;
};

/**
 * Post-signup profile picture step: pick a photo, drag to reposition, zoom, save.
 *
 * Shared by /signup/complete-role and /onboarding/tutor so the two post-signup
 * entry points can't drift apart. Cropping and upload reuse the same
 * useAvatarUpload + imageCrop path as the dashboard/settings avatar modal, so a
 * photo set here is identical to one set later.
 *
 * Always skippable — a profile picture should never block finishing signup.
 */
export default function ProfilePhotoStep({ userId, role, onSaved, onSkip }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [error, setError] = useState('');
  const { uploadAvatar, uploading } = useAvatarUpload(userId);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const pickPhoto = (file: File | undefined) => {
    if (!file) return;
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Invalid image file.');
      return;
    }
    setError('');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    const reader = new FileReader();
    reader.onload = () => setPhotoSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!photoSrc || !croppedAreaPixels || !userId) return;
    setError('');
    const result = await uploadAvatar(photoSrc, croppedAreaPixels);
    if (!result.success) {
      // Stay put with the crop intact so they can retry or skip — never move on
      // pretending the photo saved.
      setError(result.error || 'Could not save your photo. Try again, or skip for now.');
      return;
    }
    onSaved();
  };

  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-itutor-green text-white shadow-lg">
          <ImagePlus className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold text-gray-900">Add a profile picture</h2>
        <p className="mt-1.5 text-sm text-gray-500">
          {role === 'tutor'
            ? 'A clear headshot helps students trust you. You can change it any time.'
            : 'Put a face to your name. You can change it any time.'}
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={(e) => pickPhoto(e.target.files?.[0])}
        disabled={uploading}
      />

      {!photoSrc ? (
        <div className="mt-6 space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pickPhoto(e.dataTransfer.files?.[0]); }}
            className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center transition hover:border-itutor-green hover:bg-green-50/40"
          >
            <ImagePlus className="h-9 w-9 text-gray-400" />
            <p className="mt-3 text-sm text-gray-600">
              <span className="font-semibold text-itutor-green">Click to upload</span> or drag and drop
            </p>
            <p className="mt-1 text-xs text-gray-500">PNG, JPG or WebP · max 5MB</p>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
          >
            Skip for now
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {/* Drag inside the circle to reposition; slider or pinch to zoom. */}
          <div className="relative h-64 w-full overflow-hidden rounded-2xl bg-gray-900">
            <Cropper
              image={photoSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
            />
          </div>

          <p className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-gray-500">
            <Move className="h-3.5 w-3.5" /> Drag to reposition
            <span className="text-gray-300">·</span>
            <ZoomIn className="h-3.5 w-3.5" /> Pinch or use the slider to zoom
          </p>

          <div>
            <label htmlFor="avatar-zoom" className="mb-1.5 block text-sm font-medium text-gray-700">Zoom</label>
            <input
              id="avatar-zoom"
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              disabled={uploading}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-itutor-green disabled:opacity-50"
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={uploading || !croppedAreaPixels}
            className="w-full rounded-xl bg-itutor-green py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40"
          >
            {uploading
              ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving…</span>
              : 'Save & continue'}
          </button>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setPhotoSrc(null); setError(''); }}
              disabled={uploading}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
            >
              Choose another
            </button>
            <button
              type="button"
              onClick={onSkip}
              disabled={uploading}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-gray-500 transition hover:text-gray-800 disabled:opacity-40"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
