'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';
import SupportFormModal from '@/components/SupportFormModal';
import VerifiedBadge from '@/components/VerifiedBadge';

interface VerificationRequest {
  id: string;
  status: string;
  system_recommendation: string | null;
  system_reason: string | null;
  reviewer_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export default function TutorVerificationPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const [verificationStatus, setVerificationStatus] = useState<{
    status: string | null;
    latestRequest: VerificationRequest | null;
  }>({ status: null, latestRequest: null });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [showSupportForm, setShowSupportForm] = useState(false);

  useEffect(() => {
    if (loading) return;
    
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }

    fetchVerificationStatus();
  }, [profile, loading, router]);

  async function fetchVerificationStatus() {
    if (!profile) return;

    try {
      const response = await fetch('/api/verification/request');
      const data = await response.json();

      if (response.ok) {
        setVerificationStatus({
          status: data.verificationStatus,
          latestRequest: data.latestRequest,
        });
      }
    } catch (error) {
      console.error('Error fetching verification status:', error);
    } finally {
      setLoadingData(false);
    }
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !profile) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      // Determine file type
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileType = fileExt === 'pdf' ? 'pdf' : 'image';

      // Step 1: Create verification request and get upload URL
      const createResponse = await fetch('/api/verification/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileType,
          originalFilename: file.name,
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.error || 'Failed to create verification request');
      }

      const { uploadUrl, requestId } = await createResponse.json();

      // Step 2: Upload file to signed URL
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      // Step 3: Process the request (trigger OCR)
      const processResponse = await fetch(`/api/verification/request/${requestId}/process`, {
        method: 'POST',
      });

      if (!processResponse.ok) {
        console.warn('Processing may have failed, but file was uploaded');
      }

      setUploadSuccess(true);
      await fetchVerificationStatus();
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  }

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  const displayName = getDisplayName(profile);

  return (
    <DashboardLayout role="tutor" userName={displayName}>
      <div className="px-4 py-6 sm:px-0 max-w-4xl mx-auto">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">iTutor Verification</h1>
            <p className="text-gray-600">Upload your teaching credentials for verification</p>
          </div>
          <button
            onClick={() => setShowSupportForm(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors font-medium"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Need Help?
          </button>
        </div>

        {/* Benefits Banner */}
        <div className="bg-gradient-to-r from-emerald-400 to-green-500 rounded-2xl p-6 mb-6 text-white shadow-lg">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <VerifiedBadge size="lg" className="w-12 h-12" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">Get Verified</h2>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Receive a verification badge next to your name</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Get recommended to students more often</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Appear higher in search results</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Build trust with parents and students</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Current Status */}
        {verificationStatus.status && (
          <div className={`mb-6 p-6 rounded-2xl border-2 ${
            verificationStatus.status === 'VERIFIED' ? 'bg-green-50 border-green-200' :
            verificationStatus.status === 'PENDING' ? 'bg-yellow-50 border-yellow-200' :
            verificationStatus.status === 'REJECTED' ? 'bg-red-50 border-red-200' :
            'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center gap-3 mb-2">
              {verificationStatus.status === 'VERIFIED' && (
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {verificationStatus.status === 'PENDING' && (
                <svg className="h-8 w-8 text-yellow-600 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {verificationStatus.status === 'REJECTED' && (
                <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                {verificationStatus.status === 'VERIFIED' ? (
                  <>
                    Verified
                    <VerifiedBadge size="lg" />
                  </>
                ) :
                 verificationStatus.status === 'PENDING' ? 'Under Review' :
                 verificationStatus.status === 'REJECTED' ? 'Not Verified' :
                 'Not Submitted'}
              </h2>
            </div>
            <p className="text-gray-700 mb-3">
              {verificationStatus.status === 'VERIFIED' && 'Your credentials have been verified! You appear higher in search results.'}
              {verificationStatus.status === 'PENDING' && 'Your verification request is being reviewed by our team. This usually takes 1-2 business days.'}
              {verificationStatus.status === 'REJECTED' && 'Your verification request was not approved. Please review the feedback below and resubmit.'}
            </p>
            
            {/* Show rejection reason prominently */}
            {verificationStatus.status === 'REJECTED' && verificationStatus.latestRequest?.reviewer_reason && (
              <div className="bg-red-100 border-2 border-red-300 rounded-lg p-4 mt-4">
                <h3 className="font-bold text-red-900 mb-2 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Reason for Rejection:
                </h3>
                <p className="text-red-800">{verificationStatus.latestRequest.reviewer_reason}</p>
              </div>
            )}
            
            {/* Show system reason if no reviewer reason */}
            {verificationStatus.status === 'REJECTED' && !verificationStatus.latestRequest?.reviewer_reason && verificationStatus.latestRequest?.system_reason && (
              <div className="bg-red-100 border-2 border-red-300 rounded-lg p-4 mt-4">
                <h3 className="font-bold text-red-900 mb-2 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Reason for Rejection:
                </h3>
                <p className="text-red-800">{verificationStatus.latestRequest.system_reason}</p>
              </div>
            )}
          </div>
        )}

        {/* Upload Section */}
        {(verificationStatus.status !== 'VERIFIED' && verificationStatus.status !== 'PENDING') && (
          <div className="bg-white border-2 border-gray-200 rounded-2xl shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Upload Verification Document</h2>
            <p className="text-gray-600 mb-4">
              Upload your CSEC, CAPE, or university degree certificate (PDF, JPG, PNG)
            </p>

            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 hover:border-itutor-green transition-colors">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileUpload}
                disabled={uploading}
                className="block w-full text-sm text-gray-700
                  file:mr-4 file:py-3 file:px-6
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-itutor-green file:text-white
                  hover:file:bg-emerald-600
                  file:transition-colors
                  disabled:opacity-50
                  disabled:cursor-not-allowed"
              />
            </div>

            {uploading && (
              <div className="mt-4 flex items-center text-itutor-green">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-itutor-green mr-2"></div>
                <span className="font-medium">Uploading and processing...</span>
              </div>
            )}

            {uploadError && (
              <div className="mt-4 bg-red-50 border-2 border-red-300 text-red-800 px-4 py-3 rounded-lg">
                <strong>Error:</strong> {uploadError}
              </div>
            )}

            {uploadSuccess && (
              <div className="mt-4 bg-green-50 border-2 border-green-300 text-green-800 px-4 py-3 rounded-lg">
                <strong>Success!</strong> Your verification document has been submitted and is being processed.
              </div>
            )}
          </div>
        )}

        {/* Verification Request Details */}
        {verificationStatus.latestRequest && (
          <div className="bg-white border-2 border-gray-200 rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Request Details</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${
                  verificationStatus.latestRequest.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                  verificationStatus.latestRequest.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                  verificationStatus.latestRequest.status === 'READY_FOR_REVIEW' ? 'bg-blue-100 text-blue-800' :
                  verificationStatus.latestRequest.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {verificationStatus.latestRequest.status}
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Submitted</label>
                <p className="text-gray-900">{new Date(verificationStatus.latestRequest.created_at).toLocaleString()}</p>
              </div>

              {verificationStatus.latestRequest.system_recommendation && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">System Assessment</label>
                  <p className="text-gray-900">
                    <strong>{verificationStatus.latestRequest.system_recommendation}:</strong> {verificationStatus.latestRequest.system_reason}
                  </p>
                </div>
              )}

              {verificationStatus.latestRequest.reviewer_reason && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reviewer Feedback</label>
                  <p className="text-gray-900">{verificationStatus.latestRequest.reviewer_reason}</p>
                </div>
              )}

              {verificationStatus.latestRequest.reviewed_at && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reviewed At</label>
                  <p className="text-gray-900">{new Date(verificationStatus.latestRequest.reviewed_at).toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* No Requests Yet */}
        {!loadingData && !verificationStatus.latestRequest && !verificationStatus.status && (
          <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-gray-200">
            <div className="text-6xl mb-4">📜</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Get Verified</h3>
            <p className="text-gray-600 mb-4">Upload your teaching credentials to boost your profile visibility</p>
            <p className="text-sm text-gray-500">Verified iTutors appear higher in search results and get more bookings!</p>
          </div>
        )}

        {/* Support Form Modal */}
        <SupportFormModal isOpen={showSupportForm} onClose={() => setShowSupportForm(false)} />
      </div>
    </DashboardLayout>
  );
}
