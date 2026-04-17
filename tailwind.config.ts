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
      },
      animation: {
        'logout-drift': 'logout-drift 8s ease-in-out infinite alternate',
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
      },
    },
  },
  plugins: [],
}
export default config
