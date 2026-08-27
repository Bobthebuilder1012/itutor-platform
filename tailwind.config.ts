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
        blob: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(30px, -40px) scale(1.08)' },
          '66%': { transform: 'translate(-25px, 30px) scale(0.95)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'marquee-reverse': {
          from: { transform: 'translateX(-50%)' },
          to: { transform: 'translateX(0)' },
        },
        'float-y': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
      },
      animation: {
        'logout-drift': 'logout-drift 8s ease-in-out infinite alternate',
        float: 'float 20s ease-in-out infinite',
        blob: 'blob 18s ease-in-out infinite',
        marquee: 'marquee 55s linear infinite',
        'marquee-reverse': 'marquee-reverse 60s linear infinite',
        'float-y': 'float-y 6s ease-in-out infinite',
        'float-y-slow': 'float-y 9s ease-in-out infinite',
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
          soft: 'var(--brand-soft)',
          deep: 'var(--brand-deep)',
        },
        coral: {
          DEFAULT: 'var(--coral)',
          soft: 'var(--coral-soft)',
        },
        mint: {
          DEFAULT: 'var(--mint)',
          deep: 'var(--mint-deep)',
        },
        forest: 'var(--forest)',
        lavender: 'var(--lavender)',
        peach: 'var(--peach)',
        sky: 'var(--sky)',
        // Status palette from the design system. Paired bg/fg so a badge is
        // two classes that cannot drift apart: bg-success-bg text-success-fg.
        success: { bg: 'var(--success-bg)', fg: 'var(--success-fg)' },
        warning: { bg: 'var(--warning-bg)', fg: 'var(--warning-fg)' },
        danger: { bg: 'var(--danger-bg)', fg: 'var(--danger-fg)' },
        info: { bg: 'var(--info-bg)', fg: 'var(--info-fg)' },
        progress: { bg: 'var(--progress-bg)', fg: 'var(--progress-fg)' },
        neutral: { bg: 'var(--neutral-bg)', fg: 'var(--neutral-fg)' },
        star: 'var(--star)',
        surface: {
          DEFAULT: 'var(--surface)',
          soft: 'var(--surface-soft)',
          border: 'var(--surface-border)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
        },
        border: 'var(--border)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        card: 'var(--card)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'Arial', 'sans-serif'],
        display: ['var(--font-display)', 'Space Grotesk', 'Arial', 'sans-serif'],
        body: ['var(--font-sans)', 'Inter', 'Arial', 'sans-serif'],
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
