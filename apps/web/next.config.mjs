/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@ai-reviewer/db', '@ai-reviewer/shared'],
  serverExternalPackages: ['bullmq', 'ioredis', 'pino'],
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
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
  async redirects() {
    return [
      {
        source: '/cybercharbot',
        destination: '/cyberchatbot',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
