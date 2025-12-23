'use client';

export default function TestEnvPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Environment Variables Test</h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-4">
          <h2 className="text-xl font-semibold mb-4">NEXT_PUBLIC_SUPABASE_URL</h2>
          {supabaseUrl ? (
            <div>
              <p className="text-green-600 font-bold">✅ Found!</p>
              <p className="font-mono text-sm bg-gray-100 p-2 rounded mt-2 break-all">
                {supabaseUrl}
              </p>
            </div>
          ) : (
            <p className="text-red-600 font-bold">❌ Not found!</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-4">
          <h2 className="text-xl font-semibold mb-4">NEXT_PUBLIC_SUPABASE_ANON_KEY</h2>
          {supabaseKey ? (
            <div>
              <p className="text-green-600 font-bold">✅ Found!</p>
              <p className="font-mono text-sm bg-gray-100 p-2 rounded mt-2 break-all">
                {supabaseKey.substring(0, 50)}...
              </p>
            </div>
          ) : (
            <p className="text-red-600 font-bold">❌ Not found!</p>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-2">Next Steps:</h2>
          <ol className="list-decimal list-inside space-y-2">
            <li>If both show ✅, the environment variables are loaded correctly</li>
            <li>If both show ❌, make sure <code className="bg-white px-2 py-1 rounded">.env.local</code> exists in the project root</li>
            <li>After creating/updating <code className="bg-white px-2 py-1 rounded">.env.local</code>, restart the dev server</li>
            <li>Go back to <a href="/" className="text-blue-600 hover:underline">homepage</a> to test the app</li>
          </ol>
        </div>

        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="font-semibold mb-2">📁 File Location Check:</h3>
          <p className="text-sm">Your <code className="bg-white px-2 py-1 rounded">.env.local</code> file should be at:</p>
          <p className="font-mono text-sm bg-white p-2 rounded mt-2">
            C:\Users\liamd\OneDrive\Documents\Pilot\.env.local
          </p>
          <p className="text-sm mt-2 text-gray-600">
            NOT in <code className="bg-white px-1 rounded">src/types/</code> or any subdirectory
          </p>
        </div>
      </div>
    </div>
  );
}

