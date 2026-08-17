import type { GameContext } from "../gameContext";

/** Capabilities the ToolManager needs from the owning Game instance. */
export interface ToolManagerApi {
    notifySelection(): void;
    clearCanvas(): void;
}

/**
 * Tool switching, hand (pan) mode, and canvas lock state.
 *
 * Owns the active-tool change callback and the transitions between the
 * Select tool, drawing tools, and hand mode.
 */
export class ToolManager {
    private _toolChangeCallback: ((tool: string) => void) | null = null;

    constructor(
        private context: GameContext,
        private api: ToolManagerApi,
    ) {}

    /** The callback fired whenever the active tool changes. */
    get toolChangeCallback(): ((tool: string) => void) | null {
        return this._toolChangeCallback;
    }

    /** Register (or clear) the callback fired on tool changes. */
    setToolChangeCallback(cb: ((tool: string) => void) | null) {
        this._toolChangeCallback = cb;
    }

    /**
     * Set the active drawing tool.
     * Clears selection when switching away from the select tool.
     * @param tool - The tool to activate
     */
    setTool(tool: string) {
        if (this.context.selectedTool === tool) return;
        const previousTool = this.context.selectedTool;
        if (this.context._handMode && tool !== "hand") {
            this.context._previousTool = tool;
            this.context._handMode = false;
            this.context.pointerInteractionManager.spacePressed = false;
        }
        if (previousTool === "line" && this.context.pointerInteractionManager.isDrawingPolyline) {
            if (this.context.pointerInteractionManager.polylinePoints.length >= 2) {
                this.context.pointerInteractionManager.finishPolyline();
            } else {
                this.context.pointerInteractionManager.cancelPolyline();
            }
        }
        this.context.selectedTool = tool;
        this._toolChangeCallback?.(tool);
        this.context.textManager.removeTextOverlay();
        if (tool !== "laser") {
            this.context.laserManager.clearLaser();
        }
        if (tool !== "select" && tool !== "hand") {
            this.context.selectedIds.clear();
            this.api.notifySelection();
            this.api.clearCanvas();
        }
        if (tool === "line") {
            this.context.pointerInteractionManager.polylinePoints = [];
            this.context.pointerInteractionManager.isDrawingPolyline = false;
            this.context.pointerInteractionManager.polylineStartCount = 0;
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
            this.context.pointerInteractionManager.isDragging = false;
            this.context.pointerInteractionManager.isSelecting = false;
            this.context.pointerInteractionManager.isResizing = false;
            this.context.pointerInteractionManager.isRotating = false;
            this.context.selectedIds.clear();
            this.api.notifySelection();
            this.api.clearCanvas();
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
        this.context.pointerInteractionManager.spacePressed = active;
        if (active) {
            this.context._previousTool = this.context.selectedTool === "hand" ? this.context._previousTool : this.context.selectedTool;
            this.context.selectedTool = "hand";
        } else {
            this.context.selectedTool = this.context._previousTool || "select";
        }
        this._toolChangeCallback?.(this.context.selectedTool);
    }
}