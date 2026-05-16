/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        elite: {
          black: '#000000',
          white: '#FFFFFF',
          neutral: {
            50: '#F9F9F9',
            100: '#F2F2F2',
            200: '#E5E5E5',
            300: '#D4D4D4',
            400: '#A3A3A3',
            500: '#737373',
            600: '#525252',
            700: '#404040',
            800: '#262626',
            900: '#171717',
          }
        }
      },
      letterSpacing: {
        tightest: '-.06em',
        tighter: '-.04em',
      },
      borderRadius: {
        'elite': '2px',
      },
      borderWidth: {
        '3': '3px',
      }
    },
  },
  plugins: [],
}
