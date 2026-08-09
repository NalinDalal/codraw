/**
 * Authentication page for sign-in and sign-up.
 *
 * Renders a centered card with email/password fields (and name for sign-up).
 * On successful sign-in, the server sets an httpOnly cookie.
 * The frontend fetches a short-lived WS token separately when needed.
 * Redirects to `/`.
 * On successful sign-up, redirects to `/signin`.
 *
 * Displays server-side validation errors inline.
 *
 * @param isSignin - If `true`, renders the sign-in form; otherwise sign-up
 */

"use client";

import { HTTP_BACKEND } from "@/config";
import axios, { isAxiosError } from "axios";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthPage({ isSignin }: { isSignin: boolean }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const router = useRouter();

    const [error, setError] = useState("");

    /** Submit credentials to the HTTP backend and handle success/error */
    async function handleClick() {
        setError("");

        if (!/^\S+@\S+\.\S+$/.test(email)) {
            setError("Enter a valid email address.");
            return;
        }
        if (password.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }
        if (!isSignin && !name.trim()) {
            setError("Enter your name.");
            return;
        }

        try {
            await axios.post(
                `${HTTP_BACKEND}/${isSignin ? "signin" : "signup"}`,
                {
                    email,
                    password,
                    name,
                },
                { withCredentials: true },
            );

            if (isSignin) {
                // httpOnly cookie is set by the server — no token stored in JS
                router.push("/canvas/0");
            } else {
                router.push("/signin");
            }

        } catch (e: unknown) {
            if (isAxiosError<{ message?: string }>(e)) {
                const serverMsg = e.response?.data?.message;
                const fallback = isSignin
                    ? "Couldn't sign in. Check your email and password."
                    : "Couldn't create account. Check your details and try again.";
                const msg = serverMsg || fallback;

                console.error(
                    "Auth error:",
                    e.response?.status,
                    e.response?.data,
                    e.message
                );

                setError(msg);
            } else {
                console.error("Auth error:", e);
                setError("Something went wrong");
            }
        }
    }

    return (
        <div className="flex justify-center items-center w-screen h-screen bg-background">
            <form
                className="p-6 m-2 rounded-lg border bg-card text-card-foreground"
                onSubmit={(e) => { e.preventDefault(); handleClick(); }}
            >
                <div className="p-2">
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        required
                        autoComplete="email"
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 rounded border bg-background text-foreground placeholder:text-muted-foreground"
                    />
                </div>
                {!isSignin && (
                    <div className="p-2">
                        <input
                            type="text"
                            placeholder="Name"
                            value={name}
                            required
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2 rounded border bg-background text-foreground placeholder:text-muted-foreground"
                        />
                    </div>
                )}
                <div className="p-2">
                    <input
                        type="password"
                        placeholder="Password (min 6 characters)"
                        value={password}
                        required
                        minLength={6}
                        autoComplete={isSignin ? "current-password" : "new-password"}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 rounded border bg-background text-foreground placeholder:text-muted-foreground"
                    />
                </div>
                {error && <p className="p-2 text-red-500 text-sm">{error}</p>}
                <div className="pt-2">
                    <button
                        type="submit"
                        className="w-full px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        {isSignin ? "Sign in" : "Sign up"}
                    </button>
                </div>
            </form>
        </div>
    );
}
