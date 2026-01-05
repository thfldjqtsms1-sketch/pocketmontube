/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        youtube: {
          red: '#FF0000',
          dark: '#0f0f0f',
          darker: '#0a0a0a',
          sidebar: '#212121',
        }
      }
    },
  },
  plugins: [],
}
