/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070708',
          900: '#0a0a0c',
          800: '#111114',
          700: '#1a1a1f',
          600: '#26262d',
          500: '#3a3a44',
          400: '#6b6b78',
          300: '#9a9aa6',
          200: '#cfcfd6',
          100: '#f4f4f6'
        },
        accent: {
          DEFAULT: '#1ed760',
          dim: '#16a34a'
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
