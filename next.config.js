/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
      serverActions: true,
    },
    // Don't try to prerender API routes
    generateBuildId: async () => {
      return 'build-' + Date.now()
    },
    // Skip static page generation for dynamic routes
    staticPageGenerationTimeout: 1000,
    // Disable static optimization that causes build-time Supabase calls
    output: 'standalone',
  }
  
  module.exports = nextConfig
