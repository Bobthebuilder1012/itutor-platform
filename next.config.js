/** @type {import('next').NextConfig} */
const nextConfig = {
    // Don't try to prerender API routes
    generateBuildId: async () => {
      return 'build-' + Date.now()
    },
    // Skip static page generation for dynamic routes
    staticPageGenerationTimeout: 1000,
    // Enable next/image optimization
    images: {
      domains: ['nfkrfciozjxrodkusrhh.supabase.co'], // Allow Supabase storage images
      formats: ['image/avif', 'image/webp'], // Modern formats for better compression
      deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
      imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
      minimumCacheTTL: 60, // Cache images for 60 seconds
    },
  }
  
  module.exports = nextConfig
