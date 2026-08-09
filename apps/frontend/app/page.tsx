import { Button } from "@repo/ui/button";
import {
    Github,
    ImageDown,
    Pencil,
    Save,
    Shapes,
    ShieldCheck,
    Undo2,
    Wifi,
} from "lucide-react";
import Link from "next/link";
import { HeroBoard } from "@/components/HeroBoard";

const FEATURES = [
    {
        icon: Shapes,
        index: "01",
        title: "Full drawing toolset",
        body: "Pencil, rect, circle, diamond, arrow, line, text, image, eraser and frame — plus grouping and multi-select.",
    },
    {
        icon: Wifi,
        index: "02",
        title: "Real-time sync",
        body: "Shape diffs, live presence cursors and in-room chat over WebSockets, with auto-reconnect using exponential backoff.",
    },
    {
        icon: Save,
        index: "03",
        title: "Conflict-safe autosave",
        body: "Optimistic concurrency with 409 merge handling — your edits are never silently overwritten.",
    },
    {
        icon: Undo2,
        index: "04",
        title: "Canvas UX",
        body: "Undo/redo, pinch-to-zoom, touch support, minimap and present mode.",
    },
    {
        icon: ImageDown,
        index: "05",
        title: "Export & images",
        body: "Export to PNG, SVG or JSON, and upload images with LRU caching.",
    },
    {
        icon: ShieldCheck,
        index: "06",
        title: "Security",
        body: "Custom HS256 JWT auth, bcrypt, per-IP rate limiting and revocable sessions.",
    },
];

const STACK = [
    "next.js 15",
    "react 19",
    "typescript",
    "bun",
    "postgresql / prisma",
    "turborepo",
    "aws ec2",
];

const HIGHLIGHTS = [
    "monorepo — 3 apps + 4 shared packages",
    "persistence — versioned optimistic concurrency",
    "renderer — custom canvas engine, dirty-rect + layer caching",
];

function SectionKicker({ children }: { children: string }) {
    return (
        <p className="font-mono text-xs text-primary tracking-wider">
            {"// "}
            {children}
        </p>
    );
}

function App() {
    return (
        <div className="min-h-screen bg-background">
            {/* ── Nav ── */}
            <nav className="border-b border-border">
                <div className="container flex items-center justify-between px-4 py-3.5 mx-auto sm:px-6 lg:px-8">
                    <Link
                        href="/"
                        className="flex items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                        <span className="flex items-center justify-center w-7 h-7 -rotate-6 border border-border rounded-md bg-card">
                            <Pencil className="w-3.5 h-3.5 text-primary" />
                        </span>
                        <span className="font-mono font-semibold text-base tracking-tight">
                            CoDraw
                        </span>
                    </Link>
                    <a
                        href="https://github.com/NalinDalal/codraw"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-muted-foreground rounded transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label="GitHub repository"
                    >
                        <Github className="w-5 h-5" />
                    </a>
                </div>
            </nav>

            {/* ── Hero ── */}
            <header className="overflow-hidden border-b border-border bg-[radial-gradient(circle,var(--card-border)_1px,transparent_1px)] [background-size:24px_24px]">
                <div className="container px-4 py-16 mx-auto sm:px-6 lg:px-8 sm:py-20">
                    <div className="max-w-3xl mx-auto text-center">
                        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl text-foreground">
                            Excalidraw-style canvas with{" "}
                            <span className="text-primary">live multi-user collaboration</span>
                        </h1>
                        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
                            Real-time collaborative whiteboard where multiple users draw,
                            chat, and edit the same canvas together over WebSockets.
                        </p>
                        <div className="flex gap-x-4 justify-center items-center mt-10">
                            <Link href="/signin">
                                <Button
                                    variant="primary"
                                    size="lg"
                                    className="px-6 h-11 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                >
                                    Sign in
                                </Button>
                            </Link>
                            <Link href="/signup">
                                <Button
                                    variant="outline"
                                    size="lg"
                                    className="px-6 h-11 rounded-md border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                >
                                    Sign up
                                </Button>
                            </Link>
                        </div>
                    </div>

                    <div className="max-w-3xl mx-auto mt-14">
                        <HeroBoard />
                        <p className="mt-2 font-mono text-xs text-muted-foreground text-center">
                            {"// shapes: rectangle, ellipse, diamond, arrow — drawn with rough.js"}
                        </p>
                    </div>
                </div>
            </header>

            {/* ── Features ── */}
            <section className="py-20 sm:py-24">
                <div className="container px-4 mx-auto sm:px-6 lg:px-8">
                    <SectionKicker>features</SectionKicker>
                    <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
                        Everything you need to draw together
                    </h2>
                    <div className="grid grid-cols-1 gap-4 mt-12 sm:grid-cols-2 lg:grid-cols-3">
                        {FEATURES.map((f) => (
                            <div
                                key={f.title}
                                className="p-5 border border-border rounded-lg bg-card transition-colors duration-150 hover:border-primary"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center justify-center w-10 h-10 border border-border rounded-md bg-background">
                                        <f.icon className="w-5 h-5 text-primary" />
                                    </div>
                                    <span className="font-mono text-xs text-muted-foreground">
                                        {f.index}
                                    </span>
                                </div>
                                <h3 className="mt-4 font-semibold text-foreground">{f.title}</h3>
                                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                                    {f.body}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Tech stack ── */}
            <section className="py-16 sm:py-20 bg-muted border-y border-border">
                <div className="container px-4 mx-auto sm:px-6 lg:px-8">
                    <SectionKicker>tech stack</SectionKicker>
                    <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
                        One toolchain, three services
                    </h2>
                    <div className="flex flex-wrap gap-2 mt-8">
                        {STACK.map((item) => (
                            <span
                                key={item}
                                className="px-3 py-1.5 font-mono text-sm border border-border rounded-md bg-background"
                            >
                                {item}
                            </span>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Under the hood ── */}
            <section className="py-20 sm:py-24">
                <div className="container px-4 mx-auto sm:px-6 lg:px-8">
                    <SectionKicker>under the hood</SectionKicker>
                    <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
                        The boring details, done right
                    </h2>
                    <div className="mt-10 overflow-hidden border border-border rounded-lg bg-card">
                        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border bg-muted">
                            <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
                            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                                architecture
                            </span>
                        </div>
                        <div className="p-5 sm:p-6">
                            {HIGHLIGHTS.map((h) => (
                                <p key={h} className="py-1.5 font-mono text-sm text-foreground">
                                    <span className="text-muted-foreground">$ </span>
                                    {h}
                                </p>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="border-t border-border">
                <div className="container flex flex-col gap-4 items-center justify-between px-4 py-8 mx-auto sm:flex-row sm:px-6 lg:px-8">
                    <p className="font-mono text-sm text-muted-foreground">
                        © {new Date().getFullYear()} CoDraw — real-time collaborative
                        whiteboard
                    </p>
                    <a
                        href="https://github.com/NalinDalal/week-22-excalidraw"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-1.5 font-mono text-sm border border-border rounded-md text-foreground transition-colors duration-150 hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                        <Github className="w-4 h-4" />
                        view source
                    </a>
                </div>
            </footer>
        </div>
    );
}

export default App;
