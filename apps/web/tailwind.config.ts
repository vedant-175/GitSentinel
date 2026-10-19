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
          cyan: '#00f0ff',
          teal: '#00e5ff',
          emerald: '#00e676',
          crimson: '#ff1744',
          amber: '#ffab00',
          purple: '#b388ff',
        },
        surface: '#0b1019',
        'surface-elevated': '#0e1624',
        border: '#172338',
        'border-focus': '#00f0ff',
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
