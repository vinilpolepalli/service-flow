import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Accent rationale: dispatch blue #1d4ed8 is a brighter, saturated utility blue chosen for an
        // operations board. It is deliberately distinct from the sibling demo's muted dark navy (#16324f)
        // and from every other sibling accent (teal, bronze, crimson, burnt orange, olive, green), and it
        // stays out of the indigo/violet band that reads as a default.
        accent: { DEFAULT: "#1d4ed8", hover: "#1e40af" },
        ink: "#0f172a",
        line: "#e2e8f0",
        ground: "#fcfcfd",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: { card: "10px", btn: "8px" },
    },
  },
  plugins: [],
};
export default config;
