/** @type {import('next').NextConfig} */

// Content-Security-Policy (CSP) tailored for Next.js App Router, Tailwind CSS, GitHub OAuth, and avatars
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://avatars.githubusercontent.com https://github.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.github.com",
  "frame-ancestors 'none'",
  "form-action 'self' https://github.com",
  "base-uri 'self'",
  "object-src 'none'",
];

const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  {
    key: 'Content-Security-Policy',
    value: cspDirectives.join('; '),
  },
];

const nextConfig = {
  poweredByHeader: false,
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
      allowedOrigins: [
        'localhost:3000',
        '127.0.0.1:3000',
        'gitsentinel-red.vercel.app',
        'git-sentinel.vercel.app',
        process.env.VERCEL_PROJECT_PRODUCTION_URL,
        process.env.VERCEL_URL,
      ].filter(Boolean),
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
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
