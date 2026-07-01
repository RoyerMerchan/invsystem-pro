/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#1D9E75',
        'primary-dark': '#0d7a59',
        danger: '#D85A30',
        bg: { 1: 'var(--bg1)', 2: 'var(--bg2)', 3: 'var(--bg3)' },
        t: { 1: 'var(--t1)', 2: 'var(--t2)', 3: 'var(--t3)' },
        border: 'var(--border)',
      },
    },
  },
  plugins: [],
}
