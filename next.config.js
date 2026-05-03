/** @type {import('next').NextConfig} */
const path = require('path');
const os = require('os');

// In development, relocate the build output outside OneDrive to avoid file-lock
// + symlink issues. Only apply the workaround when the project actually sits
// inside a OneDrive-synced folder; otherwise use the standard .next directory.
const projectRoot = __dirname.toLowerCase();
const insideOneDrive = /[\\/]onedrive(\b|[\\/])/.test(projectRoot);
const devDistDir = insideOneDrive
  ? path.join(os.homedir(), '.itutor-next', 'build')
  : '.next';

const nextConfig = {
    distDir: process.env.NODE_ENV === 'production' ? '.next' : devDistDir,
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
    // Webpack configuration to handle Firebase
    webpack: (config, { isServer }) => {
      // Exclude Firebase from server-side bundle
      if (isServer) {
        config.resolve.alias = {
          ...config.resolve.alias,
          'firebase/app': false,
          'firebase/messaging': false,
        };
      }
      return config;
    },
  }
  
  module.exports = nextConfig
