import type { Config } from "tailwindcss";

export default {
    darkMode: "class",
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "@/packages/ui/**/*.{ts,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
                mono: ["var(--font-geist-mono)", "ui-monospace", "Menlo", "monospace"],
            },
            colors: {
                background: "var(--background)",
                foreground: "var(--foreground)",
                card: "var(--card)",
                "card-foreground": "var(--card-foreground)",
                "card-border": "var(--card-border)",
                muted: "var(--muted)",
                "muted-foreground": "var(--muted-foreground)",
                primary: "var(--primary)",
                "primary-foreground": "var(--primary-foreground)",
                secondary: "var(--secondary)",
                "secondary-foreground": "var(--secondary-foreground)",
                accent: "var(--accent)",
                "accent-foreground": "var(--accent-foreground)",
                input: "var(--input)",
                border: "var(--border)",
                "border-subtle": "var(--border-subtle)",
                canvas: "var(--canvas-background)",
                "text-secondary": "var(--text-secondary)",
                "surface-hover": "var(--surface-hover)",
                "surface-active": "var(--surface-active)",
                "icon-primary": "var(--icon-primary)",
                "icon-secondary": "var(--icon-secondary)",
                "accent-hover": "var(--accent-hover)",
                selection: "var(--selection)",
            },
            boxShadow: {
                soft: "var(--shadow)",
            },
        },
    },
    plugins: [],
} satisfies Config;
