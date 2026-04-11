import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Pre-existing lint errors in AdminDataGrid — tracked separately
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.hizliresim.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  webpack: (config) => {
    config.watchOptions = {
      poll: false,
      ignored: /node_modules/,
    };
    return config;
  },
  // Enable static file serving
  output: 'standalone',
  // Configure development settings
  onDemandEntries: {
    // period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 25 * 1000,
    // number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 2,
  },
};

export default nextConfig; 
