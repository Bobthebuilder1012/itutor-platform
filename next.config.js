/** @type {import('next').NextConfig} */
const nextConfig = {
    // Don't try to prerender API routes
    generateBuildId: async () => {
      return 'build-' + Date.now()
    },
    // Skip static page generation for dynamic routes
    staticPageGenerationTimeout: 1000,
  }
  
  module.exports = nextConfig
