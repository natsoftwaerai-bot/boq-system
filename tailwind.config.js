/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sarabun: ['Sarabun', 'sans-serif'],
        mono: ['Roboto Mono', 'monospace'], // เพิ่ม Mono ให้เหมือนใน HTML เดิม
      },
    },
  },
  plugins: [],
}