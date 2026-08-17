/**
 * React error boundary for the canvas tree.
 *
 * Catches render errors in child components and displays a fallback UI
 * with the error message and a "Try again" button that reloads the page.
 *
 * Without this, a rendering error in the canvas or its overlays would
 * crash the entire page with no recovery path.
 *
 * @param children - Child components to protect
 * @param fallback - Optional custom fallback UI (overrides default)
 */

"use client";

import { Component, type ReactNode } from "react";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/** React error boundary that catches render errors and shows a fallback UI */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    /**
     * Update state when a child component throws during render.
     * @param error - The error that was thrown
     */
    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    /**
     * Log caught errors to the console with component stack trace.
     * @param error - The error that was thrown
     * @param info - React error info with component stack
     */
    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error("ErrorBoundary caught:", error, info.componentStack);
    }

    componentDidUpdate(prevProps: Props) {
        if (prevProps.children !== this.props.children && this.state.hasError) {
            this.setState({ hasError: false, error: null });
        }
    }

    /** Render children normally, or the fallback UI if an error was caught */
    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div className="flex flex-col items-center justify-center h-screen bg-canvas dark:bg-canvas-dark text-foreground dark:text-foreground-dark gap-4">
                    <h2 className="text-xl font-semibold">Something went wrong</h2>
                    <p className="text-muted-foreground dark:text-muted-foreground-dark text-sm max-w-md text-center">
                        {this.state.error?.message || "An unexpected error occurred."}
                    </p>
                    <button
                        className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-accent-hover dark:hover:bg-accent-hover-dark transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas dark:focus-visible:ring-offset-canvas-dark"
                        onClick={() => {
                            this.setState({ hasError: false, error: null });
                            window.location.reload();
                        }}
                    >
                        Try again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
