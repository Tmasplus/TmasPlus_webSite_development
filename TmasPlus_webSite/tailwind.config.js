/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#00a7f5",
          light: "#00f4f5",
          dark: "#00204a",
        },
        secondary: {
          DEFAULT: "#005af4",
          violet: "#4300f5",
          soft: "#528df5",
        },
        neutral: {
          dark: "#002f45",
          white: "#ffffff",
        },
      },
    },
  },
  plugins: [],
};
