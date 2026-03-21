'use client';

import { useCallback, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { CreateGroupInput } from '@/lib/types/groups';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import { supabase } from '@/lib/supabase/client';
import { getCroppedImg, type Area } from '@/lib/utils/imageCrop';

interface CreateGroupModalProps {
  onCreated: (groupId: string) => void;
  onClose: () => void;
}

export default function CreateGroupModal({ onCreated, onClose }: CreateGroupModalProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<CreateGroupInput>({
    name: '',
    description: '',
    topic: '',
    subjects: [],
    form_level: 'FORM_4',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [uploadingImage, setUploadingImage] = useState<'cover' | 'header' | null>(null);
  const [draggingImage, setDraggingImage] = useState<'cover' | 'header' | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const headerInputRef = useRef<HTMLInputElement | null>(null);
  const [cropTarget, setCropTarget] = useState<'cover' | 'header' | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const uploadImage = async (file: Blob, target: 'cover' | 'header') => {
    if (!file.type.startsWith('image/')) {
      throw new Error('Please upload an image file');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Image must be 10MB or smaller');
    }

    setUploadingImage(target);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setUploadingImage(null);
      throw new Error('Please sign in again before uploading');
    }

    const safeExt =
      file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `${target}-${Date.now()}.${safeExt}`;
    const path = `${userData.user.id}/groups/${fileName}`;

    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
      contentType: file.type,
      upsert: true,
    });

    if (uploadError) {
      setUploadingImage(null);
      throw new Error(uploadError.message || 'Failed to upload image');
    }

    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const publicUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

    if (target === 'cover') {
      setForm((prev) => ({ ...prev, cover_image: publicUrl }));
    } else {
      setForm((prev) => ({ ...prev, header_image: publicUrl }));
    }

    setUploadingImage(null);
  };

  const onCropComplete = useCallback((_croppedArea: Area, nextCroppedAreaPixels: Area) => {
    setCroppedAreaPixels(nextCroppedAreaPixels);
  }, []);

  const handleImageSelection = async (file: File | null, target: 'cover' | 'header') => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be 10MB or smaller');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      setCropTarget(target);
      setCropImageSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    };
    reader.onerror = () => {
      setError('Failed to read image');
    };
    reader.readAsDataURL(file);
  };

  const handleApplyCrop = async () => {
    if (!cropImageSrc || !cropTarget || !croppedAreaPixels) return;
    setError('');
    try {
      const croppedBlob = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      await uploadImage(croppedBlob, cropTarget);
      setCropImageSrc(null);
      setCropTarget(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to upload image');
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError('Group name is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create group');
      onCreated(data.group.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Create Group Course</h2>
            <p className="text-xs text-gray-500 mt-0.5">Step {step} of 3</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            // Prevent implicit submits (e.g. file picker Enter key)
            // so group creation only happens via explicit button click.
            e.preventDefault();
          }}
          className="p-5 space-y-4"
        >
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Group Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. CSEC Trigonometry Mastery"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">About group</label>
                <input
                  type="text"
                  value={form.topic ?? ''}
                  onChange={(e) => setForm({ ...form, topic: e.target.value })}
                  placeholder="e.g. A recurring class covering key exam concepts and practice"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Subjects</label>
                <SubjectMultiSelect
                  selectedSubjects={form.subjects ?? []}
                  onChange={(subjects) => setForm({ ...form, subjects })}
                  placeholder="Search CSEC or CAPE subjects…"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Form level</label>
                  <select
                    value={form.form_level ?? 'FORM_4'}
                    onChange={(e) => setForm({ ...form, form_level: e.target.value as any })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="FORM_1">Form 1</option>
                    <option value="FORM_2">Form 2</option>
                    <option value="FORM_3">Form 3</option>
                    <option value="FORM_4">Form 4</option>
                    <option value="FORM_5">Form 5</option>
                    <option value="CAPE">CAPE</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Course overview</label>
                <textarea
                  value={form.description ?? ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe what students will learn..."
                  rows={5}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Learning objectives</label>
                <textarea
                  value={form.goals ?? ''}
                  onChange={(e) => setForm({ ...form, goals: e.target.value })}
                  placeholder="List key outcomes and who this course is for..."
                  rows={4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Group thumbnail</label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDraggingImage('cover');
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDraggingImage((prev) => (prev === 'cover' ? null : prev));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDraggingImage(null);
                    const file = e.dataTransfer.files?.[0] ?? null;
                    void handleImageSelection(file, 'cover');
                  }}
                  className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
                    draggingImage === 'cover'
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-gray-300 bg-gray-50/60'
                  }`}
                >
                  {form.cover_image ? (
                    <img
                      src={form.cover_image}
                      alt="Group thumbnail preview"
                      className="h-36 w-full rounded-lg object-cover border border-gray-200"
                    />
                  ) : (
                    <div className="h-36 w-full rounded-lg border border-gray-200 bg-white flex items-center justify-center text-sm text-gray-500">
                      Drag and drop thumbnail image here
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      Choose file
                    </button>
                    {form.cover_image && (
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, cover_image: null }))}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                    <span className="text-xs text-gray-500">
                      {uploadingImage === 'cover'
                        ? 'Uploading...'
                        : 'Recommended: 1280 x 720 px (16:9). Drag image in frame to reposition. PNG, JPG, WEBP up to 10MB'}
                    </span>
                  </div>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      void handleImageSelection(file, 'cover');
                      e.currentTarget.value = '';
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Header image (optional)</label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDraggingImage('header');
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDraggingImage((prev) => (prev === 'header' ? null : prev));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDraggingImage(null);
                    const file = e.dataTransfer.files?.[0] ?? null;
                    void handleImageSelection(file, 'header');
                  }}
                  className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
                    draggingImage === 'header'
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-gray-300 bg-gray-50/60'
                  }`}
                >
                  {form.header_image ? (
                    <img
                      src={form.header_image}
                      alt="Header image preview"
                      className="h-36 w-full rounded-lg object-cover border border-gray-200"
                    />
                  ) : (
                    <div className="h-36 w-full rounded-lg border border-gray-200 bg-white flex items-center justify-center text-sm text-gray-500">
                      Drag and drop header image here
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => headerInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      Choose file
                    </button>
                    {form.header_image && (
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, header_image: null }))}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                    <span className="text-xs text-gray-500">
                      {uploadingImage === 'header'
                        ? 'Uploading...'
                        : 'Recommended: 1280 x 720 px (16:9). Drag image in frame to reposition. PNG, JPG, WEBP up to 10MB'}
                    </span>
                  </div>
                  <input
                    ref={headerInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      void handleImageSelection(file, 'header');
                      e.currentTarget.value = '';
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((prev) => Math.max(1, prev - 1))}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep((prev) => Math.min(3, prev + 1))}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                {submitting ? 'Creating…' : 'Create Group'}
              </button>
            )}
          </div>
        </form>
        </div>
      </div>

      {cropImageSrc && cropTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-900">
                Reposition {cropTarget === 'cover' ? 'group thumbnail' : 'header image'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setCropImageSrc(null);
                  setCropTarget(null);
                  setCrop({ x: 0, y: 0 });
                  setZoom(1);
                  setCroppedAreaPixels(null);
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="relative w-full overflow-hidden rounded-xl bg-gray-100" style={{ aspectRatio: '16 / 9' }}>
                <Cropper
                  image={cropImageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={16 / 9}
                  showGrid={false}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Zoom</label>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-emerald-600"
                />
              </div>
              <p className="text-xs text-gray-500">Drag the image to move it inside the frame.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCropImageSrc(null);
                    setCropTarget(null);
                    setCrop({ x: 0, y: 0 });
                    setZoom(1);
                    setCroppedAreaPixels(null);
                  }}
                  className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleApplyCrop()}
                  disabled={uploadingImage !== null}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {uploadingImage ? 'Uploading...' : 'Apply image'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
