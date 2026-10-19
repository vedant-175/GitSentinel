/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@ai-reviewer/db', '@ai-reviewer/shared'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        child_process: false,
        dns: false,
        crypto: false,
      };
    }
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ['bullmq', 'ioredis', 'pino'],
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
};

export default nextConfig;
