import { useEffect, useRef, useState } from "react";
import { ShortcutsPanel } from "./ShortcutsPanel";
import { ContextMenu, buildContextMenuItems } from "./ContextMenu";
import { TopBar } from "./TopBar";
import { MainToolbar } from "./MainToolbar";
import { MobileToolDock } from "./MobileToolDock";
import { PropertiesPanel } from "./PropertiesPanel";
import { ZoomControls } from "./ZoomControls";
import { HistoryControls } from "./HistoryControls";
import { TrashPanel } from "./TrashPanel";
import { LibrariesPanel } from "./LibrariesPanel";
import { Minimap } from "./Minimap";
import { SearchPanel } from "./SearchPanel";
import { MermaidPanel } from "./MermaidPanel";
import { PresentMode } from "./PresentMode";
import { PluginPanel } from "./PluginPanel";
import { Game } from "@/draw/Game";
import { Tool, ShapeStyle, CanvasBackground, Shape } from "@repo/shapes";
import { toolHasProperties } from "./canvasTools";

/**
 * Main canvas component — the root of the drawing experience.
 *
 * Responsibilities:
 * - Creates and manages the {@link Game} drawing engine
 * - Tracks the currently selected tool and shape style
 * - Syncs smooth mode (rough ↔ clean rendering) toggle state
 * - Wires the {@link PropertiesPanel} to the selected shape's style
 * - Renders the canvas chrome (header, tool rail, zoom, undo/redo, export)
 *
 * The canvas is full-viewport (`100vw × 100vh`) and handles resize
 * via a `ResizeObserver`.
 */
