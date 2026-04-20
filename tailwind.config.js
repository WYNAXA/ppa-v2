/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        teal: {
          DEFAULT: '#009688',
          50:  '#e0f2f1',
          100: '#b2dfdb',
          500: '#009688',
          600: '#00897b',
          700: '#00796b',
        },
        orange: {
          DEFAULT: '#E65100',
          500: '#E65100',
          600: '#D84315',
        },
        sidebar: '#0f1117',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
