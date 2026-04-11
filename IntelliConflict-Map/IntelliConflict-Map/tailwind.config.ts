import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        text: "rgb(var(--text) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)"
      },
      boxShadow: {
        bloom:
          "0 16px 48px rgba(4, 8, 20, 0.52), 0 0 0 1px rgba(255, 255, 255, 0.05), 0 0 36px rgba(125, 84, 255, 0.15)"
      },
      backdropBlur: {
        xl: "24px"
      },
      animation: {
        "soft-pulse": "softPulse 2.4s ease-in-out infinite"
      },
      keyframes: {
        softPulse: {
          "0%, 100%": {
            opacity: "0.55",
            transform: "scale(1)"
          },
          "50%": {
            opacity: "1",
            transform: "scale(1.06)"
          }
        }
      }
    }
  },
  plugins: []
};

export default config;
