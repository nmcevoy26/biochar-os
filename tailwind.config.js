/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1e3a5f',
        'primary-light': '#2d5a8e',
      },
    },
  },
  plugins: [],
}
