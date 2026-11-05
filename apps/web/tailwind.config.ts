import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#06090e',
        cyber: {
          bg: '#06090e',
          surface: '#0b1019',
          card: '#0e1624',
          'card-hover': '#131e31',
          border: '#172338',
          'border-bright': '#233854',
          cyan: '#3b82f6',
          teal: '#2563eb',
          emerald: '#10b981',
          crimson: '#ef4444',
          amber: '#f59e0b',
          purple: '#8b5cf6',
        },
        surface: '#0b1019',
        'surface-elevated': '#0e1624',
        border: '#172338',
        'border-focus': '#3b82f6',
        primary: {
          50: '#e0f7fa',
          100: '#b2ebf2',
          500: '#00e5ff',
          600: '#00b8d4',
          700: '#0097a7',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
