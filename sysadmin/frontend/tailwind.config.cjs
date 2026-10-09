/** @type {import('tailwindcss').Config} */
const colorToken = (name) =>
  `color-mix(in oklab, var(--${name}) calc(<alpha-value> * 100%), transparent)`;

module.exports = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./modules/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: colorToken("border"),
        input: colorToken("input"),
        ring: colorToken("ring"),
        background: colorToken("background"),
        foreground: colorToken("foreground"),
        primary: {
          DEFAULT: colorToken("primary"),
          foreground: colorToken("primary-foreground"),
        },
        secondary: {
          DEFAULT: colorToken("secondary"),
          foreground: colorToken("secondary-foreground"),
        },
        destructive: {
          DEFAULT: colorToken("destructive"),
          foreground: colorToken("destructive-foreground"),
        },
        muted: {
          DEFAULT: colorToken("muted"),
          foreground: colorToken("muted-foreground"),
        },
        accent: {
          DEFAULT: colorToken("accent"),
          foreground: colorToken("accent-foreground"),
        },
        popover: {
          DEFAULT: colorToken("popover"),
          foreground: colorToken("popover-foreground"),
        },
        card: {
          DEFAULT: colorToken("card"),
          foreground: colorToken("card-foreground"),
        },
        sidebar: {
          DEFAULT: colorToken("sidebar"),
          foreground: colorToken("sidebar-foreground"),
          primary: colorToken("sidebar-primary"),
          "primary-foreground": colorToken("sidebar-primary-foreground"),
          accent: colorToken("sidebar-accent"),
          "accent-foreground": colorToken("sidebar-accent-foreground"),
          border: colorToken("sidebar-border"),
          ring: colorToken("sidebar-ring"),
        },
        chart: {
          1: colorToken("chart-1"),
          2: colorToken("chart-2"),
          3: colorToken("chart-3"),
          4: colorToken("chart-4"),
          5: colorToken("chart-5"),
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        heading: ["var(--font-heading)"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};