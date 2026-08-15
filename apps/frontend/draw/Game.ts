import { ImageCache } from "./imageCache";
import { getExistingShapes, saveShapes } from "./http";
import rough from "roughjs";
import {
    Tool,
    Shape,
    ShapeStyle,
    Point,
    Bounds,
    defaultStyle,
    CanvasBackground,
    Library,
    LibraryItem,
    getShapeBounds,
    getShapeCenter,
    ensureShapesHaveStyle,
    TextShape,
} from "@repo/shapes";
import { GameContext } from "./gameContext";
import { LibraryManager } from "./managers/libraryManager";
import { HistoryManager } from "./managers/historyManager";
import { ExportManager } from "./managers/exportManager";
import { MermaidManager } from "./managers/mermaidManager";
import { PluginManager } from "./managers/pluginManager";
import { LaserManager } from "./managers/laserManager";
import { StyleManager } from "./managers/styleManager";
import { ArrowManager } from "./managers/arrowManager";
import { ImageManager } from "./managers/imageManager";
import { TextManager } from "./managers/textManager";
import { RenderManager } from "./managers/renderManager";
import { ShapeManager } from "./managers/shapeManager";
import { CursorManager } from "./managers/cursorManager";
import { AutoSaveManager } from "./managers/autoSaveManager";
import { ClipboardManager } from "./managers/clipboardManager";
import { KeyboardManager } from "./managers/keyboardManager";
import { WebSocketSyncManager } from "./managers/webSocketSyncManager";
import {
    renderShape,
    drawDragSelect,
    hitTest,
    eraserIntersectsShape,
} from "./renderer";
import { exportToPng, exportToSvg, exportToJson } from "./exporter";
import {
    offsetShapeCopy,
    moveShape,
    TextStyleOptions,
} from "./inputHandler";
import { Plugin, CustomToolDefinition } from "./pluginSystem";

/**
 * Core drawing engine.
 *
 * Composes focused modules for viewport, undo, rendering, export, and input.
 * Manages the HTML Canvas, shape state, selection, grouping, pan/zoom,
 * WebSocket sync, and auto-save persistence.
 */
