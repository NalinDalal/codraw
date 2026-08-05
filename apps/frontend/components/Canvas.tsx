import { useEffect, useRef, useState, useCallback } from "react";
import { IconButton } from "./IconButton";
import { ShortcutsPanel } from "./ShortcutsPanel";
import { ContextMenu, buildContextMenuItems } from "./ContextMenu";
import {
    ArrowUpRight,
    AlignLeft,
    AlignRight,
    AlignHorizontalJustifyCenter,
    ArrowLeftRight,
    ArrowUpDown,
    Lock,
    Unlock,
    Droplet,
    Grid3X3,
    Circle,
    Diamond,
    Download,
    HelpCircle,
    ImageDown,
    Maximize,
    Minus,
    Moon,
    MousePointer2,
    Pencil,
    Pen,
    Plus,
    RectangleHorizontalIcon,
    Redo2,
    Sun,
    Undo2,
    Type,
    Image,
    EraserIcon,
    FileJson,
    Upload,
} from "lucide-react";
import { Game } from "@/draw/Game";
import { Tool, ShapeStyle, CanvasBackground } from "@/draw/shapes";
import { PropertiesPanel } from "./PropertiesPanel";

/**
 * Main canvas component — the root of the drawing experience.
 *
 * Responsibilities:
 * - Creates and manages the {@link Game} drawing engine
 * - Tracks the currently selected tool and shape style
 * - Syncs smooth mode (rough ↔ clean rendering) toggle state
 * - Wires the {@link PropertiesPanel} to the selected shape's style
 * - Renders all floating UI overlays (toolbar, zoom, undo/redo, export)
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
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [game, setGame] = useState<Game>();
    const [selectedTool, setSelectedTool] = useState<Tool>("circle");
    const [selectedShape, setSelectedShape] = useState<{
        type: string;
        style: ShapeStyle;
        arrowHeadSize?: number;
    } | null>(null);
    const [currentStyle, setCurrentStyle] = useState<ShapeStyle>({
        strokeColor: "#ffffff",
        backgroundColor: "transparent",
        strokeWidth: 1.5,
        roughness: 2,
        opacity: 1,
    });
    const [smoothMode, setSmoothMode] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("smoothMode") === "true";
        }
        return false;
    });
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
        game?.setTool(selectedTool);
    }, [selectedTool, game]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            game?.resize();
        };
        resize();

        const observer = new ResizeObserver(resize);
        observer.observe(canvas.parentElement!);

        const g = new Game(canvas, roomId, socket);
        g.setSelectionChangeCallback((shape) => {
            if (shape) {
                setSelectedShape({
                    type: shape.type,
                    style: shape.style ?? g.currentStyle,
                    arrowHeadSize:
                        shape.type === "arrow"
                            ? shape.arrowHeadSize
                            : undefined,
                });
                setCurrentStyle(shape.style ?? g.currentStyle);
            } else {
                setSelectedShape(null);
            }
        });
        g.setThemeChangeCallback((isDark) => {
            setCurrentStyle((s) => ({ ...s, strokeColor: isDark ? "#ffffff" : "#000000" }));
        });
        g.setShortcutsCallback(() => setShortcutsOpen((prev) => !prev));
        g.setContextMenuCallback((x, y) => setContextMenu({ x, y }));
        setGame(g);

        return () => {
            g.destroy();
            observer.disconnect();
        };
    }, [roomId, socket]);

    useEffect(() => {
        game?.setCurrentStyle(currentStyle);
    }, [currentStyle, game]);

    useEffect(() => {
        game?.setSmoothMode(smoothMode);
    }, [smoothMode, game]);

    const panelShapeType = selectedShape?.type ?? selectedTool;
    const panelStyle = selectedShape?.style ?? currentStyle;
    const panelArrowSize =
        selectedShape?.type === "arrow"
            ? selectedShape.arrowHeadSize
            : undefined;

    const cycleBackground = () => {
        if (!game) return;
        const bg = game.background as CanvasBackground;
        let next: CanvasBackground;
        if (bg.type === "solid") {
            next = { type: "dots", color: bg.color, dotSize: 3, spacing: 20 };
        } else if (bg.type === "dots") {
            next = { type: "crosses", color: bg.color, crossSize: 3, spacing: 20 };
        } else if (bg.type === "crosses") {
            next = { type: "plain" };
        } else {
            next = { type: "solid", color: game.isDark ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)" };
        }
        game.setBackground(next);
    };

    return (
        <div className="h-screen overflow-hidden">
            <canvas ref={canvasRef} />
            <Topbar setSelectedTool={setSelectedTool} selectedTool={selectedTool} smoothMode={smoothMode} onToggleSmooth={() => setSmoothMode((s) => !s)} game={game} onShowShortcuts={() => setShortcutsOpen(true)} />
            <PropertiesPanel
                shapeType={panelShapeType}
                style={panelStyle}
                onStyleChange={(updates) => {
                    if (selectedShape) {
                        game?.updateShapeStyle(updates);
                    }
                    setCurrentStyle((s) => ({ ...s, ...updates }));
                }}
                arrowHeadSize={panelArrowSize}
                onArrowHeadSizeChange={(size) => game?.setArrowHeadSize(size)}
            />
            <ThemeToggle game={game} />
            <ZoomBar game={game} />
            <UndoRedoBar game={game} />
            <ExportBar game={game} />
            <ShortcutsPanel isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
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

/**
 * Floating toolbar at the top-left with all drawing tool icons.
 *
 * Shows a vertical column of icon buttons for each tool, plus a
 * smooth/rough mode toggle at the bottom separated by a divider.
 *
 * @param selectedTool - Currently active tool (highlighted)
 * @param setSelectedTool - Callback to change the active tool
 * @param smoothMode - Whether smooth (clean) rendering is active
 * @param onToggleSmooth - Callback to toggle between rough and smooth modes
 */
