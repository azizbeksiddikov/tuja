import type { Config } from "tailwindcss";

// All colors come from CSS variables in src/app/globals.css (one place to restyle).
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        card: v("card"),
        ink: v("ink"),
        muted: v("muted"),
        line: v("line"),
        accent: v("accent"),
        "accent-ink": v("accent-ink"),
        soft: v("soft"),
        pos: v("pos"),
        neg: v("neg"),
        dark: v("dark"),
        // shadcn primitive aliases
        background: v("card"),
        foreground: v("ink"),
        primary: { DEFAULT: v("accent"), foreground: v("accent-ink") },
        secondary: { DEFAULT: v("soft"), foreground: v("ink") },
        destructive: { DEFAULT: v("neg"), foreground: v("card") },
        input: v("line"),
        ring: v("accent"),
        "muted-foreground": v("muted"),
      },
      borderRadius: { card: "var(--radius-card)", tile: "var(--radius-tile)" },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      boxShadow: { card: "var(--shadow-card)" },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;
