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
    ensureShapesHaveStyle,
    getShapeBounds,
    CanvasBackground,
} from "./shapes";
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
} from "./inputHandler";

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
    private selectedTool: Tool = "circle";
    private pencilPoints: Point[] = [];
    private isPanning = false;
    private panStartX = 0;
    private panStartY = 0;
    private spacePressed = false;
    private selectedIds: Set<string> = new Set();
    private isDragging = false;
    private isSelecting = false;
    private dragOffsetX = 0;
    private dragOffsetY = 0;
    private dragStartShapes: Shape[] | null = null;
    private clipboard: Shape[] = [];
    private rc: ReturnType<typeof rough.canvas>;
    private selectionChangeCallback: ((shape: Shape | null) => void) | null = null;
    private themeChangeCallback: ((isDark: boolean) => void) | null = null;
    private shortcutsCallback: (() => void) | null = null;
    private contextMenuCallback: ((x: number, y: number) => void) | null = null;
    private eraserPoints: Point[] = [];
    private eraserRadius = 20;
    private imageCache = new ImageCache();
    private textEditOverlay: HTMLTextAreaElement | null = null;
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
    private _smoothMode = false;
    isDark: boolean;
    currentStyle: ShapeStyle;
    private _background: CanvasBackground = { type: "solid", color: "rgb(0, 0, 0)" };

    /** The current canvas background style */
    get background(): CanvasBackground {
        return this._background;
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
    private isRotating = false;
    private rotateStartAngle = 0;
    private rotateStartRotation = 0;
    private destroyed = false;

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
        this._smoothMode = localStorage.getItem("smoothMode") === "true";
        this.currentStyle = defaultStyle(this.isDark);
        this._background = { type: "solid", color: this.isDark ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)" };
        this.rc = rough.canvas(this.canvas);
        this.cacheCanvas = document.createElement("canvas");
        this.cacheCanvas.width = canvas.width;
        this.cacheCanvas.height = canvas.height;
        this.cacheCtx = this.cacheCanvas.getContext("2d")!;
        this.cacheRc = rough.canvas(this.cacheCanvas);
        this.init().then(() => {
            if (this.destroyed) return;
            this.initHandlers();
            this.initMouseHandlers();
            this.initKeyboardHandlers();
            this.initWheelHandler();
            this.initTouchHandlers();
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
        this.canvas.removeEventListener("touchstart", this.touchStartHandler);
        this.canvas.removeEventListener("touchmove", this.touchMoveHandler);
        this.canvas.removeEventListener("touchend", this.touchEndHandler);
        this.canvas.removeEventListener("touchcancel", this.touchEndHandler);
        window.removeEventListener("keydown", this.keyDownHandler);
        window.removeEventListener("keyup", this.keyUpHandler);
    }

    /**
     * Register a callback fired when the selection changes.
     * @param cb - Called with the single selected shape, or null if nothing is selected
     */
    setSelectionChangeCallback(cb: (shape: Shape | null) => void) {
        this.selectionChangeCallback = cb;
    }

/**
      * Register a callback fired when the theme changes.
      * @param cb - Called with `true` for dark mode, `false` for light
      */
    setThemeChangeCallback(cb: (isDark: boolean) => void) {
        this.themeChangeCallback = cb;
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
     * Register a callback for when the user right-clicks the canvas.
     * @param cb - Called with the client X/Y coordinates
     */
    setContextMenuCallback(cb: (x: number, y: number) => void) {
        this.contextMenuCallback = cb;
    }

    /**
     * Whether smooth (clean) rendering is active.
     *
     * When enabled, all shapes render with roughness 0, producing
     * clean geometric strokes instead of Rough.js hand-drawn ones.
     *
     * @returns `true` if smooth mode is enabled
     */
    get smoothMode() {
        return this._smoothMode;
    }

    /**
     * Toggle between rough (hand-drawn) and smooth (clean) rendering.
     * @param enabled - `true` for smooth, `false` for rough
     */
    setSmoothMode(enabled: boolean) {
        this._smoothMode = enabled;
        localStorage.setItem("smoothMode", String(enabled));
        this.invalidateCache();
        this.clearCanvas();
    }

    /** Toggle snap-to-grid mode */
    toggleSnapToGrid() {
        this.snapToGrid = !this.snapToGrid;
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
     * Find a shape by its unique ID.
     * @param id - The shape's unique identifier
     * @returns The matching shape, or undefined
     */
    private shapeById(id: string): Shape | undefined {
        return this.existingShapes.find((s) => s.id === id);
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
    setTool(tool: Tool) {
        this.selectedTool = tool;
        this.removeTextOverlay();
        if (tool !== "select") {
            this.selectedIds.clear();
            this.notifySelection();
            this.clearCanvas();
        }
    }

    /**
     * Switch between dark and light theme.
     * Updates default stroke colors and triggers a full re-render.
     * @param isDark - `true` for dark mode, `false` for light
     */
    setTheme(isDark: boolean) {
        this.isDark = isDark;
        this.currentStyle = defaultStyle(this.isDark);
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
            next = { type: "solid", color: this.isDark ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)" };
        }
        this.setBackground(next);
    }

    /**
     * Set the canvas background style.
     * @param background - The new background configuration
     */
    setBackground(background: CanvasBackground) {
        this._background = background;
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
        } catch (err) {
            console.error("Failed to load shapes:", err);
            this.existingShapes = [];
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
                    for (const id of removed) {
                        const idx = this.existingShapes.findIndex((s) => s.id === id);
                        if (idx !== -1) this.existingShapes.splice(idx, 1);
                    }
                }

                if (Array.isArray(added)) {
                    for (const shape of ensureShapesHaveStyle(added)) {
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
        this.autoSaveTimer = setTimeout(() => {
            saveShapes(this.roomId, this.existingShapes, this.lastSavedVersion)
                .then((res) => {
                    this.lastSavedVersion = res.data.version ?? this.lastSavedVersion;
                    this.autoSaveRetries = 0;
                })
                .catch((err) => {
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
                    } else {
                        this.autoSaveRetries++;
                    }
                    this.scheduleAutoSave();
                });
        }, delay);
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
            renderShape(shape, this.cacheCtx, this.cacheRc, this.viewport.zoom, this.isDark, this.imageCache, this._smoothMode);
        }
        this.cacheCtx.restore();
        this.cacheValid = true;
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
            const { dotSize, spacing } = bg;
            const offsetX = ((this.viewport.panX % spacing) + spacing) % spacing;
            const offsetY = ((this.viewport.panY % spacing) + spacing) % spacing;
            ctx.fillStyle = bg.color;
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
            const { crossSize, spacing } = bg;
            const offsetX = ((this.viewport.panX % spacing) + spacing) % spacing;
            const offsetY = ((this.viewport.panY % spacing) + spacing) % spacing;
            ctx.strokeStyle = bg.color;
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

        // Draw alignment guides
        if (this.alignmentGuides.length > 0) {
            this.ctx.save();
            this.ctx.translate(this.viewport.panX, this.viewport.panY);
            this.ctx.scale(this.viewport.zoom, this.viewport.zoom);
            this.ctx.strokeStyle = "rgba(59, 130, 246, 0.8)";
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
            this.socket.send(
                JSON.stringify({
                    type: "shape-diff",
                    roomId: this.roomId,
                    added,
                    modified,
                    removed,
                }),
            );
        }

        this.lastSyncedShapes = structuredClone(this.existingShapes);
    }

    /**
     * Assign an ID to a shape, apply default style, add to the canvas, and sync.
     * @param shape - The shape to commit (mutated: `id` and `style` are set)
     */
    private commitShape(shape: Shape) {
        shape.id = crypto.randomUUID();
        if (!shape.style) {
            shape.style = { ...this.currentStyle };
        }
        const prev = [...this.existingShapes];
        this.existingShapes.push(shape);
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
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
        this.existingShapes = result;
        this.syncShapes();
    }

    /**
     * Delete all selected shapes from the canvas.
     *
     * Skips locked shapes — they cannot be deleted. Pushes the change
     * to the undo stack and syncs via WebSocket.
     */
    deleteSelectedShape() {
        if (this.selectedIds.size === 0) return;
        const prev = [...this.existingShapes];
        const idsToRemove = new Set(this.selectedIds);
        this.existingShapes = this.existingShapes.filter(s => {
            if (!idsToRemove.has(s.id!)) return true;
            if (s.locked) return true;
            return false;
        });
        this.undoManager.push(prev, this.existingShapes);
        this.selectedIds.clear();
        this.notifySelection();
        this.syncShapes();
    }

    /**
     * Copy all selected shapes to the internal clipboard.
     *
     * Deep-clones each selected shape so subsequent edits to the originals
     * do not affect the clipboard contents.
     */
    copySelectedShape() {
        if (this.selectedIds.size === 0) return;
        this.clipboard = [];
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (shape) this.clipboard.push(JSON.parse(JSON.stringify(shape)));
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
            copy.id = crypto.randomUUID();
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
     * Assign a shared group ID to all selected shapes (minimum 2).
     *
     * Grouped shapes are selected and moved together. The group ID is
     * a random UUID generated at group time.
     */
    group() {
        if (this.selectedIds.size < 2) return;
        const groupId = crypto.randomUUID();
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
        this.undoManager.push(prev, this.existingShapes);
        this.syncShapes();
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
        exportToPng(this.existingShapes, this.isDark, this.imageCache, this._smoothMode);
    }

    /**
     * Export the canvas as an SVG image download.
     *
     * Builds an SVG DOM from all shapes, serializes it, and triggers
     * a browser download of the resulting SVG file.
     */
    exportToSvg() {
        exportToSvg(this.existingShapes, this.isDark, this._smoothMode);
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
     */
    private startTextEdit(
        canvasX: number,
        canvasY: number,
        existingText?: string,
        existingIndex?: number,
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
            },
            this.existingShapes,
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
        if (this.spacePressed || e.button === 1) {
            this.isPanning = true;
            this.panStartX = e.clientX - this.viewport.panX;
            this.panStartY = e.clientY - this.viewport.panY;
            return;
        }
        this.handlePointerDown(e.clientX, e.clientY, e.shiftKey);
    };

    /**
     * Handle pointer down for all tool modes.
     * @param clientX - Client X coordinate
     * @param clientY - Client Y coordinate
     * @param shiftKey - Whether Shift is held (for multi-select)
     */
    private handlePointerDown(clientX: number, clientY: number, shiftKey: boolean) {
        this.clicked = true;
        this.lastPointerX = clientX;
        this.lastPointerY = clientY;
        const coords = this.viewport.getCanvasCoords(clientX, clientY);
        this.startX = coords[0];
        this.startY = coords[1];

        if (this.selectedTool === "select") {
            const lockedIds = new Set(this.existingShapes.filter(s => s.locked).map(s => s.id!));
            const hit = hitTest(coords, this.existingShapes, this.viewport.zoom, lockedIds);
            
            // Check for resize handle click
            if (this.selectedIds.size === 1 && hit !== null) {
                const handleIdx = this.hitTestResizeHandle(coords);
                if (handleIdx === -2) {
                    // Rotation handle
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

                if (hitShape.groupId) {
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
            this.startTextEdit(coords[0], coords[1]);
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
                     this.notifySelection();
                 }
             }
             this.selectedTool = "select";
             this.clicked = false;
             return;
         }

         if (this.selectedTool === "pencil") {
            this.pencilPoints = [[coords[0], coords[1]]];
        }

        if (this.selectedTool === "eraser") {
            this.eraserPoints = [[coords[0], coords[1]]];
        }
    }

    /**
     * Handle mouse up — finalize drawing, erasing, or selection.
     *
     * Resets panning and dragging state, then delegates to
     * {@link handlePointerUp} for tool-specific finalization.
     */
    mouseUpHandler = (e: MouseEvent) => {
        this.isPanning = false;
        this.isDragging = false;
        this.clicked = false;
        this.handlePointerUp();
    };

    /** Handle pointer up — commit shapes, finalize drag, or complete eraser stroke */
    private handlePointerUp() {
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

        if (this.selectedTool === "pencil") {
            if (this.pencilPoints.length < 2) return;
            this.commitShape({
                type: "pencil",
                points: [...this.pencilPoints],
            });
            this.pencilPoints = [];
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

        const coords = this.viewport.getCanvasCoords(this.lastPointerX, this.lastPointerY);
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
            shape = {
                type: "arrow",
                startX: this.startX,
                startY: this.startY,
                endX: coords[0],
                endY: coords[1],
                arrowHeadSize: 10,
            };
        } else if (this.selectedTool === "line") {
            shape = {
                type: "line",
                startX: this.startX,
                startY: this.startY,
                endX: coords[0],
                endY: coords[1],
            };
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
        }

        if (!shape) return;
        this.commitShape(shape);
    }

    /**
     * Handle mouse move — pan, draw preview, drag shapes, or extend eraser.
     *
     * If panning, updates the viewport pan offset. Otherwise delegates
     * to {@link handlePointerMove} for tool-specific behavior.
     */
    mouseMoveHandler = (e: MouseEvent) => {
        if (this.isPanning) {
            this.viewport.panX = e.clientX - this.panStartX;
            this.viewport.panY = e.clientY - this.panStartY;
            this.invalidateCache();
            this.clearCanvas();
            return;
        }
        this.handlePointerMove(e.clientX, e.clientY);
    };

    /**
     * Handle pointer move for all tool modes.
     * @param clientX - Client X coordinate
     * @param clientY - Client Y coordinate
     */
    private handlePointerMove(clientX: number, clientY: number) {
        if (!this.clicked) return;

        this.lastPointerX = clientX;
        this.lastPointerY = clientY;
        const coords = this.viewport.getCanvasCoords(clientX, clientY);

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

            // Apply to shape
            if (shape.type === "rect" || shape.type === "image") {
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
            }

            this.invalidateCache();
            this.clearCanvas();
            return;
        }

        if (this.selectedTool === "select" && this.isRotating) {
            const id = [...this.selectedIds][0];
            const shape = this.shapeById(id);
            if (!shape) return;
            const bounds = getShapeBounds(shape);
            if (!bounds) return;
            const cx = bounds.x + bounds.w / 2;
            const cy = bounds.y + bounds.h / 2;
            const currentAngle = Math.atan2(coords[1] - cy, coords[0] - cx);
            const deltaAngle = currentAngle - this.rotateStartAngle;
            shape.rotation = this.rotateStartRotation + deltaAngle;
            this.invalidateCache();
            this.clearCanvas();
            return;
        }

        if (this.selectedTool === "select" && this.isDragging) {
            const dx = coords[0] - this.dragOffsetX;
            const dy = coords[1] - this.dragOffsetY;

            for (const id of this.selectedIds) {
                const shape = this.shapeById(id);
                if (!shape || shape.locked) continue;
                moveShape(shape, dx, dy);
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

        if (this.selectedTool === "pencil") {
            this.pencilPoints.push([coords[0], coords[1]]);
            this.clearCanvas();
            this.ctx.save();
            this.ctx.translate(this.viewport.panX, this.viewport.panY);
            this.ctx.scale(this.viewport.zoom, this.viewport.zoom);
            if (this._smoothMode && this.pencilPoints.length > 1) {
                this.ctx.beginPath();
                this.ctx.moveTo(this.pencilPoints[0][0], this.pencilPoints[0][1]);
                for (let j = 1; j < this.pencilPoints.length; j++) {
                    this.ctx.lineTo(this.pencilPoints[j][0], this.pencilPoints[j][1]);
                }
                this.ctx.strokeStyle = this.currentStyle.strokeColor;
                this.ctx.lineWidth = this.currentStyle.strokeWidth / this.viewport.zoom;
                this.ctx.lineCap = "round";
                this.ctx.lineJoin = "round";
                this.ctx.stroke();
            } else {
                this.rc.linearPath(this.pencilPoints, {
                    stroke: this.currentStyle.strokeColor,
                    strokeWidth: 1.5 / this.viewport.zoom,
                    roughness: this._smoothMode ? 0 : 2,
                    bowing: this._smoothMode ? 0 : 1.5,
                });
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

        const width = coords[0] - this.startX;
        const height = coords[1] - this.startY;
        this.clearCanvas();

        this.ctx.save();
        this.ctx.translate(this.viewport.panX, this.viewport.panY);
        this.ctx.scale(this.viewport.zoom, this.viewport.zoom);

        const prevOpts = {
            stroke: this.currentStyle.strokeColor,
            strokeWidth: 1.5 / this.viewport.zoom,
            roughness: this._smoothMode ? 0 : 2,
            bowing: this._smoothMode ? 0 : 1.5,
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
            this.rc.line(this.startX, this.startY, coords[0], coords[1], prevOpts);
        } else if (this.selectedTool === "line") {
            this.rc.line(this.startX, this.startY, coords[0], coords[1], prevOpts);
        } else if (this.selectedTool === "text") {
            this.ctx.font = "20px Arial";
            this.ctx.fillStyle = "rgba(255,255,255,0.4)";
            this.ctx.fillText("|", this.startX, this.startY);
        }

        this.ctx.restore();
    };

    /**
     * Handle double-click — open text editor on text shapes.
     *
     * Only active in select mode. Hit-tests the click position and,
     * if a text shape is found, opens the inline text editor for that
     * shape.
     */
    dblClickHandler = (e: MouseEvent) => {
        if (this.selectedTool !== "select") return;
        const coords = this.viewport.getCanvasCoords(e.clientX, e.clientY);
        const lockedIds = new Set(this.existingShapes.filter(s => s.locked).map(s => s.id!));
        const hit = hitTest(coords, this.existingShapes, this.viewport.zoom, lockedIds);
        if (hit === null) return;
        const shape = this.existingShapes[hit];
        if (shape.type !== "text") return;
        this.startTextEdit(shape.x, shape.y, shape.text, hit);
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
     * - **Delete / Backspace** — delete selected
     * - **I** — eyedropper tool
     * - **?** — toggle shortcuts panel
     * - **B** — cycle background
     * - **G** — toggle snap-to-grid
     * - **Shift+1** — zoom to fit
     * - **Arrow keys** — nudge selected shapes (or pan canvas)
     */
    keyDownHandler = (e: KeyboardEvent) => {
        if (this.textEditOverlay) return;

        if (e.code === "Space") {
            e.preventDefault();
            this.spacePressed = true;
            return;
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
            this.pasteClipboard();
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
            if (this.selectedIds.size === 0) return;
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

        if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.shortcutsCallback?.();
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
        if (e.code === "Space") {
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
            if (this.selectedTool === "select") {
                const coords = this.viewport.getCanvasCoords(pos.x, pos.y);
                const lockedIds = new Set(this.existingShapes.filter(s => s.locked).map(s => s.id!));
                const hit = hitTest(coords, this.existingShapes, this.viewport.zoom, lockedIds);
                if (hit !== null) {
                    const shape = this.existingShapes[hit];
                    if (shape.type === "text") {
                        this.startTextEdit(shape.x, shape.y, shape.text, hit);
                        return;
                    }
                }
            }
            return;
        }
        this.lastTapTime = now;

        // Single touch — delegate to pointer handler
        e.preventDefault();
        this.handlePointerDown(pos.x, pos.y, false);
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

        this.handlePointerMove(pos.x, pos.y);
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

        if (e.touches.length === 0 && this.isPanning && e.changedTouches.length >= 2) {
            this.isPanning = false;
            return;
        }

        if (e.touches.length >= 1) return;

        this.isPanning = false;
        this.handlePointerUp();
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
