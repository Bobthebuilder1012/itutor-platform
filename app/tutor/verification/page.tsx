'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { TutorVerification } from '@/lib/types/database';

export default function TutorVerificationPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const [verifications, setVerifications] = useState<TutorVerification[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (loading) return;
    
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }

    fetchVerifications();
  }, [profile, loading, router]);

  async function fetchVerifications() {
    if (!profile) return;

    try {
      const { data } = await supabase
        .from('tutor_verifications')
        .select('*')
        .eq('tutor_id', profile.id)
        .order('created_at', { ascending: false });

      if (data) setVerifications(data);
    } catch (error) {
      console.error('Error fetching verifications:', error);
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
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.id}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('verification_docs')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('verification_docs')
        .getPublicUrl(filePath);

      const { error: insertError } = await supabase
        .from('tutor_verifications')
        .insert({
          tutor_id: profile.id,
          uploaded_doc_url: publicUrl,
          status: 'pending'
        });

      if (insertError) throw insertError;

      setUploadSuccess(true);
      fetchVerifications();
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <DashboardLayout role="tutor" userName={profile.full_name}>
      <div className="px-4 py-6 sm:px-0">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Certificate Verification</h1>

        {/* Upload Section */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Upload Certificate</h2>
          <p className="text-gray-600 mb-4">
            Upload your CSEC or CAPE certificate for verification (PDF, JPG, PNG)
          </p>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileUpload}
              disabled={uploading}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                disabled:opacity-50"
            />
          </div>

          {uploading && (
            <div className="mt-4 flex items-center text-blue-600">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
              <span>Uploading...</span>
            </div>
          )}

          {uploadError && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {uploadError}
            </div>
          )}

          {uploadSuccess && (
            <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              Certificate uploaded successfully!
            </div>
          )}
        </div>

        {/* Verification History */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Verification History</h2>
          
          {loadingData ? (
            <p className="text-gray-500">Loading verifications...</p>
          ) : verifications.length > 0 ? (
            <div className="space-y-4">
              {verifications.map((verification) => (
                <div
                  key={verification.id}
                  className="border rounded-lg p-4 flex justify-between items-start"
                >
                  <div className="flex-1">
                    <span className={`px-3 py-1 text-sm rounded-full ${
                      verification.status === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : verification.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {verification.status}
                    </span>
                    <p className="text-sm text-gray-500 mt-2">
                      Submitted: {new Date(verification.created_at).toLocaleDateString()}
                    </p>
                    {verification.notes && (
                      <p className="text-sm text-gray-700 mt-2">
                        <strong>Notes:</strong> {verification.notes}
                      </p>
                    )}
                  </div>
                  <a
                    href={verification.uploaded_doc_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    View
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">No verifications yet</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