export function Canvas({
    roomId,
    socket,
}: {
    socket: WebSocket;
    roomId: string;
}) {
    function hashCode(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const [game, setGame] = useState<Game | undefined>(undefined);
    const gameRef = useRef<Game | undefined>(undefined);
    const [selectedTool, setSelectedTool] = useState<Tool>("circle");
    const [handMode, setHandMode] = useState(false);
    const [selectedShape, setSelectedShape] = useState<{
        type: string;
        style: ShapeStyle;
        arrowHeadSize?: number;
        url?: string;
        name?: string;
    } | null>(null);
    const [currentStyle, setCurrentStyle] = useState<ShapeStyle>(() => {
        const storedTheme =
            typeof localStorage !== "undefined"
                ? localStorage.getItem("theme")
                : null;
        const effectiveDark = storedTheme ? storedTheme === "dark" : true;
        return {
            strokeColor: effectiveDark ? "#ffffff" : "#000000",
            backgroundColor: "transparent",
            strokeWidth: 1.5,
            roughness: 2,
            opacity: 1,
        };
    });
    const [smoothMode, setSmoothMode] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("smoothMode") === "true";
        }
        return false;
    });
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [librariesOpen, setLibrariesOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [mermaidOpen, setMermaidOpen] = useState(false);
    const [presentOpen, setPresentOpen] = useState(false);
    const [trashOpen, setTrashOpen] = useState(false);
    const [pluginOpen, setPluginOpen] = useState(false);
    const [showMinimap, setShowMinimap] = useState(true);
    const [trashItems, setTrashItems] = useState<Shape[]>([]);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [textStyle, setTextStyle] = useState<{ bold?: boolean; italic?: boolean; fontFamily?: string; fontSize?: number; textAlign?: "left" | "center" | "right" }>({});
    const [isDragOver, setIsDragOver] = useState(false);

    useEffect(() => {
        gameRef.current?.setTool(selectedTool);
    }, [selectedTool, game]);

    useEffect(() => {
        if (!game) return;
        const updateTrash = () => {
            setTrashItems(gameRef.current?.getTrash() ?? []);
        };
        updateTrash();
        const interval = setInterval(updateTrash, 500);
        return () => clearInterval(interval);
    }, [game]);

    // Keep hand-mode state in sync when it's toggled via keyboard.
    useEffect(() => {
        if (!game) return;
        const sync = () => setHandMode(Boolean(gameRef.current?.handMode));
        sync();
        const interval = setInterval(sync, 200);
        return () => clearInterval(interval);
    }, [game]);

    useEffect(() => {
        let cancelled = false;
        fetch("/auth/me", { credentials: "include" })
            .then((res) => {
                if (!res.ok) throw new Error("Unauthorized");
                return res.json();
            })
            .then((data: { userId?: string; name?: string }) => {
                if (cancelled || !gameRef.current) return;
                const colors = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899"];
                const colorIndex = data.userId ? hashCode(data.userId) % colors.length : Math.floor(Math.random() * colors.length);
                const color = colors[colorIndex];
                gameRef.current.setLocalUser(data.userId || crypto.randomUUID(), data.name || "Anonymous", color);
            })
            .catch(() => {
                if (cancelled || !gameRef.current) return;
                const colors = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899"];
                gameRef.current.setLocalUser(crypto.randomUUID(), "Anonymous", colors[Math.floor(Math.random() * colors.length)]);
            });
        return () => { cancelled = true; };
    }, [game]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            gameRef.current?.resize();
        };
        resize();

        const observer = new ResizeObserver(resize);
        observer.observe(canvas.parentElement!);

        const g = new Game(canvas, roomId, socket);
        // The Game is constructed before ThemeProvider's effect applies the
        // stored theme (effects run child-first), so the DOM class still
        // reflects the SSR default. Sync the engine to the effective theme
        // when they disagree so the canvas and chrome never mismatch.
        const storedTheme =
            typeof localStorage !== "undefined"
                ? localStorage.getItem("theme")
                : null;
        const effectiveDark = storedTheme ? storedTheme === "dark" : true;
        if (effectiveDark !== document.documentElement.classList.contains("dark")) {
            g.setTheme(effectiveDark);
        }
        g.setSelectionChangeCallback((shape) => {
            if (shape) {
                setSelectedShape({
                    type: shape.type,
                    style: shape.style ?? g.currentStyle,
                    arrowHeadSize:
                        shape.type === "arrow"
                            ? shape.arrowHeadSize
                            : undefined,
                    url: shape.url,
                    name: shape.type === "frame" ? shape.name : undefined,
                });
                setCurrentStyle(shape.style ?? g.currentStyle);
                if (shape.type === "text") {
                    setTextStyle({
                        bold: shape.bold,
                        italic: shape.italic,
                        fontFamily: shape.fontFamily,
                        fontSize: shape.fontSize,
                        textAlign: shape.textAlign || "left",
                    });
                }
            } else {
                setSelectedShape(null);
                setTextStyle({});
            }
        });
        g.setThemeChangeCallback((isDark) => {
            setCurrentStyle((s) => ({ ...s, strokeColor: isDark ? "#ffffff" : "#000000" }));
        });
        g.setShortcutsCallback(() => setShortcutsOpen((prev) => !prev));
        g.setSearchCallback(() => setSearchOpen((prev) => !prev));
        g.setContextMenuCallback((x, y) => setContextMenu({ x, y }));
        gameRef.current = g;
        setGame(g);

        return () => {
            g.destroy();
            observer.disconnect();
        };
    }, [roomId, socket]);

    useEffect(() => {
        gameRef.current?.setCurrentStyle(currentStyle);
    }, [currentStyle, game]);

    useEffect(() => {
        if (textStyle.bold !== undefined) gameRef.current!.textBold = textStyle.bold;
        if (textStyle.italic !== undefined) gameRef.current!.textItalic = textStyle.italic;
        if (textStyle.fontFamily !== undefined) gameRef.current!.textFontFamily = textStyle.fontFamily;
        if (textStyle.fontSize !== undefined) gameRef.current!.textFontSize = textStyle.fontSize;
        if (textStyle.textAlign !== undefined) gameRef.current!.textAlign = textStyle.textAlign;
    }, [textStyle, game]);

    useEffect(() => {
        gameRef.current?.setSmoothMode(smoothMode);
    }, [smoothMode, game]);

    const panelShapeType = selectedShape?.type ?? selectedTool;
    const panelStyle = selectedShape?.style ?? currentStyle;
    const panelArrowSize =
        selectedShape?.type === "arrow"
            ? selectedShape.arrowHeadSize
            : undefined;
    const panelUrl = selectedShape?.url;

    /**
     * Whether the contextual properties popover should be visible:
     * a shape is selected, or the active tool has configurable properties.
     */
    const showProperties =
        selectedShape !== null || toolHasProperties(selectedTool);

    const selectTool = (tool: string) => {
        gameRef.current?.setHandPanning(false);
        setHandMode(false);
        setSelectedTool(tool as Tool);
    };

    const toggleHand = () => {
        const g = gameRef.current;
        const next = g ? !g.handMode : !handMode;
        g?.setHandPanning(next);
        setHandMode(next);
    };

    /**
     * Cycle through canvas background styles: solid → dots → crosses → plain → solid.
     */
    const cycleBackground = () => {
        const g = gameRef.current;
        if (!g) return;
        const bg = g.background as CanvasBackground;
        let next: CanvasBackground;
        if (bg.type === "solid") {
            next = { type: "dots", color: bg.color, dotSize: 3, spacing: 20 };
        } else if (bg.type === "dots") {
            next = { type: "crosses", color: bg.color, crossSize: 3, spacing: 20 };
        } else if (bg.type === "crosses") {
            next = { type: "plain" };
        } else {
            next = { type: "solid", color: g.isDark ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)" };
        }
        g.setBackground(next);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const libraryId = e.dataTransfer.getData("application/x-library-id");
        const itemId = e.dataTransfer.getData("application/x-item-id");
        if (!libraryId || !itemId || !gameRef.current) return;
        const [canvasX, canvasY] = gameRef.current.screenToCanvas(e.clientX, e.clientY);
        gameRef.current.loadLibraryItem(libraryId, itemId, canvasX, canvasY);
    };

    return (
        <div
            ref={wrapRef}
            className={`h-screen overflow-hidden ${isDragOver ? "ring-2 ring-blue-500/50" : ""} ${handMode ? "cursor-grab active:cursor-grabbing" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <canvas ref={canvasRef} />

            <TopBar
                roomName={roomId}
                game={game}
                onShowShortcuts={() => setShortcutsOpen(true)}
                onShowLibraries={() => setLibrariesOpen(true)}
                onShowMermaid={() => setMermaidOpen(true)}
                onShowPlugins={() => setPluginOpen((prev) => !prev)}
                onShowSearch={() => setSearchOpen(true)}
                onShowTrash={() => setTrashOpen((prev) => !prev)}
                onPresent={() => setPresentOpen(true)}
                onCycleBackground={cycleBackground}
                showMinimap={showMinimap}
                onToggleMinimap={() => setShowMinimap((s) => !s)}
            />
            <MainToolbar
                selectedTool={selectedTool}
                handMode={handMode}
                onSelectTool={selectTool}
                onToggleHand={toggleHand}
                smoothMode={smoothMode}
                onToggleSmooth={() => setSmoothMode((s) => !s)}
                game={game}
            />
            <MobileToolDock
                selectedTool={selectedTool}
                handMode={handMode}
                onSelectTool={selectTool}
                onToggleHand={toggleHand}
                smoothMode={smoothMode}
                onToggleSmooth={() => setSmoothMode((s) => !s)}
            />
            {showProperties && (
                <PropertiesPanel
                    key={panelShapeType}
                    docked
                    shapeType={panelShapeType}
                    style={panelStyle}
                    onStyleChange={(updates) => {
                        if (selectedShape) {
                            gameRef.current?.updateShapeStyle(updates);
                        }
                        setCurrentStyle((s) => ({ ...s, ...updates }));
                    }}
                    arrowHeadSize={panelArrowSize}
                    onArrowHeadSizeChange={(size) => gameRef.current?.setArrowHeadSize(size)}
                    textStyle={textStyle}
                    onTextStyleChange={(updates) => setTextStyle((s) => ({ ...s, ...updates }))}
                    url={panelUrl}
                    onUrlChange={(url) => gameRef.current?.setShapeUrl(url)}
                    frameName={selectedShape?.type === "frame" ? selectedShape.name : undefined}
                    onFrameNameChange={(name) => gameRef.current?.setFrameName(name)}
                    isSelection={selectedShape !== null}
                    game={game}
                />
            )}
            <ZoomControls game={game} canvasRef={wrapRef} />
            <HistoryControls game={game} />
            <ShortcutsPanel isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
            <LibrariesPanel game={game} open={librariesOpen} onClose={() => setLibrariesOpen(false)} />
            <SearchPanel game={game} open={searchOpen} onClose={() => setSearchOpen(false)} />
            <MermaidPanel game={game} open={mermaidOpen} onClose={() => setMermaidOpen(false)} />
            <PresentMode game={game} active={presentOpen} onClose={() => setPresentOpen(false)} />
            {showMinimap && <Minimap game={game} />}
            <TrashPanel
                trash={trashItems}
                onRestore={(id) => gameRef.current?.restoreFromTrash(id)}
                onEmpty={() => gameRef.current?.emptyTrash()}
                onClose={() => setTrashOpen(false)}
                open={trashOpen}
            />
            <PluginPanel game={game} open={pluginOpen} onClose={() => setPluginOpen(false)} />
            {contextMenu && game && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={buildContextMenuItems(game, game.getSelectedShapes().length > 0)}
                    onClose={() => setContextMenu(null)}
                />
            )}
        </div>
    );
}
