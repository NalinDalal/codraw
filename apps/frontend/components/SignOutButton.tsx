/**
 * Signs the current user out (POST /auth/logout clears the httpOnly cookie)
 * and returns them to the guest home page.
 */

"use client";

import { HTTP_BACKEND } from "@/config";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useState } from "react";

export function SignOutButton() {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    async function handleClick() {
        setBusy(true);
        try {
            await axios.post(`${HTTP_BACKEND}/auth/logout`, {}, { withCredentials: true });
        } catch {
            // Even if the request fails, drop back to the guest view.
        }
        router.push("/");
        router.refresh();
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={busy}
            className="px-3 py-1.5 font-mono text-sm border border-border dark:border-border-dark rounded-md text-muted-foreground dark:text-muted-foreground-dark transition-colors duration-150 hover:border-primary hover:text-primary disabled:opacity-50"
        >
            {busy ? "signing out…" : "sign out"}
        </button>
    );
}
