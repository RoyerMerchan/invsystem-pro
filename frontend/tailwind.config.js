/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        'primary-subtle': 'var(--primary-subtle)',
        success: 'var(--success)',
        'success-subtle': 'var(--success-subtle)',
        warning: 'var(--warning)',
        'warning-subtle': 'var(--warning-subtle)',
        danger: 'var(--danger)',
        'danger-subtle': 'var(--danger-subtle)',
        info: 'var(--info)',
        'info-subtle': 'var(--info-subtle)',
        bg: { 1: 'var(--bg1)', 2: 'var(--bg2)', 3: 'var(--bg3)' },
        t: { 1: 'var(--t1)', 2: 'var(--t2)', 3: 'var(--t3)' },
        border: 'var(--border)',
        surface: 'var(--surface)',
        muted: 'var(--text-muted)',
      },
    },
  },
  plugins: [],
}
