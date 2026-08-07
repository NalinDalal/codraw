/**
 * SearchPanel — find shapes by text content, arrow labels, or frame names.
 *
 * Opens with Cmd+F, shows a floating search bar at the top center.
 * Highlights matching shapes and allows navigating between them.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Game } from "@/draw/Game";
import { Shape } from "@/draw/shapes";
import { ChevronUp, ChevronDown, X } from "lucide-react";

export function SearchPanel({
    game,
    open,
    onClose,
}: {
    game: Game | undefined;
    open: boolean;
    onClose: () => void;
}) {
    const [query, setQuery] = useState("");
    const [matches, setMatches] = useState<Shape[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const wasOpen = useRef(false);

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
        wasOpen.current = open;
    }, [open]);

    const doSearch = useCallback((q: string) => {
        setQuery(q);
        if (!game) return;
        const results = game.searchShapes(q);
        setMatches(results);
        setCurrentIndex(0);
        if (results.length > 0 && results[0].id) {
            game.selectAndZoomTo(results[0].id);
        }
    }, [game]);

    const navigate = useCallback((dir: 1 | -1) => {
        if (matches.length === 0) return;
        const next = (currentIndex + dir + matches.length) % matches.length;
        setCurrentIndex(next);
        if (matches[next].id && game) {
            game.selectAndZoomTo(matches[next].id!);
        }
    }, [matches, currentIndex, game]);

    const handleClose = useCallback(() => {
        setQuery("");
        setMatches([]);
        setCurrentIndex(0);
        onClose();
    }, [onClose]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
            if (e.key === "Enter") {
                e.preventDefault();
                navigate(e.shiftKey ? -1 : 1);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, handleClose, navigate]);

    if (!open) return null;

    return (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-30 bg-black/80 backdrop-blur-md rounded-lg border border-white/10 p-2 flex items-center gap-2 shadow-lg">
            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => doSearch(e.target.value)}
                placeholder="Search shapes..."
                className="bg-white/10 border border-white/20 rounded px-3 py-1.5 text-sm text-white placeholder:text-white/30 w-64 outline-none focus:border-blue-400"
            />
            {matches.length > 0 && (
                <span className="text-xs text-white/50 whitespace-nowrap">
                    {currentIndex + 1}/{matches.length}
                </span>
            )}
            <button
                onClick={() => navigate(-1)}
                disabled={matches.length === 0}
                className="p-1 text-white/50 hover:text-white disabled:opacity-30 cursor-pointer"
            >
                <ChevronUp size={16} />
            </button>
            <button
                onClick={() => navigate(1)}
                disabled={matches.length === 0}
                className="p-1 text-white/50 hover:text-white disabled:opacity-30 cursor-pointer"
            >
                <ChevronDown size={16} />
            </button>
            <button
                onClick={handleClose}
                className="p-1 text-white/50 hover:text-white cursor-pointer"
            >
                <X size={16} />
            </button>
        </div>
    );
}
