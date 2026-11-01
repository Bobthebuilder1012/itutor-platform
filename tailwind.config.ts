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
          // Channel form so bg-brand/60 works. See --ds-brand in globals.css.
          DEFAULT: 'rgb(var(--ds-brand) / <alpha-value>)',
          dark: 'var(--brand-dark)',
          light: 'var(--brand-light)',
          accent: 'var(--brand-accent)',
          soft: 'var(--brand-soft)',
          deep: 'var(--brand-deep)',
          // Design-system additions. These two names carry no legacy meaning,
          // so they hold literal values and work in any subtree. brand-edge is
          // the 3px lip under a brand button, and also green text on white
          // (6.3:1). brand-legacy is the current web app green, kept only
          // while screens move over.
          edge: '#0f6e3f',
          legacy: '#199356',
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
          // Channel form so text-ink/50 and bg-ink/60 work.
          DEFAULT: 'rgb(var(--ds-ink) / <alpha-value>)',
          muted: 'rgb(var(--ds-ink-muted) / <alpha-value>)',
          subtle: '#757575',
          faint: '#879489',
          raised: '#17402a',
        },
        border: 'rgb(var(--ds-border) / <alpha-value>)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        card: 'var(--card)',

        // ── iTutor design system (light-only) ──────────────────────────
        // Names are exactly as written in the design system tokens.json.
        //
        // FOUR OF ITS NAMES ARE DELIBERATELY NOT REDEFINED HERE: brand, ink,
        // ink-muted and border already exist above with different legacy
        // values and roughly 2,700 uses across the current pages
        // (bg-brand 680, text-ink 1206, border-border 856). Redefining them
        // globally would restyle the whole old UI. Instead those four resolve
        // to rgb(var(--ds-*) / <alpha-value>): globals.css gives the variables
        // the legacy colours, and components/ui/ds-tokens.css overrides them
        // inside `.ds-root`. So bg-brand is #32cc6e inside the new shell and
        // the legacy green outside it — and because the value is channels
        // rather than a bare var(), bg-brand/60 works in both.
        //
        // Every other token below is a literal, which Tailwind can already
        // split for alpha, so they need none of that machinery.
        'surface-page': '#f2f4ef',
        'surface-card': '#ffffff',
        'surface-sunken': '#e7ebe4',
        'border-strong': '#c5ccc1',
        'line-soft': '#dde3d8',
        'on-ink': '#ffffff',
        'on-ink-muted': '#c3d3c8',
        'on-ink-subtle': '#a9bbaf',
        danger: {
          DEFAULT: '#c2362f',
          edge: '#8b221d',
          soft: '#fbe9e7',
        },
        'accent-yellow': '#f5b81c',
        'accent-orange': '#e8613a',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'Arial', 'sans-serif'],
        display: ['var(--font-display)', 'Space Grotesk', 'Arial', 'sans-serif'],
        body: ['var(--font-sans)', 'Inter', 'Arial', 'sans-serif'],
      },
      spacing: {
        // Design-system spacing. Tailwind already owns the numeric scale, so
        // these take a ds- prefix rather than silently changing what p-4
        // means on every existing page. ds-card is the 14px card padding.
        'ds-1': '4px',
        'ds-1h': '6px',
        'ds-2': '8px',
        'ds-3': '12px',
        'ds-card': '14px',
        'ds-4': '16px',
        'ds-5': '20px',
        'ds-8': '32px',
      },
      borderRadius: {
        card: '1rem',
        'ds-xs': '5px',
        'ds-sm': '8px',
        'ds-btn': '9px',
        'ds-card': '10px',
        'ds-full': '999px',
      },
      borderWidth: {
        hair: '1px',
        bold: '2px',
      },
      boxShadow: {
        'brand-glow': '0 0 0 6px rgba(22,163,74,0.12)',
        // The lip: a solid 3px offset in a darker shade of the fill. There
        // are no blurred shadows anywhere in this system. Pressing a button
        // moves it down 2px and shrinks the lip to 1px — the -active pair.
        'edge-brand': '0 3px 0 #0f6e3f',
        'edge-brand-active': '0 1px 0 #0f6e3f',
        'edge-danger': '0 3px 0 #8b221d',
        'edge-danger-active': '0 1px 0 #8b221d',
        'edge-ink': '0 3px 0 #0d2318',
        'edge-ink-active': '0 1px 0 #0d2318',
        'edge-ink-raised': '0 3px 0 #17402a',
        'edge-ink-raised-active': '0 1px 0 #17402a',
      },
    },
  },
  plugins: [],
}
export default config
