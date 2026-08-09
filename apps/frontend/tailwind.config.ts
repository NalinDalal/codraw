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
                sans: ["var(--font-geist-sans)", "Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "ui-sans-serif", "system-ui", "sans-serif"],
                mono: ["var(--font-geist-mono)", "ui-monospace", "Menlo", "monospace"],
            },
            colors: {
                /* canvas + surfaces */
                canvas: "#fafafa",
                "canvas-dark": "#12151b",
                card: "#ffffff",
                "card-dark": "#181c23",
                elevated: "#ffffff",
                "elevated-dark": "#1d222b",
                muted: "#f3f4f6",
                "muted-dark": "#1b2028",
                secondary: "#f3f4f6",
                "secondary-dark": "#1d222b",

                /* interaction states */
                hover: "rgba(0,0,0,0.04)",
                "hover-dark": "rgba(255,255,255,0.06)",
                active: "rgba(0,0,0,0.07)",
                "active-dark": "rgba(255,255,255,0.10)",
                selected: "rgba(59,130,246,0.10)",
                "selected-dark": "rgba(59,130,246,0.14)",

                /* text */
                foreground: "#1f2937",
                "foreground-dark": "rgba(255,255,255,0.92)",
                "text-secondary": "#4b5563",
                "text-secondary-dark": "rgba(255,255,255,0.62)",
                "muted-foreground": "#6b7280",
                "muted-foreground-dark": "rgba(255,255,255,0.42)",
                "icon-primary": "#1f2937",
                "icon-primary-dark": "rgba(255,255,255,0.85)",
                "icon-secondary": "#6b7280",
                "icon-secondary-dark": "rgba(255,255,255,0.5)",

                /* borders */
                border: "#e5e7eb",
                "border-dark": "rgba(255,255,255,0.10)",
                "border-subtle": "#eceef1",
                "border-subtle-dark": "rgba(255,255,255,0.06)",

                /* accent */
                primary: "#3b82f6",
                "primary-foreground": "#ffffff",
                "accent-hover": "#2563eb",
                "accent-hover-dark": "#4d93f7",
            },
            boxShadow: {
                soft: "0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)",
                "soft-dark": "0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)",
                float: "0 4px 16px rgba(0,0,0,0.08)",
                "float-dark": "0 4px 16px rgba(0,0,0,0.25)",
            },
            borderRadius: {
                sm: "6px",
                md: "8px",
                lg: "12px",
            },
            transitionDuration: {
                fast: "140ms",
            },
            keyframes: {
                "popover-in": {
                    from: { opacity: "0", transform: "translateY(4px) scale(0.98)" },
                    to: { opacity: "1", transform: "translateY(0) scale(1)" },
                },
                "tooltip-in": {
                    from: { opacity: "0", transform: "translateY(2px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
            },
            animation: {
                popover: "popover-in 150ms ease-out",
                tooltip: "tooltip-in 100ms ease-out",
            },
        },
    },
    plugins: [],
} satisfies Config;
