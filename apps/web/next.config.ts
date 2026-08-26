import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The shared package is a linked workspace dependency; let Next compile it
  // rather than treating it as a prebuilt third-party module.
  transpilePackages: ['@puncline/shared'],
};

export default nextConfig;
