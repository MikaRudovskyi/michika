import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sumi: '#0B0B0C',
        charcoal: '#1A1A1C',
        ink: '#141416',
        forest: '#0F1F18',
        washi: '#F4EFE6',
        mist: '#9A968D',
        gold: {
          DEFAULT: '#D4AF37',
          soft: '#E6C766',
          deep: '#A8892B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Shippori Mincho"', '"Noto Serif JP"', 'Georgia', 'serif'],
      },
      transitionTimingFunction: {
        calm: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      boxShadow: {
        glow: '0 0 40px -8px rgba(212, 175, 55, 0.45)',
      },
    },
  },
  plugins: [],
} satisfies Config