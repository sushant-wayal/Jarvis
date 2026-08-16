/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@jarvis/shared'],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client']
  }
};

export default nextConfig;
