'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';

export default function VerificationUploadPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [statusData, setStatusData] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }
    fetchStatus();
  }, [profile, profileLoading, router]);

  async function fetchStatus() {
    try {
      const res = await fetch('/api/tutor/verification/status');
      const data = await res.json();
      setStatusData(data);
    } catch (err) {
      console.error('Error fetching status:', err);
    } finally {
      setLoadingStatus(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(selectedFile.type)) {
        setError('Invalid file type. Only PDF, JPG, and PNG are allowed.');
        setFile(null);
        return;
      }

      // Validate file size (5MB)
      if (selectedFile.size > 5 * 1024 * 1024) {
        setError('File size exceeds 5MB limit.');
        setFile(null);
        return;
      }

      setFile(selectedFile);
      setError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/tutor/verification/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setSuccess(true);
      setFile(null);
      // Reset file input
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      // Refresh status
      await fetchStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  }

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  const displayName = profile.full_name || profile.email?.split('@')[0] || 'Tutor';
  const hasPendingSubmission = statusData?.has_submission && 
    ['SUBMITTED', 'PROCESSING', 'READY_FOR_REVIEW'].includes(statusData?.request?.status);

  return (
    <DashboardLayout role="tutor" userName={displayName}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">CXC Verification</h1>
        <p className="text-gray-600 mb-8">
          Upload your CXC results slip to get verified and display your qualifications
        </p>

        {/* Current Status Section */}
        {loadingStatus ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-8">
            <p className="text-gray-600">Loading status...</p>
          </div>
        ) : statusData?.has_submission ? (
          <div className={`border-2 rounded-lg p-6 mb-8 ${
            statusData.request.status === 'APPROVED' ? 'bg-green-50 border-green-200' :
            statusData.request.status === 'REJECTED' ? 'bg-red-50 border-red-200' :
            'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-start gap-4">
              {statusData.request.status === 'APPROVED' && (
                <svg className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {statusData.request.status === 'REJECTED' && (
                <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {['SUBMITTED', 'PROCESSING', 'READY_FOR_REVIEW'].includes(statusData.request.status) && (
                <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">
                  {statusData.request.status === 'APPROVED' && 'Verification Approved'}
                  {statusData.request.status === 'REJECTED' && 'Verification Not Approved'}
                  {statusData.request.status === 'SUBMITTED' && 'Verification Submitted'}
                  {statusData.request.status === 'PROCESSING' && 'Verification Processing'}
                  {statusData.request.status === 'READY_FOR_REVIEW' && 'Ready for Review'}
                </h3>
                <p className="text-sm text-gray-700 mb-2">
                  Submitted: {new Date(statusData.request.created_at).toLocaleDateString()}
                </p>
                {statusData.request.status === 'APPROVED' && statusData.request.reviewed_at && (
                  <p className="text-sm text-gray-700">
                    Approved on: {new Date(statusData.request.reviewed_at).toLocaleDateString()}
                    {statusData.request.reviewer_name && ` by ${statusData.request.reviewer_name}`}
                  </p>
                )}
                {statusData.request.status === 'REJECTED' && statusData.request.reviewer_reason && (
                  <div className="mt-3 p-3 bg-white border border-red-200 rounded">
                    <p className="text-sm font-medium text-gray-900 mb-1">Reason for rejection:</p>
                    <p className="text-sm text-gray-700">{statusData.request.reviewer_reason}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Upload Form */}
        <div className="bg-white border-2 border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload CXC Results Slip</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="file-input" className="block text-sm font-medium text-gray-700 mb-2">
                Select Document (PDF, JPG, or PNG, max 5MB)
              </label>
              <input
                id="file-input"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                disabled={uploading || hasPendingSubmission}
                className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed p-2"
              />
              {file && (
                <p className="mt-2 text-sm text-gray-600">
                  Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800">
                  Document uploaded successfully! Your verification is now under review.
                </p>
              </div>
            )}

            {hasPendingSubmission && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  You have a pending verification request. Please wait for it to be reviewed before submitting a new one.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={!file || uploading || hasPendingSubmission}
              className="w-full bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white py-3 px-6 rounded-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-itutor-green/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
            >
              {uploading ? 'Uploading...' : 'Submit for Verification'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Requirements:</h3>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>Clear, legible photo or scan of your CXC results slip</li>
              <li>Must show your name, subject names, and grades</li>
              <li>CSEC or CAPE qualifications</li>
              <li>File must be PDF, JPG, or PNG format</li>
              <li>Maximum file size: 5MB</li>
            </ul>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}












