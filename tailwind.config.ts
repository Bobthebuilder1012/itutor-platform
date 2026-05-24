import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Legacy tokens (keep for backward compat)
        'itutor-black': '#000000',
        'itutor-green': '#199358',
        'itutor-white': '#F4F4F4',
        'itutor-card': '#0F0F0F',
        'itutor-border': '#1C1C1C',
        'itutor-muted': '#BDBDBD',
        // v2 design-system tokens
        'brand': '#32CC6F',
        'brand-deep': '#1fa855',
        'brand-soft': '#e6f9ee',
        'ink': '#0D0D0D',
        'coral': '#FF6B00',
        'coral-soft': '#FFF4EC',
        'muted': '#f3f4f6',
        'muted-foreground': '#6b7280',
        'border': '#e5e7eb',
        'background': '#ffffff',
      },
      boxShadow: {
        'pop': '0 20px 50px -20px rgba(50,204,111,0.35)',
        'card': '0 10px 30px -12px rgba(13,13,13,0.18)',
      },
    },
  },
  plugins: [],
}
export default config
