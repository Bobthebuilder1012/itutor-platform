'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { helpArticles, categories } from '@/data/itutorHelpArticles';
import PublicPageHeader from '@/components/PublicPageHeader';
import { useProfile } from '@/lib/hooks/useProfile';

export default function ITutorHelpCentrePage() {
  const { profile, loading: profileLoading } = useProfile();
  const [searchQuery, setSearchQuery] = useState('');

  // Filter articles based on search query
  const filteredArticles = useMemo(() => {
    if (!searchQuery.trim()) return helpArticles;

    const query = searchQuery.toLowerCase();
    return helpArticles.filter(
      (article) =>
        article.title.toLowerCase().includes(query) ||
        article.summary.toLowerCase().includes(query) ||
        article.content.toLowerCase().includes(query) ||
        article.category.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Get popular articles
  const popularArticles = helpArticles.filter((article) => article.isPopular);

  // Group articles by category
  const articlesByCategory = useMemo(() => {
    const grouped: Record<string, typeof helpArticles> = {};
    categories.forEach((cat) => {
      grouped[cat] = filteredArticles.filter((article) => article.category === cat);
    });
    return grouped;
  }, [filteredArticles]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <PublicPageHeader profile={profile} loading={profileLoading} />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-itutor-green via-emerald-500 to-teal-400 py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-itutor-black mb-4">
            iTutor Help Centre
          </h1>
          <p className="text-xl text-itutor-black/90 mb-8">
            Everything you need to know about teaching on iTutor
          </p>

          {/* Search Bar */}
          <div className="relative max-w-2xl mx-auto">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for help articles..."
              className="w-full px-6 py-4 pl-14 bg-white text-gray-900 rounded-xl shadow-lg focus:ring-4 focus:ring-white/50 focus:outline-none placeholder-gray-400"
            />
            <svg
              className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 max-w-7xl">
        
        {/* Search Results or Main Content */}
        {searchQuery.trim() ? (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Search Results ({filteredArticles.length})
            </h2>
            {filteredArticles.length > 0 ? (
              <div className="grid gap-4">
                {filteredArticles.map((article) => (
                  <Link
                    key={article.slug}
                    href={`/help/itutors/${article.slug}`}
                    className="bg-white rounded-xl shadow-md p-6 border-2 border-gray-100 hover:border-itutor-green hover:shadow-lg transition-all group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-3 py-1 bg-itutor-green/10 text-itutor-green text-xs font-semibold rounded-full">
                            {article.category}
                          </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-itutor-green transition-colors">
                          {article.title}
                        </h3>
                        <p className="text-gray-600">{article.summary}</p>
                      </div>
                      <svg
                        className="w-6 h-6 text-gray-400 group-hover:text-itutor-green group-hover:translate-x-1 transition-all flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 bg-white rounded-2xl shadow-md">
                <svg
                  className="w-16 h-16 text-gray-300 mx-auto mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No results found</h3>
                <p className="text-gray-600 mb-4">
                  Try searching with different keywords or browse articles by category below.
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-itutor-green hover:text-emerald-600 font-semibold"
                >
                  Clear search
                </button>
              </div>
            )}
          </section>
        ) : (
          <>
            {/* Popular Articles */}
            <section className="mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Popular Articles</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {popularArticles.map((article) => (
                  <Link
                    key={article.slug}
                    href={`/help/itutors/${article.slug}`}
                    className="bg-white rounded-xl shadow-md p-6 border-2 border-gray-100 hover:border-itutor-green hover:shadow-xl transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <svg
                        className="w-5 h-5 text-amber-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">
                        {article.category}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-itutor-green transition-colors">
                      {article.title}
                    </h3>
                    <p className="text-gray-600 text-sm">{article.summary}</p>
                  </Link>
                ))}
              </div>
            </section>

            {/* Categories */}
            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Browse by Category</h2>
              <div className="space-y-8">
                {categories.map((category) => {
                  const articles = articlesByCategory[category] || [];
                  if (articles.length === 0) return null;

                  return (
                    <div key={category} className="bg-white rounded-2xl shadow-lg p-8 border-2 border-gray-100">
                      <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <span className="w-2 h-8 bg-itutor-green rounded-full"></span>
                        {category}
                      </h3>
                      <div className="grid gap-3">
                        {articles.map((article) => (
                          <Link
                            key={article.slug}
                            href={`/help/itutors/${article.slug}`}
                            className="flex items-center justify-between p-4 rounded-lg hover:bg-gray-50 border border-transparent hover:border-itutor-green/30 transition-all group"
                          >
                            <div>
                              <h4 className="font-semibold text-gray-900 group-hover:text-itutor-green transition-colors">
                                {article.title}
                              </h4>
                              <p className="text-sm text-gray-600 mt-1">{article.summary}</p>
                            </div>
                            <svg
                              className="w-5 h-5 text-gray-400 group-hover:text-itutor-green group-hover:translate-x-1 transition-all flex-shrink-0 ml-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {/* Contact Support CTA */}
        <section className="mt-16 text-center py-12 bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Still Need Help?</h2>
          <p className="text-gray-600 mb-6">
            Can't find what you're looking for? Our support team is ready to assist you.
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
            Contact Support
          </a>
        </section>
      </div>

      {/* Footer */}
      <footer className="bg-itutor-black text-itutor-white py-8 mt-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-itutor-muted">
            &copy; {new Date().getFullYear()} iTutor. All rights reserved.
          </p>
          <div className="mt-4 flex justify-center gap-6 text-sm">
            <Link href="/terms" className="hover:text-itutor-green transition-colors">
              Terms & Conditions
            </Link>
            <Link href="/privacy" className="hover:text-itutor-green transition-colors">
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

