import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@dxer/shared'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Proxy /api requests to the backend server so everything goes through
  // a single tunnel — eliminates double-tunnel latency for API calls.
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL || 'http://localhost:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
