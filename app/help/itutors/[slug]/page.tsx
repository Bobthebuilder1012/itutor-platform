'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { helpArticles } from '@/data/itutorHelpArticles';
import ReactMarkdown from 'react-markdown';
import PublicPageHeader from '@/components/PublicPageHeader';
import { useProfile } from '@/lib/hooks/useProfile';

export default function HelpArticlePage() {
  const { profile, loading: profileLoading } = useProfile();
  const params = useParams();
  const slug = params.slug as string;

  const article = helpArticles.find((a) => a.slug === slug);

  if (!article) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Article Not Found</h1>
          <p className="text-gray-600 mb-8">
            We couldn't find the help article you're looking for.
          </p>
          <Link
            href="/help/itutors"
            className="inline-flex items-center gap-2 px-6 py-3 bg-itutor-green text-white font-semibold rounded-lg hover:bg-emerald-600 transition-colors"
          >
            ← Back to Help Centre
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <PublicPageHeader profile={profile} loading={profileLoading} />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-4xl">
        {/* Breadcrumbs */}
        <nav className="mb-8 flex items-center gap-2 text-sm text-gray-600">
          <Link href="/help/itutors" className="hover:text-itutor-green transition-colors">
            Help Centre
          </Link>
          <span>›</span>
          <span className="text-gray-400">{article.category}</span>
          <span>›</span>
          <span className="text-gray-900 font-semibold">{article.title}</span>
        </nav>

        {/* Article Header */}
        <div className="mb-8">
          <div className="mb-4">
            <span className="px-3 py-1 bg-itutor-green/10 text-itutor-green text-sm font-semibold rounded-full">
              {article.category}
            </span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">{article.title}</h1>
          <p className="text-lg text-gray-600">{article.summary}</p>
          <p className="text-sm text-gray-500 mt-2">
            Last updated: {new Date(article.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Article Content */}
        <div className="bg-white rounded-2xl shadow-lg p-8 sm:p-12 border-2 border-gray-100">
          <div className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-itutor-green prose-a:no-underline hover:prose-a:underline prose-strong:text-gray-900 prose-ul:text-gray-700 prose-ol:text-gray-700">
            <ReactMarkdown>{article.content}</ReactMarkdown>
          </div>
        </div>

        {/* Support Footer */}
        <div className="mt-12 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl shadow-md p-8 text-center border-2 border-blue-200">
          <svg
            className="w-12 h-12 text-blue-600 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Still stuck?</h3>
          <p className="text-gray-600 mb-6">
            Our support team is here to help you with any questions.
          </p>
          <a
            href="mailto:support@myitutor.com"
            className="inline-flex items-center gap-2 px-6 py-3 bg-itutor-green text-white font-semibold rounded-lg hover:bg-emerald-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            Contact support@myitutor.com
          </a>
        </div>

        {/* Back to Help Centre */}
        <div className="mt-8 text-center">
          <Link
            href="/help/itutors"
            className="inline-flex items-center gap-2 text-itutor-green hover:text-emerald-600 font-semibold transition-colors"
          >
            ← Back to Help Centre
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-itutor-black text-itutor-white py-8 mt-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-itutor-muted">
            &copy; iTutor. Nora Digital, Ltd.
          </p>
          <div className="mt-4 flex justify-center gap-6 text-sm">
            <Link href="/terms" className="hover:text-itutor-green transition-colors">
              Terms & Conditions
            </Link>
            <Link href="/terms" className="hover:text-itutor-green transition-colors">
              Privacy Policy
            </Link>
            <Link href="/itutors/requirements" className="hover:text-itutor-green transition-colors">
              iTutor Requirements
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

