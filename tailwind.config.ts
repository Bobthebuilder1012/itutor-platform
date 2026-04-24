import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      keyframes: {
        'logout-drift': {
          from: { transform: 'translate(0, 0) scale(1)' },
          to: { transform: 'translate(30px, 20px) scale(1.08)' },
        },
        float: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(60px, -40px) scale(1.1)' },
          '66%': { transform: 'translate(-40px, 60px) scale(0.95)' },
        },
      },
      animation: {
        'logout-drift': 'logout-drift 8s ease-in-out infinite alternate',
        float: 'float 20s ease-in-out infinite',
      },
      screens: {
        '3xl': '1920px',
      },
      colors: {
        'itutor-black': '#000000',
        'itutor-green': '#199356',
        'itutor-white': '#F4F4F4',
        'itutor-card': '#0F0F0F',
        'itutor-border': '#1C1C1C',
        'itutor-muted': '#BDBDBD',
        'green-deep': '#052e1a',
        brand: {
          DEFAULT: 'var(--brand)',
          dark: 'var(--brand-dark)',
          light: 'var(--brand-light)',
          accent: 'var(--brand-accent)',
        },
        sidebar: {
          DEFAULT: 'var(--sidebar)',
          fg: 'var(--sidebar-fg)',
          muted: 'var(--sidebar-muted)',
          active: 'var(--sidebar-active)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          soft: 'var(--surface-soft)',
          border: 'var(--surface-border)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
        },
      },
      fontFamily: {
        display: ['var(--font-oswald)', 'system-ui', 'sans-serif'],
        body: ['var(--font-oswald)', 'system-ui', 'sans-serif'],
        instrument: ['var(--font-oswald)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '1rem',
      },
      boxShadow: {
        'brand-glow': '0 0 0 6px rgba(22,163,74,0.12)',
      },
    },
  },
  plugins: [],
}
export default config
