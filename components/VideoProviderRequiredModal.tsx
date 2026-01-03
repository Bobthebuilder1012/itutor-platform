'use client';

import { useRouter } from 'next/navigation';

interface VideoProviderRequiredModalProps {
  isOpen: boolean;
}

export default function VideoProviderRequiredModal({ isOpen }: VideoProviderRequiredModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const handleConnect = () => {
    router.push('/tutor/video-setup');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop - non-dismissible */}
        <div className="fixed inset-0 bg-black bg-opacity-75 transition-opacity" />

        {/* Modal */}
        <div className="relative transform overflow-hidden rounded-2xl bg-white shadow-2xl transition-all sm:w-full sm:max-w-lg">
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 px-6 pt-6 pb-4">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-full p-4">
                <svg className="h-12 w-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <h3 className="text-2xl font-bold text-center text-gray-900 mb-2">
              Connect Your Video Provider
            </h3>
            <p className="text-center text-gray-700 text-sm">
              Required to start tutoring
            </p>
          </div>

          <div className="px-6 py-6">
            <div className="mb-6 space-y-4">
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-yellow-900 mb-1">Action Required</p>
                    <p className="text-sm text-yellow-800">
                      You must connect Google Meet or Zoom before you can accept booking requests or send lesson offers.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-itutor-green flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-gray-700">Choose between Google Meet or Zoom</p>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-itutor-green flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-gray-700">Secure OAuth connection</p>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-itutor-green flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-gray-700">Automatic meeting links for sessions</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleConnect}
              className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-bold text-lg transition shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Connect Video Provider Now
            </button>

            <p className="text-center text-xs text-gray-500 mt-4">
              This only takes a minute and is required to start tutoring
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}






