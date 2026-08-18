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
                /* canvas + surfaces — dark is the studio identity: deep warm-black paper,
                   glass chrome floats on top. Light mode stays clean and opaque. */
                canvas: "#fafafa",
                "canvas-dark": "#131217",
                card: "#ffffff",
                "card-dark": "#1d222b",
                /* elevated is an alias for card — both share the same value;
                   use `card` for page-level surfaces, `elevated` for floating chrome. */
                elevated: "#ffffff",
                "elevated-dark": "#1d222b",
                muted: "#f3f4f6",
                "muted-dark": "#22262f",

                /* interaction states */
                hover: "rgba(0,0,0,0.04)",
                "hover-dark": "rgba(255,255,255,0.07)",
                active: "rgba(0,0,0,0.08)",
                "active-dark": "rgba(255,255,255,0.12)",
                selected: "rgba(37,99,235,0.12)",
                "selected-dark": "rgba(96,165,250,0.16)",

                /* text — dark alphas tuned for WCAG AA on the glass surfaces */
                foreground: "#1f2937",
                "foreground-dark": "rgba(255,255,255,0.92)",
                "muted-foreground": "#6b7280",
                "muted-foreground-dark": "rgba(255,255,255,0.55)",
                "icon-primary": "#1f2937",
                "icon-primary-dark": "rgba(255,255,255,0.85)",
                "icon-secondary": "#6b7280",
                "icon-secondary-dark": "rgba(255,255,255,0.62)",

                /* borders */
                border: "#e5e7eb",
                "border-dark": "rgba(255,255,255,0.12)",
                "border-subtle": "#eceef1",
                "border-subtle-dark": "rgba(255,255,255,0.08)",

                /* accent — chrome + clickables */
                primary: "#2b6fe8",
                "primary-foreground": "#ffffff",
                "accent-hover": "#2563eb",
                "accent-hover-dark": "#4d93f7",

                /* highlight — selection & emphasis on canvas + chrome, near-neon in dark */
                highlight: "#2563eb",
                "highlight-dark": "#60a5fa",
                "highlight-foreground": "#ffffff",
                "highlight-foreground-dark": "#071120",

                /* semantic */
                danger: "#dc2626",
                "danger-dark": "#f87171",
                "danger-foreground": "#ffffff",
                success: "#15803d",
                "success-dark": "#4ade80",
                "success-foreground": "#ffffff",
            },
            fontSize: {
                '10': '0.625rem',
                '11': '0.6875rem',
                '13': '0.8125rem',
            },
            boxShadow: {
                soft: "0 1px 3px rgba(16,24,40,0.07), 0 6px 20px rgba(16,24,40,0.10)",
                "soft-dark": "0 1px 3px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.4)",
                float: "0 2px 6px rgba(16,24,40,0.04), 0 12px 32px rgba(16,24,40,0.12)",
                "float-dark": "0 2px 8px rgba(0,0,0,0.3), 0 14px 40px rgba(0,0,0,0.45)",
                glow: "0 0 0 1px rgba(37,99,235,0.25), 0 0 20px rgba(59,130,246,0.25)",
                "glow-dark": "0 0 0 1px rgba(147,197,253,0.25), 0 0 24px rgba(96,165,250,0.35)",
            },
            borderRadius: {
                sm: "6px",
                md: "8px",
                lg: "12px",
            },
            transitionDuration: {
                fast: "140ms",
                slow: "280ms",
            },
            transitionTimingFunction: {
                spring: "cubic-bezier(0.16, 1, 0.3, 1)",
                skid: "cubic-bezier(0.34, 1.56, 0.64, 1)",
            },
            keyframes: {
                "popover-in": {
                    from: { opacity: "0", transform: "translateY(4px) scale(0.97)" },
                    to: { opacity: "1", transform: "translateY(0) scale(1)" },
                },
                "tooltip-in": {
                    from: { opacity: "0", transform: "translateY(2px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
                "panel-in": {
                    from: { opacity: "0", transform: "translateY(10px) scale(0.98)" },
                    to: { opacity: "1", transform: "translateY(0) scale(1)" },
                },
                "edge-in-left": {
                    from: { opacity: "0", transform: "translateX(-14px) scale(0.98)" },
                    to: { opacity: "1", transform: "translateX(0) scale(1)" },
                },
                "edge-in-right": {
                    from: { opacity: "0", transform: "translateX(14px) scale(0.98)" },
                    to: { opacity: "1", transform: "translateX(0) scale(1)" },
                },
                "sheet-in": {
                    from: { opacity: "0", transform: "translateY(28px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
                "modal-in": {
                    from: { opacity: "0", transform: "translateY(8px) scale(0.96)" },
                    to: { opacity: "1", transform: "translateY(0) scale(1)" },
                },
                "fade-in": {
                    from: { opacity: "0" },
                    to: { opacity: "1" },
                },
                "tool-pop": {
                    "0%": { transform: "scale(1)" },
                    "55%": { transform: "scale(1.14)" },
                    "100%": { transform: "scale(1)" },
                },
            },
            animation: {
                popover: "popover-in 160ms cubic-bezier(0.16, 1, 0.3, 1)",
                tooltip: "tooltip-in 100ms ease-out",
                "panel-in": "panel-in 240ms cubic-bezier(0.16, 1, 0.3, 1)",
                "edge-in-left": "edge-in-left 220ms cubic-bezier(0.16, 1, 0.3, 1)",
                "edge-in-right": "edge-in-right 220ms cubic-bezier(0.16, 1, 0.3, 1)",
                "sheet-in": "sheet-in 260ms cubic-bezier(0.16, 1, 0.3, 1)",
                "modal-in": "modal-in 220ms cubic-bezier(0.16, 1, 0.3, 1)",
                "fade-in": "fade-in 160ms ease-out",
                "tool-pop": "tool-pop 260ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            },
        },
    },
    plugins: [],
} satisfies Config;