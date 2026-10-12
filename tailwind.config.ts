import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F4F5F2',
        ink: '#16212B',
        muted: '#5B6773',
        line: '#DADFD9',
        accent: { DEFAULT: '#0E6B63', dark: '#0A554F', soft: '#E1F0EE' },
        good: { DEFAULT: '#067647', soft: '#E4F5EA' },
        bad: { DEFAULT: '#B42318', soft: '#FDEBE9' },
        warn: { DEFAULT: '#9A5B0B', soft: '#FDF1DC' },
      },
      fontFamily: { sans: ['var(--font-sans)', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