function Topbar({
    selectedTool,
    setSelectedTool,
    smoothMode,
    onToggleSmooth,
    game,
    onShowShortcuts,
}: {
    selectedTool: Tool;
    setSelectedTool: (s: Tool) => void;
    smoothMode: boolean;
    onToggleSmooth: () => void;
    game: Game | undefined;
    onShowShortcuts: () => void;
}) {
    return (
        <div className="fixed top-2.5 left-2.5">
            <div className="flex flex-col gap-1">
                <IconButton
                    onClick={() => setSelectedTool("select")}
                    activated={selectedTool === "select"}
                    icon={<MousePointer2 />}
                />
                <IconButton
                    onClick={() => setSelectedTool("pencil")}
                    activated={selectedTool === "pencil"}
                    icon={<Pencil />}
                />
                <IconButton
                    onClick={() => setSelectedTool("rect")}
                    activated={selectedTool === "rect"}
                    icon={<RectangleHorizontalIcon />}
                />
                <IconButton
                    onClick={() => setSelectedTool("circle")}
                    activated={selectedTool === "circle"}
                    icon={<Circle />}
                />
                <IconButton
                    onClick={() => setSelectedTool("ellipsisArc")}
                    activated={selectedTool === "ellipsisArc"}
                    icon={
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 16c-4.42 0-8-3.58-8-8" />
                        </svg>
                    }
                    title="Ellipsis Arc"
                />
                <IconButton
                    onClick={() => setSelectedTool("diamond")}
                    activated={selectedTool === "diamond"}
                    icon={<Diamond />}
                />
                <IconButton
                    onClick={() => setSelectedTool("arrow")}
                    activated={selectedTool === "arrow"}
                    icon={<ArrowUpRight />}
                />
                <IconButton
                    onClick={() => setSelectedTool("line")}
                    activated={selectedTool === "line"}
                    icon={<Minus />}
                />
                <IconButton
                    onClick={() => setSelectedTool("text")}
                    activated={selectedTool === "text"}
                    icon={<Type />}
                />
                <IconButton
                    onClick={() => setSelectedTool("image")}
                    activated={selectedTool === "image"}
                    icon={<Image />}
                />
<IconButton
                     onClick={() => setSelectedTool("eraser")}
                     activated={selectedTool === "eraser"}
                     icon={<EraserIcon />}
                 />
                 <IconButton
                     onClick={() => setSelectedTool("stickyNote")}
                     activated={selectedTool === "stickyNote"}
                     icon={
                         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                             <path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
                             <path d="M14 3v6h6" />
                         </svg>
                     }
                     title="Sticky Note"
                 />
                 <div className="my-1 border-t border-white/20" />
                 <IconButton
                     onClick={() => game?.alignLeft()}
                     activated={false}
                     icon={<AlignLeft />}
                     title="Align Left (Ctrl+Shift+L)"
                 />
                 <IconButton
                     onClick={() => game?.alignCenter()}
                     activated={false}
                     icon={<AlignHorizontalJustifyCenter />}
                     title="Align Center (Ctrl+Shift+C)"
                 />
                 <IconButton
                     onClick={() => game?.alignRight()}
                     activated={false}
                     icon={<AlignRight />}
                     title="Align Right (Ctrl+Shift+R)"
                 />
                 <IconButton
                     onClick={() => game?.distributeHorizontal()}
                     activated={false}
                     icon={<ArrowLeftRight />}
                     title="Distribute Horizontal (Ctrl+Shift+H)"
                 />
                 <IconButton
                     onClick={() => game?.distributeVertical()}
                     activated={false}
                     icon={<ArrowUpDown />}
                     title="Distribute Vertical (Ctrl+Shift+V)"
                 />
                 <div className="my-1 border-t border-white/20" />
                 <IconButton
                     onClick={() => game?.lockShapes()}
                     activated={false}
                     icon={<Lock />}
                     title="Lock Shapes (Ctrl+L)"
                 />
                 <IconButton
                     onClick={() => game?.unlockShapes()}
                     activated={false}
                     icon={<Unlock />}
                     title="Unlock Shapes"
                 />
                 <div className="my-1 border-t border-white/20" />
<IconButton
                     onClick={() => game?.setTool("eyedropper")}
                     activated={selectedTool === "eyedropper"}
                     icon={<Droplet />}
                     title="Eyedropper (I)"
                 />
                 <IconButton
                     onClick={cycleBackground}
                     activated={false}
                     icon={<Background />}
                     title="Cycle Background (B)"
                 />
                 <div className="my-1 border-t border-white/20" />
                 <IconButton
                     onClick={onShowShortcuts}
                     activated={false}
                     icon={<HelpCircle />}
                     title="Keyboard Shortcuts (?)"
                 />
                 <div className="my-1 border-t border-white/20" />
                 <IconButton
                     onClick={onToggleSmooth}
                     activated={smoothMode}
                     icon={smoothMode ? <Pen /> : <Pencil />}
                 />
                 <IconButton
                     onClick={onShowShortcuts}
                     activated={false}
                     icon={<HelpCircle />}
                     title="Keyboard Shortcuts (?)"
                 />
                 <div className="my-1 border-t border-white/20" />
                 <IconButton
                     onClick={onToggleSmooth}
                     activated={smoothMode}
                     icon={smoothMode ? <Pen /> : <Pencil />}
                 />
            </div>
        </div>
    );
}

