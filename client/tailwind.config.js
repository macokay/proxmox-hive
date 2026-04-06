/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        base: {
          950: '#08080a',
          900: '#0e0e12',
          800: '#141418',
          700: '#1a1a20',
          600: '#22222a',
          500: '#2e2e38',
        },
        border: '#1e1e28',
        accent: {
          DEFAULT: '#4f8ef7',
          dim: '#2563eb22',
          glow: '#4f8ef733',
        },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        muted: '#5a5a6e',
      },
    },
  },
  plugins: [],
}
