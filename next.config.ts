import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Games register their own route strings in the catalog, so routes stay untyped.
  typedRoutes: false,
};

export default nextConfig;