/**
 * Toggle between dark and light theme.
 *
 * Flips the `dark` class on `<html>`, persists the choice to localStorage,
 * and notifies the Game engine so default stroke colors update.
 *
 * @param game - The Game engine instance (for theme change notification)
 */
function ThemeToggle({ game }: { game: Game | undefined }) {
    const [isDark, setIsDark] = useState(true);

    useEffect(() => {
        setIsDark(document.documentElement.classList.contains("dark"));
    }, []);

    return (
        <div className="fixed top-2.5 right-2.5">
            <IconButton
                onClick={() => {
                    const next = !document.documentElement.classList.contains("dark");
                    document.documentElement.classList.toggle("dark", next);
                    localStorage.setItem("theme", next ? "dark" : "light");
                    setIsDark(next);
                    game?.setTheme(next);
                }}
                activated={false}
                icon={isDark ? <Sun /> : <Moon />}
            />
        </div>
    );
}

/**
 * Undo / redo button pair at the bottom-right.
 *
 * Delegates to {@link Game.undo} and {@link Game.redo}.
 *
 * @param game - The Game engine instance
 */
function UndoRedoBar({ game }: { game: Game | undefined }) {
    return (
        <div className="fixed bottom-5 right-5 flex gap-2 bg-black/70 px-3 py-2 rounded-lg">
            <IconButton
                onClick={() => game?.undo()}
                activated={false}
                icon={<Undo2 />}
            />
            <IconButton
                onClick={() => game?.redo()}
                activated={false}
                icon={<Redo2 />}
            />
        </div>
    );
}

/**
 * Export / import bar at the bottom-left.
 *
 * Provides four actions:
 * - Export as PNG (raster image)
 * - Export as SVG (vector)
 * - Export as JSON (reloadable shape data)
 * - Import from JSON file
 *
 * @param game - The Game engine instance
 */
function ExportBar({ game }: { game: Game | undefined }) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <div className="fixed bottom-5 left-5 flex gap-2 bg-black/70 px-3 py-2 rounded-lg">
            <IconButton
                onClick={() => game?.exportToPng()}
                activated={false}
                icon={<ImageDown />}
            />
            <IconButton
                onClick={() => game?.exportToSvg()}
                activated={false}
                icon={<Download />}
            />
            <IconButton
                onClick={() => game?.exportToJson()}
                activated={false}
                icon={<FileJson />}
            />
            <IconButton
                onClick={() => fileInputRef.current?.click()}
                activated={false}
                icon={<Upload />}
            />
            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                        game?.importFromJson(reader.result as string);
                    };
                    reader.readAsText(file);
                    e.target.value = "";
                }}
            />
        </div>
    );
}

/**
 * Zoom in / out buttons at the bottom center.
 *
 * Each click adjusts zoom by a 1.2× factor, centered on the canvas midpoint.
 *
 * @param game - The Game engine instance
 */
function ZoomBar({ game }: { game: Game | undefined }) {
    return (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 flex gap-2 items-center bg-black/70 px-3 py-2 rounded-lg">
            <IconButton
                onClick={() => game?.zoomOut()}
                activated={false}
                icon={<Minus />}
            />
            <IconButton
                onClick={() => game?.zoomToFit()}
                activated={false}
                icon={<Maximize />}
                title="Zoom to Fit (Shift+1)"
            />
            <IconButton
                onClick={() => game?.zoomIn()}
                activated={false}
                icon={<Plus />}
            />
        </div>
    );
}
