/**
 * Client-side theme provider.
 *
 * Reads the persisted theme from localStorage on mount and applies the
 * `dark` class to `<html>`. Defaults to dark mode if no preference is stored.
 *
 * Must be wrapped in a `"use client"` boundary (Next.js App Router).
 *
 * @param children - Child components to render
 */
"use client";

import { useEffect, type ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
    useEffect(() => {
        const stored = localStorage.getItem("theme");
        if (stored) {
            document.documentElement.classList.toggle("dark", stored === "dark");
        } else {
            document.documentElement.classList.add("dark");
        }
    }, []);

    return <>{children}</>;
}
