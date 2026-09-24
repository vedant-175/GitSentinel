/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@ai-reviewer/db', '@ai-reviewer/shared'],
  experimental: {
    serverComponentsExternalPackages: ['bullmq', 'ioredis'],
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
};

export default nextConfig;
