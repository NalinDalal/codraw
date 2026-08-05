import { ImageCache } from "./imageCache";
import { getExistingShapes, saveShapes } from "./http";
import rough from "roughjs";
import {
    Tool,
    Shape,
    ShapeStyle,
    Point,
    defaultStyle,
    ensureShapesHaveStyle,
    getShapeBounds,
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
    private contextMenuHandler = (e: Event) => e.preventDefault();
    private _smoothMode = false;
    isDark: boolean;
    currentStyle: ShapeStyle;
    private background: CanvasBackground = { type: "solid", color: this.isDark ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)" };

    /** The WebSocket connection for real-time collaboration */
    socket: WebSocket;

    private undoManager = new UndoManager();
    private viewport = new Viewport();

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
        this.rc = rough.canvas(this.canvas);
        this.cacheCanvas = document.createElement("canvas");
        this.cacheCanvas.width = canvas.width;
        this.cacheCanvas.height = canvas.height;
        this.cacheCtx = this.cacheCanvas.getContext("2d")!;
        this.cacheRc = rough.canvas(this.cacheCanvas);
        this.init().then(() => {
            this.initHandlers();
            this.initMouseHandlers();
            this.initKeyboardHandlers();
            this.initWheelHandler();
            this.initTouchHandlers();
        });
    }

    /** Tear down all event listeners and cancel pending auto-saves */
    destroy() {
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

    /** Whether smooth (clean) rendering is active */
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

    /**
     * Find a shape by its unique ID.
     * @param id - The shape's unique identifier
     * @returns The matching shape, or undefined
     */
    private shapeById(id: string): Shape | undefined {
        return this.existingShapes.find((s) => s.id === id);
    }

    /** Get all currently selected shapes */
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

    /** Load existing shapes from the server and render the initial canvas */
    async init() {
        const { shapes, version } = await getExistingShapes(this.roomId);
        this.existingShapes = ensureShapesHaveStyle(
            shapes.filter((s) => s.type !== "eraser"),
        );
        this.lastSyncedShapes = structuredClone(this.existingShapes);
        this.lastSavedVersion = version;
        this.invalidateCache();
        this.clearCanvas();
    }

    /** Notify the selection change callback with the current selection */
    private notifySelection() {
        this.selectionChangeCallback?.(this.getSelectedShape());
    }

    /** Wire up WebSocket message handlers for real-time sync */
    initHandlers() {
        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);

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
                const inner = JSON.parse(message.message);
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

    /** Mark the off-screen cache as stale, forcing a rebuild on next render */
    private invalidateCache() {
        this.cacheValid = false;
    }

    /** Cancel any pending auto-save timer */
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
                        const remoteIds = new Set(remoteShapes.map((s) => s.id));
                        const merged = [
                            ...remoteShapes,
                            ...this.existingShapes.filter((s) => s.id && !remoteIds.has(s.id)),
                        ];
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

    /** Disable auto-save (e.g. for read-only rooms) */
    disableAutoSave() {
        this.autoSaveDisabled = true;
        this.cancelAutoSave();
    }

    /** Re-render all shapes to the off-screen cache canvas */
    private buildCache() {
        this.cacheCanvas.width = this.canvas.width;
        this.cacheCanvas.height = this.canvas.height;
        this.cacheCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.cacheCtx.fillStyle = this.isDark ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)";
        this.cacheCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.cacheCtx.save();
        this.cacheCtx.translate(this.viewport.panX, this.viewport.panY);
        this.cacheCtx.scale(this.viewport.zoom, this.viewport.zoom);
        for (const shape of this.existingShapes) {
            renderShape(shape, this.cacheCtx, this.cacheRc, this.viewport.zoom, this.isDark, this.imageCache, this._smoothMode);
        }
        this.cacheCtx.restore();
        this.cacheValid = true;
    }

    /** Clear the canvas, rebuild the cache if needed, and draw selection handles */
    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.isDark ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (
            !this.cacheValid ||
            this.cacheCanvas.width !== this.canvas.width ||
            this.cacheCanvas.height !== this.canvas.height
        ) {
            this.buildCache();
        }
        this.ctx.drawImage(this.cacheCanvas, 0, 0);
        drawSelection(this.ctx, this.existingShapes, this.selectedIds, this.viewport);
    }

    /** Rebuild the cache and re-render after a canvas resize */
    resize() {
        this.invalidateCache();
        this.clearCanvas();
    }

    /** Remove the text editing textarea overlay from the DOM */
    private removeTextOverlay() {
        removeTextOverlayFn(this.textEditOverlay);
        this.textEditOverlay = null;
    }

    /** Compute a shape diff and broadcast it over WebSocket, then schedule auto-save */
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

    /** Undo the last shape change and re-render */
    undo() {
        const result = this.undoManager.undo(this.existingShapes);
        if (!result) return;
        this.removeTextOverlay();
        this.selectedIds.clear();
        this.notifySelection();
        this.existingShapes = result;
        this.syncShapes();
    }

    /** Redo the last undone shape change and re-render */
    redo() {
        const result = this.undoManager.redo(this.existingShapes);
        if (!result) return;
        this.removeTextOverlay();
        this.selectedIds.clear();
        this.notifySelection();
        this.existingShapes = result;
        this.syncShapes();
    }

    /** Delete all selected shapes from the canvas */
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

    /** Copy all selected shapes to the internal clipboard */
    copySelectedShape() {
        if (this.selectedIds.size === 0) return;
        this.clipboard = [];
        for (const id of this.selectedIds) {
            const shape = this.shapeById(id);
            if (shape) this.clipboard.push(JSON.parse(JSON.stringify(shape)));
        }
    }

    /** Paste clipboard contents with a 20px offset from originals */
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

    /** Assign a shared group ID to all selected shapes (minimum 2) */
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

    /** Remove the group ID from all selected shapes */
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

    /** Align selected shapes to the left edge of the leftmost shape */
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

    /** Align selected shapes to the right edge of the rightmost shape */
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

    /** Align selected shapes to the horizontal center of the selection */
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

    /** Evenly space selected shapes horizontally */
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

    /** Evenly space selected shapes vertically */
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

    /** Lock selected shapes so they cannot be moved or edited */
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

    /** Unlock selected shapes so they can be moved and edited again */
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

    /** Export the canvas as a PNG image download */
    exportToPng() {
        exportToPng(this.existingShapes, this.isDark, this.imageCache, this._smoothMode);
    }

    /** Export the canvas as an SVG image download */
    exportToSvg() {
        exportToSvg(this.existingShapes, this.isDark, this._smoothMode);
    }

    /** Export the canvas shapes as a JSON file download */
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

    /** Handle mouse down — start panning, drawing, or selecting */
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

    /** Handle mouse up — finalize drawing, erasing, or selection */
    mouseUpHandler = (e: MouseEvent) => {
        this.isPanning = false;
        this.isDragging = false;
        this.clicked = false;
        this.handlePointerUp();
    };

    /** Handle pointer up — commit shapes, finalize drag, or complete eraser stroke */
    private handlePointerUp() {
        if (this.selectedTool === "select") {
            if (this.isSelecting) {
                this.isSelecting = false;
                const selX = Math.min(this.startX, this.startX + this.dragOffsetX);
                const selY = Math.min(this.startY, this.startY + this.dragOffsetY);
                const selW = Math.abs(this.dragOffsetX);
                const selH = Math.abs(this.dragOffsetY);
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
        }

        if (!shape) return;
        this.commitShape(shape);
    }

    /** Handle mouse move — pan, draw preview, drag shapes, or extend eraser */
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
            this.rc.linearPath(this.pencilPoints, {
                stroke: this.currentStyle.strokeColor,
                strokeWidth: 1.5 / this.viewport.zoom,
                roughness: this._smoothMode ? 0 : 2,
                bowing: this._smoothMode ? 0 : 1.5,
            });
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

    /** Handle double-click — open text editor on text shapes */
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

    /** Register mouse event listeners on the canvas */
    initMouseHandlers() {
        this.canvas.addEventListener("mousedown", this.mouseDownHandler);
        this.canvas.addEventListener("mouseup", this.mouseUpHandler);
        this.canvas.addEventListener("mousemove", this.mouseMoveHandler);
        this.canvas.addEventListener("dblclick", this.dblClickHandler);
        this.canvas.addEventListener("contextmenu", this.contextMenuHandler);
    }

    /** Handle scroll wheel — zoom in/out via the viewport */
    wheelHandler = (e: WheelEvent) => {
        e.preventDefault();
        this.viewport.handleWheel(e, this.canvas.width, this.canvas.height);
        this.invalidateCache();
        this.clearCanvas();
    };

    /** Register the wheel event listener on the canvas */
    initWheelHandler() {
        this.canvas.addEventListener("wheel", this.wheelHandler, {
            passive: false,
        });
    }

    /** Handle key down — space (pan), Ctrl+Z (undo/redo), Ctrl+C/V (copy/paste), Ctrl+G (group), Delete */
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

        if (
            (e.code === "Delete" || e.code === "Backspace") &&
            this.selectedIds.size > 0
        ) {
            e.preventDefault();
            this.deleteSelectedShape();
        }
    };

    /** Handle key up — release space bar pan mode */
    keyUpHandler = (e: KeyboardEvent) => {
        if (e.code === "Space") {
            this.spacePressed = false;
        }
    };

    /** Register keyboard event listeners on the window */
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

    /** Handle touch start — pinch-zoom, double-tap text edit, or single-touch draw */
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

    /** Handle touch move — pinch-zoom pan or single-touch draw */
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

    /** Handle touch end — finalize drawing or end pan */
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

    /** Register touch event listeners on the canvas */
    initTouchHandlers() {
        this.canvas.addEventListener("touchstart", this.touchStartHandler, { passive: false });
        this.canvas.addEventListener("touchmove", this.touchMoveHandler, { passive: false });
        this.canvas.addEventListener("touchend", this.touchEndHandler, { passive: false });
        this.canvas.addEventListener("touchcancel", this.touchEndHandler, { passive: false });
    }
}