export class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private context = new GameContext();
    private roomId: string;
    private clicked = false;
    private startX = 0;
    private startY = 0;
    private selectedTool: Tool | string = "circle";
    private _previousTool: Tool | string = "select";
    private constantPenPoints: Point[] = [];
    private isPanning = false;
    private panStartX = 0;
    private panStartY = 0;
    private spacePressed = false;
    private _handMode = false;
    private escapePressed = false;
    private isDragging = false;
    private isSelecting = false;
    private dragOffsetX = 0;
    private dragOffsetY = 0;
    private dragStartShapes: Shape[] | null = null;
    private dragStartPoint: { x: number; y: number } | null = null;
    private lastSnappedDelta: { x: number; y: number } | null = null;
    private dragStartBounds: Bounds | null = null;
    private rc: ReturnType<typeof rough.canvas>;
    private selectionChangeCallback: ((shape: Shape | null) => void) | null = null;
    private styleChangeCallback: (() => void) | null = null;
    private toolChangeCallback: ((tool: string) => void) | null = null;
    private shortcutsCallback: (() => void) | null = null;
    private searchCallback: (() => void) | null = null;
    private contextMenuCallback: ((x: number, y: number) => void) | null = null;
    private eraserPoints: Point[] = [];
    private eraserRadius = 20;
    private imageCache = new ImageCache();
    private pasteHandler = ((_e: ClipboardEvent) => { }) as (e: ClipboardEvent) => void;
    /** Device pixel ratio, capped at 2 for performance */
    private zenModeCallback: ((zen: boolean) => void) | null = null;
    private viewModeCallback: ((view: boolean) => void) | null = null;

    private pinchStartDist = 0;
    private pinchStartZoom = 1;
    private lastTapTime = 0;
    private lastPointerX = 0;
    private lastPointerY = 0;
    private contextMenuHandler = (e: Event) => {
        e.preventDefault();
        const me = e as MouseEvent;
        this.contextMenuCallback?.(me.clientX, me.clientY);
    };
    private laserMouseLeave = () => {
        if (this.selectedTool === "laser") {
            this.clearLaser();
        }
    };
    private laserMouseEnter = (e: MouseEvent) => {
        if (this.selectedTool === "laser") {
            const coords = this.context.viewport.getCanvasCoords(e.clientX, e.clientY);
            this.setLaserPosition(coords[0], coords[1]);
        }
    };
    /** Whether dark mode is active (public accessor for UI components) */
    get isDark(): boolean { return this.context.isDark; }
    set isDark(v: boolean) { this.context.isDark = v; }

    /** The current drawing style (public accessor for UI components) */
    get currentStyle(): ShapeStyle { return this.context.currentStyle; }
    set currentStyle(v: ShapeStyle) { this.context.currentStyle = v; }

    /** The current canvas background style */
    get background(): CanvasBackground {
        return this.context._background;
    }

    /** Whether new text will be bold */
    get textBold(): boolean { return this.context.textManager.textBold; }
    set textBold(v: boolean) { this.context.textManager.textBold = v; }

    /** Whether new text will be italic */
    get textItalic(): boolean { return this.context.textManager.textItalic; }
    set textItalic(v: boolean) { this.context.textManager.textItalic = v; }

    /** Font family for new text shapes */
    get textFontFamily(): string { return this.context.textManager.textFontFamily; }
    set textFontFamily(v: string) { this.context.textManager.textFontFamily = v; }

    /** Font size for new text shapes */
    get textFontSize(): number { return this.context.textManager.textFontSize; }
    set textFontSize(v: number) { this.context.textManager.textFontSize = v; }

    /** Text alignment for new text shapes */
    get textAlign(): "left" | "center" | "right" { return this.context.textManager.textAlign; }
    set textAlign(v: "left" | "center" | "right") { this.context.textManager.textAlign = v; }

    /** Get the current text formatting state */
    getTextStyle(): TextStyleOptions {
        return this.context.textManager.getTextStyle();
    }

    /** The WebSocket connection for real-time collaboration */
    socket: WebSocket;

    private isResizing = false;
    private resizeHandle = -1;
    private resizeStartBounds: { x: number; y: number; w: number; h: number } | null = null;
    private resizeShiftKey = false;
    private isRotating = false;
    private rotateStartAngle = 0;
    private rotateStartRotation = 0;
    private destroyed = false;

    // Plugin system
    // Polyline drawing state
    private polylinePoints: Array<[number, number]> = [];
    private isDrawingPolyline = false;
    private polylineStartCount = 0;

    // Library storage key
    /** Get all saved libraries from localStorage */
    getLibraries(): Library[] {
        return this.context.libraryManager.getLibraries();
    }

    /** Create a new library */
    createLibrary(name: string): Library {
        return this.context.libraryManager.createLibrary(name);
    }

    /** Delete a library by ID */
    deleteLibrary(id: string) {
        this.context.libraryManager.deleteLibrary(id);
    }

    /** Rename a library */
    renameLibrary(id: string, name: string) {
        this.context.libraryManager.renameLibrary(id, name);
    }

    /** Save selected shapes as a library item */
    saveToLibrary(libraryId: string, itemName: string): LibraryItem | null {
        return this.context.libraryManager.saveToLibrary(libraryId, itemName);
    }

    /** Delete a library item */
    deleteLibraryItem(libraryId: string, itemId: string) {
        this.context.libraryManager.deleteLibraryItem(libraryId, itemId);
    }

    /** Load a library item onto the canvas at the given position */
    loadLibraryItem(libraryId: string, itemId: string, x?: number, y?: number) {
        this.context.libraryManager.loadLibraryItem(libraryId, itemId, x, y);
    }

    /** Export a library as JSON for sharing */
    exportLibrary(libraryId: string): string | null {
        return this.context.libraryManager.exportLibrary(libraryId);
    }

    /** Import a library from JSON */
    importLibrary(json: string): Library | null {
        return this.context.libraryManager.importLibrary(json);
    }

    /** Get all visible shapes for the minimap */
    getShapesForMinimap(): Shape[] {
        return this.context.existingShapes.filter(s => s.type !== "eraser");
    }

    /** Get the current viewport state for the minimap */
    getViewportState() {
        return {
            panX: this.context.viewport.panX,
            panY: this.context.viewport.panY,
            zoom: this.context.viewport.zoom,
            canvasWidth: this.context.cssWidth,
            canvasHeight: this.context.cssHeight,
        };
    }

    /** Navigate the viewport to center on a canvas coordinate */
    navigateTo(canvasX: number, canvasY: number) {
        this.context.viewport.panX = this.context.cssWidth / 2 - canvasX * this.context.viewport.zoom;
        this.context.viewport.panY = this.context.cssHeight / 2 - canvasY * this.context.viewport.zoom;
        this.invalidateCache();
        this.clearCanvas();
    }

    /** Search shapes by text content, arrow labels, or frame names */
    searchShapes(query: string): Shape[] {
        if (!query.trim()) return [];
        const q = query.toLowerCase();
        return this.context.existingShapes.filter(s => {
            if (s.type === "text") return s.text.toLowerCase().includes(q);
            if (s.type === "arrow" && s.label) return s.label.toLowerCase().includes(q);
            if (s.type === "frame") return s.name.toLowerCase().includes(q);
            if (s.type === "stickyNote" && s.text) return s.text.toLowerCase().includes(q);
            return false;
        });
    }

    /** Select and zoom to a specific shape */
    selectAndZoomTo(shapeId: string) {
        this.context.selectedIds = new Set([shapeId]);
        this.notifySelection();
        const shape = this.shapeById(shapeId);
        if (shape) {
            const bounds = getShapeBounds(shape);
            if (bounds) {
                this.context.viewport.zoomToFit(bounds, this.context.cssWidth, this.context.cssHeight, 100);
                this.invalidateCache();
                this.clearCanvas();
            }
        }
    }

    /** Import a Mermaid diagram and add shapes to the canvas */
    importFromMermaid(text: string, x = 200, y = 200): Shape[] {
        return this.context.mermaidManager.importFromMermaid(text, x, y);
    }

    /** Get all frames sorted by position (top-to-bottom, left-to-right) as slides */
    getSlides(): Shape[] {
        return this.context.existingShapes
            .filter(s => s.type === "frame" && !s.locked)
            .sort((a, b) => {
                if (a.type !== "frame" || b.type !== "frame") return 0;
                const dy = a.y - b.y;
                if (Math.abs(dy) > 50) return dy;
                return a.x - b.x;
            });
    }

    /** Get the viewport state needed to show a frame full-screen */
    getSlideViewport(frame: Shape, canvasWidth: number, canvasHeight: number): { panX: number; panY: number; zoom: number } {
        const bounds = getShapeBounds(frame);
        if (!bounds) return { panX: 0, panY: 0, zoom: 1 };
        const padding = 40;
        const availW = canvasWidth - padding * 2;
        const availH = canvasHeight - padding * 2;
        const zoomX = availW / bounds.w;
        const zoomY = availH / bounds.h;
        const zoom = Math.min(zoomX, zoomY, 2);
        return {
            zoom,
            panX: canvasWidth / 2 - (bounds.x + bounds.w / 2) * zoom,
            panY: canvasHeight / 2 - (bounds.y + bounds.h / 2) * zoom,
        };
    }

    /** Convert screen/client coordinates to canvas/world coordinates */
    screenToCanvas(clientX: number, clientY: number): Point {
        return this.context.viewport.getCanvasCoords(clientX, clientY);
    }

    /**
     * Create a new drawing engine.
     * @param canvas - The HTML canvas element to draw on
     * @param roomId - The collaboration room ID for sync
     * @param socket - WebSocket connection for real-time collaboration
     */
    constructor(canvas: HTMLCanvasElement, roomId: string, socket: WebSocket) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
        this.context.existingShapes = [];
        this.roomId = roomId;
        this.socket = socket;
        this.context.isDark = document.documentElement.classList.contains("dark");
        this.context.currentStyle = defaultStyle(this.context.isDark);
        this.context.styleManager = new StyleManager(this.context, {
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
        });
        this.context._background = { type: "solid", color: this.context.styleManager.canvasBackgroundColor() };
        this.context.shapeManager = new ShapeManager(this.context, {
            syncShapes: () => this.syncShapes(),
            notifySelection: () => this.notifySelection(),
            flushAutoSave: () => this.context.autoSaveManager.flushAutoSave(),
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            setTool: (tool) => this.setTool(tool),
        });
        this.context.libraryManager = new LibraryManager(this.context, {
            getSelectedShapes: () => this.getSelectedShapes(),
            getMultipleBounds: (shapes) => this.context.shapeManager.getMultipleBounds(shapes),
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            syncShapes: () => this.syncShapes(),
        });
        this.context.historyManager = new HistoryManager(this.context, {
            removeTextOverlay: () => this.context.textManager.removeTextOverlay(),
            notifySelection: () => this.notifySelection(),
            syncShapes: () => this.syncShapes(),
        });
        this.context.exportManager = new ExportManager(this.context, {
            notifySelection: () => this.notifySelection(),
            syncShapes: () => this.syncShapes(),
            imageCache: this.imageCache,
        });
        this.context.mermaidManager = new MermaidManager(this.context, {
            getMultipleBounds: (shapes) => this.context.shapeManager.getMultipleBounds(shapes),
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            syncShapes: () => this.syncShapes(),
        });
        this.rc = rough.canvas(this.canvas);
        this.context.cursorManager = new CursorManager(this.context, {
            roomId: this.roomId,
            socket: this.socket,
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
        });
        this.context.autoSaveManager = new AutoSaveManager(this.context, {
            roomId: this.roomId,
            socket: this.socket,
            existingShapes: this.context.existingShapes,
            selectedIds: this.context.selectedIds,
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            notifySelection: () => this.notifySelection(),
        });
        this.context.clipboardManager = new ClipboardManager(this.context, {
            roomId: this.roomId,
            imageCache: this.imageCache,
        });
        this.context.keyboardManager = new KeyboardManager(this.context, {
            selectedTool: this.selectedTool,
            setTool: (tool) => this.setTool(tool),
            setHandPanning: (active) => this.setHandPanning(active),
            enterEditAction: () => this.enterEditAction(),
            insertImage: () => this.insertImage(),
            copySelectionAsPng: () => this.copySelectionAsPng(),
            cancelPolyline: () => this.cancelPolyline(),
            cancelImageCrop: () => this.cancelImageCrop(),
            searchCallback: this.searchCallback,
            shortcutsCallback: this.shortcutsCallback,
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            syncShapes: () => this.syncShapes(),
            notifySelection: () => this.notifySelection(),
            setSpacePressed: (v) => { this.spacePressed = v; },
        });
        this.context.webSocketSyncManager = new WebSocketSyncManager(this.context, {
            roomId: this.roomId,
            socket: this.socket,
            existingShapes: this.context.existingShapes,
            lastSyncedShapes: this.context.lastSyncedShapes,
            selectedIds: this.context.selectedIds,
            undoManager: this.context.undoManager,
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            notifySelection: () => this.notifySelection(),
            cursorManager: this.context.cursorManager,
        });
        this.context.renderManager = new RenderManager(this.context, {
            canvas: this.canvas,
            ctx: this.ctx,
            imageCache: this.imageCache,
            getSelectedShape: () => this.getSelectedShape(),
            drawRemoteCursors: (ctx) => this.context.cursorManager.drawRemoteCursors(ctx),
        });
        this.context.pluginManager = new PluginManager(this.context);
        this.context.pluginManager.initialize(this, this.canvas);
        this.context.laserManager = new LaserManager(this.context, {
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
        });
        this.context.arrowManager = new ArrowManager(this.context, {
            syncShapes: () => this.syncShapes(),
        });
        this.context.imageManager = new ImageManager(this.context, {
            imageCache: this.imageCache,
            clearCanvas: () => this.clearCanvas(),
            invalidateCache: () => this.invalidateCache(),
            syncShapes: () => this.syncShapes(),
            commitShape: (shape, autoSwitchToSelect) => this.context.shapeManager.commitShape(shape, autoSwitchToSelect),
        });
        this.context.textManager = new TextManager(this.context, {
            syncShapes: () => this.syncShapes(),
            commitShape: (shape, autoSwitchToSelect) => this.context.shapeManager.commitShape(shape, autoSwitchToSelect),
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            setClicked: (v) => (this.clicked = v),
        });
        this.init().then(() => {
            if (this.destroyed) return;
            this.initMouseHandlers();
            this.context.keyboardManager.init();
            this.context.webSocketSyncManager.init();
            this.initWheelHandler();
            this.initTouchHandlers();
            this.initPasteHandler();
            this.context.clipboardManager.initClipboardChannel();
            this.context.cursorManager.startCursorCleanup();
        });
    }

    /** Tear down all event listeners and cancel pending auto-saves */
    destroy() {
        this.destroyed = true;
        this.context.textManager.removeTextOverlay();
        this.context.autoSaveManager.disableAutoSave();
        this.context.webSocketSyncManager.destroy();
        this.canvas.removeEventListener("mousedown", this.mouseDownHandler);
        this.canvas.removeEventListener("mouseup", this.mouseUpHandler);
        this.canvas.removeEventListener("mousemove", this.mouseMoveHandler);
        this.canvas.removeEventListener("dblclick", this.dblClickHandler);
        this.canvas.removeEventListener("contextmenu", this.contextMenuHandler);
        this.canvas.removeEventListener("wheel", this.wheelHandler);
        this.canvas.removeEventListener("paste", this.pasteHandler);
        this.canvas.removeEventListener("mouseleave", this.laserMouseLeave);
        this.canvas.removeEventListener("mouseenter", this.laserMouseEnter);
        this.canvas.removeEventListener("touchstart", this.touchStartHandler);
        this.canvas.removeEventListener("touchmove", this.touchMoveHandler);
        this.canvas.removeEventListener("touchend", this.touchEndHandler);
        this.canvas.removeEventListener("touchcancel", this.touchEndHandler);
        this.context.keyboardManager.destroy();
        this.context.cursorManager.destroy();
        this.context.clipboardManager.destroy();
    }

    /**
     * Register a callback fired when the selection changes.
     * @param cb - Called with the single selected shape, or null if nothing is selected
     */
    setSelectionChangeCallback(cb: (shape: Shape | null) => void) {
        this.selectionChangeCallback = cb;
    }

    /**
     * Register a callback fired when the current drawing style changes
     * internally (e.g. via the eyedropper tool).
     * @param cb - Called with no arguments; use getStyle() to read the new style
     */
    setStyleChangeCallback(cb: (() => void) | null) {
        this.styleChangeCallback = cb;
    }

    /**
     * Register a callback fired when the theme changes.
     * @param cb - Called with `true` for dark mode, `false` for light
     */
    setThemeChangeCallback(cb: (isDark: boolean) => void) {
        this.context.styleManager.setThemeChangeCallback(cb);
    }

    /**
     * Register a callback fired when the active tool changes.
     * @param cb - Called with the new tool id
     */
    setToolChangeCallback(cb: (tool: string) => void) {
        this.toolChangeCallback = cb;
    }

    /**
     * Register a callback fired when the trash contents change.
     * @param cb - Called after any trash mutation, or `null` to clear
     */
    setTrashChangeCallback(cb: (() => void) | null) {
        this.context.historyManager.setTrashChangeCallback(cb);
    }

    /**
      * Register a callback fired when the keyboard shortcuts panel
      * should be toggled.
      * @param cb - Called to toggle the shortcuts panel visibility
      */
    setShortcutsCallback(cb: () => void) {
        this.shortcutsCallback = cb;
    }

    /**
     * Register a callback fired when Cmd+F search should open.
     * @param cb - Called to toggle the search panel visibility
     */
    setSearchCallback(cb: () => void) {
        this.searchCallback = cb;
    }

    /**
     * Register a callback for when the user right-clicks the canvas.
     * @param cb - Called with the client X/Y coordinates
     */
    setContextMenuCallback(cb: (x: number, y: number) => void) {
        this.contextMenuCallback = cb;
    }

    /** Toggle snap-to-grid mode */
    toggleSnapToGrid() {
        this.context.snapToGrid = !this.context.snapToGrid;
    }

    /**
     * Toggle object snapping (alignment with other shapes while dragging).
     * Off by default: on. Toggled with Alt+S.
     */
    toggleSnapToObjects() {
        this.context.snapToObjects = !this.context.snapToObjects;
    }

    /** Whether object snapping is enabled */
    get isSnapToObjects() {
        return this.context.snapToObjects;
    }

    /**
     * Toggle "keep tool active after drawing".
     *
     * When off, committing a shape switches back to the Select tool.
     * Default is on (tools stay active). Toggled with Q.
     */
    toggleStayAfterDraw() {
        this.context.stayAfterDraw = !this.context.stayAfterDraw;
    }

    /** Whether shape tools stay active after drawing */
    get stayActiveAfterDraw() {
        return this.context.stayAfterDraw;
    }

    /**
     * Toggle zen mode — hides all UI chrome around the canvas.
     * Toggled with Alt+Z.
     */
    toggleZenMode() {
        this.context.zenMode = !this.context.zenMode;
        this.zenModeCallback?.(this.context.zenMode);
        this.clearCanvas();
    }

    /** Whether zen mode (chrome hidden) is active */
    get isZenMode() {
        return this.context.zenMode;
    }

    /** Register a callback fired when zen mode changes */
    setZenModeCallback(cb: (zen: boolean) => void) {
        this.zenModeCallback = cb;
    }

    /**
     * Toggle view mode — hides all UI chrome and blocks editing,
     * leaving only pan/zoom/navigation. Toggled with Alt+R.
     */
    toggleViewMode() {
        this.context.viewMode = !this.context.viewMode;
        if (this.context.viewMode) {
            this.context.selectedIds.clear();
            this.notifySelection();
        }
        this.viewModeCallback?.(this.context.viewMode);
        this.clearCanvas();
    }

    /** Whether view mode (read-only) is active */
    get isViewMode() {
        return this.context.viewMode;
    }

    /** Register a callback fired when view mode changes */
    setViewModeCallback(cb: (view: boolean) => void) {
        this.viewModeCallback = cb;
    }

    /**
     * Get current snap-to-grid state.
     * @returns `true` if snap-to-grid is enabled
     */
    get isSnapToGrid() {
        return this.context.snapToGrid;
    }

    /**
     * Snap a value to the nearest grid point.
     *
     * When snap-to-grid is disabled, returns the value unchanged.
     * Otherwise, rounds to the nearest multiple of {@link gridSize}.
     *
     * @param value - The coordinate value to snap
     * @returns The snapped value
     */
    private snap(value: number): number {
        if (!this.context.snapToGrid) return value;
        return Math.round(value / this.context.gridSize) * this.context.gridSize;
    }

    /**
     * Union bounds of the currently selected (unlocked) shapes.
     *
     * @param shapes - Shape snapshot to measure (e.g. `dragStartShapes`)
     * @returns The combined bounds, or `null` if nothing movable is selected
     */
    private selectionBounds(shapes: Shape[] | null): Bounds | null {
        if (!shapes) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const s of shapes) {
            if (s.locked) continue;
            if (s.id && !this.context.selectedIds.has(s.id)) continue;
            const b = getShapeBounds(s);
            if (!b) continue;
            if (b.x < minX) minX = b.x;
            if (b.y < minY) minY = b.y;
            if (b.x + b.w > maxX) maxX = b.x + b.w;
            if (b.y + b.h > maxY) maxY = b.y + b.h;
        }
        if (minX === Infinity) return null;
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    /**
     * Snap a drag delta so the selection aligns with nearby shapes.
     *
     * Any of the selection's left/center/right (and top/middle/bottom)
     * edges may lock onto any matching edge of another shape when within
     * the snap tolerance. When snap-to-grid is enabled the grid wins.
     *
     * @param dx - Raw drag delta X (canvas units)
     * @param dy - Raw drag delta Y (canvas units)
     * @returns The snapped delta (may equal the raw delta)
     */
    private snapDragDelta(dx: number, dy: number): { x: number; y: number } {
        const sb = this.dragStartBounds;
        if (!sb) return { x: dx, y: dy };

        // Grid snap takes priority when enabled.
        if (this.context.snapToGrid) {
            return {
                x: Math.round((sb.x + dx) / this.context.gridSize) * this.context.gridSize - sb.x,
                y: Math.round((sb.y + dy) / this.context.gridSize) * this.context.gridSize - sb.y,
            };
        }

        // Object snapping can be toggled off (Alt+S).
        if (!this.context.snapToObjects) return { x: dx, y: dy };

        const tolerance = 5;
        const cb = { x: sb.x + dx, y: sb.y + dy, w: sb.w, h: sb.h };
        const ourX = [cb.x, cb.x + cb.w / 2, cb.x + cb.w];
        const ourY = [cb.y, cb.y + cb.h / 2, cb.y + cb.h];
        let snappedX = dx;
        let snappedY = dy;
        let bestXDist = tolerance;
        let bestYDist = tolerance;

        for (const other of this.context.existingShapes) {
            if (other.id && this.context.selectedIds.has(other.id)) continue;
            const ob = getShapeBounds(other);
            if (!ob) continue;
            const theirX = [ob.x, ob.x + ob.w / 2, ob.x + ob.w];
            const theirY = [ob.y, ob.y + ob.h / 2, ob.y + ob.h];
            for (const oe of ourX) {
                for (const te of theirX) {
                    const diff = te - oe;
                    if (Math.abs(diff) < bestXDist) {
                        bestXDist = Math.abs(diff);
                        snappedX = dx + diff;
                    }
                }
            }
            for (const oe of ourY) {
                for (const te of theirY) {
                    const diff = te - oe;
                    if (Math.abs(diff) < bestYDist) {
                        bestYDist = Math.abs(diff);
                        snappedY = dy + diff;
                    }
                }
            }
        }
        return { x: snappedX, y: snappedY };
    }

    /**
     * Find a shape by its unique ID.
     * @param id - The shape's unique identifier
     * @returns The matching shape, or undefined
     */
    private shapeById(id: string): Shape | undefined {
        return this.context.existingShapes.find((s) => s.id === id) ?? this.context.trash.find((s) => s.id === id);
    }

    /**
     * Test if a point hits a resize handle on the selected shape.
     *
     * Checks 8 directional handles (corners + midpoints) and the
     * rotation handle above the shape. Handle hit tolerance scales
     * inversely with zoom so handles remain usable at any zoom level.
     *
     * @param point - Test point in canvas coordinates
     * @returns Handle index (0–7), `-2` for rotation handle, or `-1` if no hit
     */
    private hitTestResizeHandle(point: Point): number {
        if (this.context.selectedIds.size !== 1) return -1;
        const id = [...this.context.selectedIds][0];
        const shape = this.shapeById(id);
        if (!shape) return -1;
        const bounds = getShapeBounds(shape);
        if (!bounds) return -1;
        const handleSize = 8 / this.context.viewport.zoom;

        // Check rotation handle first (return special value)
        const rotationHandleY = bounds.y - 30 / this.context.viewport.zoom;
        const rotationHandleX = bounds.x + bounds.w / 2;
        if (Math.abs(point[0] - rotationHandleX) < handleSize && Math.abs(point[1] - rotationHandleY) < handleSize) {
            return -2; // Special value for rotation handle
        }

        const handles = [
            { x: bounds.x, y: bounds.y },
            { x: bounds.x + bounds.w / 2, y: bounds.y },
            { x: bounds.x + bounds.w, y: bounds.y },
            { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 },
            { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
            { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h },
            { x: bounds.x, y: bounds.y + bounds.h },
            { x: bounds.x, y: bounds.y + bounds.h / 2 },
        ];
        for (let i = 0; i < handles.length; i++) {
            const h = handles[i];
            if (Math.abs(point[0] - h.x) < handleSize && Math.abs(point[1] - h.y) < handleSize) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Get all currently selected shapes.
     * @returns Array of shapes whose IDs are in the selection set
     */
    private selectedShapes(): Shape[] {
        return this.context.existingShapes.filter((s) => s.id && this.context.selectedIds.has(s.id));
    }

    /**
     * Get the first selected shape, or null if nothing is selected.
     * Used by the PropertiesPanel to display/edit the shape's style.
     */
    getSelectedShape(): Shape | null {
        if (this.context.selectedIds.size === 0) return null;
        const first = [...this.context.selectedIds][0];
        return this.shapeById(first) ?? null;
    }

    /** Get all currently selected shapes (multi-select support) */
    getSelectedShapes(): Shape[] {
        return this.selectedShapes();
    }

    /**
     * Apply style updates to all selected shapes and push to undo stack.
     * @param updates - Partial style properties to merge into each shape's style
     */
    updateShapeStyle(updates: Partial<ShapeStyle>) {
        this.context.shapeManager.updateShapeStyle(updates);
    }

    /**
     * Set the active drawing tool.
     * Clears selection when switching away from the select tool.
     * @param tool - The tool to activate
     */
    setTool(tool: string) {
        if (this.selectedTool === tool) return;
        if (this.context._handMode && tool !== "hand") {
            this._previousTool = tool;
            this.context._handMode = false;
            this.spacePressed = false;
        }
        this.selectedTool = tool;
        this.toolChangeCallback?.(tool);
        this.context.textManager.removeTextOverlay();
        if (tool !== "laser") {
            this.clearLaser();
        }
        if (tool !== "select" && tool !== "hand") {
            this.context.selectedIds.clear();
            this.notifySelection();
            this.clearCanvas();
        }
    }

    /** Whether hand (pan) mode is currently active */
    get handMode(): boolean {
        return this.context._handMode;
    }

    /** Whether the canvas is locked (no selection/drag allowed) */
    get isLocked(): boolean {
        return this.context._locked;
    }

    /**
     * Toggle the canvas lock state.
     *
     * When locked, selection, dragging, and text editing are suppressed
     * so the active drawing tool keeps working without accidentally
     * switching to Select. The shortcut `Ctrl+L` also calls this when
     * nothing is selected.
     */
    toggleLock() {
        this.context._locked = !this.context._locked;
        if (this.context._locked) {
            this.isDragging = false;
            this.isSelecting = false;
            this.isResizing = false;
            this.isRotating = false;
            this.context.selectedIds.clear();
            this.notifySelection();
            this.clearCanvas();
        }
    }

    /**
      * Enable or disable hand (pan) mode.
      *
      * When active, mouse drags pan the canvas by reusing the same
      * space-bar pan path, so no drawing logic changes.
      */
    setHandPanning(active: boolean) {
        if (this.context._handMode === active) return;
        this.context._handMode = active;
        this.spacePressed = active;
        if (active) {
            this._previousTool = this.selectedTool === "hand" ? this._previousTool : this.selectedTool;
            this.selectedTool = "hand";
        } else {
            this.selectedTool = this._previousTool || "select";
        }
        this.toolChangeCallback?.(this.selectedTool);
    }

    loadPlugin(plugin: Plugin): boolean {
        return this.context.pluginManager.loadPlugin(plugin);
    }

    unloadPlugin(pluginId: string): boolean {
        return this.context.pluginManager.unloadPlugin(pluginId);
    }

    getLoadedPlugins(): Plugin[] {
        return this.context.pluginManager.getLoadedPlugins();
    }

    isToolRegistered(toolId: string): boolean {
        return this.context.pluginManager.isToolRegistered(toolId);
    }

    getPluginTools(): CustomToolDefinition[] {
        return this.context.pluginManager.getPluginTools();
    }

    /**
     * Switch between dark and light theme.
     * Updates the default stroke color and canvas background (only when
     * the user has not customized the background) and re-renders.
     * Never modifies existing shapes or collaboration state.
     * @param isDark - `true` for dark mode, `false` for light
     */
    setTheme(isDark: boolean) {
        this.context.styleManager.setTheme(isDark);
    }

    /**
     * Update the current drawing style (applied to newly created shapes).
     * @param style - The new default style
     */
    setCurrentStyle(style: ShapeStyle) {
        this.context.styleManager.setCurrentStyle(style);
    }

    getStyle(): ShapeStyle {
        return this.context.styleManager.getStyle();
    }

    /**
     * Cycle through the available background styles:
     * solid → dots → crosses → plain → solid
     */
    cycleBackground() {
        this.context.styleManager.cycleBackground();
    }

    /**
     * Set the canvas background style.
     * Marks the background as user-customized so theme changes stop
     * tracking it (the user's chosen background wins over the theme).
     * @param background - The new background configuration
     */
    setBackground(background: CanvasBackground) {
        this.context.styleManager.setBackground(background);
    }

    /** Zoom in by a factor of 1.2x centered on the viewport */
    zoomIn() {
        this.context.viewport.zoomIn(this.context.cssWidth, this.context.cssHeight);
        this.invalidateCache();
        this.clearCanvas();
    }

    /** Zoom out by a factor of 1.2x centered on the viewport */
    zoomOut() {
        this.context.viewport.zoomOut(this.context.cssWidth, this.context.cssHeight);
        this.invalidateCache();
        this.clearCanvas();
    }

    /** Zoom and pan to fit all shapes within the viewport */
    zoomToFit() {
        const bounds = this.getAllShapesBounds();
        this.context.viewport.zoomToFit(bounds, this.context.cssWidth, this.context.cssHeight);
        this.invalidateCache();
        this.clearCanvas();
    }

    /** Reset zoom to 100% and center the viewport */
    resetZoom() {
        this.context.viewport.zoom = 1;
        this.context.viewport.panX = 0;
        this.context.viewport.panY = 0;
        this.invalidateCache();
        this.clearCanvas();
    }

    /** Select all shapes on the canvas */
    selectAll() {
        this.context.selectedIds = new Set(this.context.existingShapes.map(s => s.id).filter((id): id is string => id !== undefined));
        this.notifySelection();
        this.invalidateCache();
        this.clearCanvas();
    }

    /**
     * Compute the combined bounding box of all shapes on the canvas.
     *
     * Excludes eraser shapes. Used by {@link zoomToFit} to determine
     * the viewport transform that shows all content.
     *
     * @returns Combined bounding box, or `null` if no shapes exist
     */
    private getAllShapesBounds(): Bounds | null {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let hasShapes = false;

        for (const shape of this.context.existingShapes) {
            if (shape.type === "eraser") continue;
            const b = getShapeBounds(shape);
            if (!b) continue;
            hasShapes = true;
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
        }

        if (!hasShapes) return null;
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    /** Load existing shapes from the server and render the initial canvas */
    async init() {
        try {
            const { shapes, version } = await getExistingShapes(this.roomId);
            this.context.existingShapes = ensureShapesHaveStyle(
                shapes.filter((s) => s.type !== "eraser"),
            );
            this.context.lastSyncedShapes = structuredClone(this.context.existingShapes);
            this.context.lastSavedVersion = version;
            this.invalidateCache();
            this.clearCanvas();
            this.context.imageManager.preloadImages();
        } catch (err) {
            console.error("Failed to load shapes:", err);
            this.context.existingShapes = [];
            this.clearCanvas();
        }
    }

    /**
     * Notify the selection change callback with the current selection.
     *
     * Fires the callback registered via {@link setSelectionChangeCallback}
     * with the first selected shape, or `null` if nothing is selected.
     */
    private notifySelection() {
        this.selectionChangeCallback?.(this.getSelectedShape());
    }

    /**
     * Mark the off-screen cache as stale, forcing a rebuild on next render.
     *
     * Call this whenever shapes change, the viewport transforms, or the
     * background style changes.
     */
    private invalidateCache() {
        this.context.renderManager.invalidateCache();
    }

    /**
     * Clear the canvas, rebuild the cache if needed, and draw selection handles.
     *
     * This is the main render method called after any state change. It:
     * 1. Clears the visible canvas
     * 2. Draws the background
     * 3. Copies the cached scene (rebuilding if stale)
     * 4. Draws selection handles and alignment guides
     */
    clearCanvas() {
        this.context.renderManager.clearCanvas();
    }

    /**
     * Rebuild the cache and re-render after a canvas resize.
     *
     * Call this when the canvas element's width or height changes
     * (e.g. on window resize).
     */
    /**
     * Resize the canvas backing store and update the logical coordinate space.
     *
     * Accepts CSS-pixel dimensions plus the device pixel ratio so the engine
     * can keep its internal math in CSS pixels while the browser rasterizes
     * at native resolution.
     *
     * @param cssWidth - Logical canvas width in CSS pixels
     * @param cssHeight - Logical canvas height in CSS pixels
     * @param dpr - Device pixel ratio (capped at 2 for performance)
     */
    resize(cssWidth?: number, cssHeight?: number, dpr?: number) {
        if (cssWidth !== undefined) this.context.cssWidth = cssWidth;
        if (cssHeight !== undefined) this.context.cssHeight = cssHeight;
        if (dpr !== undefined) this.context.dpr = dpr;
        this.ctx.setTransform(this.context.dpr, 0, 0, this.context.dpr, 0, 0);
        this.context.renderManager.updateDpr(this.context.dpr);
        this.invalidateCache();
        this.clearCanvas();
    }

    /**
     * Compute a shape diff and broadcast it over WebSocket, then schedule auto-save.
     *
     * Compares the current shapes against {@link lastSyncedShapes} to compute
     * added, modified, and removed sets. If any changes exist, sends a
     * `shape-diff` message over the WebSocket and schedules an auto-save.
     */
    private syncShapes() {
        this.context.webSocketSyncManager.syncShapes();
    }

    /**
     * Assign an ID to a shape, apply default style, add to the canvas, and sync.
     * @param shape - The shape to commit (mutated: `id` and `style` are set)
     */
    finishPolyline() {
        if (this.polylinePoints.length < 2) {
            this.polylinePoints = [];
            this.isDrawingPolyline = false;
            return;
        }
        // Drop duplicate points (a double-click registers the same spot twice).
        const points: Array<[number, number]> = [];
        for (const p of this.polylinePoints) {
            const last = points[points.length - 1];
            if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 3) {
                points.push(p);
            }
        }
        if (points.length < 2) {
            this.polylinePoints = [];
            this.isDrawingPolyline = false;
            return;
        }
        const first = points[0];
        const last = points[points.length - 1];
        this.context.shapeManager.commitShape({
            type: "line",
            startX: first[0],
            startY: first[1],
            endX: last[0],
            endY: last[1],
            points,
        }, true);
        this.polylinePoints = [];
        this.isDrawingPolyline = false;
    }

    commitShape(shape: Shape, autoSwitchToSelect = false) {
        this.context.shapeManager.commitShape(shape, autoSwitchToSelect);
    }

    /**
     * Undo the last shape change and re-render.
     *
     * Restores the shape array to its previous state via the undo manager,
     * clears the selection, and syncs the changes.
     */
    undo() {
        this.context.historyManager.undo();
    }

    /**
     * Redo the last undone shape change and re-render.
     *
     * Re-applies the most recently undone change via the undo manager,
     * clears the selection, and syncs the changes.
     */
    redo() {
        this.context.historyManager.redo();
    }

    /** Whether an undo step is available (for UI disabled states) */
    get canUndo(): boolean {
        return this.context.historyManager.canUndo;
    }

    /** Whether a redo step is available (for UI disabled states) */
    get canRedo(): boolean {
        return this.context.historyManager.canRedo;
    }

    /**
     * Delete all selected shapes from the canvas.
     *
     * Skips locked shapes — they cannot be deleted. Moves deleted shapes
     * to the trash so they can be restored later. Pushes the change
     * to the undo stack and syncs via WebSocket.
     */
    deleteSelectedShape() {
        this.context.shapeManager.deleteSelectedShape();
    }

    /**
     * Get all shapes currently in the trash.
     * @returns Array of deleted shapes available for restore
     */
    getTrash(): Shape[] {
        return this.context.historyManager.getTrash();
    }

    /**
     * Restore a shape from the trash back to the canvas.
     * @param id - The shape ID to restore
     */
    restoreFromTrash(id: string) {
        this.context.historyManager.restoreFromTrash(id);
    }

    /**
     * Permanently remove all shapes from the trash.
     * This action cannot be undone.
     */
    emptyTrash() {
        this.context.historyManager.emptyTrash();
    }

    /**
     * Copy all selected shapes to the internal clipboard.
     *
     * Deep-clones each selected shape so subsequent edits to the originals
     * do not affect the clipboard contents.
     */
    /**
     * Duplicate selected shapes with a 20px offset.
     *
     * Unlike paste, this immediately commits the copies and selects them,
     * so the user can continue editing without a separate paste step.
     */
    duplicateSelected() {
        this.context.shapeManager.duplicateSelected();
    }

    /**
     * Set the arrowhead size for all selected arrow shapes.
     * @param size - Arrowhead size in pixels
     */
    setArrowHeadSize(size: number) {
        this.context.arrowManager.setArrowHeadSize(size);
    }

    /**
     * Assign a web URL to all selected shapes.
     * @param url - The web URL to attach, or empty string to clear
     */
    setShapeUrl(url: string) {
        this.context.shapeManager.setShapeUrl(url);
    }

    /**
     * Rename the selected frame shape.
     *
     * @param name - New name for the frame
     */
    setFrameName(name: string) {
        this.context.shapeManager.setFrameName(name);
    }

    /**
     * Enter image crop mode for the currently selected image.
     * Initializes the crop rectangle to the full image bounds.
     */
    startImageCrop() {
        this.context.imageManager.startImageCrop();
    }

    /**
     * Exit image crop mode without applying changes.
     */
    cancelImageCrop() {
        this.context.imageManager.cancelImageCrop();
    }

    /** Cancel the in-progress polyline and clear the preview. */
    cancelPolyline() {
        this.polylinePoints = [];
        this.isDrawingPolyline = false;
        this.clearCanvas();
    }

    /**
     * Apply the current crop rectangle to the selected image.
     * Re-encodes the cropped region as a new data URL and updates the shape.
     */
    applyImageCrop() {
        this.context.imageManager.applyImageCrop();
    }

    /**
     * Check whether the game is currently in image crop mode.
     */
    isInCropMode(): boolean {
        return this.context.imageManager.isInCropMode();
    }

    /**
     * Get the current crop rectangle (canvas coordinates) for rendering.
     */
    getCropRect(): { x: number; y: number; w: number; h: number } | null {
        return this.context.imageManager.getCropRect();
    }

    /**
     * Set local user info for collaboration cursors.
     */
    setLocalUser(id: string, name: string, color: string) {
        this.context.cursorManager.setLocalUser(id, name, color);
    }

    /**
     * Set the laser pointer position.
     */
    setLaserPosition(x: number, y: number) {
        this.context.laserManager.setLaserPosition(x, y);
    }

    /**
     * Hide the laser pointer.
     */
    clearLaser() {
        this.context.laserManager.clearLaser();
    }

    /**
     * Set the laser pointer color.
     */
    setLaserColor(color: string) {
        this.context.laserManager.setLaserColor(color);
    }

    /**
     * Set the laser pointer size.
     */
    setLaserSize(size: number) {
        this.context.laserManager.setLaserSize(size);
    }

    /**
     * Assign a shared group ID to all selected shapes (minimum 2).
     *
     * Grouped shapes are selected and moved together. The group ID is
     * a random UUID generated at group time.
     */
    group() {
        this.context.shapeManager.group();
    }

    /**
     * Remove the group ID from all selected shapes.
     *
     * After ungrouping, each shape can be selected and moved independently.
     */
    ungroup() {
        this.context.shapeManager.ungroup();
    }

    /**
     * Bring selected shapes forward by one step in the z-order.
     *
     * Swaps each selected shape with the shape immediately above it
     * (higher index) in the shapes array. Shapes already at the top
     * remain unchanged.
     */
    bringForward() {
        this.context.shapeManager.bringForward();
    }

    /**
     * Send selected shapes backward by one step in the z-order.
     *
     * Swaps each selected shape with the shape immediately below it
     * (lower index) in the shapes array. Shapes already at the bottom
     * remain unchanged.
     */
    sendBackward() {
        this.context.shapeManager.sendBackward();
    }

    /**
     * Bring selected shapes to the front (top of z-order).
     *
     * Moves all selected shapes to the end of the shapes array,
     * so they are rendered last (on top of everything else).
     */
    bringToFront() {
        this.context.shapeManager.bringToFront();
    }

    /**
     * Send selected shapes to the back (bottom of z-order).
     *
     * Moves all selected shapes to the beginning of the shapes array,
     * so they are rendered first (behind everything else).
     */
    sendToBack() {
        this.context.shapeManager.sendToBack();
    }

    /**
     * Align selected shapes to the left edge of the leftmost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved horizontally
     * so its left edge matches the minimum left edge across all selections.
     */
    alignLeft() {
        this.context.shapeManager.alignLeft();
    }

    /**
     * Align selected shapes to the right edge of the rightmost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved horizontally
     * so its right edge matches the maximum right edge across all selections.
     */
    alignRight() {
        this.context.shapeManager.alignRight();
    }

    /**
     * Align selected shapes to the horizontal center of the selection.
     *
     * Requires at least 2 selected shapes. Each shape is moved horizontally
     * so its center aligns with the average center X of all selections.
     */
    alignCenter() {
        this.context.shapeManager.alignCenter();
    }

    /**
     * Evenly space selected shapes horizontally.
     *
     * Requires at least 3 selected shapes. Sorts by X position, then
     * redistributes the shapes so the gaps between them are equal.
     * The leftmost and rightmost shapes stay in place.
     */
    distributeHorizontal() {
        this.context.shapeManager.distributeHorizontal();
    }

    /**
     * Evenly space selected shapes vertically.
     *
     * Requires at least 3 selected shapes. Sorts by Y position, then
     * redistributes the shapes so the gaps between them are equal.
     * The topmost and bottommost shapes stay in place.
     */
    distributeVertical() {
        this.context.shapeManager.distributeVertical();
    }

    /**
     * Align selected shapes to the top edge of the topmost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved vertically
     * so its top edge matches the minimum top edge across all selections.
     */
    alignTop() {
        this.context.shapeManager.alignTop();
    }

    /**
     * Align selected shapes to the bottom edge of the bottommost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved vertically
     * so its bottom edge matches the maximum bottom edge across all selections.
     */
    alignBottom() {
        this.context.shapeManager.alignBottom();
    }

    /**
     * Zoom and pan the viewport to fit the current selection.
     *
     * Computes the union bounds of all selected shapes and fits them
     * with the same padding as {@link zoomToFit}. No-op when nothing
     * is selected.
     */
    zoomToSelection() {
        if (this.context.selectedIds.size === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const b = getShapeBounds(shape);
            if (!b) continue;
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
        }
        if (minX === Infinity) return;
        this.context.viewport.zoomToFit(
            { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
            this.context.cssWidth,
            this.context.cssHeight,
        );
        this.invalidateCache();
        this.clearCanvas();
    }

    /**
     * Copy all selected shapes to the internal clipboard.
     *
     * Deep-clones each selected shape so subsequent edits to the originals
     * do not affect the clipboard contents.
     */
    copySelectedShape() {
        this.context.clipboardManager.copySelectedShape();
    }

    /**
     * Paste clipboard contents with a 20px offset from originals.
     *
     * Deep-clones each clipboard shape, offsets it by 20px in both
     * directions, removes any group association, and commits it.
     */
    pasteClipboard() {
        this.context.clipboardManager.pasteClipboard();
    }

    /**
     * Cut selected shapes — copy to the clipboard, then delete them.
     * Bound to Ctrl/Cmd+X.
     */
    cutSelectedShape() {
        this.context.clipboardManager.copySelectedShape();
        this.deleteSelectedShape();
    }

    /**
     * Copy the style of the first selected shape for pasting onto others.
     * Bound to Ctrl/Cmd+Alt+C.
     */
    copySelectedStyles() {
        this.context.shapeManager.copySelectedStyles();
    }

    /**
     * Apply the previously copied style to all selected shapes.
     * Bound to Ctrl/Cmd+Alt+V.
     */
    pasteSelectedStyles() {
        this.context.shapeManager.pasteSelectedStyles();
    }

    /**
     * Flip all selected shapes horizontally or vertically in place.
     *
     * Shapes are mirrored around the center of their own bounding box
     * (point-based shapes mirror their points, box-based shapes mirror
     * their origin). Bound to Shift+H / Shift+V.
     *
     * @param horizontal - `true` to flip left-right, `false` top-bottom
     */
    flipSelectedShapes(horizontal: boolean) {
        this.context.shapeManager.flipSelectedShapes(horizontal);
    }

    /**
     * Cycle the active shape tool type (Tab / Shift+Tab).
     *
     * Cycles rectangle → diamond → ellipse; arrow and line toggle
     * between each other. Any other tool switches to rectangle.
     *
     * @param forward - `true` for Tab, `false` for Shift+Tab
     */
    toggleShapeType(forward: boolean) {
        if (this.selectedTool === "arrow") {
            this.setTool("line");
            return;
        }
        if (this.selectedTool === "line") {
            this.setTool("arrow");
            return;
        }
        const cycle = ["rect", "diamond", "circle"];
        const idx = cycle.indexOf(this.selectedTool as string);
        if (idx === -1) {
            this.setTool("rect");
            return;
        }
        this.setTool(cycle[(idx + (forward ? 1 : cycle.length - 1)) % cycle.length]);
    }

    /**
     * Open the file picker and insert an image centered on the viewport.
     * Bound to the `9` shortcut (Excalidraw parity).
     */
    insertImage() {
        this.context.imageManager.insertImage();
    }

    /**
     * Enter-key action: create text at the viewport center with the text
     * tool, or edit the selected text shape / arrow label in select mode.
     */
    enterEditAction() {
        if (this.selectedTool === "text" && !this.context.textManager.hasTextEditOverlay) {
            const [cx, cy] = this.context.viewport.getCanvasCoords(
                this.context.cssWidth / 2,
                this.context.cssHeight / 2,
            );
            this.startTextEdit(cx, cy, undefined, undefined, {
                bold: this.textBold,
                italic: this.textItalic,
                fontFamily: this.textFontFamily,
                fontSize: this.textFontSize,
                textAlign: this.textAlign,
            });
            return;
        }
        if (this.context.selectedIds.size === 0) return;
        const shape = this.getSelectedShape();
        if (!shape) return;
        if (shape.type === "text") {
            this.startTextEdit(shape.x, shape.y, shape.text, this.context.existingShapes.indexOf(shape), {
                bold: shape.bold,
                italic: shape.italic,
                fontFamily: shape.fontFamily,
                fontSize: shape.fontSize,
                textAlign: shape.textAlign || "left",
            });
        } else if (shape.type === "arrow") {
            const label = prompt("Enter arrow label:", shape.label ?? "");
            if (label !== null) {
                const prev = structuredClone(this.context.existingShapes);
                shape.label = label || undefined;
                this.context.undoManager.push(prev, this.context.existingShapes);
                this.invalidateCache();
                this.clearCanvas();
                this.syncShapes();
            }
        }
    }

    /**
     * Toggle between dark and light theme (Alt+Shift+D).
     *
     * Mirrors the TopBar toggle: flips the document class, persists the
     * preference, and re-syncs the engine's style defaults.
     */
    toggleTheme() {
        this.context.styleManager.toggleTheme();
    }

    /**
     * Copy the current selection as a PNG image to the clipboard.
     * Bound to Shift+Alt+C.
     */
    async copySelectionAsPng() {
        const shapes = this.context.existingShapes.filter((s) => s.id && this.context.selectedIds.has(s.id));
        if (shapes.length === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const s of shapes) {
            const b = getShapeBounds(s);
            if (!b) continue;
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
        }
        if (minX === Infinity) return;
        const pad = 20;
        const x = minX - pad, y = minY - pad;
        const w = maxX - minX + pad * 2;
        const h = maxY - minY + pad * 2;
        const offscreen = document.createElement("canvas");
        offscreen.width = w;
        offscreen.height = h;
        const ctx = offscreen.getContext("2d")!;
        ctx.fillStyle = this.context.isDark ? "#000" : "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.translate(-x, -y);
        const rc = rough.canvas(offscreen);
        for (const shape of shapes) {
            renderShape(shape, ctx, rc, 1, this.context.isDark, this.imageCache);
        }
        try {
            const blob = await new Promise<Blob | null>((resolve) =>
                offscreen.toBlob(resolve, "image/png"),
            );
            if (!blob || typeof ClipboardItem === "undefined") return;
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        } catch {
            // Clipboard may be unavailable (permissions/context); ignore.
        }
    }

    /**
     * Lock selected shapes so they cannot be moved or edited.
     *
     * Locked shapes are skipped by hit-testing, drag operations,
     * and deletion. They remain visible on the canvas.
     */
    lockShapes() {
        this.context.shapeManager.lockShapes();
    }

    /**
     * Unlock selected shapes so they can be moved and edited again.
     *
     * Removes the `locked` flag from each selected shape, making them
     * eligible for hit-testing, dragging, and deletion.
     */
    unlockShapes() {
        this.context.shapeManager.unlockShapes();
    }

    /**
     * Export the canvas as a PNG image download.
     *
     * Renders all shapes to an offscreen canvas at 1:1 scale and
     * triggers a browser download of the resulting PNG file.
     */
    exportToPng() {
        this.context.exportManager.exportToPng();
    }

    /**
     * Export the canvas as an SVG image download.
     *
     * Builds an SVG DOM from all shapes, serializes it, and triggers
     * a browser download of the resulting SVG file.
     */
    exportToSvg() {
        this.context.exportManager.exportToSvg();
    }

    /**
     * Export the canvas shapes as a JSON file download.
     *
     * Serializes the shape array as pretty-printed JSON and triggers
     * a browser download. The JSON can be re-imported via {@link importFromJson}.
     */
    exportToJson() {
        this.context.exportManager.exportToJson();
    }

    /**
     * Import shapes from a JSON string (file or clipboard).
     * Replaces all existing shapes with the imported ones.
     * @param jsonString - JSON string containing shapes
     */
    importFromJson(jsonString: string) {
        this.context.exportManager.importFromJson(jsonString);
    }

    // ─── Input handlers ────────────────────────────────────────────

    /**
     * Create an inline textarea for editing text shapes.
     * @param canvasX - X position in canvas coordinates
     * @param canvasY - Y position in canvas coordinates
     * @param existingText - Pre-filled text for editing, or undefined for new text
     * @param existingIndex - Index in the shapes array if editing, or undefined for new text
     * @param textStyle - Formatting options for new text shapes
     */
    private startTextEdit(
        canvasX: number,
        canvasY: number,
        existingText?: string,
        existingIndex?: number,
        textStyle?: TextStyleOptions,
    ) {
        this.context.textManager.startTextEdit(canvasX, canvasY, existingText, existingIndex, textStyle);
    }

    /**
     * Handle mouse down — start panning, drawing, or selecting.
     *
     * When the space bar is held or the middle mouse button is pressed,
     * initiates canvas panning. Otherwise delegates to
     * {@link handlePointerDown} for tool-specific behavior.
     */
    mouseDownHandler = (e: MouseEvent) => {
        this.escapePressed = false;
        if (this.spacePressed || e.button === 1) {
            this.isPanning = true;
            this.panStartX = e.clientX - this.context.viewport.panX;
            this.panStartY = e.clientY - this.context.viewport.panY;
            return;
        }
        this.handlePointerDown(e.clientX, e.clientY, e.shiftKey, e);
    };

    /**
     * Handle pointer down for all tool modes.
     * @param clientX - Client X coordinate
     * @param clientY - Client Y coordinate
     * @param shiftKey - Whether Shift is held (for multi-select)
     */
    private handlePointerDown(clientX: number, clientY: number, shiftKey: boolean, e: MouseEvent) {
        if (this.context.viewMode) return;
        this.isSelecting = false;
        this.isResizing = false;
        this.isRotating = false;
        this.clicked = true;
        this.lastPointerX = clientX;
        this.lastPointerY = clientY;
        const coords = this.context.viewport.getCanvasCoords(clientX, clientY);
        const isShapeTool =
            this.selectedTool === "rect" ||
            this.selectedTool === "circle" ||
            this.selectedTool === "diamond" ||
            this.selectedTool === "ellipsisArc" ||
            this.selectedTool === "arrow" ||
            this.selectedTool === "line" ||
            this.selectedTool === "stickyNote" ||
            this.selectedTool === "frame" ||
            this.selectedTool === "text";
        this.startX = isShapeTool ? this.snap(coords[0]) : coords[0];
        this.startY = isShapeTool ? this.snap(coords[1]) : coords[1];

        if (this.context.cropMode && this.context.cropRect) {
            const handleSize = 8 / this.context.viewport.zoom;
            const corners = [
                { x: this.context.cropRect.x, y: this.context.cropRect.y },
                { x: this.context.cropRect.x + this.context.cropRect.w, y: this.context.cropRect.y },
                { x: this.context.cropRect.x + this.context.cropRect.w, y: this.context.cropRect.y + this.context.cropRect.h },
                { x: this.context.cropRect.x, y: this.context.cropRect.y + this.context.cropRect.h },
            ];
            for (let i = 0; i < corners.length; i++) {
                const dx = coords[0] - corners[i].x;
                const dy = coords[1] - corners[i].y;
                if (dx * dx + dy * dy <= handleSize * handleSize) {
                    this.context.cropDragCorner = i;
                    this.context.cropStartRect = { ...this.context.cropRect };
                    return;
                }
            }
            return;
        }

        const pluginTool = this.context.pluginManager.getTool(this.selectedTool);
        if (pluginTool?.onMouseDown) {
            const ctx = this.context.pluginManager.getContext();
            if (ctx) {
                pluginTool.onMouseDown(ctx, coords[0], coords[1], e);
                return;
            }
        }

        if (this.selectedTool === "select") {
            const lockedIds = new Set(this.context.existingShapes.filter(s => s.locked).map(s => s.id!));
            const hit = hitTest(coords, this.context.existingShapes, this.context.viewport.zoom, lockedIds);

            // Check for resize handle click
            if (this.context.selectedIds.size === 1) {
                const handleIdx = this.hitTestResizeHandle(coords);
                if (handleIdx === -2) {
                    // Rotation handle (sits above the shape, so hitTest on
                    // the shape itself returns null — check it independently)
                    const id = [...this.context.selectedIds][0];
                    const shape = this.shapeById(id);
                    if (shape) {
                        const bounds = getShapeBounds(shape);
                        if (bounds) {
                            const cx = bounds.x + bounds.w / 2;
                            const cy = bounds.y + bounds.h / 2;
                            this.isRotating = true;
                            this.rotateStartAngle = Math.atan2(coords[1] - cy, coords[0] - cx);
                            this.rotateStartRotation = shape.rotation ?? 0;
                            this.dragStartShapes = structuredClone(this.context.existingShapes);
                            return;
                        }
                    }
                } else if (handleIdx !== -1) {
                    const id = [...this.context.selectedIds][0];
                    const shape = this.shapeById(id);
                    if (shape) {
                        this.isResizing = true;
                        this.resizeHandle = handleIdx;
                        this.resizeShiftKey = shiftKey;
                        this.resizeStartBounds = getShapeBounds(shape);
                        this.dragStartShapes = structuredClone(this.context.existingShapes);
                        return;
                    }
                }
            }

            if (hit !== null) {
                const hitShape = this.context.existingShapes[hit];

                if (shiftKey) {
                    if (this.context.selectedIds.has(hitShape.id!)) {
                        this.context.selectedIds.delete(hitShape.id!);
                    } else {
                        this.context.selectedIds.add(hitShape.id!);
                    }
                    this.notifySelection();
                    this.clearCanvas();
                    return;
                }

                // Deep select (Ctrl/Cmd+click) picks the individual shape
                // even when it belongs to a group.
                if (hitShape.groupId && !(e.metaKey || e.ctrlKey)) {
                    this.context.selectedIds = new Set();
                    for (const s of this.context.existingShapes) {
                        if (s.groupId === hitShape.groupId && s.id) {
                            this.context.selectedIds.add(s.id);
                        }
                    }
                } else {
                    this.context.selectedIds = new Set([hitShape.id!]);
                }
                this.notifySelection();
                this.isDragging = true;
                this.dragOffsetX = coords[0];
                this.dragOffsetY = coords[1];
                this.dragStartShapes = structuredClone(this.context.existingShapes);
                this.dragStartPoint = { x: coords[0], y: coords[1] };
                this.lastSnappedDelta = { x: 0, y: 0 };
                this.dragStartBounds = this.selectionBounds(this.dragStartShapes);
            } else {
                this.context.selectedIds.clear();
                this.notifySelection();
                this.isSelecting = true;
                this.dragOffsetX = 0;
                this.dragOffsetY = 0;
            }
            return;
        }

        if (this.selectedTool === "text") {
            const hit = hitTest(coords, this.context.existingShapes, this.context.viewport.zoom);
            if (hit !== null) {
                const shape = this.context.existingShapes[hit];
                if (shape.type === "text") {
                    this.startTextEdit(shape.x, shape.y, shape.text, hit, {
                        bold: shape.bold,
                        italic: shape.italic,
                        fontFamily: shape.fontFamily,
                        fontSize: shape.fontSize,
                        textAlign: shape.textAlign || "left",
                    });
                    return;
                }
            }
            this.startTextEdit(this.startX, this.startY, undefined, undefined, {
                bold: this.textBold,
                italic: this.textItalic,
                fontFamily: this.textFontFamily,
                fontSize: this.textFontSize,
                textAlign: this.textAlign,
            });
            return;
        }

        if (this.selectedTool === "image") {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = () => {
                const file = input.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onerror = () => {
                    console.error("Failed to read image file");
                };
                reader.onload = () => {
                    const dataUrl = reader.result as string;
                    const img = new Image();
                    img.onload = () => {
                        const w = img.naturalWidth;
                        const h = img.naturalHeight;
                        const maxDim = 400;
                        const scale = Math.min(1, maxDim / Math.max(w, h));
                        this.imageCache.set(dataUrl, img);
                        this.context.shapeManager.commitShape({
                            type: "image",
                            x: coords[0],
                            y: coords[1],
                            width: w * scale,
                            height: h * scale,
                            imageData: dataUrl,
                        });
                    };
                    img.onerror = () => {
                        console.error("Failed to load image from data URL");
                    };
                    img.src = dataUrl;
                };
                reader.readAsDataURL(file);
            };
            input.click();
            this.clicked = false;
            return;
        }

        if (this.selectedTool === "eyedropper") {
            const hit = hitTest(coords, this.context.existingShapes, this.context.viewport.zoom);
            if (hit !== null) {
                const shape = this.context.existingShapes[hit];
                if (shape.style?.strokeColor) {
                    this.context.currentStyle = { ...this.context.currentStyle, strokeColor: shape.style.strokeColor };
                    this.context._styleCustomized = true;
                    this.styleChangeCallback?.();
                }
            }
            this.setTool("select");
            this.clicked = false;
            return;
        }

        if (this.selectedTool === "pen") {
            this.constantPenPoints = [[coords[0], coords[1]]];
        }

        if (this.selectedTool === "eraser") {
            this.eraserPoints = [[coords[0], coords[1]]];
        }

        if (this.selectedTool === "line") {
            if (!this.isDrawingPolyline) {
                this.polylinePoints = [[this.startX, this.startY]];
                this.isDrawingPolyline = true;
            } else {
                this.polylinePoints.push([this.startX, this.startY]);
            }
            this.polylineStartCount = this.polylinePoints.length;
            return;
        }
    }

    /**
     * Handle mouse up — finalize drawing, erasing, or selection.
     *
     * Resets panning and dragging state, then delegates to
     * {@link handlePointerUp} for tool-specific finalization.
     */
    mouseUpHandler = (e: MouseEvent) => {
        const wasPanning = this.isPanning;
        this.isPanning = false;
        this.isDragging = false;
        this.clicked = false;
        if (wasPanning) return;
        this.handlePointerUp(e);
    };

    /** Handle pointer up — commit shapes, finalize drag, or complete eraser stroke */
    private handlePointerUp(e: MouseEvent) {
        if (this.escapePressed) {
            this.escapePressed = false;
            this.isSelecting = false;
            this.isResizing = false;
            this.isRotating = false;
            this.isDragging = false;
            this.context.alignmentGuides = [];
            this.clearCanvas();
            return;
        }
        if (this.context.cropMode && this.context.cropDragCorner !== null) {
            this.context.cropDragCorner = null;
            this.context.cropStartRect = null;
            this.clearCanvas();
            return;
        }

        if (this.isResizing) {
            this.isResizing = false;
            this.resizeHandle = -1;
            this.resizeStartBounds = null;
            if (this.dragStartShapes) {
                this.context.undoManager.push(this.dragStartShapes, this.context.existingShapes);
                this.dragStartShapes = null;
            }
            this.syncShapes();
            return;
        }

        if (this.isRotating) {
            this.isRotating = false;
            if (this.dragStartShapes) {
                this.context.undoManager.push(this.dragStartShapes, this.context.existingShapes);
                this.dragStartShapes = null;
            }
            this.syncShapes();
            return;
        }

        if (this.selectedTool === "select") {
            if (this.isSelecting) {
                this.isSelecting = false;
                const endX = this.startX + this.dragOffsetX;
                const endY = this.startY + this.dragOffsetY;
                const selX = Math.min(this.startX, endX);
                const selY = Math.min(this.startY, endY);
                const selW = Math.abs(endX - this.startX);
                const selH = Math.abs(endY - this.startY);
                for (let i = 0; i < this.context.existingShapes.length; i++) {
                    const shape = this.context.existingShapes[i];
                    const bounds = getShapeBounds(shape);
                    if (bounds) {
                        const overlap =
                            bounds.x < selX + selW &&
                            bounds.x + bounds.w > selX &&
                            bounds.y < selY + selH &&
                            bounds.y + bounds.h > selY;
                        if (overlap && shape.id) this.context.selectedIds.add(shape.id);
                    }
                }
                this.notifySelection();
                this.clearCanvas();
            } else if (this.context.selectedIds.size > 0) {
                if (this.dragStartShapes) {
                    this.context.undoManager.push(this.dragStartShapes, this.context.existingShapes);
                    this.dragStartShapes = null;
                }
                this.context.alignmentGuides = [];
                this.syncShapes();
            }
            return;
        }

        if (this.selectedTool === "pen") {
            if (this.constantPenPoints.length < 2) return;
            this.context.shapeManager.commitShape({
                type: "pencil",
                points: [...this.constantPenPoints],
                constantWidth: true,
            });
            this.constantPenPoints = [];
            return;
        }

        if (this.selectedTool === "eraser") {
            if (this.eraserPoints.length === 0) return;

            const prev = [...this.context.existingShapes];
            this.context.existingShapes = this.context.existingShapes.filter(
                (shape) => !eraserIntersectsShape(this.eraserPoints, shape, this.eraserRadius),
            );
            this.context.undoManager.push(prev, this.context.existingShapes);
            this.context.selectedIds.clear();
            this.notifySelection();
            this.eraserPoints = [];
            this.syncShapes();
            return;
        }

        const rawCoords = this.context.viewport.getCanvasCoords(this.lastPointerX, this.lastPointerY);
        const isShapeTool =
            this.selectedTool === "rect" ||
            this.selectedTool === "circle" ||
            this.selectedTool === "diamond" ||
            this.selectedTool === "ellipsisArc" ||
            this.selectedTool === "arrow" ||
            this.selectedTool === "line" ||
            this.selectedTool === "stickyNote" ||
            this.selectedTool === "frame";
        const coords: [number, number] = isShapeTool
            ? [this.snap(rawCoords[0]), this.snap(rawCoords[1])]
            : [rawCoords[0], rawCoords[1]];
        const width = coords[0] - this.startX;
        const height = coords[1] - this.startY;

        let shape: Shape | null = null;
        if (this.selectedTool === "rect") {
            shape = { type: "rect", x: this.startX, y: this.startY, height, width };
        } else if (this.selectedTool === "circle") {
            const radius = Math.max(width, height) / 2;
            shape = { type: "circle", radius, centerX: this.startX + radius, centerY: this.startY + radius };
        } else if (this.selectedTool === "diamond") {
            shape = {
                type: "diamond",
                centerX: this.startX + width / 2,
                centerY: this.startY + height / 2,
                width: Math.abs(width),
                height: Math.abs(height),
            };
        } else if (this.selectedTool === "ellipsisArc") {
            shape = {
                type: "ellipsisArc",
                centerX: this.startX + width / 2,
                centerY: this.startY + height / 2,
                width: Math.abs(width),
                height: Math.abs(height),
                startAngle: 0,
                endAngle: Math.PI,
            };
        } else if (this.selectedTool === "arrow") {
            const startBind = this.context.arrowManager.findNearestBinding([this.startX, this.startY]);
            const endBind = this.context.arrowManager.findNearestBinding([coords[0], coords[1]], startBind?.id);
            shape = {
                type: "arrow",
                startX: startBind?.x ?? this.startX,
                startY: startBind?.y ?? this.startY,
                endX: endBind?.x ?? coords[0],
                endY: endBind?.y ?? coords[1],
                arrowHeadSize: 10,
                startBinding: startBind?.id,
                endBinding: endBind?.id,
            };
        } else if (this.selectedTool === "line") {
            if (this.isDrawingPolyline) {
                // A drag gesture commits its segment on release; plain
                // clicks keep the polyline open for the next point.
                const last = this.polylinePoints[this.polylinePoints.length - 1];
                const moved = Math.hypot(coords[0] - last[0], coords[1] - last[1]) > 3;
                if (moved) {
                    this.polylinePoints.push([coords[0], coords[1]]);
                    if (this.polylineStartCount === 1) {
                        this.finishPolyline();
                    }
                }
            }
        } else if (this.selectedTool === "stickyNote") {
            const noteColors = ["#fff9b1", "#ff8a80", "#82b1ff", "#b9f6ca", "#ea80fc"];
            const noteColor = noteColors[Math.floor(Math.random() * noteColors.length)];
            shape = {
                type: "stickyNote",
                x: this.startX,
                y: this.startY,
                width: Math.abs(width) || 150,
                height: Math.abs(height) || 150,
                noteColor,
                text: "",
            };
        } else if (this.selectedTool === "frame") {
            const frameCount = this.context.existingShapes.filter(s => s.type === "frame").length;
            shape = {
                type: "frame",
                x: this.startX,
                y: this.startY,
                width: Math.abs(width) || 300,
                height: Math.abs(height) || 200,
                name: `Frame ${frameCount + 1}`,
            };
        }

        if (!shape) return;
        this.context.shapeManager.commitShape(shape, true);
    }

    /**
     * Handle mouse move — pan, draw preview, drag shapes, or extend eraser.
     *
     * If panning, updates the viewport pan offset. Otherwise delegates
     * to {@link handlePointerMove} for tool-specific behavior.
     */
    mouseMoveHandler = (e: MouseEvent) => {
        const coords = this.context.viewport.getCanvasCoords(e.clientX, e.clientY);
        this.context.cursorManager.broadcastCursor(coords[0], coords[1]);

        // Show a caret preview for the text tool even between clicks.
        if (this.selectedTool === "text" && !this.context.textManager.hasTextEditOverlay) {
            this.clearCanvas();
            this.ctx.save();
            this.ctx.translate(this.context.viewport.panX, this.context.viewport.panY);
            this.ctx.scale(this.context.viewport.zoom, this.context.viewport.zoom);
            this.ctx.font = `${this.textFontSize}px ${this.textFontFamily}`;
            this.ctx.fillStyle = this.context.currentStyle.strokeColor;
            this.ctx.globalAlpha = 0.5;
            this.ctx.fillText("|", coords[0], coords[1]);
            this.ctx.restore();
            return;
        }

        if (this.selectedTool === "laser") {
            this.setLaserPosition(coords[0], coords[1]);
            return;
        }

        const pluginToolMove = this.context.pluginManager.getTool(this.selectedTool);
        if (pluginToolMove?.onMouseMove && this.clicked) {
            const ctx = this.context.pluginManager.getContext();
            if (ctx) {
                pluginToolMove.onMouseMove(ctx, coords[0], coords[1], e);
                return;
            }
        }

        if (this.isPanning) {
            this.context.viewport.panX = e.clientX - this.panStartX;
            this.context.viewport.panY = e.clientY - this.panStartY;
            this.invalidateCache();
            this.clearCanvas();
            return;
        }
        this.handlePointerMove(e.clientX, e.clientY, e);
    };

    /**
     * Handle pointer move for all tool modes.
     * @param clientX - Client X coordinate
     * @param clientY - Client Y coordinate
     */
    private handlePointerMove(clientX: number, clientY: number, e: MouseEvent) {
        if (this.context.viewMode) return;
        this.lastPointerX = clientX;
        this.lastPointerY = clientY;
        const coords = this.context.viewport.getCanvasCoords(clientX, clientY);

        // Show the in-progress polyline with a rubber-band tail, even
        // between clicks (no button pressed).
        if (this.selectedTool === "line" && this.isDrawingPolyline && this.polylinePoints.length > 0) {
            this.clearCanvas();
            this.ctx.save();
            this.ctx.translate(this.context.viewport.panX, this.context.viewport.panY);
            this.ctx.scale(this.context.viewport.zoom, this.context.viewport.zoom);
            const pts = this.polylinePoints;
            this.ctx.beginPath();
            this.ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) {
                this.ctx.lineTo(pts[i][0], pts[i][1]);
            }
            this.ctx.lineTo(this.snap(coords[0]), this.snap(coords[1]));
            this.ctx.strokeStyle = this.context.currentStyle.strokeColor;
            this.ctx.lineWidth = this.context.currentStyle.strokeWidth;
            this.ctx.globalAlpha = this.context.currentStyle.opacity;
            this.ctx.stroke();
            this.ctx.restore();
        }

        if (!this.clicked) return;

        if (this.context.cropMode && this.context.cropRect && this.context.cropDragCorner !== null && this.context.cropStartRect) {
            const s = this.context.cropStartRect;
            const opp = [
                { x: s.x + s.w, y: s.y + s.h },
                { x: s.x, y: s.y + s.h },
                { x: s.x, y: s.y },
                { x: s.x + s.w, y: s.y },
            ];
            const o = opp[this.context.cropDragCorner];
            const minX = Math.min(s.x, s.x + s.w);
            const maxX = Math.max(s.x, s.x + s.w);
            const minY = Math.min(s.y, s.y + s.h);
            const maxY = Math.max(s.y, s.y + s.h);
            const nx = Math.max(minX, Math.min(coords[0], maxX));
            const ny = Math.max(minY, Math.min(coords[1], maxY));
            const x = Math.min(nx, o.x);
            const y = Math.min(ny, o.y);
            const w = Math.abs(nx - o.x);
            const h = Math.abs(ny - o.y);
            this.context.cropRect = { x, y, w, h };
            this.clearCanvas();
            return;
        }

        const pluginToolMove = this.context.pluginManager.getTool(this.selectedTool);
        if (pluginToolMove?.onMouseMove) {
            const ctx = this.context.pluginManager.getContext();
            if (ctx) {
                pluginToolMove.onMouseMove(ctx, coords[0], coords[1], e as any);
                return;
            }
        }

        if (this.selectedTool === "select" && this.isSelecting) {
            this.dragOffsetX = coords[0] - this.startX;
            this.dragOffsetY = coords[1] - this.startY;
            this.clearCanvas();
            this.ctx.save();
            this.ctx.translate(this.context.viewport.panX, this.context.viewport.panY);
            this.ctx.scale(this.context.viewport.zoom, this.context.viewport.zoom);
            drawDragSelect(this.ctx, this.startX, this.startY, coords[0], coords[1], this.context.viewport);
            this.ctx.restore();
            return;
        }

        if (this.selectedTool === "select" && this.isResizing && this.resizeStartBounds) {
            const id = [...this.context.selectedIds][0];
            const shape = this.shapeById(id);
            if (!shape) return;
            const dx = coords[0] - this.startX;
            const dy = coords[1] - this.startY;
            const b = this.resizeStartBounds;
            let newX = b.x, newY = b.y, newW = b.w, newH = b.h;

            // Handle index: 0=TL, 1=TC, 2=TR, 3=MR, 4=BR, 5=BC, 6=BL, 7=ML
            if (this.resizeHandle === 0 || this.resizeHandle === 6 || this.resizeHandle === 7) {
                newX = b.x + dx;
                newW = b.w - dx;
            }
            if (this.resizeHandle === 2 || this.resizeHandle === 3 || this.resizeHandle === 4) {
                newW = b.w + dx;
            }
            if (this.resizeHandle === 0 || this.resizeHandle === 1 || this.resizeHandle === 2) {
                newY = b.y + dy;
                newH = b.h - dy;
            }
            if (this.resizeHandle === 4 || this.resizeHandle === 5 || this.resizeHandle === 6) {
                newH = b.h + dy;
            }

            // Proportional resize when Shift is held
            if (this.resizeShiftKey && b.w > 0 && b.h > 0) {
                const aspect = b.w / b.h;
                // Use the larger delta to determine size, constrain the other
                if (Math.abs(newW - b.w) > Math.abs(newH - b.h)) {
                    newH = newW / aspect;
                } else {
                    newW = newH * aspect;
                }
                // Recompute origin for corner handles
                if (this.resizeHandle === 0 || this.resizeHandle === 6 || this.resizeHandle === 7) {
                    newX = b.x + b.w - newW;
                }
                if (this.resizeHandle === 0 || this.resizeHandle === 1 || this.resizeHandle === 2) {
                    newY = b.y + b.h - newH;
                }
            }

            // Apply to shape
            if (shape.type === "rect" || shape.type === "image" || shape.type === "stickyNote" || shape.type === "frame") {
                shape.x = newX;
                shape.y = newY;
                shape.width = newW;
                shape.height = newH;
            } else if (shape.type === "circle") {
                shape.centerX = newX + newW / 2;
                shape.centerY = newY + newH / 2;
                shape.radius = Math.max(newW, newH) / 2;
            } else if (shape.type === "diamond") {
                shape.centerX = newX + newW / 2;
                shape.centerY = newY + newH / 2;
                shape.width = newW;
                shape.height = newH;
            } else if (shape.type === "ellipsisArc") {
                shape.centerX = newX + newW / 2;
                shape.centerY = newY + newH / 2;
                shape.width = newW;
                shape.height = newH;
            } else if (shape.type === "text") {
                shape.x = newX;
                shape.y = newY + newH;
            } else if (shape.type === "arrow" || shape.type === "line") {
                // Scale endpoints proportionally within new bounds
                const sx = b.w > 0 ? newW / b.w : 1;
                const sy = b.h > 0 ? newH / b.h : 1;
                shape.startX = newX + (b.x !== 0 ? (shape.startX - b.x) * sx : 0);
                shape.startY = newY + (b.y !== 0 ? (shape.startY - b.y) * sy : 0);
                shape.endX = newX + (b.x !== 0 ? (shape.endX - b.x) * sx : 0);
                shape.endY = newY + (b.y !== 0 ? (shape.endY - b.y) * sy : 0);
                if (shape.type === "line" && shape.points) {
                    shape.points = shape.points.map(([px, py]: [number, number]) => [
                        newX + (b.x !== 0 ? (px - b.x) * sx : 0),
                        newY + (b.y !== 0 ? (py - b.y) * sy : 0),
                    ]);
                }
            }

            this.context.textManager.updateBoundText(id);
            this.context.arrowManager.updateBoundArrows(id);

            this.invalidateCache();
            this.clearCanvas();
            return;
        }

        if (this.selectedTool === "select" && this.isRotating) {
            const id = [...this.context.selectedIds][0];
            const shape = this.shapeById(id);
            if (!shape) return;
            const [cx, cy] = getShapeCenter(shape);
            const currentAngle = Math.atan2(coords[1] - cy, coords[0] - cx);
            const deltaAngle = currentAngle - this.rotateStartAngle;
            shape.rotation = this.rotateStartRotation + deltaAngle;
            this.invalidateCache();
            this.clearCanvas();
            return;
        }

        if (this.selectedTool === "select" && this.isDragging) {
            // Raw drag delta measured from the drag start point, snapped
            // so the selection locks onto nearby shapes (or the grid).
            const rawX = coords[0] - this.dragStartPoint!.x;
            const rawY = coords[1] - this.dragStartPoint!.y;
            const snapped = this.snapDragDelta(rawX, rawY);
            const dx = snapped.x - this.lastSnappedDelta!.x;
            const dy = snapped.y - this.lastSnappedDelta!.y;
            this.lastSnappedDelta = snapped;

            for (const id of this.context.selectedIds) {
                const shape = this.shapeById(id);
                if (!shape || shape.locked) continue;
                moveShape(shape, dx, dy);
            }

            // Update arrows bound to moved shapes
            for (const id of this.context.selectedIds) {
                this.context.arrowManager.updateBoundArrows(id);
            }

            // Update bound text positions
            for (const id of this.context.selectedIds) {
                this.context.textManager.updateBoundText(id);
            }

            this.dragOffsetX = coords[0];
            this.dragOffsetY = coords[1];

            // Compute alignment guides
            this.context.alignmentGuides = [];
            const tolerance = 5;
            for (const id of this.context.selectedIds) {
                const shape = this.shapeById(id);
                if (!shape) continue;
                const bounds = getShapeBounds(shape);
                if (!bounds) continue;
                const cx = bounds.x + bounds.w / 2;
                const cy = bounds.y + bounds.h / 2;
                for (const other of this.context.existingShapes) {
                    if (other.id && this.context.selectedIds.has(other.id)) continue;
                    const otherBounds = getShapeBounds(other);
                    if (!otherBounds) continue;
                    const otherCx = otherBounds.x + otherBounds.w / 2;
                    const otherCy = otherBounds.y + otherBounds.h / 2;
                    if (Math.abs(cx - otherCx) < tolerance) {
                        this.context.alignmentGuides.push({ x: otherCx });
                    }
                    if (Math.abs(bounds.x - otherBounds.x) < tolerance) {
                        this.context.alignmentGuides.push({ x: otherBounds.x });
                    }
                    if (Math.abs(bounds.x + bounds.w - otherBounds.x - otherBounds.w) < tolerance) {
                        this.context.alignmentGuides.push({ x: otherBounds.x + otherBounds.w });
                    }
                    if (Math.abs(cy - otherCy) < tolerance) {
                        this.context.alignmentGuides.push({ y: otherCy });
                    }
                    if (Math.abs(bounds.y - otherBounds.y) < tolerance) {
                        this.context.alignmentGuides.push({ y: otherBounds.y });
                    }
                    if (Math.abs(bounds.y + bounds.h - otherBounds.y - otherBounds.h) < tolerance) {
                        this.context.alignmentGuides.push({ y: otherBounds.y + otherBounds.h });
                    }
                }
            }

            this.invalidateCache();
            this.clearCanvas();
            return;
        }

        if (this.selectedTool === "pen") {
            this.constantPenPoints.push([coords[0], coords[1]]);
            this.clearCanvas();
            this.ctx.save();
            this.ctx.translate(this.context.viewport.panX, this.context.viewport.panY);
            this.ctx.scale(this.context.viewport.zoom, this.context.viewport.zoom);
            if (this.constantPenPoints.length > 1) {
                this.ctx.beginPath();
                this.ctx.moveTo(this.constantPenPoints[0][0], this.constantPenPoints[0][1]);
                for (let j = 1; j < this.constantPenPoints.length; j++) {
                    this.ctx.lineTo(this.constantPenPoints[j][0], this.constantPenPoints[j][1]);
                }
                this.ctx.strokeStyle = this.context.currentStyle.strokeColor;
                this.ctx.lineWidth = this.context.currentStyle.strokeWidth / this.context.viewport.zoom;
                this.ctx.lineCap = "round";
                this.ctx.lineJoin = "round";
                this.ctx.stroke();
            }
            this.ctx.restore();
            return;
        }

        if (this.selectedTool === "eraser") {
            const last = this.eraserPoints[this.eraserPoints.length - 1];
            const dx = coords[0] - last[0];
            const dy = coords[1] - last[1];
            if (dx * dx + dy * dy > 25) {
                this.eraserPoints.push([coords[0], coords[1]]);
            }
            this.clearCanvas();
            return;
        }

        const width = this.snap(coords[0]) - this.startX;
        const height = this.snap(coords[1]) - this.startY;
        this.clearCanvas();

        this.ctx.save();
        this.ctx.translate(this.context.viewport.panX, this.context.viewport.panY);
        this.ctx.scale(this.context.viewport.zoom, this.context.viewport.zoom);

        const prevOpts = {
            stroke: this.context.currentStyle.strokeColor,
            strokeWidth: 1.5 / this.context.viewport.zoom,
            roughness: 0,
            bowing: 0,
            fill: this.context.currentStyle.backgroundColor !== "transparent" ? this.context.currentStyle.backgroundColor : undefined,
            fillStyle: this.context.currentStyle.backgroundColor !== "transparent" ? (this.context.currentStyle.fillStyle ?? "solid") : undefined,
            fillWeight: 1,
            hachureGap: 4,
        };

        if (this.selectedTool === "rect") {
            const x = Math.min(this.startX, this.startX + width);
            const y = Math.min(this.startY, this.startY + height);
            const w = Math.abs(width);
            const h = Math.abs(height);
            this.rc.rectangle(x, y, w, h, prevOpts);
        } else if (this.selectedTool === "circle") {
            const radius = Math.max(width, height) / 2;
            const centerX = this.startX + radius;
            const centerY = this.startY + radius;
            this.rc.circle(centerX, centerY, Math.abs(radius) * 2, prevOpts);
        } else if (this.selectedTool === "diamond") {
            const cx = this.startX + width / 2;
            const cy = this.startY + height / 2;
            const hw = Math.abs(width) / 2;
            const hh = Math.abs(height) / 2;
            this.rc.polygon(
                [[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]],
                prevOpts,
            );
        } else if (this.selectedTool === "ellipsisArc") {
            const rx = Math.abs(width) / 2;
            const ry = Math.abs(height) / 2;
            if (rx > 0 && ry > 0) {
                const cx = this.startX + width / 2;
                const cy = this.startY + height / 2;
                this.ctx.beginPath();
                this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
                this.ctx.strokeStyle = this.context.currentStyle.strokeColor;
                this.ctx.lineWidth = 1.5 / this.context.viewport.zoom;
                this.ctx.stroke();
            }
        } else if (this.selectedTool === "arrow") {
            // Snap endpoint to nearest shape edge/center
            const startBind = this.context.arrowManager.findNearestBinding([this.startX, this.startY]);
            const endBind = this.context.arrowManager.findNearestBinding([this.snap(coords[0]), this.snap(coords[1])], startBind?.id);
            const sx = startBind?.x ?? this.startX;
            const sy = startBind?.y ?? this.startY;
            const ex = endBind?.x ?? this.snap(coords[0]);
            const ey = endBind?.y ?? this.snap(coords[1]);
            this.rc.line(sx, sy, ex, ey, prevOpts);
            // Draw snap indicators
            if (startBind) {
                this.ctx.beginPath();
                this.ctx.arc(sx, sy, 4 / this.context.viewport.zoom, 0, Math.PI * 2);
                this.ctx.fillStyle = "rgba(59, 130, 246, 0.8)";
                this.ctx.fill();
            }
            if (endBind) {
                this.ctx.beginPath();
                this.ctx.arc(ex, ey, 4 / this.context.viewport.zoom, 0, Math.PI * 2);
                this.ctx.fillStyle = "rgba(59, 130, 246, 0.8)";
                this.ctx.fill();
            }
        } else if (this.selectedTool === "line") {
            // While a polyline is in progress the preview is drawn by the
            // dedicated block at the top of handlePointerMove.
            if (!this.isDrawingPolyline) {
                this.rc.line(this.startX, this.startY, coords[0], coords[1], prevOpts);
            }
        } else if (this.selectedTool === "text") {
            // The caret preview is drawn in mouseMoveHandler so it stays
            // visible before and between clicks.
        } else if (this.selectedTool === "frame") {
            const x = Math.min(this.startX, this.startX + width);
            const y = Math.min(this.startY, this.startY + height);
            const w = Math.abs(width) || 300;
            const h = Math.abs(height) || 200;
            this.ctx.strokeStyle = "rgba(59, 130, 246, 0.6)";
            this.ctx.lineWidth = 2 / this.context.viewport.zoom;
            this.ctx.setLineDash([6 / this.context.viewport.zoom, 4 / this.context.viewport.zoom]);
            this.ctx.strokeRect(x, y, w, h);
            this.ctx.setLineDash([]);
            this.ctx.font = `bold ${12 / this.context.viewport.zoom}px Arial`;
            this.ctx.fillStyle = "rgba(59, 130, 246, 0.8)";
            this.ctx.fillText("Frame", x + 8 / this.context.viewport.zoom, y - 6 / this.context.viewport.zoom);
        }

        this.ctx.restore();
    };

    /**
     * Handle double-click — open text editor on text shapes, or finish polyline.
     *
     * In select mode: hit-tests the click position and opens the inline text
     * editor if a text shape is found, or prompts for arrow label.
     * In line mode: finishes the current polyline.
     */
    dblClickHandler = (e: MouseEvent) => {
        if (this.context.viewMode) return;
        if (this.selectedTool === "line" && this.isDrawingPolyline) {
            this.finishPolyline();
            return;
        }
        if (this.selectedTool !== "select") return;
        const coords = this.context.viewport.getCanvasCoords(e.clientX, e.clientY);
        const lockedIds = new Set(this.context.existingShapes.filter(s => s.locked).map(s => s.id!));
        const hit = hitTest(coords, this.context.existingShapes, this.context.viewport.zoom, lockedIds);
        if (hit === null) return;
        const shape = this.context.existingShapes[hit];
        if (shape.type === "text") {
            this.startTextEdit(shape.x, shape.y, shape.text, hit, {
                bold: shape.bold,
                italic: shape.italic,
                fontFamily: shape.fontFamily,
                fontSize: shape.fontSize,
                textAlign: shape.textAlign || "left",
            });
        } else if (shape.type === "arrow") {
            const label = prompt("Enter arrow label:", shape.label ?? "");
            if (label !== null) {
                const prev = structuredClone(this.context.existingShapes);
                shape.label = label || undefined;
                this.context.undoManager.push(prev, this.context.existingShapes);
                this.invalidateCache();
                this.clearCanvas();
                this.syncShapes();
            }
        } else if (shape.type === "frame") {
            const name = prompt("Frame name:", shape.name ?? "");
            if (name !== null) {
                const prev = structuredClone(this.context.existingShapes);
                shape.name = name || `Frame ${this.context.existingShapes.filter(s => s.type === "frame").length + 1}`;
                this.context.undoManager.push(prev, this.context.existingShapes);
                this.invalidateCache();
                this.clearCanvas();
                this.syncShapes();
                this.notifySelection();
            }
        } else if (["rect", "circle", "diamond", "ellipsisArc", "stickyNote"].includes(shape.type)) {
            const bounds = getShapeBounds(shape);
            if (!bounds) return;
            const centerX = bounds.x + bounds.w / 2;
            const centerY = bounds.y + bounds.h / 2;
            if (shape.boundTextId) {
                const textShape = this.context.existingShapes.find(s => s.id === shape.boundTextId && s.type === "text");
                if (textShape) {
                    const ts = textShape as TextShape;
                    const idx = this.context.existingShapes.indexOf(textShape);
                    this.startTextEdit(ts.x, ts.y, ts.text, idx, {
                        bold: ts.bold,
                        italic: ts.italic,
                        fontFamily: ts.fontFamily,
                        fontSize: ts.fontSize,
                        textAlign: ts.textAlign || "left",
                    });
                    return;
                } else {
                    delete shape.boundTextId;
                }
            }
            this.context.textManager.pendingBoundTextContainerId = shape.id!;
            this.startTextEdit(centerX, centerY, undefined, undefined, {
                fontSize: 20,
                textAlign: "center",
            });
        } else if (shape.url) {
            window.open(shape.url, "_blank", "noopener,noreferrer");
        }
    };

    /**
     * Register mouse event listeners on the canvas.
     *
     * Binds mousedown, mouseup, mousemove, dblclick, and contextmenu
     * handlers to the canvas element.
     */
    initMouseHandlers() {
        this.canvas.addEventListener("mousedown", this.mouseDownHandler);
        this.canvas.addEventListener("mouseup", this.mouseUpHandler);
        this.canvas.addEventListener("mousemove", this.mouseMoveHandler);
        this.canvas.addEventListener("dblclick", this.dblClickHandler);
        this.canvas.addEventListener("contextmenu", this.contextMenuHandler);
        this.canvas.addEventListener("mouseleave", this.laserMouseLeave);
        this.canvas.addEventListener("mouseenter", this.laserMouseEnter);
    }

    /**
     * Handle scroll wheel — zoom in/out via the viewport.
     *
     * Delegates to {@link Viewport.handleWheel} which zooms centered
     * on the cursor position. Prevents the default browser scroll behavior.
     */
    wheelHandler = (e: WheelEvent) => {
        e.preventDefault();
        this.context.viewport.handleWheel(e, this.context.cssWidth, this.context.cssHeight);
        this.invalidateCache();
        this.clearCanvas();
    };

    /**
     * Register the wheel event listener on the canvas.
     *
     * Uses `{ passive: false }` to allow `preventDefault()` for
     * scroll zooming.
     */
    initWheelHandler() {
        this.canvas.addEventListener("wheel", this.wheelHandler, {
            passive: false,
        });
    }

    /**
     * Handle key down — space (pan), Ctrl+Z (undo/redo), Ctrl+C/V (copy/paste), Ctrl+G (group), Delete.
     *
     * Keyboard shortcuts:
     * - **Space** — hold to pan
     * - **Ctrl+Z / Ctrl+Shift+Z** — undo / redo
     * - **Ctrl+C / Ctrl+V** — copy / paste
     * - **Ctrl+D** — duplicate
     * - **Ctrl+G / Ctrl+Shift+G** — group / ungroup
     * - **Ctrl+Shift+L/R/C** — align left / right / center
     * - **Ctrl+Shift+H/V** — distribute horizontal / vertical
     * - **Ctrl+L** — lock/unlock
     * - **Ctrl+B** — toggle bold for new text
     * - **Ctrl+I** — toggle italic for new text
     * - **Delete / Backspace** — delete selected
     * - **I** — eyedropper tool
     * - **P** — constant-width pen tool
     * - **?** — toggle shortcuts panel
     * - **B** — cycle background
     * - **G** — toggle snap-to-grid
     * - **Shift+1** — zoom to fit
     * - **Arrow keys** — nudge selected shapes (or pan canvas)
     * - **Escape** — finish polyline / cancel action
     */
    // ─── Touch handlers ────────────────────────────────────────────

    /**
     * Get the position of the first touch point.
     * @param e - Touch event
     * @returns Client coordinates, or null if no touches
     */
    private getTouchPos(e: TouchEvent): { x: number; y: number } | null {
        const t = e.touches[0] || e.changedTouches[0];
        return t ? { x: t.clientX, y: t.clientY } : null;
    }

    /**
     * Calculate the center point and distance between two touch points.
     * @param e - Touch event with at least 2 touches
     * @returns Center coordinates and distance, or null if < 2 touches
     */
    private getTwoFingerCenter(e: TouchEvent): { cx: number; cy: number; dist: number } | null {
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        if (!t0 || !t1) return null;
        const cx = (t0.clientX + t1.clientX) / 2;
        const cy = (t0.clientY + t1.clientY) / 2;
        const dx = t1.clientX - t0.clientX;
        const dy = t1.clientY - t0.clientY;
        return { cx, cy, dist: Math.sqrt(dx * dx + dy * dy) };
    }

    /**
     * Handle touch start — pinch-zoom, double-tap text edit, or single-touch draw.
     *
     * - **2 fingers** — begins pinch-zoom and pan gesture
     * - **Double-tap** — opens text editor on text shapes (select mode only)
     * - **Single touch** — delegates to {@link handlePointerDown} for tool behavior
     */
    touchStartHandler = (e: TouchEvent) => {
        if (e.touches.length > 2) return;

        if (e.touches.length === 2) {
            e.preventDefault();
            this.clicked = false;
            this.isDragging = false;
            this.isSelecting = false;
            const gesture = this.getTwoFingerCenter(e);
            if (gesture) {
                this.pinchStartDist = gesture.dist;
                this.pinchStartZoom = this.context.viewport.zoom;
                this.isPanning = true;
                this.panStartX = gesture.cx - this.context.viewport.panX;
                this.panStartY = gesture.cy - this.context.viewport.panY;
            }
            return;
        }

        const pos = this.getTouchPos(e);
        if (!pos) return;

        // Double-tap detection (for text editing on touch)
        const now = Date.now();
        if (now - this.lastTapTime < 300) {
            e.preventDefault();
            this.lastTapTime = 0;
        if (this.selectedTool === "select" && !this.context._locked) {
                const coords = this.context.viewport.getCanvasCoords(pos.x, pos.y);
                const lockedIds = new Set(this.context.existingShapes.filter(s => s.locked).map(s => s.id!));
                const hit = hitTest(coords, this.context.existingShapes, this.context.viewport.zoom, lockedIds);
                if (hit !== null) {
                    const shape = this.context.existingShapes[hit];
                    if (shape.type === "text") {
                        this.startTextEdit(shape.x, shape.y, shape.text, hit, {
                            bold: shape.bold,
                            italic: shape.italic,
                            fontFamily: shape.fontFamily,
                            fontSize: shape.fontSize,
                        });
                        return;
                    } else if (["rect", "circle", "diamond", "ellipsisArc", "stickyNote"].includes(shape.type)) {
                        const bounds = getShapeBounds(shape);
                        if (!bounds) return;
                        const centerX = bounds.x + bounds.w / 2;
                        const centerY = bounds.y + bounds.h / 2;
                        if (shape.boundTextId) {
                            const textShape = this.context.existingShapes.find(s => s.id === shape.boundTextId && s.type === "text");
                            if (textShape) {
                                const ts = textShape as TextShape;
                                const idx = this.context.existingShapes.indexOf(textShape);
                                this.startTextEdit(ts.x, ts.y, ts.text, idx, {
                                    bold: ts.bold,
                                    italic: ts.italic,
                                    fontFamily: ts.fontFamily,
                                    fontSize: ts.fontSize,
                                    textAlign: ts.textAlign || "left",
                                });
                                return;
                            } else {
                                delete shape.boundTextId;
                            }
                        }
                        this.context.textManager.pendingBoundTextContainerId = shape.id!;
                        this.startTextEdit(centerX, centerY, undefined, undefined, {
                            fontSize: 20,
                            textAlign: "center",
                        });
                        return;
                    }
                }
            }
            return;
        }
        this.lastTapTime = now;

        // Single touch — delegate to pointer handler
        e.preventDefault();
        this.handlePointerDown(pos.x, pos.y, false, new MouseEvent("touchstart"));
    };

    /**
     * Handle touch move — pinch-zoom pan or single-touch draw.
     *
     * With 2 fingers, computes the pinch scale and pan offset from
     * the gesture center. With 1 finger, delegates to
     * {@link handlePointerMove} for tool-specific behavior.
     */
    touchMoveHandler = (e: TouchEvent) => {
        e.preventDefault();

        if (e.touches.length === 2 && this.isPanning) {
            const gesture = this.getTwoFingerCenter(e);
            if (gesture) {
                const scale = gesture.dist / this.pinchStartDist;
                const newZoom = Math.min(Math.max(this.pinchStartZoom * scale, 0.1), 10);
                this.context.viewport.zoom = newZoom;
                this.context.viewport.panX = gesture.cx - this.panStartX;
                this.context.viewport.panY = gesture.cy - this.panStartY;

                this.invalidateCache();
                this.clearCanvas();
            }
            return;
        }

        if (e.touches.length !== 1) return;
        const pos = this.getTouchPos(e);
        if (!pos) return;

        this.handlePointerMove(pos.x, pos.y, new MouseEvent("touchmove"));
    };

    /**
     * Handle touch end — finalize drawing or end pan.
     *
     * Resets panning state and delegates to {@link handlePointerUp}
     * for tool-specific finalization. Ignores the event if other
     * fingers are still touching (multi-finger gesture).
     */
    touchEndHandler = (e: TouchEvent) => {
        e.preventDefault();

        const wasPanning = this.isPanning;
        if (e.touches.length === 0 && wasPanning && e.changedTouches.length >= 2) {
            this.isPanning = false;
            return;
        }

        if (e.touches.length >= 1) return;

        this.isPanning = false;
        if (wasPanning) return;
        this.handlePointerUp(e as any);
    };

    /**
     * Register paste event listener on the canvas.
     *
     * Handles both internal clipboard paste and external image paste
     * from the system clipboard.
     */
    initPasteHandler() {
        this.pasteHandler = (e: ClipboardEvent) => {
            if (this.context.textManager.hasTextEditOverlay) return;
            const wasPending = this.context.clipboardManager.pendingPaste;
            this.context.clipboardManager.pendingPaste = false;
            void this.context.clipboardManager.pasteExternal(e).then((wasExternal) => {
                if (!wasExternal && wasPending) {
                    this.context.clipboardManager.pasteClipboard();
                }
            });
        };
        this.canvas.addEventListener("paste", this.pasteHandler);
    }

    /**
     * Register touch event listeners on the canvas.
     *
     * Uses `{ passive: false }` on all touch events to allow
     * `preventDefault()` for pinch-zoom and draw gestures.
     */
    initTouchHandlers() {
        this.canvas.addEventListener("touchstart", this.touchStartHandler, { passive: false });
        this.canvas.addEventListener("touchmove", this.touchMoveHandler, { passive: false });
        this.canvas.addEventListener("touchend", this.touchEndHandler, { passive: false });
        this.canvas.addEventListener("touchcancel", this.touchEndHandler, { passive: false });
    }
}
