/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        water: {
          50: '#eef7fb',
          100: '#d6ecf5',
          200: '#aedaeb',
          300: '#7dc1dc',
          400: '#48a3c8',
          500: '#2987af',
          600: '#1f6c8f',
          700: '#1a5774',
          800: '#174860',
          900: '#143c50',
        },
      },
    },
  },
  plugins: [],
};
