/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#711361",
          light: "#921a7c",
          dark: "#4e0c43",
          glow: "rgba(113, 19, 97, 0.45)",
        },
        plum: {
          950: "#0e030c",
          900: "#1a0717",
          800: "#260C22",
          700: "#37002E",
          600: "#520c45",
        }
      },
      fontFamily: {
        poppins: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "brand-glow": "0 0 25px rgba(113, 19, 97, 0.5)",
        "brand-sm": "0 0 12px rgba(113, 19, 97, 0.35)",
        "card": "0 8px 32px 0 rgba(0, 0, 0, 0.6)",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: 1, filter: "drop-shadow(0 0 15px rgba(113, 19, 97, 0.7))" },
          "50%": { opacity: 0.8, filter: "drop-shadow(0 0 5px rgba(113, 19, 97, 0.3))" },
        }
      },
      animation: {
        "pulse-glow": "pulse-glow 3s infinite ease-in-out",
      }
    },
  },
  plugins: [],
}
