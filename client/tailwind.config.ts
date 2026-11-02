import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        line: 'var(--line)',
        card: 'var(--card)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        now: 'var(--now)',
        'now-soft': 'var(--now-soft)',
        warn: 'var(--warn)',
        'warn-soft': 'var(--warn-soft)',
        'mono-bg': 'var(--mono-bg)',
      },
      fontFamily: {
        heading: ['Spectral', 'Georgia', 'serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
