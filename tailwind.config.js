/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Enable dark mode using a class
  theme: {
    extend: {},
  },
  plugins: [
    require('tailwindcss-animate') // Add tailwind-animate plugin
  ],
}