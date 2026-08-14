import { ImageCache } from "./imageCache";
import { getExistingShapes, saveShapes } from "./http";
import { uuid } from "@/lib/uuid";
import rough from "roughjs";
import { generateFromMermaid } from "./mermaid";
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
} from "@repo/shapes";
import { UndoManager, shapesEqual } from "./undoManager";
import { Viewport } from "./viewport";
import {
    renderShape,
    drawSelection,
    drawDragSelect,
    hitTest,
    eraserIntersectsShape,
} from "./renderer";
import { exportToPng, exportToSvg, exportToJson } from "./exporter";
import {
    startTextEdit,
    removeTextOverlayFn,
    offsetShapeCopy,
    moveShape,
    TextStyleOptions,
} from "./inputHandler";
import { PluginRegistry, Plugin, CustomToolDefinition } from "./pluginSystem";

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
    private existingShapes: Shape[];
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
    private selectedIds: Set<string> = new Set();
    private isDragging = false;
    private isSelecting = false;
    private dragOffsetX = 0;
    private dragOffsetY = 0;
    private dragStartShapes: Shape[] | null = null;
    private dragStartPoint: { x: number; y: number } | null = null;
    private lastSnappedDelta: { x: number; y: number } | null = null;
    private dragStartBounds: Bounds | null = null;
    private clipboard: Shape[] = [];
    private rc: ReturnType<typeof rough.canvas>;
    private selectionChangeCallback: ((shape: Shape | null) => void) | null = null;
    private styleChangeCallback: (() => void) | null = null;
    private themeChangeCallback: ((isDark: boolean) => void) | null = null;
    private toolChangeCallback: ((tool: string) => void) | null = null;
    private trashChangeCallback: (() => void) | null = null;
    private shortcutsCallback: (() => void) | null = null;
    private searchCallback: (() => void) | null = null;
    private contextMenuCallback: ((x: number, y: number) => void) | null = null;
    private eraserPoints: Point[] = [];
    private eraserRadius = 20;
    private imageCache = new ImageCache();
    private _styleCustomized = false;
    private pasteHandler = ((_e: ClipboardEvent) => { }) as (e: ClipboardEvent) => void;
    private pendingPaste = false;
    private textEditOverlay: HTMLTextAreaElement | null = null;
    /** Tracks the container shape ID whose bound text is currently being created (null when idle) */
    private pendingBoundTextContainerId: string | null = null;
    private clipboardChannel: BroadcastChannel | null = null;
    private _locked = false;
    private stayAfterDraw = true;
    private snapToObjects = true;
    private zenMode = false;
    private viewMode = false;
    private copiedStyle: Partial<ShapeStyle> | null = null;
    private zenModeCallback: ((zen: boolean) => void) | null = null;
    private viewModeCallback: ((view: boolean) => void) | null = null;

    // Collaboration cursors
    private localCursorId = uuid();
    private localUserName = "";
    private localUserColor = "";
    private remoteCursors = new Map<string, { x: number; y: number; name: string; color: string; lastSeen: number }>();
    private cursorBroadcastTimer: ReturnType<typeof setTimeout> | null = null;
    private cursorCleanupTimer: ReturnType<typeof setInterval> | null = null;
    private cacheCanvas: HTMLCanvasElement;
    private cacheCtx: CanvasRenderingContext2D;
    private cacheRc: ReturnType<typeof rough.canvas>;
    private cacheValid = false;
    private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
    private autoSaveDisabled = false;
    private lastSavedVersion = 0;
    private lastSyncedShapes: Shape[] = [];
    private autoSaveRetries = 0;
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
            const coords = this.viewport.getCanvasCoords(e.clientX, e.clientY);
            this.setLaserPosition(coords[0], coords[1]);
        }
    };
    isDark: boolean;
    currentStyle: ShapeStyle;
    private _background: CanvasBackground = { type: "dots", color: "rgb(0,0,0)", dotSize: 1.5, spacing: 20 };
    private _backgroundCustom = false;

    /** The current canvas background style */
    get background(): CanvasBackground {
        return this._background;
    }

    /** Whether new text will be bold */
    get textBold(): boolean { return this._textBold; }
    set textBold(v: boolean) { this._textBold = v; }

    /** Whether new text will be italic */
    get textItalic(): boolean { return this._textItalic; }
    set textItalic(v: boolean) { this._textItalic = v; }

    /** Font family for new text shapes */
    get textFontFamily(): string { return this._textFontFamily; }
    set textFontFamily(v: string) { this._textFontFamily = v; }

    /** Font size for new text shapes */
    get textFontSize(): number { return this._textFontSize; }
    set textFontSize(v: number) { this._textFontSize = v; }

    /** Text alignment for new text shapes */
    get textAlign(): "left" | "center" | "right" { return this._textAlign; }
    set textAlign(v: "left" | "center" | "right") { this._textAlign = v; }

    /** Get the current text formatting state */
    getTextStyle(): TextStyleOptions {
        return {
            bold: this._textBold,
            italic: this._textItalic,
            fontFamily: this._textFontFamily,
            fontSize: this._textFontSize,
            textAlign: this._textAlign,
        };
    }

    /** The WebSocket connection for real-time collaboration */
    socket: WebSocket;

    private undoManager = new UndoManager();
    private viewport = new Viewport();
    private gridSize = 20;
    private snapToGrid = false;
    private alignmentGuides: Array<{ x?: number; y?: number }> = [];
    private isResizing = false;
    private resizeHandle = -1;
    private resizeStartBounds: { x: number; y: number; w: number; h: number } | null = null;
    private resizeShiftKey = false;
    private isRotating = false;
    private rotateStartAngle = 0;
    private rotateStartRotation = 0;
    private destroyed = false;

    // Plugin system
    private pluginRegistry = new PluginRegistry();

    // Trash / recovery state
    private trash: Shape[] = [];

    // Laser pointer state
    private laserPosition: { x: number; y: number } | null = null;
    private laserColor = "#ef4444";
    private laserSize = 6;

    // Image crop state
    private cropMode = false;
    private cropShapeId: string | null = null;
    private cropRect: { x: number; y: number; w: number; h: number } | null = null;
    private cropDragCorner: number | null = null;
    private cropStartRect: { x: number; y: number; w: number; h: number } | null = null;

    // Text formatting state
    private _textBold = false;
    private _textItalic = false;
    private _textFontFamily = "Arial";
    private _textFontSize = 20;
    private _textAlign: "left" | "center" | "right" = "left";

    // Polyline drawing state
    private polylinePoints: Array<[number, number]> = [];
    private isDrawingPolyline = false;
    private polylineStartCount = 0;

    // Library storage key
    private static LIBRARY_KEY = "codraw_libraries";

    /** Get all saved libraries from localStorage */
    getLibraries(): Library[] {
        try {
            const raw = localStorage.getItem(Game.LIBRARY_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    /** Save libraries to localStorage */
    private saveLibraries(libs: Library[]) {
        localStorage.setItem(Game.LIBRARY_KEY, JSON.stringify(libs));
    }

    /** Create a new library */
    createLibrary(name: string): Library {
        const libs = this.getLibraries();
        const lib: Library = {
            id: uuid(),
            name,
            items: [],
            createdAt: Date.now(),
        };
        libs.push(lib);
        this.saveLibraries(libs);
        return lib;
    }

    /** Delete a library by ID */
    deleteLibrary(id: string) {
        const libs = this.getLibraries().filter(l => l.id !== id);
        this.saveLibraries(libs);
    }

    /** Rename a library */
    renameLibrary(id: string, name: string) {
        const libs = this.getLibraries();
        const lib = libs.find(l => l.id === id);
        if (lib) {
            lib.name = name;
            this.saveLibraries(libs);
        }
    }

    /** Save selected shapes as a library item */
    saveToLibrary(libraryId: string, itemName: string): LibraryItem | null {
        const selected = this.getSelectedShapes();
        if (selected.length === 0) return null;
        const libs = this.getLibraries();
        const lib = libs.find(l => l.id === libraryId);
        if (!lib) return null;
        const item: LibraryItem = {
            id: uuid(),
            name: itemName,
            shapes: structuredClone(selected),
            createdAt: Date.now(),
        };
        lib.items.push(item);
        this.saveLibraries(libs);
        return item;
    }

    /** Delete a library item */
    deleteLibraryItem(libraryId: string, itemId: string) {
        const libs = this.getLibraries();
        const lib = libs.find(l => l.id === libraryId);
        if (lib) {
            lib.items = lib.items.filter(i => i.id !== itemId);
            this.saveLibraries(libs);
        }
    }

    /** Load a library item onto the canvas at the given position */
    loadLibraryItem(libraryId: string, itemId: string, x?: number, y?: number) {
        const libs = this.getLibraries();
        const lib = libs.find(l => l.id === libraryId);
        if (!lib) return;
        const item = lib.items.find(i => i.id === itemId);
        if (!item) return;
        const shapes = structuredClone(item.shapes);
        // Assign new IDs and optionally offset to position
        const ids = new Map<string, string>();
        for (const s of shapes) {
            const oldId = s.id;
            s.id = uuid();
            if (oldId) ids.set(oldId, s.id);
        }
        // Update bindings
        for (const s of shapes) {
            if (s.type === "arrow") {
                if (s.startBinding) s.startBinding = ids.get(s.startBinding) ?? s.startBinding;
                if (s.endBinding) s.endBinding = ids.get(s.endBinding) ?? s.endBinding;
            }
            if (s.boundTextId) {
                s.boundTextId = ids.get(s.boundTextId) ?? s.boundTextId;
            }
        }
        // Offset to position if provided
        if (x !== undefined && y !== undefined && shapes.length > 0) {
            const bounds = this.getMultipleBounds(shapes);
            if (bounds) {
                const dx = x - bounds.x;
                const dy = y - bounds.y;
                for (const s of shapes) moveShape(s, dx, dy);
            }
        }
        const prev = [...this.existingShapes];
        this.existingShapes.push(...shapes);
        this.undoManager.push(prev, this.existingShapes);
        this.invalidateCache();
        this.clearCanvas();
        this.syncShapes();
    }

    /** Export a library as JSON for sharing */
    exportLibrary(libraryId: string): string | null {
        const libs = this.getLibraries();
        const lib = libs.find(l => l.id === libraryId);
        if (!lib) return null;
        return JSON.stringify(lib, null, 2);
    }

    /** Import a library from JSON */
    importLibrary(json: string): Library | null {
        try {
            const lib = JSON.parse(json) as Library;
            if (!lib.name || !Array.isArray(lib.items)) return null;
            lib.id = uuid(); // Assign new ID to avoid conflicts
            lib.items = lib.items.map(item => ({ ...item, id: uuid() }));
            const libs = this.getLibraries();
            libs.push(lib);
            this.saveLibraries(libs);
            return lib;
        } catch {
            return null;
        }
    }

    /** Get bounds for multiple shapes (for positioning loaded items) */
    private getMultipleBounds(shapes: Shape[]): Bounds | null {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const s of shapes) {
            const b = getShapeBounds(s);
            if (b) {
                if (b.x < minX) minX = b.x;
                if (b.y < minY) minY = b.y;
                if (b.x + b.w > maxX) maxX = b.x + b.w;
                if (b.y + b.h > maxY) maxY = b.y + b.h;
            }
        }
        if (minX === Infinity) return null;
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    /** Get all visible shapes for the minimap */
    getShapesForMinimap(): Shape[] {
        return this.existingShapes.filter(s => s.type !== "eraser");
    }

    /** Get the current viewport state for the minimap */
    getViewportState() {
        return {
            panX: this.viewport.panX,
            panY: this.viewport.panY,
            zoom: this.viewport.zoom,
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height,
        };
    }

    /** Navigate the viewport to center on a canvas coordinate */
    navigateTo(canvasX: number, canvasY: number) {
        this.viewport.panX = this.canvas.width / 2 - canvasX * this.viewport.zoom;
        this.viewport.panY = this.canvas.height / 2 - canvasY * this.viewport.zoom;
        this.invalidateCache();
        this.clearCanvas();
    }

    /** Search shapes by text content, arrow labels, or frame names */
    searchShapes(query: string): Shape[] {
        if (!query.trim()) return [];
        const q = query.toLowerCase();
        return this.existingShapes.filter(s => {
            if (s.type === "text") return s.text.toLowerCase().includes(q);
            if (s.type === "arrow" && s.label) return s.label.toLowerCase().includes(q);
            if (s.type === "frame") return s.name.toLowerCase().includes(q);
            if (s.type === "stickyNote" && s.text) return s.text.toLowerCase().includes(q);
            return false;
        });
    }

    /** Select and zoom to a specific shape */
    selectAndZoomTo(shapeId: string) {
        this.selectedIds = new Set([shapeId]);
        this.notifySelection();
        const shape = this.shapeById(shapeId);
        if (shape) {
            const bounds = getShapeBounds(shape);
            if (bounds) {
                this.viewport.zoomToFit(bounds, this.canvas.width, this.canvas.height, 100);
                this.invalidateCache();
                this.clearCanvas();
            }
        }
    }

    /** Import a Mermaid diagram and add shapes to the canvas */
    importFromMermaid(text: string, x = 200, y = 200): Shape[] {
        const shapes = generateFromMermaid(text);
        // Offset all shapes to the given position
        if (shapes.length > 0) {
            const bounds = this.getMultipleBounds(shapes);
            if (bounds) {
                const dx = x - bounds.x;
                const dy = y - bounds.y;
                for (const s of shapes) moveShape(s, dx, dy);
            }
        }
        const prev = [...this.existingShapes];
        for (const s of shapes) {
            s.id = uuid();
            s.style = { ...this.currentStyle };
        }
        this.existingShapes.push(...shapes);
        this.undoManager.push(prev, this.existingShapes);
        this.invalidateCache();
        this.clearCanvas();
        this.syncShapes();
        return shapes;
    }

    /** Get all frames sorted by position (top-to-bottom, left-to-right) as slides */
    getSlides(): Shape[] {
        return this.existingShapes
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
        return this.viewport.getCanvasCoords(clientX, clientY);
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
        this.existingShapes = [];
        this.roomId = roomId;
        this.socket = socket;
        this.isDark = document.documentElement.classList.contains("dark");
        this.currentStyle = defaultStyle(this.isDark);
        this._background = { type: "solid", color: this.canvasBackgroundColor() };
        this.rc = rough.canvas(this.canvas);
        this.cacheCanvas = document.createElement("canvas");
        this.cacheCanvas.width = canvas.width;
        this.cacheCanvas.height = canvas.height;
        this.cacheCtx = this.cacheCanvas.getContext("2d")!;
        this.cacheRc = rough.canvas(this.cacheCanvas);
        this.pluginRegistry.initialize(this, this.canvas);
        this.init().then(() => {
            if (this.destroyed) return;
            this.initHandlers();
            this.initMouseHandlers();
            this.initKeyboardHandlers();
            this.initWheelHandler();
            this.initTouchHandlers();
            this.initPasteHandler();
            this.initClipboardChannel();
            this.startCursorCleanup();
        });
    }

    /** Tear down all event listeners and cancel pending auto-saves */
    destroy() {
        this.destroyed = true;
        this.removeTextOverlay();
        this.cancelAutoSave();
        this.socket.onmessage = null;
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
        window.removeEventListener("keydown", this.keyDownHandler);
        window.removeEventListener("keyup", this.keyUpHandler);
        if (this.cursorCleanupTimer) {
            clearInterval(this.cursorCleanupTimer);
            this.cursorCleanupTimer = null;
        }
        try {
            this.clipboardChannel?.close();
        } catch {
            // ignore
        }
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
        this.themeChangeCallback = cb;
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
        this.trashChangeCallback = cb;
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
        this.snapToGrid = !this.snapToGrid;
    }

    /**
     * Toggle object snapping (alignment with other shapes while dragging).
     * Off by default: on. Toggled with Alt+S.
     */
    toggleSnapToObjects() {
        this.snapToObjects = !this.snapToObjects;
    }

    /** Whether object snapping is enabled */
    get isSnapToObjects() {
        return this.snapToObjects;
    }

    /**
     * Toggle "keep tool active after drawing".
     *
     * When off, committing a shape switches back to the Select tool.
     * Default is on (tools stay active). Toggled with Q.
     */
    toggleStayAfterDraw() {
        this.stayAfterDraw = !this.stayAfterDraw;
    }

    /** Whether shape tools stay active after drawing */
    get stayActiveAfterDraw() {
        return this.stayAfterDraw;
    }

    /**
     * Toggle zen mode — hides all UI chrome around the canvas.
     * Toggled with Alt+Z.
     */
    toggleZenMode() {
        this.zenMode = !this.zenMode;
        this.zenModeCallback?.(this.zenMode);
        this.clearCanvas();
    }

    /** Whether zen mode (chrome hidden) is active */
    get isZenMode() {
        return this.zenMode;
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
        this.viewMode = !this.viewMode;
        if (this.viewMode) {
            this.selectedIds.clear();
            this.notifySelection();
        }
        this.viewModeCallback?.(this.viewMode);
        this.clearCanvas();
    }

    /** Whether view mode (read-only) is active */
    get isViewMode() {
        return this.viewMode;
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
        return this.snapToGrid;
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
        if (!this.snapToGrid) return value;
        return Math.round(value / this.gridSize) * this.gridSize;
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
            if (s.id && !this.selectedIds.has(s.id)) continue;
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
        if (this.snapToGrid) {
            return {
                x: Math.round((sb.x + dx) / this.gridSize) * this.gridSize - sb.x,
                y: Math.round((sb.y + dy) / this.gridSize) * this.gridSize - sb.y,
            };
        }

        // Object snapping can be toggled off (Alt+S).
        if (!this.snapToObjects) return { x: dx, y: dy };

        const tolerance = 5;
        const cb = { x: sb.x + dx, y: sb.y + dy, w: sb.w, h: sb.h };
        const ourX = [cb.x, cb.x + cb.w / 2, cb.x + cb.w];
        const ourY = [cb.y, cb.y + cb.h / 2, cb.y + cb.h];
        let snappedX = dx;
        let snappedY = dy;
        let bestXDist = tolerance;
        let bestYDist = tolerance;

        for (const other of this.existingShapes) {
            if (other.id && this.selectedIds.has(other.id)) continue;
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
        return this.existingShapes.find((s) => s.id === id) ?? this.trash.find((s) => s.id === id);
    }

    /**
     * Find the nearest shape edge or center to bind an arrow endpoint to.
     *
     * Checks all non-arrow shapes and returns the closest binding target
     * within the snap distance threshold. Returns null if no shape is close enough.
     *
     * @param point - The arrow endpoint [x, y] in canvas coordinates
     * @param excludeId - Shape ID to exclude (prevents binding to self)
     * @returns Binding info { id, x, y } or null
     */
    private findNearestBinding(point: Point, excludeId?: string): { id: string; x: number; y: number } | null {
        const snapDist = 20 / this.viewport.zoom;
        let best: { id: string; x: number; y: number; dist: number } | null = null;

        for (const shape of this.existingShapes) {
            if (shape.type === "arrow" || shape.type === "line" || shape.type === "pencil" || shape.type === "eraser") continue;
            if (shape.id && shape.id === excludeId) continue;

            const bounds = getShapeBounds(shape);
            if (!bounds) continue;

            // Check center
            const cx = bounds.x + bounds.w / 2;
            const cy = bounds.y + bounds.h / 2;
            const dcx = point[0] - cx;
            const dcy = point[1] - cy;
            const distCenter = Math.sqrt(dcx * dcx + dcy * dcy);

            // Check 4 edge midpoints
            const edges = [
                { x: bounds.x + bounds.w / 2, y: bounds.y, dist: Math.sqrt((point[0] - (bounds.x + bounds.w / 2)) ** 2 + (point[1] - bounds.y) ** 2) },
                { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2, dist: Math.sqrt((point[0] - (bounds.x + bounds.w)) ** 2 + (point[1] - (bounds.y + bounds.h / 2)) ** 2) },
                { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h, dist: Math.sqrt((point[0] - (bounds.x + bounds.w / 2)) ** 2 + (point[1] - (bounds.y + bounds.h)) ** 2) },
                { x: bounds.x, y: bounds.y + bounds.h / 2, dist: Math.sqrt((point[0] - bounds.x) ** 2 + (point[1] - (bounds.y + bounds.h / 2)) ** 2) },
            ];

            const candidates = [
                { x: cx, y: cy, dist: distCenter },
                ...edges,
            ];

            for (const c of candidates) {
                if (c.dist < snapDist && (!best || c.dist < best.dist)) {
                    best = { id: shape.id!, x: c.x, y: c.y, dist: c.dist };
                }
            }
        }

        return best ? { id: best.id, x: best.x, y: best.y } : null;
    }

    /**
     * Update arrow endpoints that are bound to a moved shape.
     *
     * After a shape is dragged, all arrows with startBinding or endBinding
     * referencing that shape have their endpoints repositioned to the shape's
     * current edge/center.
     *
     * @param movedShapeId - The ID of the shape that was moved
     */
    private updateBoundArrows(movedShapeId: string) {
        const shape = this.shapeById(movedShapeId);
        if (!shape) return;
        const bounds = getShapeBounds(shape);
        if (!bounds) return;

        const cx = bounds.x + bounds.w / 2;
        const cy = bounds.y + bounds.h / 2;

        for (const s of this.existingShapes) {
            if (s.type !== "arrow") continue;

            if (s.startBinding === movedShapeId) {
                // Find closest edge of the moved shape
                const edges = [
                    { x: cx, y: bounds.y },
                    { x: bounds.x + bounds.w, y: cy },
                    { x: cx, y: bounds.y + bounds.h },
                    { x: bounds.x, y: cy },
                ];
                let best = edges[0];
                let bestDist = Infinity;
                for (const e of edges) {
                    const d = Math.sqrt((s.startX - e.x) ** 2 + (s.startY - e.y) ** 2);
                    if (d < bestDist) { bestDist = d; best = e; }
                }
                s.startX = best.x;
                s.startY = best.y;
            }

            if (s.endBinding === movedShapeId) {
                const edges = [
                    { x: cx, y: bounds.y },
                    { x: bounds.x + bounds.w, y: cy },
                    { x: cx, y: bounds.y + bounds.h },
                    { x: bounds.x, y: cy },
                ];
                let best = edges[0];
                let bestDist = Infinity;
                for (const e of edges) {
                    const d = Math.sqrt((s.endX - e.x) ** 2 + (s.endY - e.y) ** 2);
                    if (d < bestDist) { bestDist = d; best = e; }
                }
                s.endX = best.x;
                s.endY = best.y;
            }
        }
    }

    /**
     * Reposition a text shape that is bound to a container shape.
     *
     * Keeps the bound text centered (or aligned) within the container's
     * current bounds whenever the container is moved, resized, or otherwise
     * transformed.
     *
     * If the referenced text shape no longer exists, the binding is cleared.
     *
     * @param movedShapeId - The container shape ID whose bound text should be updated
     */
    private updateBoundText(movedShapeId: string) {
        const shape = this.shapeById(movedShapeId);
        if (!shape || !shape.boundTextId) return;
        const bounds = getShapeBounds(shape);
        if (!bounds) return;
        const textShape = this.existingShapes.find(s => s.id === shape.boundTextId && s.type === "text");
        if (!textShape) {
            delete shape.boundTextId;
            return;
        }
        const cx = bounds.x + bounds.w / 2;
        const cy = bounds.y + bounds.h / 2;
        if (textShape.textAlign === "center") {
            textShape.x = cx;
        } else if (textShape.textAlign === "right") {
            textShape.x = bounds.x + bounds.w;
        } else {
            textShape.x = bounds.x;
        }
        textShape.y = cy - textShape.fontSize / 2;
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
        if (this.selectedIds.size !== 1) return -1;
        const id = [...this.selectedIds][0];
        const shape = this.shapeById(id);
        if (!shape) return -1;
        const bounds = getShapeBounds(shape);
        if (!bounds) return -1;
        const handleSize = 8 / this.viewport.zoom;

        // Check rotation handle first (return special value)
        const rotationHandleY = bounds.y - 30 / this.viewport.zoom;
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
        return this.existingShapes.filter((s) => s.id && this.selectedIds.has(s.id));
    }

    /**
     * Get the first selected shape, or null if nothing is selected.
     * Used by the PropertiesPanel to display/edit the shape's style.
     */
    getSelectedShape(): Shape | null {
        if (this.selectedIds.size === 0) return null;
        const first = [...this.selectedIds][0];
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
        if (this.selectedIds.size === 0) return;
        const prev = [...this.existingShapes];
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            if (!shape.style) shape.style = { ...this.currentStyle };
            Object.assign(shape.style, updates);
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Set the active drawing tool.
     * Clears selection when switching away from the select tool.
     * @param tool - The tool to activate
     */
    setTool(tool: string) {
        if (this.selectedTool === tool) return;
        if (this._handMode && tool !== "hand") {
            this._previousTool = tool;
            this._handMode = false;
            this.spacePressed = false;
        }
        this.selectedTool = tool;
        this.toolChangeCallback?.(tool);
        this.removeTextOverlay();
        if (tool !== "laser") {
            this.clearLaser();
        }
        if (tool !== "select" && tool !== "hand") {
            this.selectedIds.clear();
            this.notifySelection();
            this.clearCanvas();
        }
    }

    /** Whether hand (pan) mode is currently active */
    get handMode(): boolean {
        return this._handMode;
    }

    /** Whether the canvas is locked (no selection/drag allowed) */
    get isLocked(): boolean {
        return this._locked;
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
        this._locked = !this._locked;
        if (this._locked) {
            this.isDragging = false;
            this.isSelecting = false;
            this.isResizing = false;
            this.isRotating = false;
            this.selectedIds.clear();
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
        if (this._handMode === active) return;
        this._handMode = active;
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
        return this.pluginRegistry.load(plugin);
    }

    unloadPlugin(pluginId: string): boolean {
        return this.pluginRegistry.unload(pluginId);
    }

    getLoadedPlugins(): Plugin[] {
        return this.pluginRegistry.getAllPlugins();
    }

    isToolRegistered(toolId: string): boolean {
        return this.pluginRegistry.isToolRegistered(toolId);
    }

    getPluginTools(): CustomToolDefinition[] {
        return this.pluginRegistry.getAllTools();
    }

    /**
     * The default solid canvas background color for the active theme.
     * Matches the `--canvas-background` design token in globals.css so
     * the canvas and the app frame share the same environment color.
     */
    private canvasBackgroundColor(): string {
        return this.isDark ? "rgb(18, 21, 27)" : "rgb(250, 250, 250)";
    }

    /**
     * Switch between dark and light theme.
     * Updates the default stroke color and canvas background (only when
     * the user has not customized the background) and re-renders.
     * Never modifies existing shapes or collaboration state.
     * @param isDark - `true` for dark mode, `false` for light
     */
    setTheme(isDark: boolean) {
        this.isDark = isDark;
        if (!this._styleCustomized) {
            this.currentStyle = defaultStyle(this.isDark);
        }
        if (!this._backgroundCustom && this._background.type === "solid") {
            this._background = { type: "dots", color: this.canvasBackgroundColor(), dotSize: 1.5, spacing: 20 };
        }
        this.themeChangeCallback?.(this.isDark);
        this.invalidateCache();
        this.clearCanvas();
    }

    /**
     * Update the current drawing style (applied to newly created shapes).
     * @param style - The new default style
     */
    setCurrentStyle(style: ShapeStyle) {
        this.currentStyle = style;
        this._styleCustomized = JSON.stringify(style) !== JSON.stringify(defaultStyle(this.isDark));
    }

    getStyle(): ShapeStyle {
        return this.currentStyle;
    }

    /**
     * Cycle through the available background styles:
     * solid → dots → crosses → plain → solid
     */
    cycleBackground() {
        const bg = this._background;
        let next: CanvasBackground;
        if (bg.type === "solid") {
            next = { type: "dots", color: bg.color, dotSize: 3, spacing: 20 };
        } else if (bg.type === "dots") {
            next = { type: "crosses", color: bg.color, crossSize: 3, spacing: 20 };
        } else if (bg.type === "crosses") {
            next = { type: "plain" };
        } else {
            next = { type: "solid", color: this.canvasBackgroundColor() };
        }
        this.setBackground(next);
    }

    /**
     * Set the canvas background style.
     * Marks the background as user-customized so theme changes stop
     * tracking it (the user's chosen background wins over the theme).
     * @param background - The new background configuration
     */
    setBackground(background: CanvasBackground) {
        this._background = background;
        this._backgroundCustom = true;
        this.invalidateCache();
        this.clearCanvas();
    }

    /** Zoom in by a factor of 1.2x centered on the viewport */
    zoomIn() {
        this.viewport.zoomIn(this.canvas.width, this.canvas.height);
        this.invalidateCache();
        this.clearCanvas();
    }

    /** Zoom out by a factor of 1.2x centered on the viewport */
    zoomOut() {
        this.viewport.zoomOut(this.canvas.width, this.canvas.height);
        this.invalidateCache();
        this.clearCanvas();
    }

    /** Zoom and pan to fit all shapes within the viewport */
    zoomToFit() {
        const bounds = this.getAllShapesBounds();
        this.viewport.zoomToFit(bounds, this.canvas.width, this.canvas.height);
        this.invalidateCache();
        this.clearCanvas();
    }

    /** Reset zoom to 100% and center the viewport */
    resetZoom() {
        this.viewport.zoom = 1;
        this.viewport.panX = 0;
        this.viewport.panY = 0;
        this.invalidateCache();
        this.clearCanvas();
    }

    /** Select all shapes on the canvas */
    selectAll() {
        this.selectedIds = new Set(this.existingShapes.map(s => s.id).filter((id): id is string => id !== undefined));
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

        for (const shape of this.existingShapes) {
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
            this.existingShapes = ensureShapesHaveStyle(
                shapes.filter((s) => s.type !== "eraser"),
            );
            this.lastSyncedShapes = structuredClone(this.existingShapes);
            this.lastSavedVersion = version;
            this.invalidateCache();
            this.clearCanvas();
            this.preloadImages();
        } catch (err) {
            console.error("Failed to load shapes:", err);
            this.existingShapes = [];
            this.clearCanvas();
        }
    }

    /**
     * Preload images from IndexedDB for any image shapes on the canvas.
     *
     * Scans the current shape array for image types and loads them from
     * IndexedDB into the in-memory cache so they render immediately.
     */
    private preloadImages() {
        for (const shape of this.existingShapes) {
            if (shape.type !== "image" || !shape.imageData) continue;
            if (!this.imageCache.has(shape.imageData)) {
                this.imageCache.getAsync(shape.imageData).then(img => {
                    if (img?.complete) {
                        this.invalidateCache();
                        this.clearCanvas();
                    }
                }).catch((err) => {
                    console.warn("Failed to preload image; will show placeholder", {
                        imageData: shape.imageData.slice(0, 64),
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
            }
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
     * Wire up WebSocket message handlers for real-time sync.
     *
     * Handles two message types:
     * - `shape-diff` — incremental adds/modifications/removals from other clients
     * - `chat` — full-state snapshots or individual shape additions (legacy)
     *
     * On receipt, shapes are merged, selection is cleared, and the canvas
     * is re-rendered.
     */
    initHandlers() {
        this.socket.onmessage = (event) => {
            let message: any;
            try {
                message = JSON.parse(event.data);
            } catch {
                return;
            }

            if (message.type === "shape-diff") {
                const { added, modified, removed } = message;

                if (Array.isArray(removed)) {
                    const removedSet = new Set(removed);
                    for (const id of removed) {
                        const idx = this.existingShapes.findIndex((s) => s.id === id);
                        if (idx !== -1) this.existingShapes.splice(idx, 1);
                    }
                    for (const s of this.existingShapes) {
                        if (s.boundTextId && removedSet.has(s.boundTextId)) {
                            delete s.boundTextId;
                        }
                    }
                }

                if (Array.isArray(added)) {
                    const existingIds = new Set(this.existingShapes.map(s => s.id).filter(Boolean));
                    for (const shape of ensureShapesHaveStyle(added)) {
                        if (shape.id && existingIds.has(shape.id)) continue;
                        this.existingShapes.push(shape);
                    }
                }

                if (Array.isArray(modified)) {
                    for (const shape of ensureShapesHaveStyle(modified)) {
                        if (!shape.id) continue;
                        const idx = this.existingShapes.findIndex((s) => s.id === shape.id);
                        if (idx !== -1) {
                            this.existingShapes[idx] = shape;
                        } else {
                            this.existingShapes.push(shape);
                        }
                    }
                }

                this.lastSyncedShapes = structuredClone(this.existingShapes);
                this.selectedIds.clear();
                this.notifySelection();
                this.invalidateCache();
                this.clearCanvas();
                return;
            }

            if (message.type === "chat") {
                let inner: any;
                try {
                    inner = JSON.parse(message.message);
                } catch {
                    return;
                }
                if (inner.type === "full-state") {
                    this.undoManager.clear();
                    this.existingShapes = ensureShapesHaveStyle(inner.shapes);
                    this.lastSyncedShapes = structuredClone(this.existingShapes);
                    this.selectedIds.clear();
                    this.notifySelection();
                    this.invalidateCache();
                    this.clearCanvas();
                } else {
                    inner.shape = ensureShapesHaveStyle([inner.shape])[0];
                    if (
                        !inner.shape.id ||
                        !this.existingShapes.some((s) => s.id === inner.shape.id)
                    ) {
                        this.existingShapes.push(inner.shape);
                        this.lastSyncedShapes = structuredClone(this.existingShapes);
                        this.selectedIds.clear();
                        this.notifySelection();
                        this.invalidateCache();
                        this.clearCanvas();
                    }
                }
            }

            if (message.type === "cursor") {
                const userId = message.userId;
                const cursor = message.cursor;
                if (userId && cursor && userId !== this.localCursorId) {
                    this.updateRemoteCursor(userId, cursor);
                }
            }
        };
    }

    /**
     * Mark the off-screen cache as stale, forcing a rebuild on next render.
     *
     * Call this whenever shapes change, the viewport transforms, or the
     * background style changes.
     */
    private invalidateCache() {
        this.cacheValid = false;
    }

    /**
     * Cancel any pending auto-save timer.
     *
     * Safe to call when no timer is active — simply returns in that case.
     */
    private cancelAutoSave() {
        if (this.autoSaveTimer !== null) {
            clearTimeout(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    /**
     * Schedule an auto-save with exponential backoff (2s → 30s max).
     * Handles 409 conflicts by merging remote and local shapes.
     */
    private scheduleAutoSave() {
        if (this.autoSaveDisabled) return;
        this.cancelAutoSave();
        const delay = Math.min(2000 * Math.pow(2, this.autoSaveRetries), 30_000);
        this.autoSaveTimer = setTimeout(() => this.performAutoSave(), delay);
    }

    /**
     * Save immediately, skipping the debounce.
     *
     * Used after destructive actions (e.g. delete) so a page reload
     * can never resurrect shapes from a stale server snapshot.
     */
    flushAutoSave() {
        if (this.autoSaveDisabled) return;
        this.cancelAutoSave();
        this.performAutoSave();
    }

    private async performAutoSave() {
        try {
            const res = await saveShapes(this.roomId, this.existingShapes, this.lastSavedVersion);
            this.lastSavedVersion = res.version ?? this.lastSavedVersion;
            this.autoSaveRetries = 0;
        } catch (err: any) {
            if (err?.response?.status === 409) {
                const remoteShapes: Shape[] = err.response.data.shapes ?? [];
                const syncedMap = new Map(this.lastSyncedShapes.map((s) => [s.id, s]));
                const localModified = new Set<string>();
                for (const s of this.existingShapes) {
                    if (!s.id) continue;
                    const prev = syncedMap.get(s.id);
                    if (!prev || JSON.stringify(prev) !== JSON.stringify(s)) {
                        localModified.add(s.id);
                    }
                }
                const remoteMap = new Map(remoteShapes.map((s) => [s.id, s]));
                const merged: Shape[] = [];
                for (const rs of remoteShapes) {
                    if (rs.id && localModified.has(rs.id)) {
                        const local = this.existingShapes.find((s) => s.id === rs.id);
                        merged.push(local ?? rs);
                    } else {
                        merged.push(rs);
                    }
                }
                for (const ls of this.existingShapes) {
                    if (ls.id && !remoteMap.has(ls.id)) merged.push(ls);
                }
                this.existingShapes = merged;
                this.lastSyncedShapes = structuredClone(merged);
                this.lastSavedVersion = err.response.data.version ?? this.lastSavedVersion;
                this.selectedIds.clear();
                this.notifySelection();
                this.invalidateCache();
                this.clearCanvas();
                this.autoSaveRetries = 0;
            } else if (err?.response?.status === 403) {
                // Guests can't persist (admin only) — stop retrying forever
                this.autoSaveDisabled = true;
                this.cancelAutoSave();
            } else {
                this.autoSaveRetries++;
            }
            if (!this.autoSaveDisabled) {
                this.scheduleAutoSave();
            }
        }
    }

    /**
     * Disable auto-save (e.g. for read-only rooms).
     *
     * Cancels any pending auto-save timer and prevents future saves
     * from being scheduled.
     */
    disableAutoSave() {
        this.autoSaveDisabled = true;
        this.cancelAutoSave();
    }

    /**
     * Re-render all shapes to the off-screen cache canvas.
     *
     * This is the expensive operation that {@link clearCanvas} avoids
     * re-running when the cache is still valid. The cache canvas is
     * sized to match the visible canvas and stores the fully rendered
     * scene at the current zoom and pan.
     */
    private buildCache() {
        this.cacheCanvas.width = this.canvas.width;
        this.cacheCanvas.height = this.canvas.height;
        this.cacheCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBackground(this.cacheCtx, this.cacheCanvas.width, this.cacheCanvas.height);
        this.cacheCtx.save();
        this.cacheCtx.translate(this.viewport.panX, this.viewport.panY);
        this.cacheCtx.scale(this.viewport.zoom, this.viewport.zoom);
        for (const shape of this.existingShapes) {
            renderShape(shape, this.cacheCtx, this.cacheRc, this.viewport.zoom, this.isDark, this.imageCache);
        }
        this.drawFrameHighlight();
        this.cacheCtx.restore();
        this.cacheValid = true;
    }

    /**
     * Draw a subtle highlight around shapes inside the selected frame.
     *
     * When a frame is selected, all non-frame shapes within its bounds
     * get a faint blue tint to visually group them with the frame.
     */
    private drawFrameHighlight() {
        const selected = this.getSelectedShape();
        if (!selected || selected.type !== "frame") return;
        const bounds = getShapeBounds(selected);
        if (!bounds) return;

        const zoom = this.viewport.zoom;
        this.cacheCtx.save();
        this.cacheCtx.strokeStyle = "rgba(59, 130, 246, 0.4)";
        this.cacheCtx.lineWidth = 1 / zoom;
        this.cacheCtx.setLineDash([4 / zoom, 4 / zoom]);

        for (const shape of this.existingShapes) {
            if (shape.type === "frame" || shape.id === selected.id) continue;
            const sb = getShapeBounds(shape);
            if (!sb) continue;
            if (sb.x >= bounds.x && sb.y >= bounds.y &&
                sb.x + sb.w <= bounds.x + bounds.w &&
                sb.y + sb.h <= bounds.y + bounds.h) {
                this.cacheCtx.strokeRect(sb.x, sb.y, sb.w, sb.h);
            }
        }
        this.cacheCtx.restore();
    }

    /**
     * Draw the canvas background based on the current background style.
     *
     * Renders solid fill, dot grid, cross grid, or transparent (plain)
     * backgrounds. Dot and cross grids are offset by the current pan
     * position so they appear fixed relative to the canvas.
     *
     * @param ctx - Target canvas 2D context
     * @param width - Width of the area to fill
     * @param height - Height of the area to fill
     */
    private drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
        const bg = this.background;
        if (bg.type === "solid") {
            ctx.fillStyle = bg.color;
            ctx.fillRect(0, 0, width, height);
        } else if (bg.type === "dots") {
            ctx.fillStyle = bg.color;
            ctx.fillRect(0, 0, width, height);
            const { dotSize = 1.5, spacing = 20 } = bg;
            const offsetX = ((this.viewport.panX % spacing) + spacing) % spacing;
            const offsetY = ((this.viewport.panY % spacing) + spacing) % spacing;
            ctx.fillStyle = this.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
            for (let x = offsetX; x < width; x += spacing) {
                for (let y = offsetY; y < height; y += spacing) {
                    ctx.beginPath();
                    ctx.arc(x, y, dotSize, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        } else if (bg.type === "crosses") {
            ctx.fillStyle = bg.color;
            ctx.fillRect(0, 0, width, height);
            const { crossSize, spacing = 20 } = bg;
            const offsetX = ((this.viewport.panX % spacing) + spacing) % spacing;
            const offsetY = ((this.viewport.panY % spacing) + spacing) % spacing;
            ctx.strokeStyle = this.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
            ctx.lineWidth = 1;
            for (let x = offsetX; x < width; x += spacing) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            for (let y = offsetY; y < height; y += spacing) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }
        } else if (bg.type === "plain") {
            ctx.clearRect(0, 0, width, height);
        }
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
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBackground(this.ctx, this.canvas.width, this.canvas.height);

        if (
            !this.cacheValid ||
            this.cacheCanvas.width !== this.canvas.width ||
            this.cacheCanvas.height !== this.canvas.height
        ) {
            this.buildCache();
        }
        this.ctx.drawImage(this.cacheCanvas, 0, 0);
        drawSelection(this.ctx, this.existingShapes, this.selectedIds, this.viewport);

        if (this.cropMode && this.cropRect) {
            this.ctx.save();
            this.ctx.translate(this.viewport.panX, this.viewport.panY);
            this.ctx.scale(this.viewport.zoom, this.viewport.zoom);
            const r = this.cropRect;
            this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            this.ctx.fillRect(r.x, r.y, r.w, r.h);
            this.ctx.strokeStyle = "#3b82f6";
            this.ctx.lineWidth = 2 / this.viewport.zoom;
            this.ctx.setLineDash([6 / this.viewport.zoom, 4 / this.viewport.zoom]);
            this.ctx.strokeRect(r.x, r.y, r.w, r.h);
            this.ctx.setLineDash([]);
            const corners = [
                { x: r.x, y: r.y },
                { x: r.x + r.w, y: r.y },
                { x: r.x + r.w, y: r.y + r.h },
                { x: r.x, y: r.y + r.h },
            ];
            const handleSize = 8 / this.viewport.zoom;
            for (const c of corners) {
                this.ctx.fillStyle = "#3b82f6";
                this.ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
            }
            this.ctx.restore();
        }

        this.drawRemoteCursors(this.ctx);
        this.drawLaserPointer(this.ctx);

        // Draw alignment guides
        if (this.alignmentGuides.length > 0) {
            this.ctx.save();
            this.ctx.translate(this.viewport.panX, this.viewport.panY);
            this.ctx.scale(this.viewport.zoom, this.viewport.zoom);
            this.ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
            this.ctx.lineWidth = 1 / this.viewport.zoom;
            this.ctx.setLineDash([4 / this.viewport.zoom, 4 / this.viewport.zoom]);
            for (const guide of this.alignmentGuides) {
                if (guide.x !== undefined) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(guide.x, 0);
                    this.ctx.lineTo(guide.x, this.canvas.height / this.viewport.zoom);
                    this.ctx.stroke();
                }
                if (guide.y !== undefined) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(0, guide.y);
                    this.ctx.lineTo(this.canvas.width / this.viewport.zoom, guide.y);
                    this.ctx.stroke();
                }
            }
            this.ctx.setLineDash([]);
            this.ctx.restore();
        }
    }

    /**
     * Rebuild the cache and re-render after a canvas resize.
     *
     * Call this when the canvas element's width or height changes
     * (e.g. on window resize).
     */
    resize() {
        this.invalidateCache();
        this.clearCanvas();
    }

    /**
     * Remove the text editing textarea overlay from the DOM.
     *
     * Delegates to {@link removeTextOverlayFn} and clears the local
     * reference. Safe to call when no overlay exists.
     */
    private removeTextOverlay() {
        removeTextOverlayFn(this.textEditOverlay);
        this.textEditOverlay = null;
    }

    /**
     * Compute a shape diff and broadcast it over WebSocket, then schedule auto-save.
     *
     * Compares the current shapes against {@link lastSyncedShapes} to compute
     * added, modified, and removed sets. If any changes exist, sends a
     * `shape-diff` message over the WebSocket and schedules an auto-save.
     */
    private syncShapes() {
        this.invalidateCache();
        this.clearCanvas();
        this.scheduleAutoSave();

        const added: Shape[] = [];
        const modified: Shape[] = [];
        const removed: string[] = [];

        const prevMap = new Map<string, Shape>();
        for (const s of this.lastSyncedShapes) {
            if (s.id) prevMap.set(s.id, s);
        }

        const seen = new Set<string>();
        for (const shape of this.existingShapes) {
            if (!shape.id) continue;
            seen.add(shape.id);
            const prev = prevMap.get(shape.id);
            if (!prev) {
                added.push(shape);
            } else if (!shapesEqual(prev, shape)) {
                modified.push(shape);
            }
        }
        for (const [id] of prevMap) {
            if (!seen.has(id)) removed.push(id);
        }

        if (added.length === 0 && modified.length === 0 && removed.length === 0) return;

        if (this.socket.readyState === WebSocket.OPEN) {
            try {
                this.socket.send(
                    JSON.stringify({
                        type: "shape-diff",
                        roomId: this.roomId,
                        added,
                        modified,
                        removed,
                    }),
                );
            } catch (err) {
                console.warn("Failed to send shape-diff", {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        this.lastSyncedShapes = structuredClone(this.existingShapes);
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
        this.commitShape({
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
        shape.id = uuid();
        if (!shape.style) {
            shape.style = { ...this.currentStyle };
        }
        const prev = [...this.existingShapes];
        this.existingShapes.push(shape);
        if (this.pendingBoundTextContainerId && shape.type === "text") {
            const container = this.existingShapes.find(s => s.id === this.pendingBoundTextContainerId);
            if (container) {
                container.boundTextId = shape.id;
            }
            this.pendingBoundTextContainerId = null;
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
        if (autoSwitchToSelect && !this.stayAfterDraw && !this._locked) {
            this.setTool("select");
        }
    }

    /**
     * Undo the last shape change and re-render.
     *
     * Restores the shape array to its previous state via the undo manager,
     * clears the selection, and syncs the changes.
     */
    undo() {
        const result = this.undoManager.undo(this.existingShapes);
        if (!result) return;
        this.removeTextOverlay();
        this.selectedIds.clear();
        this.notifySelection();
        this.cleanupTrash(this.existingShapes, result);
        this.existingShapes = result;
        this.syncShapes();
    }

    /**
     * Redo the last undone shape change and re-render.
     *
     * Re-applies the most recently undone change via the undo manager,
     * clears the selection, and syncs the changes.
     */
    redo() {
        const result = this.undoManager.redo(this.existingShapes);
        if (!result) return;
        this.removeTextOverlay();
        this.selectedIds.clear();
        this.notifySelection();

        const currentIds = new Set(this.existingShapes.map(s => s.id).filter(Boolean) as string[]);
        const nextIds = new Set(result.map(s => s.id).filter(Boolean) as string[]);
        for (const id of currentIds) {
            if (!nextIds.has(id)) {
                const shape = this.existingShapes.find(s => s.id === id);
                if (shape && !this.trash.some(s => s.id === id)) {
                    this.trash.push(structuredClone(shape));
                }
            }
        }

        this.cleanupTrash(this.existingShapes, result);
        this.existingShapes = result;
        this.syncShapes();
        this.notifyTrashChange();
    }

    /** Whether an undo step is available (for UI disabled states) */
    get canUndo(): boolean {
        return this.undoManager.canUndo;
    }

    /** Whether a redo step is available (for UI disabled states) */
    get canRedo(): boolean {
        return this.undoManager.canRedo;
    }

    /**
     * Remove shapes from trash that have been restored to existingShapes
     * by undo/redo.
     */
    private cleanupTrash(prevShapes: Shape[], nextShapes: Shape[]) {
        const prevIds = new Set(prevShapes.map(s => s.id).filter(Boolean) as string[]);
        const restoredIds = new Set<string>();
        for (const s of nextShapes) {
            if (s.id && !prevIds.has(s.id)) {
                restoredIds.add(s.id);
            }
        }
        if (restoredIds.size > 0) {
            this.trash = this.trash.filter(s => !restoredIds.has(s.id!));
        }
    }

    /** Notify listeners that the trash contents changed */
    private notifyTrashChange() {
        this.trashChangeCallback?.();
    }

    /**
     * Delete all selected shapes from the canvas.
     *
     * Skips locked shapes — they cannot be deleted. Moves deleted shapes
     * to the trash so they can be restored later. Pushes the change
     * to the undo stack and syncs via WebSocket.
     */
    deleteSelectedShape() {
        if (this.selectedIds.size === 0) return;
        const prev = [...this.existingShapes];
        const idsToRemove = new Set(this.selectedIds);
        const deleted: Shape[] = [];
        this.existingShapes = this.existingShapes.filter((s) => {
            if (!idsToRemove.has(s.id!)) return true;
            if (s.locked) return true;
            deleted.push(structuredClone(s));
            if (s.boundTextId) {
                idsToRemove.add(s.boundTextId);
            }
            return false;
        });
        this.existingShapes = this.existingShapes.filter((s) => {
            if (!idsToRemove.has(s.id!)) return true;
            if (s.locked) return true;
            deleted.push(structuredClone(s));
            return false;
        });
        for (const s of this.existingShapes) {
            if (s.boundTextId && idsToRemove.has(s.boundTextId)) {
                delete s.boundTextId;
            }
        }
        if (deleted.length > 0) {
            this.trash.push(...deleted);
            this.flushAutoSave();
        }
        this.undoManager.push(prev, this.existingShapes);
        this.selectedIds.clear();
        this.notifySelection();
        this.syncShapes();
        this.notifyTrashChange();
    }

    /**
     * Get all shapes currently in the trash.
     * @returns Array of deleted shapes available for restore
     */
    getTrash(): Shape[] {
        return [...this.trash];
    }

    /**
     * Restore a shape from the trash back to the canvas.
     * @param id - The shape ID to restore
     */
    restoreFromTrash(id: string) {
        const idx = this.trash.findIndex((s) => s.id === id);
        if (idx === -1) return;
        const shape = this.trash[idx];
        const prev = [...this.existingShapes];
        this.existingShapes.push(structuredClone(shape));
        this.trash.splice(idx, 1);
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
        this.notifyTrashChange();
    }

    /**
     * Permanently remove all shapes from the trash.
     * This action cannot be undone.
     */
    emptyTrash() {
        if (this.trash.length === 0) return;
        const prev = [...this.existingShapes];
        this.trash = [];
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
        this.notifyTrashChange();
    }

    /**
     * Copy all selected shapes to the internal clipboard.
     *
     * Deep-clones each selected shape so subsequent edits to the originals
     * do not affect the clipboard contents.
     */
    /**
     * Initialize BroadcastChannel for cross-tab clipboard sharing.
     *
     * When shapes are copied in one tab, they are broadcast to all other
     * tabs viewing the same room. Receiving tabs update their local clipboard
     * so the user can paste immediately.
     */
    private initClipboardChannel() {
        try {
            this.clipboardChannel = new BroadcastChannel(`codraw-clipboard-${this.roomId}`);
            this.clipboardChannel.onmessage = (event) => {
                if (event.data?.type === "copy" && Array.isArray(event.data.shapes)) {
                    this.clipboard = event.data.shapes;
                }
            };
        } catch {
            // BroadcastChannel not supported; cross-tab clipboard sharing is disabled
        }
    }

    copySelectedShape() {
        if (this.selectedIds.size === 0) return;
        this.clipboard = [];
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (shape) this.clipboard.push(JSON.parse(JSON.stringify(shape)));
        }
        this.broadcastClipboard();
    }

    private broadcastClipboard() {
        if (!this.clipboardChannel || this.clipboard.length === 0) return;
        try {
            this.clipboardChannel.postMessage({ type: "copy", shapes: this.clipboard });
        } catch {
            // Channel closed or unavailable
        }
    }

    /**
     * Paste clipboard contents with a 20px offset from originals.
     *
     * Deep-clones each clipboard shape, offsets it by 20px in both
     * directions, removes any group association, and commits it.
     */
    pasteClipboard() {
        if (this.clipboard.length === 0) return;
        const offset = 20;
        for (const original of this.clipboard) {
            const copy = JSON.parse(JSON.stringify(original)) as Shape;
            offsetShapeCopy(copy, offset);
            delete copy.groupId;
            this.commitShape(copy);
        }
    }

    /**
     * Duplicate selected shapes with a 20px offset.
     *
     * Unlike paste, this immediately commits the copies and selects them,
     * so the user can continue editing without a separate paste step.
     */
    duplicateSelected() {
        if (this.selectedIds.size === 0) return;
        const offset = 20;
        const prev = [...this.existingShapes];
        const newIds: string[] = [];
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const copy = JSON.parse(JSON.stringify(shape)) as Shape;
            offsetShapeCopy(copy, offset);
            delete copy.groupId;
            copy.id = uuid();
            if (!copy.style) copy.style = { ...this.currentStyle };
            this.existingShapes.push(copy);
            newIds.push(copy.id);
        }
        this.undoManager.push(prev, this.existingShapes);
        this.selectedIds = new Set(newIds);
        this.notifySelection();
        this.syncShapes();
    }

    /**
     * Set the arrowhead size for all selected arrow shapes.
     * @param size - Arrowhead size in pixels
     */
    setArrowHeadSize(size: number) {
        if (this.selectedIds.size === 0) return;
        const prev = [...this.existingShapes];
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (shape?.type === "arrow") {
                shape.arrowHeadSize = size;
            }
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Assign a web URL to all selected shapes.
     * @param url - The web URL to attach, or empty string to clear
     */
    setShapeUrl(url: string) {
        if (this.selectedIds.size === 0) return;
        const prev = [...this.existingShapes];
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (shape) shape.url = url || undefined;
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Rename the selected frame shape.
     *
     * @param name - New name for the frame
     */
    setFrameName(name: string) {
        if (this.selectedIds.size === 0) return;
        const prev = [...this.existingShapes];
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (shape?.type === "frame") {
                shape.name = name;
            }
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
        this.notifySelection();
    }

    /**
     * Enter image crop mode for the currently selected image.
     * Initializes the crop rectangle to the full image bounds.
     */
    startImageCrop() {
        if (this.selectedIds.size !== 1) return;
        const id = [...this.selectedIds][0];
        const shape = this.shapeById(id);
        if (!shape || shape.type !== "image") return;
        const bounds = getShapeBounds(shape);
        if (!bounds) return;
        this.cropMode = true;
        this.cropShapeId = id;
        this.cropRect = { ...bounds };
        this.cropDragCorner = null;
        this.cropStartRect = null;
        this.clearCanvas();
    }

    /**
     * Exit image crop mode without applying changes.
     */
    cancelImageCrop() {
        this.cropMode = false;
        this.cropShapeId = null;
        this.cropRect = null;
        this.cropDragCorner = null;
        this.cropStartRect = null;
        this.clearCanvas();
    }

    /**
     * Apply the current crop rectangle to the selected image.
     * Re-encodes the cropped region as a new data URL and updates the shape.
     */
    applyImageCrop() {
        if (!this.cropMode || !this.cropShapeId || !this.cropRect) return;
        const shape = this.shapeById(this.cropShapeId);
        if (!shape || shape.type !== "image") return;
        const img = this.imageCache.get(shape.imageData);
        if (!img || !img.complete) return;

        const bounds = getShapeBounds(shape);
        if (!bounds) return;

        const scaleX = img.naturalWidth / bounds.w;
        const scaleY = img.naturalHeight / bounds.h;
        const sx = Math.max(0, (this.cropRect.x - bounds.x) * scaleX);
        const sy = Math.max(0, (this.cropRect.y - bounds.y) * scaleY);
        const sw = Math.min(img.naturalWidth - sx, this.cropRect.w * scaleX);
        const sh = Math.min(img.naturalHeight - sy, this.cropRect.h * scaleY);

        if (sw <= 0 || sh <= 0) return;

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = Math.max(1, Math.round(sw));
        tempCanvas.height = Math.max(1, Math.round(sh));
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) return;
        tempCtx.drawImage(img, sx, sy, sw, sh, 0, 0, tempCanvas.width, tempCanvas.height);
        const newDataUrl = tempCanvas.toDataURL("image/png");

        const prev = structuredClone(this.existingShapes);
        shape.imageData = newDataUrl;
        shape.x = this.cropRect.x;
        shape.y = this.cropRect.y;
        shape.width = this.cropRect.w;
        shape.height = this.cropRect.h;
        this.imageCache.set(newDataUrl, img);

        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
        this.cancelImageCrop();
    }

    /**
     * Check whether the game is currently in image crop mode.
     */
    isInCropMode(): boolean {
        return this.cropMode;
    }

    /**
     * Get the current crop rectangle (canvas coordinates) for rendering.
     */
    getCropRect(): { x: number; y: number; w: number; h: number } | null {
        return this.cropRect;
    }

    /**
     * Set local user info for collaboration cursors.
     */
    setLocalUser(id: string, name: string, color: string) {
        this.localCursorId = id;
        this.localUserName = name;
        this.localUserColor = color;
    }

    /**
     * Broadcast the current pointer position to other users in the room.
     */
    broadcastCursor(x: number, y: number) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        if (this.cursorBroadcastTimer) {
            clearTimeout(this.cursorBroadcastTimer);
        }
        this.cursorBroadcastTimer = setTimeout(() => {
            try {
                this.socket.send(
                    JSON.stringify({
                        type: "cursor",
                        roomId: this.roomId,
                        cursor: { x, y, name: this.localUserName, color: this.localUserColor },
                    }),
                );
            } catch (err) {
                console.warn("Failed to send cursor position", {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            this.cursorBroadcastTimer = null;
        }, 16);
    }

    /**
     * Update a remote user's cursor position.
     */
    updateRemoteCursor(userId: string, cursor: { x: number; y: number; name: string; color: string }) {
        this.remoteCursors.set(userId, { ...cursor, lastSeen: Date.now() });
        this.invalidateCache();
        this.clearCanvas();
    }

    /**
     * Start the cursor cleanup interval.
     */
    startCursorCleanup() {
        this.cursorCleanupTimer = setInterval(() => {
            const now = Date.now();
            let changed = false;
            for (const [userId, cursor] of this.remoteCursors) {
                if (now - cursor.lastSeen > 5000) {
                    this.remoteCursors.delete(userId);
                    changed = true;
                }
            }
            if (changed) {
                this.invalidateCache();
                this.clearCanvas();
            }
        }, 1000);
    }

    /**
     * Draw remote collaboration cursors on the canvas.
     */
    private drawRemoteCursors(ctx: CanvasRenderingContext2D) {
        if (this.remoteCursors.size === 0) return;
        ctx.save();
        ctx.translate(this.viewport.panX, this.viewport.panY);
        ctx.scale(this.viewport.zoom, this.viewport.zoom);
        for (const cursor of this.remoteCursors.values()) {
            const size = 12 / this.viewport.zoom;
            const fontSize = 11 / this.viewport.zoom;
            ctx.fillStyle = cursor.color;
            ctx.beginPath();
            ctx.moveTo(cursor.x, cursor.y);
            ctx.lineTo(cursor.x + size, cursor.y + size * 2);
            ctx.lineTo(cursor.x + size * 0.6, cursor.y + size * 1.2);
            ctx.closePath();
            ctx.fill();
            ctx.font = `bold ${fontSize}px Arial`;
            const textWidth = ctx.measureText(cursor.name).width;
            const padding = 4 / this.viewport.zoom;
            const labelX = cursor.x + size;
            const labelY = cursor.y + size * 2;
            ctx.fillStyle = cursor.color;
            ctx.fillRect(labelX, labelY, textWidth + padding * 2, fontSize + padding * 2);
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(cursor.name, labelX + padding, labelY + fontSize / 2 + padding);
        }
        ctx.restore();
    }

    /**
     * Set the laser pointer position.
     */
    setLaserPosition(x: number, y: number) {
        this.laserPosition = { x, y };
        this.invalidateCache();
        this.clearCanvas();
    }

    /**
     * Hide the laser pointer.
     */
    clearLaser() {
        this.laserPosition = null;
        this.invalidateCache();
        this.clearCanvas();
    }

    /**
     * Set the laser pointer color.
     */
    setLaserColor(color: string) {
        this.laserColor = color;
        if (this.laserPosition) this.clearCanvas();
    }

    /**
     * Set the laser pointer size.
     */
    setLaserSize(size: number) {
        this.laserSize = size;
        if (this.laserPosition) this.clearCanvas();
    }

    /**
     * Draw the laser pointer overlay.
     */
    private drawLaserPointer(ctx: CanvasRenderingContext2D) {
        if (!this.laserPosition) return;
        ctx.save();
        ctx.translate(this.viewport.panX, this.viewport.panY);
        ctx.scale(this.viewport.zoom, this.viewport.zoom);
        const { x, y } = this.laserPosition;
        const size = this.laserSize;

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = this.laserColor;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2 / this.viewport.zoom;
        ctx.stroke();

        const glow = ctx.createRadialGradient(x, y, size * 0.5, x, y, size * 2.5);
        glow.addColorStop(0, this.laserColor + "80");
        glow.addColorStop(1, this.laserColor + "00");
        ctx.beginPath();
        ctx.arc(x, y, size * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        ctx.restore();
    }

    /**
     * Handle pasting external content from the system clipboard.
     *
     * Supports:
     * - `image/svg+xml` items
     * - `text/html` items that contain embedded SVG markup
     * - `image/png` / generic image items
     *
     * SVG/html sources are rendered to an offscreen canvas, converted to
     * PNG data URLs, and inserted as `image` shapes.
     * @returns `true` if external content was pasted, `false` otherwise
     */
    private async pasteExternal(e: ClipboardEvent): Promise<boolean> {
        if (!e.clipboardData) return false;
        const items = e.clipboardData.items;
        let svgItem: DataTransferItem | null = null;
        let imageItem: DataTransferItem | null = null;

        for (const item of items) {
            if (item.type === "image/svg+xml") {
                svgItem = item;
                break;
            }
            if (item.type.startsWith("image/") && !imageItem) {
                imageItem = item;
            }
        }

        const item = svgItem || imageItem;
        if (!item) return false;

        try {
            const blob = item.getAsFile();
            if (!blob) return false;
            const text = await blob.text();
            let svgText = text;
            if (item.type === "text/html") {
                const match = text.match(/<svg[\s\S]*?<\/svg>/i);
                if (!match) return false;
                svgText = match[0];
            }
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgText, "image/svg+xml");
            const svgEl = doc.querySelector("svg");
            if (!svgEl) return false;

            const width = parseFloat(svgEl.getAttribute("width") || "200");
            const height = parseFloat(svgEl.getAttribute("height") || "200");

            const svgBlob = new Blob([svgText], { type: "image/svg+xml" });
            const url = URL.createObjectURL(svgBlob);
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => {
                    URL.revokeObjectURL(url);
                    resolve();
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error("Failed to load SVG"));
                };
                img.src = url;
            });

            const maxDim = 600;
            const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
            const w = img.naturalWidth * scale;
            const h = img.naturalHeight * scale;

            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = Math.max(1, Math.round(w));
            tempCanvas.height = Math.max(1, Math.round(h));
            const tempCtx = tempCanvas.getContext("2d");
            if (!tempCtx) return false;
            tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
            const dataUrl = tempCanvas.toDataURL("image/png");

            const [cx, cy] = this.viewport.getCanvasCoords(
                this.canvas.width / 2,
                this.canvas.height / 2,
            );
            const prev = [...this.existingShapes];
            const shape: Shape = {
                type: "image",
                x: cx - w / 2,
                y: cy - h / 2,
                width: w,
                height: h,
                imageData: dataUrl,
                style: { ...this.currentStyle },
            };
            this.imageCache.set(dataUrl, img);
            this.commitShape(shape);
            return true;
        } catch {
            console.error("Failed to paste SVG");
            return false;
        }
    }

    /**
     * Assign a shared group ID to all selected shapes (minimum 2).
     *
     * Grouped shapes are selected and moved together. The group ID is
     * a random UUID generated at group time.
     */
    group() {
        if (this.selectedIds.size < 2) return;
        const groupId = uuid();
        const prev = [...this.existingShapes];
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (shape) shape.groupId = groupId;
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Remove the group ID from all selected shapes.
     *
     * After ungrouping, each shape can be selected and moved independently.
     */
    ungroup() {
        if (this.selectedIds.size === 0) return;
        const prev = [...this.existingShapes];
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (shape) delete shape.groupId;
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Bring selected shapes forward by one step in the z-order.
     *
     * Swaps each selected shape with the shape immediately above it
     * (higher index) in the shapes array. Shapes already at the top
     * remain unchanged.
     */
    bringForward() {
        if (this.selectedIds.size === 0) return;
        const prev = [...this.existingShapes];
        const shapes = this.existingShapes;
        for (let i = shapes.length - 2; i >= 0; i--) {
            if (shapes[i].id && this.selectedIds.has(shapes[i].id!) && shapes[i + 1].id && !this.selectedIds.has(shapes[i + 1].id!)) {
                [shapes[i], shapes[i + 1]] = [shapes[i + 1], shapes[i]];
            }
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Send selected shapes backward by one step in the z-order.
     *
     * Swaps each selected shape with the shape immediately below it
     * (lower index) in the shapes array. Shapes already at the bottom
     * remain unchanged.
     */
    sendBackward() {
        if (this.selectedIds.size === 0) return;
        const prev = [...this.existingShapes];
        const shapes = this.existingShapes;
        for (let i = 1; i < shapes.length; i++) {
            if (shapes[i].id && this.selectedIds.has(shapes[i].id!) && shapes[i - 1].id && !this.selectedIds.has(shapes[i - 1].id!)) {
                [shapes[i], shapes[i - 1]] = [shapes[i - 1], shapes[i]];
            }
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Bring selected shapes to the front (top of z-order).
     *
     * Moves all selected shapes to the end of the shapes array,
     * so they are rendered last (on top of everything else).
     */
    bringToFront() {
        if (this.selectedIds.size === 0) return;
        const prev = [...this.existingShapes];
        const selected = this.existingShapes.filter(s => s.id && this.selectedIds.has(s.id));
        const rest = this.existingShapes.filter(s => !s.id || !this.selectedIds.has(s.id));
        this.existingShapes = [...rest, ...selected];
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Send selected shapes to the back (bottom of z-order).
     *
     * Moves all selected shapes to the beginning of the shapes array,
     * so they are rendered first (behind everything else).
     */
    sendToBack() {
        if (this.selectedIds.size === 0) return;
        const prev = [...this.existingShapes];
        const selected = this.existingShapes.filter(s => s.id && this.selectedIds.has(s.id));
        const rest = this.existingShapes.filter(s => !s.id || !this.selectedIds.has(s.id));
        this.existingShapes = [...selected, ...rest];
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Align selected shapes to the left edge of the leftmost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved horizontally
     * so its left edge matches the minimum left edge across all selections.
     */
    alignLeft() {
        if (this.selectedIds.size < 2) return;
        const prev = [...this.existingShapes];
        let minX = Infinity;
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            minX = Math.min(minX, bounds.x);
        }
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            moveShape(shape, minX - bounds.x, 0);
        }
        for (const id of this.selectedIds) {
            this.updateBoundText(id);
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Align selected shapes to the right edge of the rightmost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved horizontally
     * so its right edge matches the maximum right edge across all selections.
     */
    alignRight() {
        if (this.selectedIds.size < 2) return;
        const prev = [...this.existingShapes];
        let maxX = -Infinity;
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            maxX = Math.max(maxX, bounds.x + bounds.w);
        }
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            moveShape(shape, maxX - (bounds.x + bounds.w), 0);
        }
        for (const id of this.selectedIds) {
            this.updateBoundText(id);
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Align selected shapes to the horizontal center of the selection.
     *
     * Requires at least 2 selected shapes. Each shape is moved horizontally
     * so its center aligns with the average center X of all selections.
     */
    alignCenter() {
        if (this.selectedIds.size < 2) return;
        const prev = [...this.existingShapes];
        let sumCenterX = 0;
        let count = 0;
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            sumCenterX += bounds.x + bounds.w / 2;
            count++;
        }
        if (count === 0) return;
        const targetX = sumCenterX / count;
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            const shapeCenterX = bounds.x + bounds.w / 2;
            moveShape(shape, targetX - shapeCenterX, 0);
        }
        for (const id of this.selectedIds) {
            this.updateBoundText(id);
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Evenly space selected shapes horizontally.
     *
     * Requires at least 3 selected shapes. Sorts by X position, then
     * redistributes the shapes so the gaps between them are equal.
     * The leftmost and rightmost shapes stay in place.
     */
    distributeHorizontal() {
        if (this.selectedIds.size < 3) return;
        const prev = [...this.existingShapes];
        const selected = [];
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            selected.push({ shape, bounds });
        }
        if (selected.length < 3) return;
        selected.sort((a, b) => a.bounds.x - b.bounds.x);
        const totalWidth = (selected[selected.length - 1].bounds.x + selected[selected.length - 1].bounds.w) - selected[0].bounds.x;
        const totalShapesWidth = selected.reduce((sum, s) => sum + s.bounds.w, 0);
        const gap = (totalWidth - totalShapesWidth) / (selected.length - 1);
        let currentX = selected[0].bounds.x;
        for (const { shape, bounds } of selected) {
            const dx = currentX - bounds.x;
            moveShape(shape, dx, 0);
            currentX += bounds.w + gap;
        }
        for (const id of this.selectedIds) {
            this.updateBoundText(id);
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Evenly space selected shapes vertically.
     *
     * Requires at least 3 selected shapes. Sorts by Y position, then
     * redistributes the shapes so the gaps between them are equal.
     * The topmost and bottommost shapes stay in place.
     */
    distributeVertical() {
        if (this.selectedIds.size < 3) return;
        const prev = [...this.existingShapes];
        const selected = [];
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            selected.push({ shape, bounds });
        }
        if (selected.length < 3) return;
        selected.sort((a, b) => a.bounds.y - b.bounds.y);
        const totalHeight = (selected[selected.length - 1].bounds.y + selected[selected.length - 1].bounds.h) - selected[0].bounds.y;
        const totalShapesHeight = selected.reduce((sum, s) => sum + s.bounds.h, 0);
        const gap = (totalHeight - totalShapesHeight) / (selected.length - 1);
        let currentY = selected[0].bounds.y;
        for (const { shape, bounds } of selected) {
            const dy = currentY - bounds.y;
            moveShape(shape, 0, dy);
            currentY += bounds.h + gap;
        }
        for (const id of this.selectedIds) {
            this.updateBoundText(id);
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Align selected shapes to the top edge of the topmost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved vertically
     * so its top edge matches the minimum top edge across all selections.
     */
    alignTop() {
        if (this.selectedIds.size < 2) return;
        const prev = [...this.existingShapes];
        let minY = Infinity;
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            minY = Math.min(minY, bounds.y);
        }
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            moveShape(shape, 0, minY - bounds.y);
        }
        for (const id of this.selectedIds) {
            this.updateBoundText(id);
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Align selected shapes to the bottom edge of the bottommost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved vertically
     * so its bottom edge matches the maximum bottom edge across all selections.
     */
    alignBottom() {
        if (this.selectedIds.size < 2) return;
        const prev = [...this.existingShapes];
        let maxY = -Infinity;
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            maxY = Math.max(maxY, bounds.y + bounds.h);
        }
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            moveShape(shape, 0, maxY - (bounds.y + bounds.h));
        }
        for (const id of this.selectedIds) {
            this.updateBoundText(id);
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Zoom and pan the viewport to fit the current selection.
     *
     * Computes the union bounds of all selected shapes and fits them
     * with the same padding as {@link zoomToFit}. No-op when nothing
     * is selected.
     */
    zoomToSelection() {
        if (this.selectedIds.size === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const id of this.selectedIds) {
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
        this.viewport.zoomToFit(
            { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
            this.canvas.width,
            this.canvas.height,
        );
        this.invalidateCache();
        this.clearCanvas();
    }

    /**
     * Cut selected shapes — copy to the clipboard, then delete them.
     * Bound to Ctrl/Cmd+X.
     */
    cutSelectedShape() {
        this.copySelectedShape();
        this.deleteSelectedShape();
    }

    /**
     * Copy the style of the first selected shape for pasting onto others.
     * Bound to Ctrl/Cmd+Alt+C.
     */
    copySelectedStyles() {
        const shape = this.getSelectedShape();
        if (!shape || !shape.style) return;
        this.copiedStyle = { ...shape.style };
    }

    /**
     * Apply the previously copied style to all selected shapes.
     * Bound to Ctrl/Cmd+Alt+V.
     */
    pasteSelectedStyles() {
        if (!this.copiedStyle) return;
        this.updateShapeStyle({ ...this.copiedStyle });
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
        if (this.selectedIds.size === 0) return;
        const prev = [...this.existingShapes];
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape || shape.locked) continue;
            const b = getShapeBounds(shape);
            if (!b) continue;
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            if (horizontal) {
                if (shape.type === "arrow") {
                    shape.startX = 2 * cx - shape.startX;
                    shape.endX = 2 * cx - shape.endX;
                } else if ((shape.type === "line" || shape.type === "pencil") && shape.points) {
                    for (const p of shape.points) p[0] = 2 * cx - p[0];
                    if (shape.type === "line") {
                        shape.startX = 2 * cx - shape.startX;
                        shape.endX = 2 * cx - shape.endX;
                    }
                } else if (shape.type === "rect" || shape.type === "image" || shape.type === "stickyNote" || shape.type === "frame") {
                    shape.x = 2 * cx - shape.x - shape.width;
                }
            } else {
                if (shape.type === "arrow") {
                    shape.startY = 2 * cy - shape.startY;
                    shape.endY = 2 * cy - shape.endY;
                } else if ((shape.type === "line" || shape.type === "pencil") && shape.points) {
                    for (const p of shape.points) p[1] = 2 * cy - p[1];
                    if (shape.type === "line") {
                        shape.startY = 2 * cy - shape.startY;
                        shape.endY = 2 * cy - shape.endY;
                    }
                } else if (shape.type === "rect" || shape.type === "image" || shape.type === "stickyNote" || shape.type === "frame") {
                    shape.y = 2 * cy - shape.y - shape.height;
                }
            }
        }
        this.undoManager.push(prev, this.existingShapes);
        this.invalidateCache();
        this.clearCanvas();
        this.syncShapes();
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
        const [cx, cy] = this.viewport.getCanvasCoords(
            this.canvas.width / 2,
            this.canvas.height / 2,
        );
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                const img = new Image();
                img.onload = () => {
                    const w = img.naturalWidth;
                    const h = img.naturalHeight;
                    const maxDim = 400;
                    const scale = Math.min(1, maxDim / Math.max(w, h));
                    this.imageCache.set(dataUrl, img);
                    this.commitShape({
                        type: "image",
                        x: cx - (w * scale) / 2,
                        y: cy - (h * scale) / 2,
                        width: w * scale,
                        height: h * scale,
                        imageData: dataUrl,
                    });
                };
                img.src = dataUrl;
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    /**
     * Enter-key action: create text at the viewport center with the text
     * tool, or edit the selected text shape / arrow label in select mode.
     */
    enterEditAction() {
        if (this.selectedTool === "text" && !this.textEditOverlay) {
            const [cx, cy] = this.viewport.getCanvasCoords(
                this.canvas.width / 2,
                this.canvas.height / 2,
            );
            this.startTextEdit(cx, cy, undefined, undefined, {
                bold: this._textBold,
                italic: this._textItalic,
                fontFamily: this._textFontFamily,
                fontSize: this._textFontSize,
                textAlign: this._textAlign,
            });
            return;
        }
        if (this.selectedIds.size === 0) return;
        const shape = this.getSelectedShape();
        if (!shape) return;
        if (shape.type === "text") {
            this.startTextEdit(shape.x, shape.y, shape.text, this.existingShapes.indexOf(shape), {
                bold: shape.bold,
                italic: shape.italic,
                fontFamily: shape.fontFamily,
                fontSize: shape.fontSize,
                textAlign: shape.textAlign || "left",
            });
        } else if (shape.type === "arrow") {
            const label = prompt("Enter arrow label:", shape.label ?? "");
            if (label !== null) {
                const prev = structuredClone(this.existingShapes);
                shape.label = label || undefined;
                this.undoManager.push(prev, this.existingShapes);
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
        const next = !this.isDark;
        document.documentElement.classList.toggle("dark", next);
        localStorage.setItem("theme", next ? "dark" : "light");
        this.setTheme(next);
    }

    /**
     * Copy the current selection as a PNG image to the clipboard.
     * Bound to Shift+Alt+C.
     */
    async copySelectionAsPng() {
        const shapes = this.existingShapes.filter((s) => s.id && this.selectedIds.has(s.id));
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
        ctx.fillStyle = this.isDark ? "#000" : "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.translate(-x, -y);
        const rc = rough.canvas(offscreen);
        for (const shape of shapes) {
            renderShape(shape, ctx, rc, 1, this.isDark, this.imageCache);
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
        if (this.selectedIds.size === 0) return;
        const prev = [...this.existingShapes];
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (shape) shape.locked = true;
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Unlock selected shapes so they can be moved and edited again.
     *
     * Removes the `locked` flag from each selected shape, making them
     * eligible for hit-testing, dragging, and deletion.
     */
    unlockShapes() {
        if (this.selectedIds.size === 0) return;
        const prev = [...this.existingShapes];
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (shape) delete shape.locked;
        }
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
    }

    /**
     * Export the canvas as a PNG image download.
     *
     * Renders all shapes to an offscreen canvas at 1:1 scale and
     * triggers a browser download of the resulting PNG file.
     */
    exportToPng() {
        exportToPng(this.existingShapes, this.isDark, this.imageCache);
    }

    /**
     * Export the canvas as an SVG image download.
     *
     * Builds an SVG DOM from all shapes, serializes it, and triggers
     * a browser download of the resulting SVG file.
     */
    exportToSvg() {
        exportToSvg(this.existingShapes, this.isDark);
    }

    /**
     * Export the canvas shapes as a JSON file download.
     *
     * Serializes the shape array as pretty-printed JSON and triggers
     * a browser download. The JSON can be re-imported via {@link importFromJson}.
     */
    exportToJson() {
        exportToJson(this.existingShapes);
    }

    /**
     * Import shapes from a JSON string (file or clipboard).
     * Replaces all existing shapes with the imported ones.
     * @param jsonString - JSON string containing shapes
     */
    importFromJson(jsonString: string) {
        try {
            const parsed = JSON.parse(jsonString);
            const shapes = parsed.shapes ?? (Array.isArray(parsed) ? parsed : [parsed]);
            const prev = [...this.existingShapes];
            this.existingShapes = ensureShapesHaveStyle(
                shapes.filter((s: Shape) => s.type !== "eraser"),
            );
            this.undoManager.push(prev, this.existingShapes);
            this.selectedIds.clear();
            this.notifySelection();
            this.syncShapes();
        } catch {
            console.error("Invalid JSON file");
        }
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
        this.textEditOverlay = startTextEdit(
            canvasX,
            canvasY,
            this.viewport.zoom,
            this.viewport.panX,
            this.viewport.panY,
            this.isDark,
            existingText,
            existingIndex,
            {
                removeTextOverlay: () => this.removeTextOverlay(),
                pushUndo: (prev) => this.undoManager.push(prev, this.existingShapes),
                syncShapes: () => this.syncShapes(),
                commitShape: (shape) => this.commitShape(shape),
                setClicked: (v) => (this.clicked = v),
                invalidateAndRedraw: () => {
                    this.invalidateCache();
                    this.clearCanvas();
                },
                onTextCleared: (textIndex) => {
                    const textShape = this.existingShapes[textIndex];
                    if (!textShape || textShape.type !== "text") return;
                    const container = this.existingShapes.find(
                        s => s.boundTextId === textShape.id,
                    );
                    if (container) {
                        delete container.boundTextId;
                    }
                    const prev = [...this.existingShapes];
                    this.existingShapes = this.existingShapes.filter(s => s.id !== textShape.id);
                    this.undoManager.push(prev, this.existingShapes);
                    this.syncShapes();
                },
                onTextEditCancelled: () => {
                    this.pendingBoundTextContainerId = null;
                },
            },
            this.existingShapes,
            textStyle,
        );
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
            this.panStartX = e.clientX - this.viewport.panX;
            this.panStartY = e.clientY - this.viewport.panY;
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
        if (this.viewMode) return;
        this.isSelecting = false;
        this.isResizing = false;
        this.isRotating = false;
        this.clicked = true;
        this.lastPointerX = clientX;
        this.lastPointerY = clientY;
        const coords = this.viewport.getCanvasCoords(clientX, clientY);
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

        if (this.cropMode && this.cropRect) {
            const handleSize = 8 / this.viewport.zoom;
            const corners = [
                { x: this.cropRect.x, y: this.cropRect.y },
                { x: this.cropRect.x + this.cropRect.w, y: this.cropRect.y },
                { x: this.cropRect.x + this.cropRect.w, y: this.cropRect.y + this.cropRect.h },
                { x: this.cropRect.x, y: this.cropRect.y + this.cropRect.h },
            ];
            for (let i = 0; i < corners.length; i++) {
                const dx = coords[0] - corners[i].x;
                const dy = coords[1] - corners[i].y;
                if (dx * dx + dy * dy <= handleSize * handleSize) {
                    this.cropDragCorner = i;
                    this.cropStartRect = { ...this.cropRect };
                    return;
                }
            }
            return;
        }

        const pluginTool = this.pluginRegistry.getTool(this.selectedTool);
        if (pluginTool?.onMouseDown) {
            const ctx = this.pluginRegistry.getContext();
            if (ctx) {
                pluginTool.onMouseDown(ctx, coords[0], coords[1], e);
                return;
            }
        }

        if (this.selectedTool === "select") {
            const lockedIds = new Set(this.existingShapes.filter(s => s.locked).map(s => s.id!));
            const hit = hitTest(coords, this.existingShapes, this.viewport.zoom, lockedIds);

            // Check for resize handle click
            if (this.selectedIds.size === 1) {
                const handleIdx = this.hitTestResizeHandle(coords);
                if (handleIdx === -2) {
                    // Rotation handle (sits above the shape, so hitTest on
                    // the shape itself returns null — check it independently)
                    const id = [...this.selectedIds][0];
                    const shape = this.shapeById(id);
                    if (shape) {
                        const bounds = getShapeBounds(shape);
                        if (bounds) {
                            const cx = bounds.x + bounds.w / 2;
                            const cy = bounds.y + bounds.h / 2;
                            this.isRotating = true;
                            this.rotateStartAngle = Math.atan2(coords[1] - cy, coords[0] - cx);
                            this.rotateStartRotation = shape.rotation ?? 0;
                            this.dragStartShapes = structuredClone(this.existingShapes);
                            return;
                        }
                    }
                } else if (handleIdx !== -1) {
                    const id = [...this.selectedIds][0];
                    const shape = this.shapeById(id);
                    if (shape) {
                        this.isResizing = true;
                        this.resizeHandle = handleIdx;
                        this.resizeShiftKey = shiftKey;
                        this.resizeStartBounds = getShapeBounds(shape);
                        this.dragStartShapes = structuredClone(this.existingShapes);
                        return;
                    }
                }
            }

            if (hit !== null) {
                const hitShape = this.existingShapes[hit];

                if (shiftKey) {
                    if (this.selectedIds.has(hitShape.id!)) {
                        this.selectedIds.delete(hitShape.id!);
                    } else {
                        this.selectedIds.add(hitShape.id!);
                    }
                    this.notifySelection();
                    this.clearCanvas();
                    return;
                }

                // Deep select (Ctrl/Cmd+click) picks the individual shape
                // even when it belongs to a group.
                if (hitShape.groupId && !(e.metaKey || e.ctrlKey)) {
                    this.selectedIds = new Set();
                    for (const s of this.existingShapes) {
                        if (s.groupId === hitShape.groupId && s.id) {
                            this.selectedIds.add(s.id);
                        }
                    }
                } else {
                    this.selectedIds = new Set([hitShape.id!]);
                }
                this.notifySelection();
                this.isDragging = true;
                this.dragOffsetX = coords[0];
                this.dragOffsetY = coords[1];
                this.dragStartShapes = structuredClone(this.existingShapes);
                this.dragStartPoint = { x: coords[0], y: coords[1] };
                this.lastSnappedDelta = { x: 0, y: 0 };
                this.dragStartBounds = this.selectionBounds(this.dragStartShapes);
            } else {
                this.selectedIds.clear();
                this.notifySelection();
                this.isSelecting = true;
                this.dragOffsetX = 0;
                this.dragOffsetY = 0;
            }
            return;
        }

        if (this.selectedTool === "text") {
            const hit = hitTest(coords, this.existingShapes, this.viewport.zoom);
            if (hit !== null) {
                const shape = this.existingShapes[hit];
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
                bold: this._textBold,
                italic: this._textItalic,
                fontFamily: this._textFontFamily,
                fontSize: this._textFontSize,
                textAlign: this._textAlign,
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
                        this.commitShape({
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
            const hit = hitTest(coords, this.existingShapes, this.viewport.zoom);
            if (hit !== null) {
                const shape = this.existingShapes[hit];
                if (shape.style?.strokeColor) {
                    this.currentStyle = { ...this.currentStyle, strokeColor: shape.style.strokeColor };
                    this._styleCustomized = true;
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
            this.alignmentGuides = [];
            this.clearCanvas();
            return;
        }
        if (this.cropMode && this.cropDragCorner !== null) {
            this.cropDragCorner = null;
            this.cropStartRect = null;
            this.clearCanvas();
            return;
        }

        if (this.isResizing) {
            this.isResizing = false;
            this.resizeHandle = -1;
            this.resizeStartBounds = null;
            if (this.dragStartShapes) {
                this.undoManager.push(this.dragStartShapes, this.existingShapes);
                this.dragStartShapes = null;
            }
            this.syncShapes();
            return;
        }

        if (this.isRotating) {
            this.isRotating = false;
            if (this.dragStartShapes) {
                this.undoManager.push(this.dragStartShapes, this.existingShapes);
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
                for (let i = 0; i < this.existingShapes.length; i++) {
                    const shape = this.existingShapes[i];
                    const bounds = getShapeBounds(shape);
                    if (bounds) {
                        const overlap =
                            bounds.x < selX + selW &&
                            bounds.x + bounds.w > selX &&
                            bounds.y < selY + selH &&
                            bounds.y + bounds.h > selY;
                        if (overlap && shape.id) this.selectedIds.add(shape.id);
                    }
                }
                this.notifySelection();
                this.clearCanvas();
            } else if (this.selectedIds.size > 0) {
                if (this.dragStartShapes) {
                    this.undoManager.push(this.dragStartShapes, this.existingShapes);
                    this.dragStartShapes = null;
                }
                this.alignmentGuides = [];
                this.syncShapes();
            }
            return;
        }

        if (this.selectedTool === "pen") {
            if (this.constantPenPoints.length < 2) return;
            this.commitShape({
                type: "pencil",
                points: [...this.constantPenPoints],
                constantWidth: true,
            });
            this.constantPenPoints = [];
            return;
        }

        if (this.selectedTool === "eraser") {
            if (this.eraserPoints.length === 0) return;

            const prev = [...this.existingShapes];
            this.existingShapes = this.existingShapes.filter(
                (shape) => !eraserIntersectsShape(this.eraserPoints, shape, this.eraserRadius),
            );
            this.undoManager.push(prev, this.existingShapes);
            this.selectedIds.clear();
            this.notifySelection();
            this.eraserPoints = [];
            this.syncShapes();
            return;
        }

        const rawCoords = this.viewport.getCanvasCoords(this.lastPointerX, this.lastPointerY);
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
            const startBind = this.findNearestBinding([this.startX, this.startY]);
            const endBind = this.findNearestBinding([coords[0], coords[1]], startBind?.id);
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
            const frameCount = this.existingShapes.filter(s => s.type === "frame").length;
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
        this.commitShape(shape, true);
    }

    /**
     * Handle mouse move — pan, draw preview, drag shapes, or extend eraser.
     *
     * If panning, updates the viewport pan offset. Otherwise delegates
     * to {@link handlePointerMove} for tool-specific behavior.
     */
    mouseMoveHandler = (e: MouseEvent) => {
        const coords = this.viewport.getCanvasCoords(e.clientX, e.clientY);
        this.broadcastCursor(coords[0], coords[1]);

        // Show a caret preview for the text tool even between clicks.
        if (this.selectedTool === "text" && !this.textEditOverlay) {
            this.clearCanvas();
            this.ctx.save();
            this.ctx.translate(this.viewport.panX, this.viewport.panY);
            this.ctx.scale(this.viewport.zoom, this.viewport.zoom);
            this.ctx.font = `${this._textFontSize}px ${this._textFontFamily}`;
            this.ctx.fillStyle = this.currentStyle.strokeColor;
            this.ctx.globalAlpha = 0.5;
            this.ctx.fillText("|", coords[0], coords[1]);
            this.ctx.restore();
            return;
        }

        if (this.selectedTool === "laser") {
            this.setLaserPosition(coords[0], coords[1]);
            return;
        }

        const pluginToolMove = this.pluginRegistry.getTool(this.selectedTool);
        if (pluginToolMove?.onMouseMove && this.clicked) {
            const ctx = this.pluginRegistry.getContext();
            if (ctx) {
                pluginToolMove.onMouseMove(ctx, coords[0], coords[1], e);
                return;
            }
        }

        if (this.isPanning) {
            this.viewport.panX = e.clientX - this.panStartX;
            this.viewport.panY = e.clientY - this.panStartY;
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
        if (this.viewMode) return;
        this.lastPointerX = clientX;
        this.lastPointerY = clientY;
        const coords = this.viewport.getCanvasCoords(clientX, clientY);

        // Show the in-progress polyline with a rubber-band tail, even
        // between clicks (no button pressed).
        if (this.selectedTool === "line" && this.isDrawingPolyline && this.polylinePoints.length > 0) {
            this.clearCanvas();
            this.ctx.save();
            this.ctx.translate(this.viewport.panX, this.viewport.panY);
            this.ctx.scale(this.viewport.zoom, this.viewport.zoom);
            const pts = this.polylinePoints;
            this.ctx.beginPath();
            this.ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) {
                this.ctx.lineTo(pts[i][0], pts[i][1]);
            }
            this.ctx.lineTo(this.snap(coords[0]), this.snap(coords[1]));
            this.ctx.strokeStyle = this.currentStyle.strokeColor;
            this.ctx.lineWidth = this.currentStyle.strokeWidth;
            this.ctx.globalAlpha = this.currentStyle.opacity;
            this.ctx.stroke();
            this.ctx.restore();
        }

        if (!this.clicked) return;

        if (this.cropMode && this.cropRect && this.cropDragCorner !== null && this.cropStartRect) {
            const s = this.cropStartRect;
            const opp = [
                { x: s.x + s.w, y: s.y + s.h },
                { x: s.x, y: s.y + s.h },
                { x: s.x, y: s.y },
                { x: s.x + s.w, y: s.y },
            ];
            const o = opp[this.cropDragCorner];
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
            this.cropRect = { x, y, w, h };
            this.clearCanvas();
            return;
        }

        const pluginToolMove = this.pluginRegistry.getTool(this.selectedTool);
        if (pluginToolMove?.onMouseMove) {
            const ctx = this.pluginRegistry.getContext();
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
            this.ctx.translate(this.viewport.panX, this.viewport.panY);
            this.ctx.scale(this.viewport.zoom, this.viewport.zoom);
            drawDragSelect(this.ctx, this.startX, this.startY, coords[0], coords[1], this.viewport);
            this.ctx.restore();
            return;
        }

        if (this.selectedTool === "select" && this.isResizing && this.resizeStartBounds) {
            const id = [...this.selectedIds][0];
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

            this.updateBoundText(id);
            this.updateBoundArrows(id);

            this.invalidateCache();
            this.clearCanvas();
            return;
        }

        if (this.selectedTool === "select" && this.isRotating) {
            const id = [...this.selectedIds][0];
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

            for (const id of this.selectedIds) {
                const shape = this.shapeById(id);
                if (!shape || shape.locked) continue;
                moveShape(shape, dx, dy);
            }

            // Update arrows bound to moved shapes
            for (const id of this.selectedIds) {
                this.updateBoundArrows(id);
            }

            // Update bound text positions
            for (const id of this.selectedIds) {
                this.updateBoundText(id);
            }

            this.dragOffsetX = coords[0];
            this.dragOffsetY = coords[1];

            // Compute alignment guides
            this.alignmentGuides = [];
            const tolerance = 5;
            for (const id of this.selectedIds) {
                const shape = this.shapeById(id);
                if (!shape) continue;
                const bounds = getShapeBounds(shape);
                if (!bounds) continue;
                const cx = bounds.x + bounds.w / 2;
                const cy = bounds.y + bounds.h / 2;
                for (const other of this.existingShapes) {
                    if (other.id && this.selectedIds.has(other.id)) continue;
                    const otherBounds = getShapeBounds(other);
                    if (!otherBounds) continue;
                    const otherCx = otherBounds.x + otherBounds.w / 2;
                    const otherCy = otherBounds.y + otherBounds.h / 2;
                    if (Math.abs(cx - otherCx) < tolerance) {
                        this.alignmentGuides.push({ x: otherCx });
                    }
                    if (Math.abs(bounds.x - otherBounds.x) < tolerance) {
                        this.alignmentGuides.push({ x: otherBounds.x });
                    }
                    if (Math.abs(bounds.x + bounds.w - otherBounds.x - otherBounds.w) < tolerance) {
                        this.alignmentGuides.push({ x: otherBounds.x + otherBounds.w });
                    }
                    if (Math.abs(cy - otherCy) < tolerance) {
                        this.alignmentGuides.push({ y: otherCy });
                    }
                    if (Math.abs(bounds.y - otherBounds.y) < tolerance) {
                        this.alignmentGuides.push({ y: otherBounds.y });
                    }
                    if (Math.abs(bounds.y + bounds.h - otherBounds.y - otherBounds.h) < tolerance) {
                        this.alignmentGuides.push({ y: otherBounds.y + otherBounds.h });
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
            this.ctx.translate(this.viewport.panX, this.viewport.panY);
            this.ctx.scale(this.viewport.zoom, this.viewport.zoom);
            if (this.constantPenPoints.length > 1) {
                this.ctx.beginPath();
                this.ctx.moveTo(this.constantPenPoints[0][0], this.constantPenPoints[0][1]);
                for (let j = 1; j < this.constantPenPoints.length; j++) {
                    this.ctx.lineTo(this.constantPenPoints[j][0], this.constantPenPoints[j][1]);
                }
                this.ctx.strokeStyle = this.currentStyle.strokeColor;
                this.ctx.lineWidth = this.currentStyle.strokeWidth / this.viewport.zoom;
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
        this.ctx.translate(this.viewport.panX, this.viewport.panY);
        this.ctx.scale(this.viewport.zoom, this.viewport.zoom);

        const prevOpts = {
            stroke: this.currentStyle.strokeColor,
            strokeWidth: 1.5 / this.viewport.zoom,
            roughness: 0,
            bowing: 0,
            fill: this.currentStyle.backgroundColor !== "transparent" ? this.currentStyle.backgroundColor : undefined,
            fillStyle: this.currentStyle.backgroundColor !== "transparent" ? (this.currentStyle.fillStyle ?? "solid") : undefined,
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
                this.ctx.strokeStyle = this.currentStyle.strokeColor;
                this.ctx.lineWidth = 1.5 / this.viewport.zoom;
                this.ctx.stroke();
            }
        } else if (this.selectedTool === "arrow") {
            // Snap endpoint to nearest shape edge/center
            const startBind = this.findNearestBinding([this.startX, this.startY]);
            const endBind = this.findNearestBinding([this.snap(coords[0]), this.snap(coords[1])], startBind?.id);
            const sx = startBind?.x ?? this.startX;
            const sy = startBind?.y ?? this.startY;
            const ex = endBind?.x ?? this.snap(coords[0]);
            const ey = endBind?.y ?? this.snap(coords[1]);
            this.rc.line(sx, sy, ex, ey, prevOpts);
            // Draw snap indicators
            if (startBind) {
                this.ctx.beginPath();
                this.ctx.arc(sx, sy, 4 / this.viewport.zoom, 0, Math.PI * 2);
                this.ctx.fillStyle = "rgba(59, 130, 246, 0.8)";
                this.ctx.fill();
            }
            if (endBind) {
                this.ctx.beginPath();
                this.ctx.arc(ex, ey, 4 / this.viewport.zoom, 0, Math.PI * 2);
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
            this.ctx.lineWidth = 2 / this.viewport.zoom;
            this.ctx.setLineDash([6 / this.viewport.zoom, 4 / this.viewport.zoom]);
            this.ctx.strokeRect(x, y, w, h);
            this.ctx.setLineDash([]);
            this.ctx.font = `bold ${12 / this.viewport.zoom}px Arial`;
            this.ctx.fillStyle = "rgba(59, 130, 246, 0.8)";
            this.ctx.fillText("Frame", x + 8 / this.viewport.zoom, y - 6 / this.viewport.zoom);
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
        if (this.viewMode) return;
        if (this.selectedTool === "line" && this.isDrawingPolyline) {
            this.finishPolyline();
            return;
        }
        if (this.selectedTool !== "select") return;
        const coords = this.viewport.getCanvasCoords(e.clientX, e.clientY);
        const lockedIds = new Set(this.existingShapes.filter(s => s.locked).map(s => s.id!));
        const hit = hitTest(coords, this.existingShapes, this.viewport.zoom, lockedIds);
        if (hit === null) return;
        const shape = this.existingShapes[hit];
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
                const prev = structuredClone(this.existingShapes);
                shape.label = label || undefined;
                this.undoManager.push(prev, this.existingShapes);
                this.invalidateCache();
                this.clearCanvas();
                this.syncShapes();
            }
        } else if (shape.type === "frame") {
            const name = prompt("Frame name:", shape.name ?? "");
            if (name !== null) {
                const prev = structuredClone(this.existingShapes);
                shape.name = name || `Frame ${this.existingShapes.filter(s => s.type === "frame").length + 1}`;
                this.undoManager.push(prev, this.existingShapes);
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
                const textShape = this.existingShapes.find(s => s.id === shape.boundTextId && s.type === "text");
                if (textShape) {
                    const idx = this.existingShapes.indexOf(textShape);
                    this.startTextEdit(textShape.x, textShape.y, textShape.text, idx, {
                        bold: textShape.bold,
                        italic: textShape.italic,
                        fontFamily: textShape.fontFamily,
                        fontSize: textShape.fontSize,
                        textAlign: textShape.textAlign || "left",
                    });
                    return;
                } else {
                    delete shape.boundTextId;
                }
            }
            this.pendingBoundTextContainerId = shape.id!;
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
        this.viewport.handleWheel(e, this.canvas.width, this.canvas.height);
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
    keyDownHandler = (e: KeyboardEvent) => {
        if (this.textEditOverlay) return;

        const target = e.target as HTMLElement | null;
        if (
            target?.tagName === "INPUT" ||
            target?.tagName === "TEXTAREA" ||
            target?.isContentEditable
        ) {
            return;
        }

        // View mode: only navigation and zoom keys keep working.
        if (this.viewMode) {
            const isNav =
                e.code === "Space" ||
                ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Escape"].includes(e.key) ||
                ((e.ctrlKey || e.metaKey) && ["0", "=", "+", "-"].includes(e.key)) ||
                (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && ["1", "2"].includes(e.key)) ||
                (e.altKey && !e.ctrlKey && !e.metaKey && ["z", "r", "s"].includes(e.key.toLowerCase()));
            if (!isNav) return;
        }

        if (e.key === "Escape") {
            if (this.isDrawingPolyline) {
                // Cancel the in-progress polyline (Escape never commits).
                this.polylinePoints = [];
                this.isDrawingPolyline = false;
                this.clearCanvas();
            }
            if (this.cropMode) {
                this.cancelImageCrop();
            }
            if (this.selectedIds.size > 0) {
                this.selectedIds.clear();
                this.notifySelection();
                this.invalidateCache();
                this.clearCanvas();
            }
            this.escapePressed = true;
            return;
        }

        if (this.cropMode) {
            if (e.key === "Enter") {
                e.preventDefault();
                this.applyImageCrop();
                return;
            }
            return;
        }

        if (e.code === "Space") {
            e.preventDefault();
            this.spacePressed = true;
            return;
        }

        // ---- Excalidraw-parity shortcuts ----
        const mod = e.ctrlKey || e.metaKey;
        const noMods = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;

        if (mod && e.altKey && !e.shiftKey && e.code === "KeyC") {
            e.preventDefault();
            this.copySelectedStyles();
            return;
        }
        if (mod && e.altKey && !e.shiftKey && e.code === "KeyV") {
            e.preventDefault();
            this.pasteSelectedStyles();
            return;
        }
        if (e.shiftKey && e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyC") {
            e.preventDefault();
            this.copySelectionAsPng();
            return;
        }
        if (mod && e.shiftKey && !e.altKey && e.key === "t") {
            e.preventDefault();
            this.alignTop();
            return;
        }
        if (mod && e.shiftKey && !e.altKey && e.key === "b") {
            e.preventDefault();
            this.alignBottom();
            return;
        }
        if (mod && !e.altKey && (e.key === "[" || e.key === "]")) {
            e.preventDefault();
            if (e.key === "[") {
                e.shiftKey ? this.sendToBack() : this.sendBackward();
            } else {
                e.shiftKey ? this.bringToFront() : this.bringForward();
            }
            return;
        }
        if (mod && !e.altKey && !e.shiftKey && e.key === "x") {
            e.preventDefault();
            this.cutSelectedShape();
            return;
        }
        if (mod && !e.altKey && !e.shiftKey && (e.key === "=" || e.key === "+")) {
            e.preventDefault();
            this.zoomIn();
            return;
        }
        if (mod && !e.altKey && !e.shiftKey && e.key === "-") {
            e.preventDefault();
            this.zoomOut();
            return;
        }
        if (mod && !e.altKey && !e.shiftKey && e.key === "'") {
            e.preventDefault();
            this.toggleSnapToGrid();
            return;
        }
        if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "2") {
            e.preventDefault();
            this.zoomToSelection();
            return;
        }
        if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.code === "KeyH") {
            e.preventDefault();
            this.flipSelectedShapes(true);
            return;
        }
        if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.code === "KeyV") {
            e.preventDefault();
            this.flipSelectedShapes(false);
            return;
        }
        if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyD") {
            e.preventDefault();
            this.toggleTheme();
            return;
        }
        if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyZ") {
            e.preventDefault();
            this.toggleZenMode();
            return;
        }
        if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyR") {
            e.preventDefault();
            this.toggleViewMode();
            return;
        }
        if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyS") {
            e.preventDefault();
            this.toggleSnapToObjects();
            return;
        }
        if (e.key === "Tab") {
            e.preventDefault();
            this.toggleShapeType(!e.shiftKey);
            return;
        }
        if (noMods && e.key === "q") {
            e.preventDefault();
            this.toggleStayAfterDraw();
            return;
        }
        if (noMods && e.key === "k") {
            e.preventDefault();
            this.setTool("laser");
            return;
        }
        if (noMods && e.key === "f") {
            e.preventDefault();
            this.setTool("frame");
            return;
        }
        if (noMods && e.key === "l") {
            e.preventDefault();
            this.setTool("line");
            return;
        }
        if (noMods && e.key === "Enter") {
            e.preventDefault();
            this.enterEditAction();
            return;
        }
        if (e.key === "PageUp") {
            e.preventDefault();
            this.viewport.panY += this.canvas.height * 0.8;
            this.invalidateCache();
            this.clearCanvas();
            return;
        }
        if (e.key === "PageDown") {
            e.preventDefault();
            this.viewport.panY -= this.canvas.height * 0.8;
            this.invalidateCache();
            this.clearCanvas();
            return;
        }
        const digitTools: Record<string, string> = {
            "1": "select",
            "2": "rect",
            "3": "diamond",
            "4": "circle",
            "5": "arrow",
            "6": "line",
            "7": "pen",
            "8": "text",
            "9": "image",
            "0": "eraser",
        };
        if (noMods && e.key in digitTools) {
            e.preventDefault();
            if (digitTools[e.key] === "image") {
                this.insertImage();
            } else {
                this.setTool(digitTools[e.key]);
            }
            return;
        }

        const pluginTool = this.pluginRegistry.getTool(this.selectedTool);
        if (pluginTool?.onKeyDown) {
            const ctx = this.pluginRegistry.getContext();
            if (ctx && pluginTool.onKeyDown(ctx, e)) {
                return;
            }
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "z") {
            e.preventDefault();
            if (e.shiftKey) {
                this.redo();
            } else {
                this.undo();
            }
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "c") {
            e.preventDefault();
            this.copySelectedShape();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "v") {
            e.preventDefault();
            this.pendingPaste = true;
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "d") {
            e.preventDefault();
            this.duplicateSelected();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "g") {
            e.preventDefault();
            if (e.shiftKey) {
                this.ungroup();
            } else {
                this.group();
            }
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "b") {
            e.preventDefault();
            this._textBold = !this._textBold;
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "i") {
            e.preventDefault();
            this._textItalic = !this._textItalic;
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "l") {
            e.preventDefault();
            this.alignLeft();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "r") {
            e.preventDefault();
            this.alignRight();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "c") {
            e.preventDefault();
            this.alignCenter();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "h") {
            e.preventDefault();
            this.distributeHorizontal();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "v") {
            e.preventDefault();
            this.distributeVertical();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "l") {
            e.preventDefault();
            if (this.selectedIds.size === 0) {
                this.toggleLock();
                return;
            }
            const allLocked = [...this.selectedIds].every(id => {
                const shape = this.shapeById(id);
                return shape?.locked;
            });
            if (allLocked) {
                this.unlockShapes();
            } else {
                this.lockShapes();
            }
            return;
        }

        if (
            (e.code === "Delete" || e.code === "Backspace") &&
            this.selectedIds.size > 0
        ) {
            e.preventDefault();
            this.deleteSelectedShape();
            return;
        }

        if (e.key === "i" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.setTool("eyedropper");
            return;
        }

        if (e.key === "p" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.setTool("pen");
            return;
        }

        if (e.key === "v" && !e.ctrlKey && !e.metaKey && !e.altKey && !this._locked) {
            e.preventDefault();
            this.setTool("select");
            return;
        }

        if (e.key === "h" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.setHandPanning(!this._handMode);
            return;
        }

        if (e.key === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.setTool("rect");
            return;
        }

        if (e.key === "o" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.setTool("circle");
            return;
        }

        if (e.key === "t" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.setTool("text");
            return;
        }

        if (e.key === "e" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.setTool("eraser");
            return;
        }

        if (e.key === "a" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.setTool("arrow");
            return;
        }

        if (e.key === "d" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.setTool("diamond");
            return;
        }

        if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.shortcutsCallback?.();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "f") {
            e.preventDefault();
            this.searchCallback?.();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "a") {
            e.preventDefault();
            this.selectAll();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "0") {
            e.preventDefault();
            this.resetZoom();
            return;
        }

        if (e.key === "=" || e.key === "+") {
            e.preventDefault();
            this.zoomIn();
            return;
        }

        if (e.key === "-") {
            e.preventDefault();
            this.zoomOut();
            return;
        }

        if (e.key === "b" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.cycleBackground();
            return;
        }

        if (e.key === "g" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.toggleSnapToGrid();
            return;
        }

        if (e.key === "1" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.zoomToFit();
            return;
        }

        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
            const step = this.snapToGrid ? this.gridSize : (e.shiftKey ? 10 : 1);

            if (this.selectedIds.size > 0) {
                const selectedShapes = this.existingShapes
                    .filter((s) => s.id && this.selectedIds.has(s.id))
                    .map((s) => structuredClone(s));
                const prevMap = new Map(selectedShapes.map((s) => [s.id, s]));
                const prev = this.existingShapes.map((s) => prevMap.get(s.id) ?? s);
                const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
                const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
                for (const id of this.selectedIds) {
                    const shape = this.shapeById(id);
                    if (!shape || shape.locked) continue;
                    moveShape(shape, dx, dy);
                }
                for (const id of this.selectedIds) {
                    this.updateBoundArrows(id);
                }
                for (const id of this.selectedIds) {
                    this.updateBoundText(id);
                }
                this.undoManager.push(prev, this.existingShapes);
                this.syncShapes();
            } else {
                const panStep = e.shiftKey ? 100 : 20;
                if (e.key === "ArrowLeft") this.viewport.panX += panStep;
                if (e.key === "ArrowRight") this.viewport.panX -= panStep;
                if (e.key === "ArrowUp") this.viewport.panY += panStep;
                if (e.key === "ArrowDown") this.viewport.panY -= panStep;
                this.invalidateCache();
                this.clearCanvas();
            }
            return;
        }

    };

    /**
     * Handle key up — release space bar pan mode.
     *
     * Resets the `spacePressed` flag so subsequent mouse events
     * are treated as normal drawing/selecting rather than panning.
     */
    keyUpHandler = (e: KeyboardEvent) => {
        if (e.code === "Space" && !this._handMode) {
            this.spacePressed = false;
        }
    };

    /**
     * Register keyboard event listeners on the window.
     *
     * Key events are captured on `window` (not the canvas) so they
     * work regardless of which element has focus.
     */
    initKeyboardHandlers() {
        window.addEventListener("keydown", this.keyDownHandler);
        window.addEventListener("keyup", this.keyUpHandler);
    }

    initPasteHandler() {
        this.pasteHandler = (e: ClipboardEvent) => {
            if (this.textEditOverlay) return;
            const wasPending = this.pendingPaste;
            this.pendingPaste = false;
            void this.pasteExternal(e).then((wasExternal) => {
                if (!wasExternal && wasPending) {
                    this.pasteClipboard();
                }
            });
        };
        this.canvas.addEventListener("paste", this.pasteHandler);
    }

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
                this.pinchStartZoom = this.viewport.zoom;
                this.isPanning = true;
                this.panStartX = gesture.cx - this.viewport.panX;
                this.panStartY = gesture.cy - this.viewport.panY;
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
        if (this.selectedTool === "select" && !this._locked) {
                const coords = this.viewport.getCanvasCoords(pos.x, pos.y);
                const lockedIds = new Set(this.existingShapes.filter(s => s.locked).map(s => s.id!));
                const hit = hitTest(coords, this.existingShapes, this.viewport.zoom, lockedIds);
                if (hit !== null) {
                    const shape = this.existingShapes[hit];
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
                            const textShape = this.existingShapes.find(s => s.id === shape.boundTextId && s.type === "text");
                            if (textShape) {
                                const idx = this.existingShapes.indexOf(textShape);
                                this.startTextEdit(textShape.x, textShape.y, textShape.text, idx, {
                                    bold: textShape.bold,
                                    italic: textShape.italic,
                                    fontFamily: textShape.fontFamily,
                                    fontSize: textShape.fontSize,
                                    textAlign: textShape.textAlign || "left",
                                });
                                return;
                            } else {
                                delete shape.boundTextId;
                            }
                        }
                        this.pendingBoundTextContainerId = shape.id!;
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
                this.viewport.zoom = newZoom;
                this.viewport.panX = gesture.cx - this.panStartX;
                this.viewport.panY = gesture.cy - this.panStartY;

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
